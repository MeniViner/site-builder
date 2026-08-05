import { afterEach, describe, expect, it, vi } from 'vitest';
import { installKasharDevRecovery } from './KasharDevRecovery';

describe('installKasharDevRecovery', () => {
    afterEach(() => {
        delete window.__KASHAR_DEMO_RECOVERY__;
        vi.restoreAllMocks();
    });

    it('does not expose recovery controls outside development or Kashar mode', () => {
        const store = { inspect: vi.fn() };
        expect(installKasharDevRecovery({ isDevelopment: false, isKashar: () => true, store })).toBe(false);
        expect(installKasharDevRecovery({ isDevelopment: true, isKashar: () => false, store })).toBe(false);
        expect(window.__KASHAR_DEMO_RECOVERY__).toBeUndefined();
    });

    it('exposes diagnostics and confirmation-protected reset only for development Kashar', async () => {
        const store = {
            inspect: vi.fn().mockResolvedValue({ records: [] }),
            getRawForRecovery: vi.fn().mockReturnValue('{raw}'),
            exportDraft: vi.fn().mockResolvedValue({ format: 'site-builder-kashar-draft' }),
            reset: vi.fn().mockResolvedValue({}),
            importDraftText: vi.fn().mockResolvedValue({}),
        };
        vi.spyOn(window, 'confirm').mockReturnValue(true);

        expect(installKasharDevRecovery({ isDevelopment: true, isKashar: () => true, store })).toBe(true);
        await expect(window.__KASHAR_DEMO_RECOVERY__.inspect()).resolves.toEqual({ records: [] });
        expect(window.__KASHAR_DEMO_RECOVERY__.getRaw('draft')).toBe('{raw}');
        await window.__KASHAR_DEMO_RECOVERY__.reset();
        await window.__KASHAR_DEMO_RECOVERY__.importDraft('{"format":"site-builder-kashar-draft"}');

        expect(store.reset).toHaveBeenCalledTimes(1);
        expect(store.importDraftText).toHaveBeenCalledTimes(1);
    });
});
