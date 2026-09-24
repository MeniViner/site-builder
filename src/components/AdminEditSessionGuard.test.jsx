import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEditSessionGuard from './AdminEditSessionGuard';
import {
    ADMIN_STALE_THRESHOLD_MS,
    beginAdminEditSession,
    resetAdminEditSessionForTests,
    setAdminRecoveryScope,
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
        expect(await screen.findByRole('alertdialog')).toBeInTheDocument();

        const ordinaryMutation = vi.fn();
        const outside = document.createElement('button');
        outside.addEventListener('click', ordinaryMutation);
        document.body.appendChild(outside);
        fireEvent.click(outside);
        expect(ordinaryMutation).not.toHaveBeenCalled();

        const recoveryButton = screen.getByRole('button', { name: 'רענון בטוח' });
        fireEvent.pointerDown(recoveryButton);
        fireEvent.keyDown(recoveryButton, { key: 'Enter' });
        fireEvent.click(recoveryButton);

        await waitFor(() => expect(reload).toHaveBeenCalledOnce());
        outside.remove();
    });
});
