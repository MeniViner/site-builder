import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GANTT_DATA } from '../utils/ganttData';
import { GanttService } from './GanttService';

const mockConfig = {
    useMock: true,
    ganttMockStorageKey: 'test_gantt_data',
    ganttFileServerRelativeUrl: '/sites/schedule/siteDB/siteAssets/gantt_data.txt',
};

describe('GanttService', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('falls back to default disabled gantt data when local mock data is missing', async () => {
        const service = new GanttService(mockConfig);

        const loaded = await service.getGantt();

        expect(loaded.enabled).toBe(false);
        expect(loaded.items).toEqual([]);
        expect(JSON.parse(localStorage.getItem(mockConfig.ganttMockStorageKey))).toEqual(expect.objectContaining({
            enabled: DEFAULT_GANTT_DATA.enabled,
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

    it('falls back safely when production gantt_data.txt is missing', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
        });
        const service = new GanttService({ ...mockConfig, useMock: false });

        const loaded = await service.getGantt();

        expect(globalThis.fetch).toHaveBeenCalled();
        expect(loaded.enabled).toBe(false);
        expect(loaded.items).toEqual([]);
    });
});
