import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminBoom from './AdminBoom';

const mocks = vi.hoisted(() => ({
    boom: null,
    loaded: true,
    error: null,
    saveBoom: vi.fn(),
    reloadBoom: vi.fn(),
}));

vi.mock('../context/BoomContext', () => ({
    useBoom: () => ({
        boom: mocks.boom,
        loading: false,
        loaded: mocks.loaded,
        saving: false,
        error: mocks.error,
        saveBoom: mocks.saveBoom,
        reloadBoom: mocks.reloadBoom,
    }),
}));

const initialBoom = {
    enabled: true,
    buttonLabel: 'בום',
    pageTitle: 'חדר מצב',
    description: 'תיאור',
    design: {
        preset: 'operational',
        showSummaryStrip: true,
        summaryMetrics: ['total', 'active', 'blocked', 'overdue'],
        tableDensity: 'comfortable',
        showCategoryColors: true,
        showSummaryChips: true,
        accent: 'primary',
        cardEmphasis: 'soft',
        headerStyle: 'standard',
    },
    categories: [{ id: 'general', name: 'כללי', color: '#2563eb', order: 1 }],
    items: [{
        id: 'task-1',
        title: 'משימה קיימת',
        category: 'כללי',
        owner: 'אחראי',
        status: 'active',
        startDate: '2026-01-01',
        endDate: '2026-01-10',
        details: '',
        color: '#2563eb',
        order: 1,
    }],
};

describe('AdminBoom', () => {
    beforeEach(() => {
        mocks.boom = JSON.parse(JSON.stringify(initialBoom));
        mocks.loaded = true;
        mocks.error = null;
        mocks.saveBoom.mockReset().mockImplementation(async (value) => value);
        mocks.reloadBoom.mockReset().mockResolvedValue(mocks.boom);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
    });

    it('supports task create, edit, duplicate, and delete controls through the shared task table', async () => {
        render(<MemoryRouter><AdminBoom /></MemoryRouter>);
        fireEvent.click(screen.getByRole('tab', { name: 'ניהול משימות' }));

        fireEvent.click(screen.getByRole('button', { name: 'משימה חדשה' }));
        expect(screen.queryByText('התקדמות')).not.toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('שם המשימה'), { target: { value: 'משימה חדשה' } });
        fireEvent.click(screen.getByRole('button', { name: 'הוספת משימה' }));
        expect(screen.getAllByText('משימה חדשה')).toHaveLength(3);

        const editButtons = screen.getAllByRole('button', { name: 'ערוך משימה' });
        fireEvent.click(editButtons.at(-1));
        fireEvent.change(screen.getByLabelText('שם המשימה'), { target: { value: 'משימה מעודכנת' } });
        fireEvent.click(screen.getByRole('button', { name: 'עדכון משימה' }));
        expect(screen.getAllByText('משימה מעודכנת')).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'שכפל משימה' }).at(-1));
        expect(screen.getAllByText('משימה מעודכנת - עותק')).toHaveLength(2);

        fireEvent.click(screen.getAllByRole('button', { name: 'מחק משימה' }).at(-1));
        expect(screen.queryByText('משימה מעודכנת - עותק')).not.toBeInTheDocument();

        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalled(), { timeout: 1800 });
    });

    it('keeps a trailing space in the local draft after its normalized autosave returns', async () => {
        const view = render(<MemoryRouter><AdminBoom /></MemoryRouter>);

        const pageTitle = screen.getByLabelText('כותרת העמוד');
        fireEvent.change(pageTitle, { target: { value: 'חדר מצב חדש ' } });

        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalled(), { timeout: 1800 });
        mocks.boom = {
            ...mocks.boom,
            pageTitle: 'חדר מצב חדש',
        };
        view.rerender(<MemoryRouter><AdminBoom /></MemoryRouter>);

        expect(screen.getByLabelText('כותרת העמוד')).toHaveValue('חדר מצב חדש ');
    });

    it('blocks editing after an initial load failure', () => {
        mocks.loaded = false;
        mocks.error = 'Access denied';

        render(<MemoryRouter><AdminBoom /></MemoryRouter>);

        expect(screen.getByRole('heading', { name: 'נתוני BOOM לא נטענו' })).toBeInTheDocument();
        expect(screen.queryByLabelText('כותרת העמוד')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'ניסיון טעינה חוזר' }));
        expect(mocks.reloadBoom).toHaveBeenCalledOnce();
    });

    it('flushes a pending autosave when leaving the page', async () => {
        const { unmount } = render(<MemoryRouter><AdminBoom /></MemoryRouter>);
        fireEvent.change(screen.getByLabelText('כותרת העמוד'), { target: { value: 'חדר מצב מעודכן' } });

        unmount();

        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalledWith(
            expect.objectContaining({ pageTitle: 'חדר מצב מעודכן' })
        ));
    });

    it('loads and clears demo tasks only after deliberate actions', async () => {
        render(<MemoryRouter><AdminBoom /></MemoryRouter>);

        fireEvent.click(screen.getByRole('button', { name: 'טעינת נתוני הדגמה' }));
        expect(window.confirm).toHaveBeenCalled();
        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalled(), { timeout: 1800 });
        expect(mocks.saveBoom.mock.calls.at(-1)[0].items.length).toBeGreaterThan(2);

        fireEvent.click(screen.getByRole('button', { name: 'ניקוי משימות BOOM' }));
        await waitFor(() => expect(mocks.saveBoom.mock.calls.at(-1)[0].items).toEqual([]), { timeout: 1800 });
    });

    it('persists design presets and previews them through the real BOOM presentation', async () => {
        render(<MemoryRouter><AdminBoom /></MemoryRouter>);
        fireEvent.click(screen.getByRole('tab', { name: 'עיצוב' }));

        expect(screen.getByTestId('boom-presentation')).toHaveAttribute('data-preset', 'operational');
        fireEvent.click(screen.getByRole('button', { name: /מרכז שליטה/ }));
        expect(screen.getByTestId('boom-presentation')).toHaveAttribute('data-preset', 'command-center');

        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalledWith(
            expect.objectContaining({ design: expect.objectContaining({ preset: 'command-center' }) })
        ), { timeout: 1800 });
    });

    it('updates the live summary preview and persists its visibility and selected metrics', async () => {
        render(<MemoryRouter><AdminBoom /></MemoryRouter>);
        fireEvent.click(screen.getByRole('tab', { name: 'עיצוב' }));

        expect(screen.getByTestId('boom-summary-strip')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('switch', { name: 'הצגת שורת סטטוס' }));
        expect(screen.queryByTestId('boom-summary-strip')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: /חסומות/ }));

        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalledWith(
            expect.objectContaining({
                design: expect.objectContaining({
                    showSummaryStrip: false,
                    summaryMetrics: expect.not.arrayContaining(['blocked']),
                }),
            })
        ), { timeout: 1800 });
    });

    it('manages categories and safely reassigns affected tasks on deletion', async () => {
        render(<MemoryRouter><AdminBoom /></MemoryRouter>);
        fireEvent.click(screen.getByRole('tab', { name: 'קטגוריות' }));

        fireEvent.click(screen.getByRole('button', { name: 'קטגוריה חדשה' }));
        const nameField = screen.getByLabelText('שם קטגוריה תחום 2');
        fireEvent.change(nameField, { target: { value: 'כשירות' } });
        fireEvent.blur(nameField);
        fireEvent.change(screen.getByLabelText('צבע עבור כשירות'), { target: { value: '#0f766e' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'מחיקה' })[0]);

        await waitFor(() => expect(mocks.saveBoom).toHaveBeenCalledWith(
            expect.objectContaining({
                categories: [expect.objectContaining({ name: 'כשירות', color: '#0f766e' })],
                items: [expect.objectContaining({ category: 'כשירות', color: '#0f766e' })],
            })
        ), { timeout: 1800 });
    });
});
