import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GANTT_DATA } from '../utils/ganttData';
import { GanttService } from './GanttService';
import kasharDraftStore, { KASHAR_DRAFT_FORMAT, KASHAR_DRAFT_STORAGE_KEY } from './KasharDraftStore';

const storageState = vi.hoisted(() => ({ mongo: false, kashar: false }));

vi.mock('./storage/storageBackend', () => ({
    isMongoStorageBackend: () => storageState.mongo,
    isLocalDevStorageBackend: () => !storageState.mongo,
    isSharePointReadonlyBackend: () => false,
}));

vi.mock('../demo-data/demoProfile', () => ({
    isKasharDemoProfile: () => storageState.kashar,
}));

const mockConfig = {
    useMock: true,
    ganttMockStorageKey: 'test_gantt_data',
    ganttFileServerRelativeUrl: '/sites/schedule/siteDB/siteAssets/gantt_data.txt',
};

describe('GanttService', () => {
    beforeEach(() => {
        storageState.mongo = false;
        storageState.kashar = false;
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('falls back to default disabled sample gantt data when local mock data is missing', async () => {
        const service = new GanttService(mockConfig);

        const loaded = await service.getGantt();

        expect(loaded.enabled).toBe(false);
        expect(loaded.items.length).toBe(DEFAULT_GANTT_DATA.items.length);
        expect(loaded.items.some((item) => item.id === 'gantt-demo-weekly-update')).toBe(true);
        expect(JSON.parse(localStorage.getItem(mockConfig.ganttMockStorageKey))).toEqual(expect.objectContaining({
            enabled: DEFAULT_GANTT_DATA.enabled,
            items: expect.arrayContaining([
                expect.objectContaining({ id: 'gantt-demo-weekly-update' }),
            ]),
        }));
    });

    it('persists local/dev gantt edits through the existing localStorage mock path', async () => {
        const service = new GanttService(mockConfig);

        await service.saveGantt({
            enabled: true,
            buttonLabel: 'כפתור גאנט',
            pageTitle: 'גאנט בדיקה',
            description: 'תיאור בדיקה לגאנט',
            items: [
                {
                    title: 'משימה מקומית',
                    startDate: '2026-01-01',
                    endDate: '2026-01-05',
                    category: 'בדיקות',
                },
            ],
        });
        const loaded = await service.getGantt();

        expect(loaded.enabled).toBe(true);
        expect(loaded.buttonLabel).toBe('כפתור גאנט');
        expect(loaded.pageTitle).toBe('גאנט בדיקה');
        expect(loaded.description).toBe('תיאור בדיקה לגאנט');
        expect(loaded.items[0]).toEqual(expect.objectContaining({
            title: 'משימה מקומית',
            milestones: [],
        }));
    });

    it('resets corrupted local mock data so local/dev can recover', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        localStorage.setItem(mockConfig.ganttMockStorageKey, '{bad json');
        const service = new GanttService(mockConfig);

        const loaded = await service.getGantt();

        expect(loaded.enabled).toBe(false);
        expect(loaded.items.length).toBe(DEFAULT_GANTT_DATA.items.length);
        expect(() => JSON.parse(localStorage.getItem(mockConfig.ganttMockStorageKey))).not.toThrow();
    });

    it('uses the SharePoint gantt_data.txt path in production mode', async () => {
        const service = new GanttService({ ...mockConfig, useMock: false });
        let savedPath = '';
        service._saveSharePointData = async function saveSharePointData(payload) {
            savedPath = this.config.ganttFileServerRelativeUrl;
            return payload;
        };

        await service.saveGantt({ enabled: true, items: [] });

        expect(savedPath).toBe('/sites/schedule/siteDB/siteAssets/gantt_data.txt');
    });

    it('seeds empty Kashar gantt data once and preserves an edit after reload', async () => {
        storageState.kashar = true;
        const service = new GanttService(mockConfig);

        const loaded = await service.getGantt();

        expect(loaded).toMatchObject({
            enabled: true,
            pageTitle: 'תכנית עבודה שנתית – הדגמה',
        });
        expect(loaded.items.some((item) => item.dependsOn.length > 0)).toBe(true);
        expect(JSON.parse(localStorage.getItem(KASHAR_DRAFT_STORAGE_KEY))).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            gantt: { pageTitle: 'תכנית עבודה שנתית – הדגמה' },
        });

        await service.saveGantt({
            ...loaded,
            pageTitle: 'גאנט שנערך ונשמר',
        });

        const reloaded = await new GanttService(mockConfig).getGantt();
        expect(reloaded.pageTitle).toBe('גאנט שנערך ונשמר');
        expect(JSON.parse(localStorage.getItem(KASHAR_DRAFT_STORAGE_KEY))).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            gantt: { pageTitle: 'גאנט שנערך ונשמר' },
        });
    });

    it('reads the reset Kashar gantt fixture from the shared draft', async () => {
        storageState.kashar = true;
        const service = new GanttService(mockConfig);
        const seeded = await service.getGantt();
        await service.saveGantt({ ...seeded, pageTitle: 'גאנט שנערך' });

        await kasharDraftStore.reset();
        await expect(new GanttService(mockConfig).getGantt()).resolves.toMatchObject({
            pageTitle: 'תכנית עבודה שנתית – הדגמה',
        });
    });

    it('falls back safely when production gantt_data.txt is missing', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: vi.fn().mockResolvedValue(''),
        });
        const service = new GanttService({ ...mockConfig, useMock: false });

        const loaded = await service.getGantt();

        expect(globalThis.fetch).toHaveBeenCalled();
        expect(loaded.enabled).toBe(false);
        expect(loaded.items.length).toBe(DEFAULT_GANTT_DATA.items.length);
    });
});
