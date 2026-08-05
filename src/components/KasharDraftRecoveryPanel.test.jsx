import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KasharDraftRecoveryPanel from './KasharDraftRecoveryPanel';

function createRecoveryStore() {
    return {
        inspect: vi.fn().mockResolvedValue({
            records: [{
                key: 'site-builder:demo:kashar:draft:v1:backup:invalid:abc',
                byteSize: 42,
                jsonParseResult: 'valid',
                jsonLayers: 1,
                topLevelType: 'object',
                topLevelKeys: ['polls'],
                classification: 'invalid',
                reason: 'partial_widget_or_shared_polls_payload',
            }],
        }),
        reset: vi.fn().mockResolvedValue({}),
        importDraftText: vi.fn().mockResolvedValue({}),
        getRawForRecovery: vi.fn().mockReturnValue('{"polls":[]}'),
    };
}

describe('KasharDraftRecoveryPanel', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows diagnostics and can reset before a normal configuration is available', async () => {
        const store = createRecoveryStore();
        const onRetry = vi.fn();
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        render(<KasharDraftRecoveryPanel store={store} onRetry={onRetry} />);

        expect(await screen.findByText('Kashar draft recovery (development only)')).toBeInTheDocument();
        expect(screen.getByText(/42 bytes/)).toBeInTheDocument();
        expect(screen.getByText(/partial_widget_or_shared_polls_payload/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Reset Kashar demo data' }));

        await waitFor(() => expect(store.reset).toHaveBeenCalledTimes(1));
        expect(onRetry).toHaveBeenCalledTimes(1);
    });
});
