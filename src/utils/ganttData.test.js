import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GANTT_DATA,
    DEFAULT_GANTT_DESIGN,
    GANTT_DESIGN_PRESETS,
    GANTT_COLOR_OPTIONS,
    applyGanttDesignPreset,
    computeGanttProgress,
    computeGanttTimeStatus,
    normalizeGanttData,
    normalizeGanttDesignSettings,
    normalizeGanttMilestones,
} from './ganttData';

describe('gantt data normalization', () => {
    it('keeps legacy gantt data safe when newer optional fields are missing', () => {
        const normalized = normalizeGanttData({
            enabled: true,
            pageTitle: 'תכנית עבודה',
            groupBy: 'category',
            showLegend: true,
            items: [
                {
                    id: 'task-1',
                    title: 'בדיקת תאימות',
                    category: 'תשתיות',
                    status: 'done',
                    startDate: '2026-01-10',
                    endDate: '2026-01-08',
                    progress: 140,
                    color: '#16a34a',
                },
            ],
        });

        expect(normalized.enabled).toBe(true);
        expect(normalized.buttonLabel).toBe('תכנית עבודה');
        expect(normalized.defaultView).toBe(DEFAULT_GANTT_DATA.defaultView);
        expect(normalized.showToday).toBe(true);
        expect(normalized.categories).toEqual([
            expect.objectContaining({ name: 'תשתיות', color: '#16a34a' }),
        ]);
        expect(normalized.items[0]).toEqual(expect.objectContaining({
            endDate: '2026-01-10',
            status: 'completed',
            milestones: [],
        }));
    });

    it('falls back for invalid colors without crashing old data', () => {
        const normalized = normalizeGanttData({
            items: [
                {
                    title: 'משימה',
                    startDate: '2026-01-10',
                    endDate: '2026-01-11',
                    color: 'not-a-color',
                },
            ],
        });

        expect(normalized.items[0].color).toBe(GANTT_COLOR_OPTIONS[0]);
    });

    it('normalizes missing milestones to an empty array', () => {
        const normalized = normalizeGanttData({
            items: [{ title: 'משימה', startDate: '2026-01-01', endDate: '2026-01-05' }],
        });

        expect(normalized.items[0].milestones).toEqual([]);
    });

    it('sorts and renumbers milestones while ignoring invalid dates', () => {
        expect(normalizeGanttMilestones([
            { id: 'late', title: 'מאוחר', date: '2026-02-15', order: 7 },
            { id: 'bad', title: 'לא תקין', date: 'bad-date', order: 1 },
            { id: 'early', title: 'מוקדם', date: '2026-02-01', order: 5 },
        ])).toEqual([
            expect.objectContaining({ id: 'early', order: 1, date: '2026-02-01' }),
            expect.objectContaining({ id: 'late', order: 2, date: '2026-02-15' }),
        ]);
    });

    it('converts a legacy task milestone flag into an optional milestone marker', () => {
        const normalized = normalizeGanttData({
            items: [
                {
                    id: 'task-legacy',
                    title: 'מסירה',
                    milestone: true,
                    startDate: '2026-02-01',
                    endDate: '2026-02-10',
                },
            ],
        });

        expect(normalized.items[0].milestones).toEqual([
            expect.objectContaining({
                id: 'task-legacy-legacy-milestone',
                title: 'אבן דרך',
                date: '2026-02-10',
                order: 1,
            }),
        ]);
    });

    it('adds safe default design settings when old gantt data has no settings block', () => {
        const normalized = normalizeGanttData({
            enabled: true,
            items: [],
        });

        expect(normalized.settings.design).toEqual(DEFAULT_GANTT_DESIGN);
        expect(normalized.settings.design.presetId).toBe('classic-beige');
    });

    it('normalizes missing settings.design without crashing', () => {
        const normalized = normalizeGanttData({
            settings: { unrelatedFutureSetting: true },
            items: [],
        });

        expect(normalized.settings.unrelatedFutureSetting).toBe(true);
        expect(normalized.settings.design.presetId).toBe('classic-beige');
    });
});

describe('gantt design settings', () => {
    it('includes all required visual presets', () => {
        expect(GANTT_DESIGN_PRESETS.map((preset) => preset.id)).toEqual([
            'classic-beige',
            'clean-card',
            'full-board',
            'compact',
            'glass-modern',
        ]);
    });

    it('applies the clean-card preset to design settings', () => {
        expect(applyGanttDesignPreset('clean-card')).toEqual(expect.objectContaining({
            presetId: 'clean-card',
            chartWidthMode: 'contained',
            cardStyle: 'clean',
            backgroundStyle: 'clean',
            toolbarStyle: 'compact',
        }));
    });

    it('falls back safely for invalid design options and colors', () => {
        const normalized = normalizeGanttDesignSettings({
            presetId: 'missing',
            density: 'huge',
            colors: {
                accentColor: 'not-a-color',
            },
        });

        expect(normalized.presetId).toBe('classic-beige');
        expect(normalized.density).toBe(DEFAULT_GANTT_DESIGN.density);
        expect(normalized.colors.accentColor).toBe(DEFAULT_GANTT_DESIGN.colors.accentColor);
    });

    it('keeps selected design settings in normalized gantt data', () => {
        const normalized = normalizeGanttData({
            settings: {
                design: {
                    presetId: 'compact',
                    taskColumnWidth: 'wide',
                    showProgressLabel: false,
                },
            },
            items: [],
        });

        expect(normalized.settings.design).toEqual(expect.objectContaining({
            presetId: 'compact',
            density: 'compact',
            taskColumnWidth: 'wide',
            showProgressLabel: false,
        }));
    });
});

describe('computeGanttProgress', () => {
    it('returns 0 before task start', () => {
        expect(computeGanttProgress({ startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-09')).toBe(0);
    });

    it('returns a valid value on the start day', () => {
        expect(computeGanttProgress({ startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-10')).toBe(0);
    });

    it('returns about half progress in the middle', () => {
        expect(computeGanttProgress({ startDate: '2026-01-01', endDate: '2026-01-11' }, '2026-01-06')).toBe(50);
    });

    it('returns 100 after task end', () => {
        expect(computeGanttProgress({ startDate: '2026-01-01', endDate: '2026-01-11' }, '2026-01-12')).toBe(100);
    });

    it('handles one-day tasks before the date', () => {
        expect(computeGanttProgress({ startDate: '2026-01-10', endDate: '2026-01-10' }, '2026-01-09')).toBe(0);
    });

    it('handles one-day tasks on or after the date', () => {
        expect(computeGanttProgress({ startDate: '2026-01-10', endDate: '2026-01-10' }, '2026-01-10')).toBe(100);
        expect(computeGanttProgress({ startDate: '2026-01-10', endDate: '2026-01-10' }, '2026-01-11')).toBe(100);
    });

    it('falls back safely for invalid dates', () => {
        expect(computeGanttProgress({ startDate: 'bad', endDate: '2026-01-10' }, '2026-01-05')).toBe(0);
    });
});

describe('computeGanttTimeStatus', () => {
    it('marks future tasks as upcoming', () => {
        expect(computeGanttTimeStatus({ status: 'planned', startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-09')).toBe('upcoming');
    });

    it('marks in-range tasks as active', () => {
        expect(computeGanttTimeStatus({ status: 'planned', startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-15')).toBe('active');
    });

    it('marks unfinished past tasks as overdue', () => {
        expect(computeGanttTimeStatus({ status: 'planned', startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-21')).toBe('overdue');
    });

    it('lets completed manual status override date state', () => {
        expect(computeGanttTimeStatus({ status: 'completed', startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-12')).toBe('completed');
    });

    it('lets cancelled manual status use the cancelled visual state', () => {
        expect(computeGanttTimeStatus({ status: 'cancelled', startDate: '2026-01-10', endDate: '2026-01-20' }, '2026-01-12')).toBe('cancelled');
    });

    it('marks invalid dates as invalidDate', () => {
        expect(computeGanttTimeStatus({ status: 'planned', startDate: 'bad', endDate: '2026-01-20' }, '2026-01-12')).toBe('invalidDate');
    });
});
