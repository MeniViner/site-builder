import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoomService from '../services/BoomService';
import { BoomProvider, useBoom } from './BoomContext';
import {
    ADMIN_STALE_THRESHOLD_MS,
    beginAdminEditSession,
    endAdminEditSession,
} from '../utils/adminEditSession';

vi.mock('../services/BoomService', () => ({
    default: {
        getBoom: vi.fn(),
        saveBoom: vi.fn(),
    },
}));

const baseBoom = {
    enabled: true,
    buttonLabel: 'בום',
    pageTitle: 'חדר מצב',
    description: '',
    categories: [{ id: 'general', name: 'כללי', color: '#2563eb', order: 1 }],
    items: [],
};

let currentContext;

function captureContext(value) {
    currentContext = value;
}

function Probe({ onChange }) {
    const value = useBoom();

    React.useEffect(() => {
        onChange(value);
    }, [onChange, value]);

    return null;
}

describe('BoomContext persistence safety', () => {
    beforeEach(() => {
        endAdminEditSession();
        currentContext = null;
        BoomService.getBoom.mockReset().mockResolvedValue(baseBoom);
        BoomService.saveBoom.mockReset();
    });

    afterEach(() => endAdminEditSession());

    it('serializes saves so an older request cannot overwrite a newer BOOM revision', async () => {
        let resolveFirst;
        const firstSave = new Promise((resolve) => {
            resolveFirst = resolve;
        });
        BoomService.saveBoom
            .mockImplementationOnce(() => firstSave)
            .mockImplementationOnce(async (payload) => payload);
        render(<BoomProvider><Probe onChange={captureContext} /></BoomProvider>);
        await waitFor(() => expect(currentContext.loaded).toBe(true));

        let firstPromise;
        let secondPromise;
        await act(async () => {
            firstPromise = currentContext.saveBoom({ ...baseBoom, pageTitle: 'גרסה ראשונה' });
            secondPromise = currentContext.saveBoom({ ...baseBoom, pageTitle: 'גרסה שנייה' });
            await Promise.resolve();
        });

        expect(BoomService.saveBoom).toHaveBeenCalledTimes(1);
        await act(async () => {
            resolveFirst({ ...baseBoom, pageTitle: 'גרסה ראשונה' });
            await firstPromise;
            await secondPromise;
        });

        expect(BoomService.saveBoom).toHaveBeenCalledTimes(2);
        expect(BoomService.saveBoom.mock.calls[1][0]).toMatchObject({ pageTitle: 'גרסה שנייה' });
        expect(currentContext.boom.pageTitle).toBe('גרסה שנייה');
    });

    it('rejects saves when the initial load failed', async () => {
        BoomService.getBoom.mockRejectedValue(new Error('Forbidden'));
        render(<BoomProvider><Probe onChange={captureContext} /></BoomProvider>);
        await waitFor(() => expect(currentContext.loading).toBe(false));

        await expect(currentContext.saveBoom(baseBoom)).rejects.toThrow('לפני שהטעינה הראשונית');
        expect(BoomService.saveBoom).not.toHaveBeenCalled();
    });

    it('does not call persistence after an Admin session becomes stale', async () => {
        render(<BoomProvider><Probe onChange={captureContext} /></BoomProvider>);
        await waitFor(() => expect(currentContext.loaded).toBe(true));
        beginAdminEditSession(Date.now() - ADMIN_STALE_THRESHOLD_MS - 1);

        await expect(currentContext.saveBoom(baseBoom)).rejects.toThrow('חייבים לרענן');
        expect(BoomService.saveBoom).not.toHaveBeenCalled();
    });
});
