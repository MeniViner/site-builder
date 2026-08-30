import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BOOM_DATA } from '../utils/boomData';
import { BoomService } from './BoomService';
import { KASHAR_DRAFT_FORMAT, KASHAR_DRAFT_STORAGE_KEY } from './KasharDraftStore';

const storageState = vi.hoisted(() => ({
    mongo: false,
    kashar: false,
    adapter: {
        load: vi.fn(),
        save: vi.fn(),
    },
    adapterFactory: vi.fn(),
}));

vi.mock('./storage/storageBackend', () => ({
    isMongoStorageBackend: () => storageState.mongo,
    isLocalDevStorageBackend: () => !storageState.mongo,
    isSharePointReadonlyBackend: () => false,
}));

vi.mock('../demo-data/demoProfile', () => ({
    isKasharDemoProfile: () => storageState.kashar,
}));

vi.mock('./storage/LegacyObjectStorageAdapter', () => ({
    createLegacyObjectStorageAdapter: (options) => {
        storageState.adapterFactory(options);
        return storageState.adapter;
    },
}));

const mockConfig = {
    useMock: true,
    boomMockStorageKey: 'test_boom_data',
    boomFileServerRelativeUrl: '/sites/schedule/siteDB/siteAssets/boom_data.txt',
};

describe('BoomService', () => {
    beforeEach(() => {
        storageState.mongo = false;
        storageState.kashar = false;
        localStorage.clear();
        vi.restoreAllMocks();
        storageState.adapter.load.mockReset();
        storageState.adapter.save.mockReset();
        storageState.adapterFactory.mockClear();
    });

    it('seeds an independent disabled BOOM demo document in explicit mock mode', async () => {
        const loaded = await new BoomService(mockConfig).getBoom();

        expect(loaded).toMatchObject({ enabled: false, design: { preset: 'operational' } });
        expect(loaded.items.length).toBeGreaterThan(0);
        expect(JSON.parse(localStorage.getItem(mockConfig.boomMockStorageKey))).toEqual(loaded);
    });

    it('round-trips BOOM task data through the local development store', async () => {
        const service = new BoomService(mockConfig);
        await service.saveBoom({
            enabled: true,
            pageTitle: 'חדר מצב',
            categories: [{ name: 'מבצעים', color: '#2563eb', order: 1 }],
            items: [{
                id: 'task-1',
                title: 'משימת בדיקה',
                category: 'מבצעים',
                owner: 'אחראי',
                status: 'active',
                startDate: '2026-02-01',
                endDate: '2026-02-10',
                progress: 45,
            }],
        });

        await expect(service.getBoom()).resolves.toMatchObject({
            enabled: true,
            pageTitle: 'חדר מצב',
            items: [{ id: 'task-1' }],
        });
        expect((await service.getBoom()).items[0]).not.toHaveProperty('progress');
    });

    it('uses the dedicated BOOM TXT path in production mode', async () => {
        const service = new BoomService({ ...mockConfig, useMock: false });
        service._saveSharePointData = vi.fn(async (payload) => payload);

        await service.saveBoom({ enabled: true, items: [] });

        expect(service.config.boomFileServerRelativeUrl).toBe('/sites/schedule/siteDB/siteAssets/boom_data.txt');
        expect(service._saveSharePointData).toHaveBeenCalledOnce();
    });

    it('uses the dedicated BOOM key through the Mongo legacy-object adapter', async () => {
        storageState.mongo = true;
        storageState.adapter.load.mockResolvedValue({ enabled: true, pageTitle: 'Mongo BOOM', items: [] });
        storageState.adapter.save.mockImplementation(async (payload) => payload);
        const service = new BoomService(mockConfig);

        await expect(service.getBoom()).resolves.toMatchObject({ pageTitle: 'Mongo BOOM' });
        await service.saveBoom({ enabled: true, pageTitle: 'Updated', items: [] });

        expect(storageState.adapterFactory).toHaveBeenCalledWith({
            key: '/sites/schedule/siteDB/siteAssets/boom_data.txt',
        });
        expect(storageState.adapter.load).toHaveBeenCalledOnce();
        expect(storageState.adapter.save).toHaveBeenCalledOnce();
    });

    it('returns disabled defaults when the BOOM TXT has not been provisioned yet', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: vi.fn().mockResolvedValue(''),
        });

        await expect(new BoomService({ ...mockConfig, useMock: false }).getBoom()).resolves.toEqual(DEFAULT_BOOM_DATA);
    });

    it('surfaces non-404 SharePoint read failures instead of presenting disabled defaults', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
        });

        await expect(new BoomService({ ...mockConfig, useMock: false }).getBoom())
            .rejects.toThrow('SharePoint request failed: 403 Forbidden');
    });

    it('persists BOOM independently in the Kashar draft envelope', async () => {
        storageState.kashar = true;
        const service = new BoomService(mockConfig);
        const seeded = await service.getBoom();
        expect(seeded.enabled).toBe(true);

        await service.saveBoom({ ...seeded, pageTitle: 'BOOM שנשמר' });

        expect(JSON.parse(localStorage.getItem(KASHAR_DRAFT_STORAGE_KEY))).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            boom: { pageTitle: 'BOOM שנשמר' },
        });
        await expect(new BoomService(mockConfig).getBoom()).resolves.toMatchObject({ pageTitle: 'BOOM שנשמר' });
    });
});
