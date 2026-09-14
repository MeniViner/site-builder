import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ADMIN_STALE_THRESHOLD_MS,
    assertAdminEditSessionFresh,
    beginAdminEditSession,
    endAdminEditSession,
    recordAdminActivity,
    recordAdminVisibility,
} from './adminEditSession';

describe('adminEditSession', () => {
    beforeEach(() => beginAdminEditSession(1_000));
    afterEach(() => {
        endAdminEditSession();
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
});
