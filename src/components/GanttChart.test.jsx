import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('collapses and expands grouped categories', () => {
        render(<GanttChart viewportHeight="520px" data={baseData} />);

        const collapseButton = screen.getByRole('button', { name: 'צמצם קטגוריה בדיקות' });
        expect(collapseButton.getAttribute('aria-expanded')).toBe('true');

        fireEvent.click(collapseButton);

        expect(screen.queryByText('משימת אלפא')).toBeNull();
        expect(screen.queryByText('משימת בטא')).toBeNull();
        const expandButton = screen.getByRole('button', { name: 'הרחב קטגוריה בדיקות' });
        expect(expandButton.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(expandButton);

        expect(screen.getByText('משימת אלפא')).toBeTruthy();
        expect(screen.getByText('משימת בטא')).toBeTruthy();
    });

    it('opens the legend from the toolbar help button instead of rendering it as a fixed row', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);

        expect(container.querySelector('[data-gantt-legend-help]')).toBeNull();

        const legendButton = screen.getByRole('button', { name: 'מקרא' });
        expect(legendButton.getAttribute('aria-expanded')).toBe('false');

        fireEvent.click(legendButton);

        const legendDialog = screen.getByRole('dialog', { name: 'עזרה לקריאת הגאנט' });
        expect(legendDialog).toBeTruthy();
        expect(legendButton.getAttribute('aria-expanded')).toBe('true');
        expect(legendDialog.textContent).toContain('מתוכנן');
        expect(legendDialog.textContent).toContain('אבן דרך');

        fireEvent.click(screen.getByRole('button', { name: 'סגור עזרה לקריאת הגאנט' }));

        expect(container.querySelector('[data-gantt-legend-help]')).toBeNull();
    });

    it('renders a visible today label above the timeline ticks', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-15T12:00:00'));
        try {
            const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);
            const todayLabel = container.querySelector('[data-gantt-today-label="header"]');

            expect(todayLabel).toBeTruthy();
            expect(todayLabel?.textContent).toContain('היום');
            expect(Number(todayLabel?.getAttribute('data-gantt-x'))).toBeGreaterThan(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it('renders recurring task occurrences inside the current timeline range', () => {
        const { container } = render(
            <GanttChart
                viewportHeight="520px"
                data={{
                    ...baseData,
                    items: [
                        {
                            id: 'weekly-briefing',
                            title: 'עדכון חוזר',
                            category: 'בדיקות',
                            status: 'planned',
                            startDate: '2026-01-05',
                            endDate: '2026-01-05',
                            color: '#2563eb',
                            recurrence: {
                                enabled: true,
                                frequency: 'weekly',
                                weekdays: [1],
                                until: '2026-01-31',
                            },
                        },
                    ],
                }}
            />
        );

        const occurrenceBars = container.querySelectorAll('[data-gantt-task-bar^="weekly-briefing__occ_"]');
        expect(occurrenceBars).toHaveLength(4);
        expect(container.textContent).toContain('חוזר');
    });

    it('keeps a recurring task as a single Gantt row instead of duplicating it once per occurrence', () => {
        const { container } = render(
            <GanttChart
                viewportHeight="520px"
                data={{
                    ...baseData,
                    items: [
                        {
                            id: 'weekly-briefing',
                            title: 'פגישת סטטוס שבועית',
                            category: 'בדיקות',
                            status: 'planned',
                            startDate: '2026-01-05',
                            endDate: '2026-01-05',
                            color: '#2563eb',
                            recurrence: {
                                enabled: true,
                                frequency: 'weekly',
                                weekdays: [1],
                                until: '2026-01-31',
                            },
                        },
                    ],
                }}
            />
        );

        // Four occurrence bars, but the task name/label is only rendered once —
        // proving there is exactly one logical row, not six duplicated rows.
        const occurrenceBars = container.querySelectorAll('[data-gantt-task-bar^="weekly-briefing__occ_"]');
        expect(occurrenceBars).toHaveLength(4);
        expect(container.querySelectorAll('[data-gantt-task-row="weekly-briefing"]')).toHaveLength(1);
        expect(screen.getAllByText('פגישת סטטוס שבועית')).toHaveLength(1);
    });

    it('does not create duplicate rows for a plain, non-recurring task', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        expect(container.querySelectorAll('[data-gantt-task-row="task-alpha"]')).toHaveLength(1);
        expect(container.querySelectorAll('[data-gantt-task-bar="task-alpha"]')).toHaveLength(1);
    });

    it('opens milestone details on click', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        const milestone = container.querySelector('[data-gantt-milestone="ms-alpha"]');
        const scrollBody = container.querySelector('[data-gantt-scroll-body]');

        expect(scrollBody?.getAttribute('data-gantt-milestone-popover-open')).toBe('false');

        fireEvent.click(milestone);

        const popover = container.querySelector('[data-gantt-milestone-popover="ms-alpha"]');
        expect(popover).toBeTruthy();
        expect(popover?.textContent).toContain('מסירה');
        expect(popover?.textContent).toContain('משימת אלפא');
        expect(popover?.className).toContain('z-[120]');
        expect(scrollBody?.getAttribute('data-gantt-milestone-popover-open')).toBe('true');
        expect(scrollBody?.getAttribute('style')).toContain('padding-bottom: 190px');

        fireEvent.click(screen.getByRole('button', { name: 'סגור פרטי אבן דרך' }));
        expect(container.querySelector('[data-gantt-milestone-popover="ms-alpha"]')).toBeNull();
        expect(scrollBody?.getAttribute('data-gantt-milestone-popover-open')).toBe('false');
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
                viewportHeight="calc(100dvh - 180px)"
                layoutVariant="public"
                data={cleanCardData}
            />
        );
        const publicShell = publicContainer.querySelector('[data-gantt-view-mode]');
        expect(publicShell?.getAttribute('data-gantt-layout-variant')).toBe('public');
        expect(publicShell?.className).toContain('max-w-none');
        expect(publicShell?.className).not.toContain('max-w-7xl');
        expect(publicShell?.getAttribute('data-gantt-viewport-height')).toBe('calc(100dvh - 180px)');
    });

    it('can shrink the public chart height to its rendered rows without the outer shadow', () => {
        const { container } = render(
            <GanttChart
                viewportHeight="calc(100dvh - 180px)"
                layoutVariant="public"
                fitHeightToContent
                data={baseData}
            />
        );
        const publicShell = container.querySelector('[data-gantt-view-mode]');
        const style = publicShell?.getAttribute('style') || '';

        expect(publicShell?.getAttribute('data-gantt-fit-height-to-content')).toBe('true');
        expect(publicShell?.className).toContain('shadow-none');
        expect(style).toContain('max-height: calc(100dvh - 180px)');
        expect(style).not.toMatch(/(^|;)\s*height:/);
        expect(style).not.toContain('560px');
    });

    it('includes a Day view button alongside Week/Month/Quarter and can switch to it', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);

        const dayButton = screen.getByRole('button', { name: 'יום', exact: true });
        expect(dayButton).toBeTruthy();

        fireEvent.click(dayButton);

        expect(container.querySelector('[data-gantt-view-mode]')?.getAttribute('data-gantt-view-mode')).toBe('day');
    });

    it('shows a visible, deterministic number on each milestone marker', () => {
        const { container } = render(
            <GanttChart
                viewportHeight="520px"
                data={{
                    ...baseData,
                    items: [
                        {
                            id: 'task-milestones',
                            title: 'משימה עם אבני דרך',
                            category: 'בדיקות',
                            status: 'planned',
                            startDate: '2026-01-01',
                            endDate: '2026-01-25',
                            color: '#2563eb',
                            milestones: [
                                { id: 'ms-1', title: 'שלב א', date: '2026-01-05' },
                                { id: 'ms-2', title: 'שלב ב', date: '2026-01-15' },
                            ],
                        },
                    ],
                }}
            />
        );

        const firstBadge = container.querySelector('[data-gantt-milestone-number="1"]');
        const secondBadge = container.querySelector('[data-gantt-milestone-number="2"]');
        expect(firstBadge?.textContent).toBe('1');
        expect(secondBadge?.textContent).toBe('2');
    });

    it('renders the task name on the bar only when "show task name on bar" is enabled', () => {
        const dataWithNames = {
            ...baseData,
            settings: { design: { showTaskNameOnBar: true } },
        };
        const { container: enabledContainer } = render(<GanttChart viewportHeight="520px" data={dataWithNames} />);
        const bar = enabledContainer.querySelector('[data-gantt-task-bar="task-alpha"]');
        expect(bar?.textContent).toContain('משימת אלפא');

        const { container: disabledContainer } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        const disabledBar = disabledContainer.querySelector('[data-gantt-task-bar="task-alpha"]');
        expect(disabledBar?.textContent).not.toContain('משימת אלפא');
    });

    it('shows a polished floating hover card with task details on hover', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        const bar = container.querySelector('[data-gantt-task-bar="task-alpha"]');

        expect(document.querySelector('[data-gantt-hover-card]')).toBeNull();
        fireEvent.mouseEnter(bar);

        const hoverCard = document.querySelector('[data-gantt-hover-card="task-alpha"]');
        expect(hoverCard).toBeTruthy();
        expect(hoverCard.textContent).toContain('משימת אלפא');
        expect(hoverCard.textContent).toContain('בדיקות');

        fireEvent.mouseLeave(bar);
        expect(document.querySelector('[data-gantt-hover-card]')).toBeNull();
    });

    it('renders Hebrew calendar dates in the header only when the option is enabled', () => {
        const { container: onContainer } = render(
            <GanttChart viewportHeight="520px" data={{ ...baseData, settings: { design: { showHebrewDate: true } } }} />
        );
        const tick = onContainer.querySelector('[data-gantt-tick]');
        expect(tick?.textContent?.length).toBeGreaterThan(0);

        const { container: offContainer } = render(<GanttChart viewportHeight="520px" data={baseData} />);
        expect(offContainer.querySelector('[data-gantt-timeline-header]')?.getAttribute('class')).toBeTruthy();
    });

    it('renders Israeli/Jewish holiday markers in the header only when the option is enabled', () => {
        const holidayData = {
            ...baseData,
            defaultView: 'quarter',
            settings: { design: { showHolidays: true } },
            items: [
                {
                    id: 'task-holiday-window',
                    title: 'משימה סביב חג',
                    category: 'בדיקות',
                    status: 'planned',
                    startDate: '2026-09-01',
                    endDate: '2026-10-15',
                    color: '#2563eb',
                },
            ],
        };
        const { container: onContainer } = render(<GanttChart viewportHeight="520px" data={holidayData} />);
        expect(onContainer.querySelector('[data-gantt-holiday="2026-09-21"]')).toBeTruthy();

        const { container: offContainer } = render(
            <GanttChart viewportHeight="520px" data={{ ...holidayData, settings: { design: { showHolidays: false } } }} />
        );
        expect(offContainer.querySelector('[data-gantt-holiday-row]')).toBeNull();
    });
});
