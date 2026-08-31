import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminGantt from './AdminGantt';
import { normalizeGanttData } from '../utils/ganttData';

vi.mock('react-router-dom', () => ({
    useNavigate: () => vi.fn(),
}));

vi.mock('react-toastify', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
}));

const baseGantt = normalizeGanttData({
    enabled: true,
    pageTitle: 'גאנט',
    categories: [
        { id: 'cat-planning', name: 'תכנון', color: '#2563eb', order: 1 },
        { id: 'cat-dev', name: 'פיתוח', color: '#7c3aed', order: 2 },
    ],
    items: [],
});

const mocks = vi.hoisted(() => ({
    gantt: null,
    saveGantt: vi.fn(),
    reloadGantt: vi.fn(),
}));

vi.mock('../context/GanttContext', () => ({
    useGantt: () => ({
        gantt: mocks.gantt,
        loading: false,
        saving: false,
        error: null,
        saveGantt: mocks.saveGantt,
        reloadGantt: mocks.reloadGantt,
    }),
}));

function openTaskModal() {
    render(<AdminGantt />);
    fireEvent.click(screen.getByRole('tab', { name: 'ניהול הגאנט' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'הוסף משימה' })[0]);
    return screen.getByRole('dialog');
}

describe('AdminGantt category combobox', () => {
    beforeEach(() => {
        mocks.gantt = JSON.parse(JSON.stringify(baseGantt));
        mocks.saveGantt.mockReset().mockImplementation(async (value) => value);
        mocks.reloadGantt.mockReset().mockResolvedValue(mocks.gantt);
    });

    it('does not render the removed upper AI launcher', () => {
        render(<AdminGantt />);
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
    });

    it('shows existing categories and lets the user select one instead of only typing', () => {
        const dialog = openTaskModal();
        const categoryInput = within(dialog).getByRole('combobox', { name: 'תחום / קטגוריה' });

        fireEvent.focus(categoryInput);
        const option = within(dialog).getByRole('option', { name: 'תכנון' });
        expect(option).toBeTruthy();

        fireEvent.click(option);
        expect(categoryInput).toHaveValue('תכנון');
    });

    it('also renders existing categories as quick-select chips below the input', () => {
        const dialog = openTaskModal();
        const planningChip = within(dialog).getByRole('button', { name: 'תכנון' });
        const devChip = within(dialog).getByRole('button', { name: 'פיתוח' });

        expect(planningChip).toBeTruthy();
        expect(devChip).toBeTruthy();

        fireEvent.click(devChip);
        expect(within(dialog).getByRole('combobox', { name: 'תחום / קטגוריה' })).toHaveValue('פיתוח');
    });

    it('still allows typing a brand new category that does not exist yet', () => {
        const dialog = openTaskModal();
        const categoryInput = within(dialog).getByRole('combobox', { name: 'תחום / קטגוריה' });

        fireEvent.change(categoryInput, { target: { value: 'קטגוריה חדשה לגמרי' } });

        expect(categoryInput).toHaveValue('קטגוריה חדשה לגמרי');
        expect(within(dialog).queryByRole('option', { name: 'קטגוריה חדשה לגמרי' })).toBeNull();
    });

    it('snaps a typed value that only differs by case/whitespace to the existing category on blur', () => {
        const dialog = openTaskModal();
        const categoryInput = within(dialog).getByRole('combobox', { name: 'תחום / קטגוריה' });

        fireEvent.change(categoryInput, { target: { value: '  תכנון  ' } });
        fireEvent.blur(categoryInput);

        expect(categoryInput).toHaveValue('תכנון');
    });

    it('adopts an external persisted update without overwriting it from the stale local draft', async () => {
        const view = render(<AdminGantt />);
        mocks.gantt = normalizeGanttData({
            ...mocks.gantt,
            items: [{
                id: 'task-ai',
                title: 'משימת גאנט חיצונית',
                category: 'תכנון',
                status: 'planned',
                startDate: '2026-09-01',
                endDate: '2026-09-02',
            }],
        });

        view.rerender(<AdminGantt />);
        fireEvent.click(screen.getByRole('tab', { name: 'ניהול הגאנט' }));

        expect(await screen.findAllByText('משימת גאנט חיצונית')).not.toHaveLength(0);
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        expect(mocks.saveGantt).not.toHaveBeenCalled();
    });
});
