import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ADMIN_STALE_THRESHOLD_MS,
    assertAdminEditSessionFresh,
    beginAdminEditSession,
    completeAdminRecoveryRevalidation,
    endAdminEditSession,
    getAdminRecoveryState,
    getAdminRecoveryStorageKey,
    prepareAdminSafeReload,
    recordAdminActivity,
    recordAdminVisibility,
    registerAdminPersistenceController,
    registerAdminRecoveryParticipant,
    resetAdminEditSessionForTests,
    setAdminRecoveryScope,
    shouldWarnBeforeAdminUnload,
} from './adminEditSession';

describe('adminEditSession', () => {
    beforeEach(() => {
        sessionStorage.clear();
        resetAdminEditSessionForTests();
        setAdminRecoveryScope({ backend: 'txt', target: '/sites/alpha/data', user: 'user-a' });
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
        let dirty = true;
        const flush = vi.fn(() => new Promise((resolve) => {
            release.resolve = (value) => {
                dirty = false;
                resolve(value);
            };
        }));
        registerAdminRecoveryParticipant({
            id: 'alerts',
            isDirty: () => true,
            captureDraft: () => ({ text: 'טיוטה בטוחה' }),
        });
        registerAdminPersistenceController({
            id: 'config',
            getState: () => ({ dirty, saving: dirty }),
            flush,
        });

        const preparation = prepareAdminSafeReload();
        expect(getAdminRecoveryState()).toMatchObject({ frozen: true, reloadApproved: false });
        expect(() => assertAdminEditSessionFresh()).toThrow(/מוקפאת/);
        expect(flush).toHaveBeenCalledOnce();

        release.resolve({ ok: true });
        await expect(preparation).resolves.toMatchObject({ reloadApproved: true, draftVerified: true });
        expect(JSON.parse(sessionStorage.getItem(getAdminRecoveryStorageKey()))).toMatchObject({
            version: 2,
            scope: { backend: 'txt', target: '/sites/alpha/data', user: 'user-a' },
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

    it('does not restore another site or user draft and ignores the unscoped legacy envelope', async () => {
        registerAdminRecoveryParticipant({
            id: 'alerts',
            isDirty: () => true,
            captureDraft: () => ({ text: 'site A' }),
        });
        await prepareAdminSafeReload();
        const siteAKey = getAdminRecoveryStorageKey();
        sessionStorage.setItem('siteBuilder.adminRecoveryDraft.v1', JSON.stringify({
            participants: { alerts: { text: 'legacy' } },
        }));

        setAdminRecoveryScope({ backend: 'txt', target: '/sites/beta/data', user: 'user-a' });
        expect(getAdminRecoveryStorageKey()).not.toBe(siteAKey);
        expect(sessionStorage.getItem(getAdminRecoveryStorageKey())).toBeNull();

        setAdminRecoveryScope({ backend: 'txt', target: '/sites/alpha/data', user: 'user-b' });
        expect(sessionStorage.getItem(getAdminRecoveryStorageKey())).toBeNull();
    });

    it('blocks reload when selected file bytes are not recoverable', async () => {
        registerAdminRecoveryParticipant({
            id: 'upload-form',
            isDirty: () => true,
            getState: () => ({
                recoveryBlocked: true,
                recoveryBlockReason: 'pending-file-bytes',
            }),
            captureDraft: () => ({ fileName: 'photo.png' }),
        });

        await expect(prepareAdminSafeReload()).rejects.toThrow('לא ניתן לשחזר');
        expect(getAdminRecoveryState().reloadApproved).toBe(false);
    });
});
