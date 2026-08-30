import { describe, expect, it } from 'vitest';
import {
    DEFAULT_BOOM_DATA,
    clearBoomTasks,
    computeBoomProgress,
    createInitialBoomData,
    deleteBoomCategory,
    loadBoomDemoData,
    createBoomTask,
    normalizeBoomData,
    reorderBoomCategory,
    updateBoomCategory,
} from './boomData';

describe('boomData', () => {
    it('keeps BOOM disabled and independent by default', () => {
        expect(normalizeBoomData()).toEqual(DEFAULT_BOOM_DATA);
        expect(DEFAULT_BOOM_DATA).not.toHaveProperty('groupBy');
        expect(DEFAULT_BOOM_DATA).not.toHaveProperty('defaultView');
    });

    it('normalizes the command-and-control task fields without Gantt-only fields', () => {
        const normalized = normalizeBoomData({
            enabled: true,
            categories: [{ name: 'מבצעים', color: '#0f766e', order: 1 }],
            items: [{
                id: 'task-1',
                title: 'בדיקת מוכנות',
                domain: 'מבצעים',
                responsibleOwner: 'חדר מבצעים',
                status: 'active',
                startDate: '2026-01-02',
                deadline: '2026-01-09',
                progress: 135,
            }],
        });

        expect(normalized.items[0]).toEqual({
            id: 'task-1',
            title: 'בדיקת מוכנות',
            category: 'מבצעים',
            owner: 'חדר מבצעים',
            status: 'active',
            startDate: '2026-01-02',
            endDate: '2026-01-09',
            details: '',
            color: '#0f766e',
            order: 1,
        });
    });

    it('creates valid task defaults and fixes an end date before the start date', () => {
        const task = createBoomTask({
            title: 'משימה',
            startDate: '2026-05-10',
            endDate: '2026-05-01',
        });

        expect(task.id).toMatch(/^boom-/);
        expect(task.endDate).toBe('2026-05-10');
        expect(task).not.toHaveProperty('progress');
    });

    it('seeds newly initialized BOOM data with useful disabled demo tasks', () => {
        const initialized = createInitialBoomData(new Date('2026-06-15T12:00:00'));

        expect(initialized.enabled).toBe(false);
        expect(initialized.categories).toHaveLength(3);
        expect(initialized.items).toHaveLength(4);
        expect(new Set(initialized.items.map((task) => task.owner)).size).toBeGreaterThan(2);
        expect(initialized.items.every((task) => !Object.hasOwn(task, 'progress'))).toBe(true);
    });

    it('loads and clears demo tasks without changing basic or design settings', () => {
        const current = normalizeBoomData({
            enabled: true,
            buttonLabel: 'חדר מצב',
            design: { preset: 'compact' },
            items: [{ id: 'old', title: 'ישן' }],
        });
        const loaded = loadBoomDemoData(current, new Date('2026-06-15T12:00:00'));
        const cleared = clearBoomTasks(loaded);

        expect(loaded).toMatchObject({ enabled: true, buttonLabel: 'חדר מצב', design: { preset: 'compact' } });
        expect(loaded.items).toHaveLength(4);
        expect(cleared.items).toEqual([]);
        expect(cleared.design.preset).toBe('compact');
    });

    it.each([
        ['future', { startDate: '2026-06-20', endDate: '2026-06-30' }, 0],
        ['current', { startDate: '2026-06-10', endDate: '2026-06-20' }, 50],
        ['past', { startDate: '2026-06-01', endDate: '2026-06-10' }, 100],
        ['same day', { startDate: '2026-06-15', endDate: '2026-06-15' }, 100],
        ['invalid', { startDate: '', endDate: '' }, 0],
    ])('derives %s task progress from dates', (_label, task, expected) => {
        expect(computeBoomProgress(task, new Date('2026-06-15T12:00:00'))).toBe(expected);
    });

    it('ignores an old persisted manual progress value', () => {
        const normalized = normalizeBoomData({
            items: [{
                id: 'legacy',
                title: 'משימה ישנה',
                category: 'כללי',
                startDate: '2026-06-10',
                endDate: '2026-06-20',
                progress: 99,
            }],
        });

        expect(normalized.items[0]).not.toHaveProperty('progress');
        expect(computeBoomProgress(normalized.items[0], new Date('2026-06-15T12:00:00'))).toBe(50);
    });

    it('normalizes persisted dashboard design settings to supported values', () => {
        const normalized = normalizeBoomData({
            design: {
                preset: 'command-center',
                showDashboard: false,
                dashboardTitle: '  תמונת מצב מבצעית  ',
                dashboardWidgets: ['overview', 'status', 'unknown', 'overview'],
                dashboardDensity: 'compact',
                tableDensity: 'compact',
                showCategoryColors: false,
                accent: 'emerald',
                cardEmphasis: 'outlined',
                headerStyle: 'minimal',
            },
        });

        expect(normalized.design).toMatchObject({
            preset: 'command-center',
            showDashboard: false,
            dashboardTitle: 'תמונת מצב מבצעית',
            dashboardWidgets: ['overview', 'status'],
            dashboardDensity: 'compact',
            tableDensity: 'compact',
            showCategoryColors: false,
            accent: 'emerald',
            cardEmphasis: 'outlined',
            headerStyle: 'minimal',
        });
    });

    it('renames and recolors categories without leaving task references behind', () => {
        const current = normalizeBoomData({
            categories: [
                { id: 'ops', name: 'מבצעים', color: '#2563eb' },
                { id: 'ready', name: 'כשירות', color: '#0f766e' },
            ],
            items: [{ id: 'task', title: 'עדכון', category: 'מבצעים', color: '#2563eb' }],
        });
        const updated = updateBoomCategory(current, 'ops', { name: 'פעילות', color: '#dc2626' });

        expect(updated.categories.find((category) => category.id === 'ops')).toMatchObject({ name: 'פעילות', color: '#dc2626' });
        expect(updated.items[0]).toMatchObject({ category: 'פעילות', color: '#dc2626' });
    });

    it('safely reassigns tasks when deleting a category and preserves category order', () => {
        const current = normalizeBoomData({
            categories: [
                { id: 'ops', name: 'מבצעים', color: '#2563eb' },
                { id: 'ready', name: 'כשירות', color: '#0f766e' },
            ],
            items: [{ id: 'task', title: 'עדכון', category: 'מבצעים', color: '#2563eb' }],
        });
        const reordered = reorderBoomCategory(current, 'ready', -1);
        const deleted = deleteBoomCategory(reordered, 'ops', 'ready');

        expect(deleted.categories).toEqual([expect.objectContaining({ id: 'ready', order: 1 })]);
        expect(deleted.items[0]).toMatchObject({ category: 'כשירות', color: '#0f766e' });
        expect(() => deleteBoomCategory(deleted, 'ready')).toThrow('לא ניתן למחוק את הקטגוריה האחרונה');
    });
});
