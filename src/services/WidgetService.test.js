import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WidgetService } from './WidgetService';
import kasharDraftStore, { KASHAR_DRAFT_FORMAT, KASHAR_DRAFT_STORAGE_KEY } from './KasharDraftStore';

const storageState = vi.hoisted(() => ({ kashar: false }));

vi.mock('../config/sharepoint.config', () => ({
    SHAREPOINT_CONFIG: {
        useMock: true,
        widgetsMockStorageKey: 'test_widget_data',
        widgetsFileServerRelativeUrl: '/sites/widgets/siteDB/siteAssets/widgets_data.txt',
    },
}));

vi.mock('./storage/storageBackend', () => ({
    isMongoStorageBackend: () => false,
    isSharePointReadonlyBackend: () => false,
}));

vi.mock('../demo-data/demoProfile', () => ({
    isKasharDemoProfile: () => storageState.kashar,
}));

vi.mock('./storage/LegacyObjectStorageAdapter', () => ({
    createLegacyObjectStorageAdapter: () => ({
        load: vi.fn(),
        save: vi.fn(),
    }),
}));

describe('WidgetService Kashar persistence', () => {
    beforeEach(() => {
        storageState.kashar = false;
        localStorage.clear();
    });

    it('seeds empty Kashar shared widget data once and keeps changes after reload', async () => {
        storageState.kashar = true;
        const service = new WidgetService();

        const seeded = await service.getWidgetConfig();
        expect(seeded).toMatchObject({
            activeWidgets: ['news', 'events', 'heritage'],
            polls: [],
        });

        await service.saveWidgetConfig({
            ...seeded,
            polls: [{ id: 'saved-poll', question: 'נשמר', options: [], active: true }],
        });

        await expect(new WidgetService().getWidgetConfig()).resolves.toMatchObject({
            polls: [{ id: 'saved-poll', question: 'נשמר' }],
        });
        expect(JSON.parse(localStorage.getItem(KASHAR_DRAFT_STORAGE_KEY))).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            sharedWidgetConfig: { polls: [{ id: 'saved-poll', question: 'נשמר' }] },
        });
    });

    it('reads reset shared-widget data from the shared Kashar draft', async () => {
        storageState.kashar = true;
        const service = new WidgetService();
        const seeded = await service.getWidgetConfig();
        await service.saveWidgetConfig({
            ...seeded,
            polls: [{ id: 'edited-poll', question: 'עריכה', options: [], active: true }],
        });

        await kasharDraftStore.reset();
        await expect(new WidgetService().getWidgetConfig()).resolves.toMatchObject({ polls: [] });
    });
});
