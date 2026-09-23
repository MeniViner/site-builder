import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEditSessionGuard from './AdminEditSessionGuard';
import {
    ADMIN_STALE_THRESHOLD_MS,
    beginAdminEditSession,
    resetAdminEditSessionForTests,
    setAdminRecoveryScope,
    STALE_ADMIN_EDIT_EVENT,
    staleInactivityTitle,
} from '../utils/adminEditSession';

describe('AdminEditSessionGuard', () => {
    beforeEach(() => {
        resetAdminEditSessionForTests();
        setAdminRecoveryScope({ backend: 'txt', target: '/sites/test/data', user: 'tester' });
        beginAdminEditSession(1_000);
        vi.spyOn(Date, 'now').mockReturnValue(1_000 + ADMIN_STALE_THRESHOLD_MS + 1);
    });

    it('keeps ordinary capture-phase mutations blocked but lets the recovery button work by mouse and keyboard', async () => {
        const reload = vi.fn();
        render(<AdminEditSessionGuard reloadPage={reload} />);

        fireEvent.click(document.body);
        expect(await screen.findByRole('dialog')).toBeInTheDocument();

        const ordinaryMutation = vi.fn();
        const outside = document.createElement('button');
        outside.addEventListener('click', ordinaryMutation);
        document.body.appendChild(outside);
        fireEvent.click(outside);
        expect(ordinaryMutation).not.toHaveBeenCalled();

        const recoveryButton = screen.getByRole('button', { name: 'ריענון' });
        fireEvent.pointerDown(recoveryButton);
        fireEvent.keyDown(recoveryButton, { key: 'Enter' });
        fireEvent.click(recoveryButton);

        await waitFor(() => expect(reload).toHaveBeenCalledOnce());
        outside.remove();
    });
});

describe('inactivity dialog presentation', () => {
    // This is a sibling describe, so it does not inherit the suite setup above.
    // Without its own reset, a leaked reloadApproved from an earlier test leaves
    // the Refresh button disabled, and a disabled button cannot take focus.
    beforeEach(() => {
        resetAdminEditSessionForTests();
        setAdminRecoveryScope({ backend: 'txt', target: '/sites/test/data', user: 'tester' });
        beginAdminEditSession(1_000);
        vi.spyOn(Date, 'now').mockReturnValue(1_000 + ADMIN_STALE_THRESHOLD_MS + 1);
    });

    // Drive the dialog from the explicit stale event the component listens for,
    // rather than from activity bookkeeping: a synthetic click records activity
    // before the staleness check, which makes the trigger order-dependent.
    const showStale = async () => {
        render(<AdminEditSessionGuard reloadPage={() => {}} />);
        await act(async () => {
            window.dispatchEvent(new Event(STALE_ADMIN_EDIT_EVENT));
        });
        return screen.findByRole('dialog');
    };

    it('uses the calm Hebrew inactivity copy and a Refresh action', async () => {
        await showStale();
        expect(screen.getByText('זיהינו שלא עבדת במערכת כבר 60 דקות')).toBeInTheDocument();
        expect(screen.getByText('כפתור הריענון יחזיר אותך לעניינים.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /ריענון/ })).toBeInTheDocument();
    });

    it('is a plain dialog, not an error alert, with no red treatment by default', async () => {
        const dialog = await showStale();
        expect(dialog.getAttribute('aria-modal')).toBe('true');
        expect(dialog.getAttribute('aria-labelledby')).toBe('admin-stale-title');
        expect(dialog.getAttribute('aria-describedby')).toBe('admin-stale-body');
        // Red is reserved for an actual failure; none has happened yet.
        expect(screen.queryByRole('alert')).toBeNull();
        expect(dialog.innerHTML).not.toMatch(/text-red-600/);
    });

    it('keeps the backdrop light enough to recognise the app behind it', async () => {
        const dialog = await showStale();
        const backdrop = dialog.parentElement;
        // The previous treatment was bg-black/65 + backdrop-blur-md.
        expect(backdrop.className).not.toMatch(/bg-black\/(6[0-9]|[7-9][0-9]|100)/);
        expect(backdrop.className).toMatch(/bg-slate-900\/25/);
        expect(backdrop.className).not.toMatch(/backdrop-blur-md/);
    });

    it('focuses the Refresh action when it appears', async () => {
        await showStale();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: /ריענון/ }));
    });

    it('does not dismiss on Escape and keeps focus on Refresh when tabbing', async () => {
        await showStale();
        const refresh = screen.getByRole('button', { name: /ריענון/ });
        await act(async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        await act(async () => {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
        });
        expect(document.activeElement).toBe(refresh);
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does not dismiss when the backdrop is clicked', async () => {
        const dialog = await showStale();
        const backdrop = dialog.parentElement;
        await act(async () => {
            fireEvent.mouseDown(backdrop);
            fireEvent.click(backdrop);
        });
        expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
});

describe('staleInactivityTitle', () => {
    it('only says 60 minutes when the threshold really is 60 minutes', () => {
        expect(staleInactivityTitle(60 * 60 * 1000)).toBe('זיהינו שלא עבדת במערכת כבר 60 דקות');
        expect(staleInactivityTitle(30 * 60 * 1000)).not.toMatch(/60 דקות/);
        expect(staleInactivityTitle(30 * 60 * 1000)).toBe('זיהינו שלא עבדת במערכת כבר 30 דקות');
        expect(staleInactivityTitle(2 * 60 * 60 * 1000)).toBe('זיהינו שלא עבדת במערכת כבר שעתיים');
        expect(staleInactivityTitle(60 * 1000)).toBe('זיהינו שלא עבדת במערכת כבר דקה');
    });
});
