import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildGanttTimelineModel } from '../utils/ganttTimeline';
import GanttChart from './GanttChart';

const baseData = {
    enabled: true,
    pageTitle: 'גאנט',
    defaultView: 'month',
    groupBy: 'category',
    showLegend: true,
    showToday: true,
    categories: [{ id: 'cat-1', name: 'בדיקות', color: '#2563eb', order: 1 }],
    items: [
        {
            id: 'task-alpha',
            title: 'משימת אלפא',
            category: 'בדיקות',
            status: 'planned',
            startDate: '2026-01-10',
            endDate: '2026-01-20',
            color: '#2563eb',
            milestones: [{ id: 'ms-alpha', title: 'מסירה', date: '2026-01-15', order: 1 }],
        },
        {
            id: 'task-beta',
            title: 'משימת בטא',
            category: 'בדיקות',
            status: 'blocked',
            startDate: '2026-01-22',
            endDate: '2026-01-24',
            color: '#16a34a',
        },
    ],
};

function readChartMetrics(container) {
    const root = container.querySelector('[data-gantt-view-mode]');
    const bar = container.querySelector('[data-gantt-task-bar="task-alpha"]');
    const todayLine = container.querySelector('[data-gantt-today-line="header"]');
    return {
        viewMode: root?.getAttribute('data-gantt-view-mode'),
        periodOffset: Number(root?.getAttribute('data-gantt-period-offset')),
        rangeStart: root?.getAttribute('data-gantt-range-start'),
        rangeEnd: root?.getAttribute('data-gantt-range-end'),
        dayWidth: Number(root?.getAttribute('data-gantt-day-width')),
        totalDays: Number(root?.getAttribute('data-gantt-total-days')),
        timelineWidth: Number(root?.getAttribute('data-gantt-timeline-width')),
        barX: Number(bar?.getAttribute('data-gantt-x')),
        barWidth: Number(bar?.getAttribute('data-gantt-width')),
        todayX: todayLine ? Number(todayLine.getAttribute('data-gantt-x')) : null,
        tickCount: container.querySelectorAll('[data-gantt-tick]').length,
        tickDates: [...container.querySelectorAll('[data-gantt-tick]')].map((tick) => tick.getAttribute('data-gantt-tick')),
    };
}

describe('GanttChart', () => {
    beforeEach(() => {
        Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            writable: true,
            value: 1280,
        });
    });

    it('renders without crashing when design settings are missing', () => {
        render(
            <GanttChart
                viewportHeight="420px"
                data={{
                    enabled: true,
                    pageTitle: 'גאנט',
                    defaultView: 'month',
                    groupBy: 'category',
                    showLegend: true,
                    showToday: true,
                    categories: [],
                    items: [
                        {
                            id: 'task-1',
                            title: 'משימה לבדיקה',
                            category: 'בדיקות',
                            status: 'planned',
                            startDate: '2026-01-01',
                            endDate: '2026-01-10',
                            color: '#2563eb',
                        },
                    ],
                }}
            />
        );

        expect(screen.getAllByText('משימה לבדיקה').length).toBeGreaterThan(0);
    });

    it('uses distinct week, month and quarter timeline scale configs', () => {
        const common = {
            items: baseData.items,
            viewportWidth: 1280,
            taskColumnWidth: 260,
            todayString: '2026-01-15',
            showToday: true,
            groupBy: 'category',
            categories: baseData.categories,
        };

        const week = buildGanttTimelineModel({ ...common, viewMode: 'week' });
        const month = buildGanttTimelineModel({ ...common, viewMode: 'month' });
        const quarter = buildGanttTimelineModel({ ...common, viewMode: 'quarter' });

        expect(week.viewMode).toBe('week');
        expect(month.viewMode).toBe('month');
        expect(quarter.viewMode).toBe('quarter');
        expect(week.totalDays).toBeLessThan(month.totalDays);
        expect(month.totalDays).toBeLessThan(quarter.totalDays);
        expect(week.dayWidth).toBeGreaterThan(month.dayWidth);
        expect(month.dayWidth).toBeGreaterThan(quarter.dayWidth);
        expect(week.ticks.map((tick) => tick.date)).not.toEqual(month.ticks.map((tick) => tick.date));
        expect(month.ticks.map((tick) => tick.date)).not.toEqual(quarter.ticks.map((tick) => tick.date));
        expect(week.todayOffset).not.toBe(month.todayOffset);
        expect(month.todayOffset).not.toBe(quarter.todayOffset);
    });

    it('moves the timeline range by the selected view period', () => {
        const common = {
            items: baseData.items,
            viewportWidth: 1280,
            taskColumnWidth: 260,
            todayString: '2026-01-15',
            showToday: true,
            groupBy: 'category',
            categories: baseData.categories,
        };

        const month = buildGanttTimelineModel({ ...common, viewMode: 'month' });
        const nextMonth = buildGanttTimelineModel({ ...common, viewMode: 'month', periodOffset: 1 });
        const previousWeek = buildGanttTimelineModel({ ...common, viewMode: 'week', periodOffset: -1 });
        const nextQuarter = buildGanttTimelineModel({ ...common, viewMode: 'quarter', periodOffset: 1 });

        expect(month.periodOffset).toBe(0);
        expect(new Date(month.start).toISOString().slice(0, 10)).toBe('2026-01-01');
        expect(new Date(nextMonth.start).toISOString().slice(0, 10)).toBe('2026-02-01');
        expect(new Date(nextMonth.end).toISOString().slice(0, 10)).toBe('2026-02-28');
        expect(new Date(previousWeek.start).toISOString().slice(0, 10)).toBe('2025-12-27');
        expect(new Date(nextQuarter.start).toISOString().slice(0, 10)).toBe('2026-04-01');
        expect(new Date(nextQuarter.end).toISOString().slice(0, 10)).toBe('2026-06-30');
    });

    it('clicking view buttons recalculates board geometry, bars and ticks', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);

        const month = readChartMetrics(container);
        fireEvent.click(screen.getByRole('button', { name: 'שבוע', exact: true }));
        const week = readChartMetrics(container);
        fireEvent.click(screen.getByRole('button', { name: 'רבעון', exact: true }));
        const quarter = readChartMetrics(container);

        expect(month.viewMode).toBe('month');
        expect(week.viewMode).toBe('week');
        expect(quarter.viewMode).toBe('quarter');
        expect(week.dayWidth).toBeGreaterThan(month.dayWidth);
        expect(month.dayWidth).toBeGreaterThan(quarter.dayWidth);
        expect(week.barWidth).toBeGreaterThan(month.barWidth);
        expect(month.barWidth).toBeGreaterThan(quarter.barWidth);
        expect(week.barX).not.toBe(month.barX);
        expect(month.barX).not.toBe(quarter.barX);
        expect(week.tickDates).not.toEqual(month.tickDates);
        expect(month.tickDates).not.toEqual(quarter.tickDates);
        expect(week.tickCount).not.toBe(month.tickCount);
    });

    it('keeps filters and search while switching view modes', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);

        fireEvent.change(screen.getByPlaceholderText('חיפוש משימה'), { target: { value: 'אלפא' } });
        expect(screen.getByText('משימת אלפא')).toBeTruthy();
        expect(screen.queryByText('משימת בטא')).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: 'רבעון', exact: true }));

        expect(screen.getByPlaceholderText('חיפוש משימה').value).toBe('אלפא');
        expect(screen.getByText('משימת אלפא')).toBeTruthy();
        expect(screen.queryByText('משימת בטא')).toBeNull();
        expect(readChartMetrics(container).viewMode).toBe('quarter');
    });

    it('period arrow buttons move ranges without clearing filters', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        const month = readChartMetrics(container);

        fireEvent.change(screen.getByPlaceholderText('חיפוש משימה'), { target: { value: 'אלפא' } });
        fireEvent.click(screen.getByRole('button', { name: 'חודש הבא', exact: true }));
        const nextMonth = readChartMetrics(container);

        expect(nextMonth.viewMode).toBe('month');
        expect(nextMonth.periodOffset).toBe(1);
        expect(nextMonth.rangeStart).not.toBe(month.rangeStart);
        expect(nextMonth.tickDates).not.toEqual(month.tickDates);
        expect(screen.getByPlaceholderText('חיפוש משימה').value).toBe('אלפא');

        fireEvent.click(screen.getByRole('button', { name: 'שבוע', exact: true }));
        const resetWeek = readChartMetrics(container);
        expect(resetWeek.viewMode).toBe('week');
        expect(resetWeek.periodOffset).toBe(0);
    });

    it('keeps the Gantt shell RTL after scale changes', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        fireEvent.click(screen.getByRole('button', { name: 'שבוע', exact: true }));

        expect(container.querySelector('[data-gantt-view-mode]')?.getAttribute('dir')).toBe('rtl');
    });

    it('keeps clean-card constrained by default but full width in public layout', () => {
        const cleanCardData = {
            ...baseData,
            settings: {
                design: {
                    presetId: 'clean-card',
                    layoutMode: 'centered',
                    chartWidthMode: 'contained',
                    chartHeightMode: 'viewport',
                    density: 'comfortable',
                    taskColumnWidth: 'medium',
                    cardStyle: 'clean',
                    backgroundStyle: 'clean',
                    toolbarStyle: 'compact',
                    gridStyle: 'subtle',
                    barStyle: 'rounded',
                    milestoneStyle: 'diamond',
                    legendPlacement: 'bottom',
                    todayLineStyle: 'soft',
                    showOuterCard: true,
                    barShadow: false,
                    showProgressLabel: true,
                    colors: {
                        chartBackground: '#f8fafc',
                        cardBackground: '#ffffff',
                        accentColor: '#2563eb',
                        todayLineColor: '#ef4444',
                    },
                },
            },
        };

        const { container: previewContainer } = render(<GanttChart viewportHeight="520px" data={cleanCardData} />);
        const previewShell = previewContainer.querySelector('[data-gantt-view-mode]');
        expect(previewShell?.className).toContain('max-w-7xl');

        const { container: publicContainer } = render(
            <GanttChart
                viewportHeight="clamp(560px, calc(100dvh - 180px), 920px)"
                layoutVariant="public"
                data={cleanCardData}
            />
        );
        const publicShell = publicContainer.querySelector('[data-gantt-view-mode]');
        expect(publicShell?.getAttribute('data-gantt-layout-variant')).toBe('public');
        expect(publicShell?.className).toContain('max-w-none');
        expect(publicShell?.className).not.toContain('max-w-7xl');
        expect(publicShell?.getAttribute('data-gantt-viewport-height')).toBe('clamp(560px, calc(100dvh - 180px), 920px)');
    });
});
