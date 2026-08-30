import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TaskManagementTable, { TASK_STATUS_META } from './TaskManagementTable';

const tasks = [{
    id: 'task-1',
    title: 'משימת שליטה',
    category: 'מבצעים',
    owner: 'אחראי',
    status: 'active',
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    progress: 55,
    details: 'פרטי משימה',
    color: '#2563eb',
}];
const categories = [{ id: 'category-1', name: 'מבצעים', color: '#2563eb', order: 1 }];

describe('TaskManagementTable', () => {
    it('renders the shared desktop and mobile task presentation', () => {
        render(<TaskManagementTable tasks={tasks} categories={categories} statusMeta={TASK_STATUS_META} readOnly />);

        expect(screen.getAllByText('משימת שליטה')).toHaveLength(2);
        expect(screen.getAllByText('55%')).toHaveLength(2);
        expect(screen.getAllByText('בביצוע')).toHaveLength(2);
        expect(screen.queryByRole('button', { name: 'ערוך משימה' })).not.toBeInTheDocument();
    });

    it('adds admin actions without changing the task rendering', () => {
        const onEdit = vi.fn();
        render(<TaskManagementTable tasks={tasks} categories={categories} statusMeta={TASK_STATUS_META} onEdit={onEdit} />);

        fireEvent.click(screen.getByRole('button', { name: 'ערוך משימה' }));

        expect(onEdit).toHaveBeenCalledWith(tasks[0]);
        expect(screen.getAllByText('משימת שליטה')).toHaveLength(2);
    });
});
