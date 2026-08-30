import { describe, expect, it } from 'vitest';
import {
    DEFAULT_BOOM_DATA,
    createBoomTask,
    normalizeBoomData,
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
            progress: 100,
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
        expect(task.progress).toBe(0);
    });
});
