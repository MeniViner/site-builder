import { describe, expect, it } from 'vitest';
import {
    GANTT_TIMELINE_VIEW_CONFIG,
    buildGanttTimelineModel,
    resolveGanttTimelineRange,
    toGanttDateString,
} from './ganttTimeline';

const items = [{ startDate: '2026-01-10', endDate: '2026-01-20' }];
const commonModelArgs = {
    items,
    viewportWidth: 1280,
    taskColumnWidth: 260,
    todayString: '2026-01-15',
    showToday: true,
    groupBy: 'none',
    categories: [],
};

describe('Day view', () => {
    it('is registered as a first-class timeline view config, distinct from week', () => {
        expect(GANTT_TIMELINE_VIEW_CONFIG.day).toBeTruthy();
        expect(GANTT_TIMELINE_VIEW_CONFIG.day.pixelsPerDay).toBeGreaterThan(GANTT_TIMELINE_VIEW_CONFIG.week.pixelsPerDay);
    });

    it('resolves a range covering exactly the task extent with no week-style padding', () => {
        const range = resolveGanttTimelineRange(items, 'day', '2026-01-15');
        expect(toGanttDateString(range.start)).toBe('2026-01-10');
        expect(toGanttDateString(range.end)).toBe('2026-01-20');
    });

    it('paginates one day at a time via periodOffset (unlike week/month/quarter)', () => {
        const base = resolveGanttTimelineRange(items, 'day', '2026-01-15', 0);
        const next = resolveGanttTimelineRange(items, 'day', '2026-01-15', 1);
        expect(toGanttDateString(next.start)).toBe(toGanttDateString(base.start + 24 * 60 * 60 * 1000));
    });

    it('builds a valid timeline model with a wider day column than week/month/quarter', () => {
        const day = buildGanttTimelineModel({ ...commonModelArgs, viewMode: 'day' });
        const week = buildGanttTimelineModel({ ...commonModelArgs, viewMode: 'week' });
        const month = buildGanttTimelineModel({ ...commonModelArgs, viewMode: 'month' });
        const quarter = buildGanttTimelineModel({ ...commonModelArgs, viewMode: 'quarter' });

        expect(day.viewMode).toBe('day');
        expect(day.dayWidth).toBeGreaterThan(week.dayWidth);
        expect(week.dayWidth).toBeGreaterThan(month.dayWidth);
        expect(month.dayWidth).toBeGreaterThan(quarter.dayWidth);
    });
});

describe('existing view modes remain intact', () => {
    it('still supports week, month and quarter after adding day', () => {
        ['week', 'month', 'quarter'].forEach((viewMode) => {
            const model = buildGanttTimelineModel({ ...commonModelArgs, viewMode });
            expect(model.viewMode).toBe(viewMode);
            expect(model.totalDays).toBeGreaterThan(0);
        });
    });

    it('falls back to month for an unknown view mode', () => {
        const range = resolveGanttTimelineRange(items, 'not-a-real-view', '2026-01-15');
        const monthRange = resolveGanttTimelineRange(items, 'month', '2026-01-15');
        expect(range).toEqual(monthRange);
    });
});
