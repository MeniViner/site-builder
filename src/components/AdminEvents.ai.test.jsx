import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminEvents from './AdminEvents';
import AIService from '../services/AIService';
import { clearAdminAiHistoryStore } from '../hooks/useAdminAiHistory';

const mocks = vi.hoisted(() => ({
    enabled: true,
    current: {
        events: [{ id: 'original', date: '2026-08-31', title: 'אירוע מקורי', subtitle: '', color: 'gray' }],
        displayCount: 1,
        displayMode: 'default',
        intervalMs: 6000,
    },
    saveEvents: vi.fn(),
}));

vi.mock('../config/uiFeatures.config', () => ({
    isWidgetAiButtonEnabled: (widgetKey) => mocks.enabled && widgetKey === 'events',
}));

vi.mock('../config/ai.config', () => ({
    getSafeAiRuntimeConfig: () => ({ defaultModel: 'test-model', apiBase: '/api' }),
    // Mirrors the production behaviour: outside a DEV AI runtime the badge is
    // just the model name.
    formatAiEngineLabel: (result) => String(result?.modelUsed || result?.model || ''),
}));

vi.mock('../services/AIService', () => ({
    default: {
        ask: vi.fn(),
        isEnabled: vi.fn(() => true),
    },
}));

vi.mock('../context/EventsContext', () => ({
    useEvents: () => ({
        ...mocks.current,
        loading: false,
        error: '',
        saveEvents: mocks.saveEvents,
    }),
}));

vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => <button type="button">עזרה</button>,
    HelpLabel: ({ as = 'label', children, ...props }) => React.createElement(as, props, children),
    HelpTooltipButton: () => null,
}));

describe('AdminEvents AI integration', () => {
    beforeEach(() => {
        mocks.enabled = true;
        mocks.current = {
            events: [{ id: 'original', date: '2026-08-31', title: 'אירוע מקורי', subtitle: '', color: 'gray' }],
            displayCount: 1,
            displayMode: 'default',
            intervalMs: 6000,
        };
        mocks.saveEvents.mockImplementation(async (events, displayCount, displayMode, intervalMs) => {
            mocks.current = { events, displayCount, displayMode, intervalMs };
            return true;
        });
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        clearAdminAiHistoryStore();
    });

    it('respects the Events-specific feature gate', () => {
        mocks.enabled = false;
        render(<AdminEvents inHub />);
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
    });

    it('applies generated Events through saveEvents and restores Before AI', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                eventCount: 3,
                events: [
                    { id: 'e1', date: '2026-09-01', title: 'אירוע ראשון', subtitle: 'פרטים', color: 'gray' },
                    { id: 'e2', date: '2026-09-02', title: 'אירוע שני', subtitle: 'פרטים', color: 'red' },
                    { id: 'e3', date: '2026-09-03', title: 'אירוע שלישי', subtitle: 'פרטים', color: 'gray' },
                ],
                displayCount: 3,
                displayMode: 'default',
                intervalMs: 6000,
            }),
        });
        render(<AdminEvents inHub />);

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'ייצר אירועים' }));

        await waitFor(() => expect(screen.getByText('אירוע ראשון')).toBeVisible());
        expect(mocks.saveEvents).toHaveBeenLastCalledWith(
            expect.arrayContaining([expect.objectContaining({ id: 'e1', title: 'אירוע ראשון' })]),
            3,
            'default',
            6000
        );

        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(screen.getByText('אירוע מקורי')).toBeVisible());
        expect(mocks.saveEvents).toHaveBeenLastCalledWith(
            [expect.objectContaining({ id: 'original', title: 'אירוע מקורי' })],
            1,
            'default',
            6000
        );
    });

    it('keeps Events history when the manager unmounts and remounts', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                eventCount: 3,
                events: [
                    { id: 'e1', date: '2026-09-01', title: 'אירוע ראשון', subtitle: '', color: 'gray' },
                    { id: 'e2', date: '2026-09-02', title: 'אירוע שני', subtitle: '', color: 'gray' },
                    { id: 'e3', date: '2026-09-03', title: 'אירוע שלישי', subtitle: '', color: 'gray' },
                ],
                displayCount: 3,
                displayMode: 'default',
                intervalMs: 6000,
            }),
        });
        const first = render(<AdminEvents inHub />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'ייצר אירועים' }));
        await waitFor(() => expect(mocks.saveEvents).toHaveBeenCalled());
        first.unmount();

        render(<AdminEvents inHub />);
        expect(screen.getByRole('button', { name: 'לפני AI' })).toBeVisible();
    });

    it('adds generated Events without removing unrelated existing entries', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                eventCount: 3,
                events: [
                    { id: 'e1', date: '2026-09-01', title: 'תוספת ראשונה', subtitle: '', color: 'gray' },
                    { id: 'e2', date: '2026-09-02', title: 'תוספת שנייה', subtitle: '', color: 'gray' },
                    { id: 'e3', date: '2026-09-03', title: 'תוספת שלישית', subtitle: '', color: 'gray' },
                ],
                displayCount: 3,
                displayMode: 'default',
                intervalMs: 6000,
            }),
        });
        render(<AdminEvents inHub />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'הוסף בלי למחוק' }));
        fireEvent.change(screen.getByRole('textbox'), {
            target: { value: 'הוסף 3 אירועים ובדוק שהניסוח ברור, בלי למחוק אירועים קיימים' },
        });
        fireEvent.click(screen.getByRole('button', { name: 'ייצר אירועים' }));

        await waitFor(() => expect(screen.getByText('תוספת ראשונה')).toBeVisible());
        expect(screen.getByText('אירוע מקורי')).toBeVisible();
        expect(mocks.saveEvents.mock.calls.at(-1)[0]).toHaveLength(4);
    });

    it('shows an Events audit visibly without mutating or recording history', async () => {
        AIService.ask.mockResolvedValue({
            content: 'נמצאה כפילות אפשרית בין שני אירועים. מומלץ לבדוק את התאריכים.',
        });
        render(<AdminEvents inHub />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'בדוק את הלוח' }));
        fireEvent.click(screen.getByRole('button', { name: 'נתח והצג תשובה' }));

        expect(await screen.findByText(/נמצאה כפילות אפשרית/)).toBeVisible();
        expect(mocks.saveEvents).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'לפני AI' })).not.toBeInTheDocument();
    });
});
