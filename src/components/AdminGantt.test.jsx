import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

vi.mock('../context/GanttContext', () => ({
    useGantt: () => ({
        gantt: baseGantt,
        loading: false,
        saving: false,
        error: null,
        saveGantt: vi.fn(),
        reloadGantt: vi.fn(),
    }),
}));

function openTaskModal() {
    render(<AdminGantt />);
    fireEvent.click(screen.getByRole('button', { name: 'ניהול הגאנט' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'הוסף משימה' })[0]);
    return screen.getByRole('dialog');
}

describe('AdminGantt category combobox', () => {
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
});
