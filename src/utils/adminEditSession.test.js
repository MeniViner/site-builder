import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ADMIN_STALE_THRESHOLD_MS,
    ADMIN_RECOVERY_DRAFT_STORAGE_KEY,
    assertAdminEditSessionFresh,
    beginAdminEditSession,
    completeAdminRecoveryRevalidation,
    endAdminEditSession,
    getAdminRecoveryState,
    prepareAdminSafeReload,
    recordAdminActivity,
    recordAdminVisibility,
    registerAdminPersistenceController,
    registerAdminRecoveryParticipant,
    resetAdminEditSessionForTests,
    shouldWarnBeforeAdminUnload,
} from './adminEditSession';

describe('adminEditSession', () => {
    beforeEach(() => {
        sessionStorage.clear();
        resetAdminEditSessionForTests();
        beginAdminEditSession(1_000);
    });
    afterEach(() => {
        endAdminEditSession();
        resetAdminEditSessionForTests();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('blocks mutations after the inactivity threshold and stays latched', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_000 + ADMIN_STALE_THRESHOLD_MS + 1);
        expect(() => assertAdminEditSessionFresh()).toThrow('חייבים לרענן');
        recordAdminActivity(1_000 + ADMIN_STALE_THRESHOLD_MS + 2);
        expect(() => assertAdminEditSessionFresh()).toThrow('חייבים לרענן');
    });

    it('treats a long hidden period as stale', () => {
        recordAdminVisibility(true, 2_000);
        recordAdminVisibility(false, 2_000 + ADMIN_STALE_THRESHOLD_MS + 1);
        expect(() => assertAdminEditSessionFresh()).toThrow('חייבים לרענן');
    });

    it('does not clear a latched stale session on remount before fresh-state revalidation', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_000 + ADMIN_STALE_THRESHOLD_MS + 1);
        expect(() => assertAdminEditSessionFresh()).toThrow();

        endAdminEditSession();
        beginAdminEditSession(10_000);
        expect(() => assertAdminEditSessionFresh()).toThrow();

        completeAdminRecoveryRevalidation(10_001);
        expect(() => assertAdminEditSessionFresh()).not.toThrow();
    });

    it('coordinates dirty editors and persistence state for unload warnings', () => {
        const unregisterEditor = registerAdminRecoveryParticipant({
            id: 'alerts',
            isDirty: () => true,
            captureDraft: () => ({ title: 'טיוטה' }),
        });
        const unregisterPersistence = registerAdminPersistenceController({
            id: 'config',
            getState: () => ({ dirty: false, saving: true }),
            flush: vi.fn(),
        });

        expect(shouldWarnBeforeAdminUnload()).toBe(true);
        unregisterEditor();
        unregisterPersistence();
        expect(shouldWarnBeforeAdminUnload()).toBe(false);
    });

    it('freezes edits, waits for queued persistence, verifies the draft, and approves only that reload', async () => {
        const release = {};
        const flush = vi.fn(() => new Promise((resolve) => {
            release.resolve = resolve;
        }));
        registerAdminRecoveryParticipant({
            id: 'alerts',
            isDirty: () => true,
            captureDraft: () => ({ text: 'טיוטה בטוחה' }),
        });
        registerAdminPersistenceController({
            id: 'config',
            getState: () => ({ dirty: true, saving: true }),
            flush,
        });

        const preparation = prepareAdminSafeReload();
        expect(getAdminRecoveryState()).toMatchObject({ frozen: true, reloadApproved: false });
        expect(() => assertAdminEditSessionFresh()).toThrow(/מוקפאת/);
        expect(flush).toHaveBeenCalledOnce();

        release.resolve({ ok: true });
        await expect(preparation).resolves.toMatchObject({ reloadApproved: true, draftVerified: true });
        expect(JSON.parse(sessionStorage.getItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY))).toMatchObject({
            participants: { alerts: { text: 'טיוטה בטוחה' } },
        });
        expect(shouldWarnBeforeAdminUnload()).toBe(false);
    });

    it('does not approve reload when persistence fails and no recoverable draft exists', async () => {
        registerAdminPersistenceController({
            id: 'config',
            getState: () => ({ dirty: true, saving: false }),
            flush: vi.fn().mockRejectedValue(new Error('save failed')),
        });

        await expect(prepareAdminSafeReload()).rejects.toThrow('save failed');
        expect(getAdminRecoveryState().reloadApproved).toBe(false);
        expect(shouldWarnBeforeAdminUnload()).toBe(true);
    });

    it('continues with a verified save when sessionStorage cannot preserve a large draft', async () => {
        let dirty = true;
        vi.stubGlobal('sessionStorage', {
            getItem: vi.fn(() => null),
            removeItem: vi.fn(),
            setItem: vi.fn(() => {
                throw new DOMException('quota exceeded', 'QuotaExceededError');
            }),
        });
        registerAdminPersistenceController({
            id: 'config',
            getState: () => ({ dirty }),
            captureDraft: () => ({ text: 'large config draft' }),
            flush: vi.fn(async () => {
                dirty = false;
            }),
        });

        await expect(prepareAdminSafeReload()).resolves.toMatchObject({
            persisted: true,
            draftVerified: false,
            reloadApproved: true,
        });
    });
});
