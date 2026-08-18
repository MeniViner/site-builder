import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GanttChart from './GanttChart';

const recurringData = {
    enabled: true,
    pageTitle: 'גאנט',
    groupBy: 'none',
    defaultView: 'week',
    showLegend: true,
    showToday: true,
    categories: [{ id: 'cat', name: 'בדיקות', color: '#2563eb', order: 1 }],
    settings: { design: { showTaskNameOnBar: true, colors: { cardBackground: '#fff' } } },
    items: [{
        id: 'weekly',
        title: 'ישיבה שבועית',
        category: 'בדיקות',
        status: 'planned',
        startDate: '2026-01-05',
        endDate: '2026-01-05',
        color: '#2563eb',
        milestones: [{ id: 'weekly-ms', title: 'בדיקת סטטוס', date: '2026-01-05' }],
        recurrence: { enabled: true, frequency: 'weekly', weekdays: [1], until: '2026-02-28' },
    }],
};

describe('Gantt recurrence review fixes', () => {
    it('keeps one row while repeating shifted milestones for visible occurrences', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={recurringData} />);
        expect(container.querySelectorAll('[data-gantt-task-row="weekly"]')).toHaveLength(1);
        expect(container.querySelector('[data-gantt-milestone="weekly-ms__occ_2026-01-05"]')).toBeTruthy();
    });

    it('keeps the real occurrence ordinal after navigating to a later week', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T12:00:00'));
        try {
            const { container } = render(<GanttChart viewportHeight="520px" data={recurringData} />);
            const next = container.querySelector('[data-gantt-period-nav="next"]');
            fireEvent.click(next);
            fireEvent.click(next);
            const bar = container.querySelector('[data-gantt-task-bar^="weekly__occ_"]');
            expect(bar).toBeTruthy();
            fireEvent.mouseEnter(bar);
            const hover = document.querySelector('[data-gantt-hover-card="weekly"]');
            expect(hover?.textContent).toMatch(/מופע\s+[3-9]/);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the glass hover translucent when the configured color is 3-digit HEX', () => {
        const { container } = render(<GanttChart viewportHeight="520px" data={recurringData} />);
        const bar = container.querySelector('[data-gantt-task-bar^="weekly__occ_"]');
        fireEvent.mouseEnter(bar);
        const glass = document.querySelector('[data-gantt-hover-card="weekly"] > div');
        expect(glass?.style.backgroundColor).toBeTruthy();
        expect(glass?.style.backgroundColor).not.toBe('rgb(255, 255, 255)');
    });
});
