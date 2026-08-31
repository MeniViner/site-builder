import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWidgetAIAssistant from './AdminWidgetAIAssistant';
import AIService from '../services/AIService';
import { clearAdminAiHistoryStore } from '../hooks/useAdminAiHistory';
import { UI_FEATURES } from '../config/uiFeatures.config';
import { getAiPromptSuggestions } from '../utils/aiPromptSuggestions';

vi.mock('../config/uiFeatures.config', () => {
    const UI_FEATURES = {
        showAiUi: true,
        showWidgetAiButtons: true,
        widgetAiButtons: {
            alerts: true,
            countdown: true,
            events: true,
            news: true,
            phonebook: true,
            polls: true,
            shuttles: true,
            tips: true,
        },
    };
    return {
        UI_FEATURES,
        isWidgetAiButtonEnabled: (widgetKey) => (
            UI_FEATURES.showAiUi
            && UI_FEATURES.showWidgetAiButtons
            && UI_FEATURES.widgetAiButtons[widgetKey] === true
        ),
    };
});

vi.mock('../config/ai.config', () => ({
    getSafeAiRuntimeConfig: () => ({ defaultModel: 'test-model' }),
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

function StatefulAssistant({ widgetKey, initialValue, onPersist = vi.fn() }) {
    const [value, setValue] = React.useState(initialValue);
    const applyValue = async (next) => {
        setValue(next);
        onPersist(next);
        return true;
    };
    return (
        <>
            <pre data-testid={`${widgetKey}-state`}>{JSON.stringify(value)}</pre>
            <AdminWidgetAIAssistant widgetKey={widgetKey} value={value} onChange={applyValue} />
        </>
    );
}

describe('AdminWidgetAIAssistant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AIService.isEnabled.mockReturnValue(true);
        UI_FEATURES.showAiUi = true;
        UI_FEATURES.showWidgetAiButtons = true;
        Object.keys(UI_FEATURES.widgetAiButtons).forEach((key) => {
            UI_FEATURES.widgetAiButtons[key] = true;
        });
    });

    afterEach(() => {
        cleanup();
        clearAdminAiHistoryStore();
        vi.restoreAllMocks();
    });

    it('hides local controls when the master AI UI is disabled', () => {
        UI_FEATURES.showAiUi = false;
        render(<AdminWidgetAIAssistant widgetKey="news" value={[]} onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
    });

    it('hides local controls when the widget AI master is disabled', () => {
        UI_FEATURES.showWidgetAiButtons = false;
        render(<AdminWidgetAIAssistant widgetKey="news" value={[]} onChange={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
    });

    it('requires the matching widget-specific flag', () => {
        UI_FEATURES.widgetAiButtons.news = true;
        UI_FEATURES.widgetAiButtons.alerts = false;
        const { rerender } = render(
            <AdminWidgetAIAssistant widgetKey="alerts" value={[]} onChange={vi.fn()} />
        );
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();

        rerender(<AdminWidgetAIAssistant widgetKey="news" value={[]} onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'AI' })).toBeVisible();
    });

    it('fills the actual prompt without calling AI and Generate uses the suggestion', async () => {
        const onChange = vi.fn();
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                items: [{ id: 'new', text: 'מבזק חדש', isUrgent: false }],
            }),
            modelUsed: 'test-model',
        });
        vi.spyOn(Math, 'random').mockReturnValue(0);

        render(<AdminWidgetAIAssistant widgetKey="news" value={[]} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));

        const promptInput = screen.getByRole('textbox');
        const suggestion = promptInput.value;
        expect(suggestion).toBeTruthy();
        expect(getAiPromptSuggestions('news', 'flash')).toContain(suggestion);
        expect(AIService.ask).not.toHaveBeenCalled();
        expect(onChange).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(AIService.ask).toHaveBeenCalledOnce());
        expect(AIService.ask.mock.calls[0][0]).toContain(suggestion);
    });

    it('uses a different suggestion on a second click when options exist', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        render(<AdminWidgetAIAssistant widgetKey="polls" value={[]} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));

        const suggestionButton = screen.getByRole('button', { name: 'הצע ניסוח' });
        fireEvent.click(suggestionButton);
        const first = screen.getByRole('textbox').value;
        fireEvent.click(suggestionButton);
        const second = screen.getByRole('textbox').value;

        expect(first).not.toBe(second);
        expect(getAiPromptSuggestions('polls', 'create')).toEqual(expect.arrayContaining([first, second]));
        expect(AIService.ask).not.toHaveBeenCalled();
    });

    it('keeps local suggestions available when the AI provider is disabled', () => {
        AIService.isEnabled.mockReturnValue(false);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        render(<AdminWidgetAIAssistant widgetKey="countdown" value={{ items: [] }} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));

        const suggestionButton = screen.getByRole('button', { name: 'הצע ניסוח' });
        expect(suggestionButton).toBeEnabled();
        fireEvent.click(suggestionButton);

        expect(screen.getByRole('textbox')).not.toHaveValue('');
        expect(AIService.ask).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'צור והחל מיד' })).toBeDisabled();
    });

    it('resets prompt context when switching widget managers', async () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        const { rerender } = render(
            <AdminWidgetAIAssistant widgetKey="news" value={[]} onChange={vi.fn()} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));
        const newsSuggestion = screen.getByRole('textbox').value;

        rerender(<AdminWidgetAIAssistant widgetKey="polls" value={[]} onChange={vi.fn()} />);
        await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        expect(screen.getByRole('textbox')).toHaveValue('');
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));

        const pollSuggestion = screen.getByRole('textbox').value;
        expect(pollSuggestion).not.toBe(newsSuggestion);
        expect(getAiPromptSuggestions('polls', 'create')).toContain(pollSuggestion);
    });

    it('switches to the selected action suggestion pool', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        render(<AdminWidgetAIAssistant widgetKey="events" value={[]} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));

        fireEvent.click(screen.getByRole('button', { name: 'הדבק לו״ז' }));
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));
        const pasteSuggestion = screen.getByRole('textbox').value;
        expect(getAiPromptSuggestions('events', 'paste')).toContain(pasteSuggestion);

        fireEvent.click(screen.getByRole('button', { name: 'שפר אירועים' }));
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));
        const improveSuggestion = screen.getByRole('textbox').value;
        expect(getAiPromptSuggestions('events', 'improve')).toContain(improveSuggestion);
        expect(improveSuggestion).not.toBe(pasteSuggestion);
    });

    it('applies a normalized mutation and supports before-AI and redo navigation', async () => {
        const onChange = vi.fn();
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                items: [{ id: 'new', text: 'מבזק חדש', isUrgent: false }],
            }),
            modelUsed: 'test-model',
        });

        render(
            <AdminWidgetAIAssistant
                widgetKey="news"
                value={[{ id: 'existing', text: 'מבזק קיים', isUrgent: false }]}
                onChange={onChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור מבזק חדש מהטקסט' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => expect(onChange).toHaveBeenCalledWith([
            { id: 'existing', text: 'מבזק קיים', isUrgent: false },
            { id: 'new', text: 'מבזק חדש', isUrgent: false },
        ]));
        expect(screen.getByText('השינוי הוחל')).toBeVisible();
        expect(screen.getByText(/נוספו 1 ידיעות/)).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
            { id: 'existing', text: 'מבזק קיים', isUrgent: false },
        ]));

        fireEvent.click(screen.getByRole('button', { name: 'הבא' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
            { id: 'existing', text: 'מבזק קיים', isUrgent: false },
            { id: 'new', text: 'מבזק חדש', isUrgent: false },
        ]));
    });

    it('keeps analysis output visible without mutating content', async () => {
        const onChange = vi.fn();
        AIService.ask.mockResolvedValue({
            content: '## בדיקת מבזקים\n\nמצאתי **שני מבזקים דומים**.\n\n| בעיה | המלצה |\n|---|---|\n| כפילות | לבדוק איחוד |',
            modelUsed: 'test-model',
        });

        render(
            <AdminWidgetAIAssistant
                widgetKey="news"
                value={[{ id: 'existing', text: 'מבזק קיים', isUrgent: false }]}
                onChange={onChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'בדוק את הרשימה' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'בדוק כפילויות' } });
        fireEvent.click(screen.getByRole('button', { name: 'נתח והצג תשובה' }));

        expect(await screen.findByRole('heading', { name: 'בדיקת מבזקים' })).toBeVisible();
        expect(screen.getByRole('table')).toHaveTextContent('כפילות');
        expect(onChange).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /לפני AI|הקודם|הבא/ })).not.toBeInTheDocument();
    });

    it('keeps mutation history intact without recording a later audit response', async () => {
        const onPersist = vi.fn();
        AIService.ask
            .mockResolvedValueOnce({
                content: JSON.stringify({
                    items: [{ id: 'n2', text: 'מבזק חדש', isUrgent: false }],
                }),
                modelUsed: 'test-model',
            })
            .mockResolvedValueOnce({
                content: '## בדיקה\n\nלא נמצאו כפילויות.',
                modelUsed: 'test-model',
            });

        render(
            <StatefulAssistant
                widgetKey="news"
                initialValue={[{ id: 'n1', text: 'מקור', isUrgent: false }]}
                onPersist={onPersist}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור מבזק חדש' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(onPersist).toHaveBeenCalledTimes(1));

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'בדוק את הרשימה' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'בדוק כפילויות' } });
        fireEvent.click(screen.getByRole('button', { name: 'נתח והצג תשובה' }));
        expect(await screen.findByRole('heading', { name: 'בדיקה' })).toBeVisible();
        expect(onPersist).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'הפוך למבזק' }));
        fireEvent.click(screen.getByRole('button', { name: 'סגור' }));
        expect(screen.getByText('1/1')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(onPersist).toHaveBeenCalledTimes(2));
        fireEvent.click(screen.getByRole('button', { name: 'הבא' }));
        await waitFor(() => expect(onPersist).toHaveBeenCalledTimes(3));
    });

    it('records external AI imports in the same before-AI history', async () => {
        const onChange = vi.fn();
        const ref = createRef();
        const before = [{ id: 'before', text: 'לפני', isUrgent: false }];
        const after = [{ id: 'after', text: 'אחרי', isUrgent: false }];
        render(
            <AdminWidgetAIAssistant
                ref={ref}
                widgetKey="news"
                value={before}
                onChange={onChange}
            />
        );

        await act(() => ref.current.applyExternalResult(after, { label: 'ייבוא עם AI' }));
        expect(onChange).toHaveBeenLastCalledWith(after);

        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(before));
        fireEvent.click(screen.getByRole('button', { name: 'הבא' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(after));
    });

    it('uses the explicit current baseline for an in-flight external import', async () => {
        const onChange = vi.fn();
        const ref = createRef();
        const renderedValue = [{ id: 'stale', text: 'ישן', isUrgent: false }];
        const currentValue = [{ id: 'current', text: 'עריכה בזמן הניתוח', isUrgent: false }];
        const after = [{ id: 'after', text: 'תוצאת AI', isUrgent: false }];
        render(
            <AdminWidgetAIAssistant
                ref={ref}
                widgetKey="news"
                value={renderedValue}
                onChange={onChange}
            />
        );

        await act(() => ref.current.applyExternalResult(after, {
            label: 'ייבוא עם AI',
            baseline: currentValue,
        }));
        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(currentValue));
    });

    it('discards a stale future branch when generating after undo', async () => {
        AIService.ask
            .mockResolvedValueOnce({
                content: JSON.stringify({ items: [{ id: 'first', text: 'גרסה ראשונה', isUrgent: false }] }),
            })
            .mockResolvedValueOnce({
                content: JSON.stringify({ items: [{ id: 'second', text: 'גרסה חלופית', isUrgent: false }] }),
            });
        render(
            <StatefulAssistant
                widgetKey="news"
                initialValue={[{ id: 'base', text: 'מקור', isUrgent: false }]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור מבזק ראשון' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(screen.getByTestId('news-state')).toHaveTextContent('גרסה ראשונה'));

        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(screen.getByTestId('news-state')).not.toHaveTextContent('גרסה ראשונה'));

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור מבזק חלופי' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => expect(screen.getByTestId('news-state')).toHaveTextContent('גרסה חלופית'));
        expect(screen.getByTestId('news-state')).not.toHaveTextContent('גרסה ראשונה');
        expect(screen.getByText('1/1')).toBeVisible();
        expect(screen.getByRole('button', { name: 'הבא' })).toBeDisabled();
    });

    it('stores every alternative as a browsable history version', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                alternatives: [
                    { items: [{ id: 'n1', text: 'חלופה ראשונה', isUrgent: false }] },
                    { items: [{ id: 'n1', text: 'חלופה שנייה', isUrgent: false }] },
                    { items: [{ id: 'n1', text: 'חלופה שלישית', isUrgent: false }] },
                ],
            }),
        });
        render(
            <StatefulAssistant
                widgetKey="news"
                initialValue={[{ id: 'n1', text: 'נוסח מקורי', isUrgent: false }]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: '3 גרסאות ניסוח' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור שלוש חלופות' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => expect(screen.getByTestId('news-state')).toHaveTextContent('חלופה ראשונה'));
        expect(screen.getByText('1/3')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'הבא' }));
        await waitFor(() => expect(screen.getByTestId('news-state')).toHaveTextContent('חלופה שנייה'));
        fireEvent.click(screen.getByRole('button', { name: 'הבא' }));
        await waitFor(() => expect(screen.getByTestId('news-state')).toHaveTextContent('חלופה שלישית'));
        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(screen.getByTestId('news-state')).toHaveTextContent('נוסח מקורי'));
    });

    it('keeps News and Polls histories independent across unmounts', async () => {
        let newsValue = [{ id: 'n1', text: 'חדשות מקור', isUrgent: false }];
        let pollsValue = [{
            id: 'p1',
            question: 'סקר מקור',
            active: true,
            options: [{ id: 'o1', text: 'כן', votes: 0, voters: [] }],
        }];
        AIService.ask
            .mockResolvedValueOnce({
                content: JSON.stringify({ items: [{ id: 'n2', text: 'חדשות AI', isUrgent: false }] }),
            })
            .mockResolvedValueOnce({
                content: JSON.stringify({
                    items: [{
                        id: 'p2',
                        question: 'סקר AI',
                        active: true,
                        options: [{ id: 'p2-o1', text: 'אפשרות', votes: 0 }],
                    }],
                }),
            });

        const newsOnChange = vi.fn(async (next) => {
            newsValue = next;
            return true;
        });
        const firstNews = render(
            <AdminWidgetAIAssistant widgetKey="news" value={newsValue} onChange={newsOnChange} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור חדשות' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(newsOnChange).toHaveBeenCalled());
        firstNews.unmount();

        const pollsOnChange = vi.fn(async (next) => {
            pollsValue = next;
            return true;
        });
        const polls = render(
            <AdminWidgetAIAssistant widgetKey="polls" value={pollsValue} onChange={pollsOnChange} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור סקר בנושא שירות' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(pollsOnChange).toHaveBeenCalled());
        polls.unmount();

        render(<AdminWidgetAIAssistant widgetKey="news" value={newsValue} onChange={newsOnChange} />);
        expect(screen.getByRole('button', { name: 'לפני AI' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(newsOnChange).toHaveBeenLastCalledWith([
            { id: 'n1', text: 'חדשות מקור', isUrgent: false },
        ]));
        expect(pollsValue.map((poll) => poll.question)).toContain('סקר AI');
    });

    it('hides history without deleting it and shows it again after generation', async () => {
        let currentValue = [{ id: 'n1', text: 'מקור', isUrgent: false }];
        const onChange = vi.fn(async (next) => {
            currentValue = next;
            return true;
        });
        AIService.ask
            .mockResolvedValueOnce({
                content: JSON.stringify({ items: [{ id: 'n2', text: 'ראשון', isUrgent: false }] }),
            })
            .mockResolvedValueOnce({
                content: JSON.stringify({ items: [{ id: 'n3', text: 'שני', isUrgent: false }] }),
            });

        const first = render(
            <AdminWidgetAIAssistant widgetKey="news" value={currentValue} onChange={onChange} />
        );
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור ראשון' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'לפני AI' })).toBeVisible());
        fireEvent.click(screen.getByRole('button', { name: 'הסתר היסטוריית AI' }));
        expect(screen.queryByRole('button', { name: 'לפני AI' })).not.toBeInTheDocument();
        first.unmount();

        const second = render(
            <AdminWidgetAIAssistant widgetKey="news" value={currentValue} onChange={onChange} />
        );
        expect(screen.queryByRole('button', { name: 'לפני AI' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור שני' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(screen.getByText('2/2')).toBeVisible());
        second.unmount();

        render(<AdminWidgetAIAssistant widgetKey="news" value={currentValue} onChange={onChange} />);
        fireEvent.click(screen.getByRole('button', { name: 'לפני AI' }));
        await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([
            { id: 'n1', text: 'מקור', isUrgent: false },
        ]));
    });

    it('updates Alerts actual state and persistence callback', async () => {
        const onPersist = vi.fn();
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                items: [{ id: 'a2', title: 'עדכון', text: 'הכניסה תיסגר בשעה 18:00', isUrgent: false }],
            }),
        });
        render(
            <StatefulAssistant
                widgetKey="alerts"
                initialValue={[{ id: 'a1', title: 'קיים', text: 'הודעה קיימת', isUrgent: false }]}
                onPersist={onPersist}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור הודעה: הכניסה תיסגר בשעה 18:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => expect(JSON.parse(screen.getByTestId('alerts-state').textContent)).toHaveLength(2));
        expect(onPersist).toHaveBeenCalledOnce();
    });

    it('updates Countdown items and active item together', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                countdown: {
                    items: [{ id: 'c2', title: 'טקס', targetDate: '2026-09-04T10:00:00', showDetails: true, details: 'באולם' }],
                    activeItemId: 'c2',
                },
            }),
        });
        render(<StatefulAssistant widgetKey="countdown" initialValue={{ items: [], activeItemId: null }} />);

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור ספירה לטקס ב-4.9.2026 בשעה 10:00' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => {
            const state = JSON.parse(screen.getByTestId('countdown-state').textContent);
            expect(state.items).toHaveLength(1);
            expect(state.activeItemId).toBe('c2');
        });
    });

    it('shows a Countdown clarification without calling the model when no date was supplied', async () => {
        render(<StatefulAssistant widgetKey="countdown" initialValue={{ items: [], activeItemId: null }} />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור ספירה לטקס' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        expect(await screen.findByText(/חסר תאריך או מועד ברור/)).toBeVisible();
        expect(AIService.ask).not.toHaveBeenCalled();
    });

    it('rewrites Poll wording while preserving votes and voters', async () => {
        const initialPolls = [{
            id: 'p1',
            question: 'אתם מסכימים?',
            active: true,
            options: [
                { id: 'o1', text: 'כן', votes: 7, voters: [{ id: 'u1', name: 'סודי' }] },
                { id: 'o2', text: 'לא', votes: 3, voters: [{ id: 'u2', name: 'סודי 2' }] },
            ],
        }];
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                items: [{
                    id: 'p1',
                    question: 'מה דעתך על ההצעה?',
                    active: true,
                    options: [
                        { id: 'o1', text: 'תומך/ת' },
                        { id: 'o2', text: 'לא תומך/ת' },
                    ],
                }],
            }),
        });
        render(<StatefulAssistant widgetKey="polls" initialValue={initialPolls} />);

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'שכתב שאלה ותשובות' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'שכתב את השאלה והתשובות לניסוח ניטרלי' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => {
            const [poll] = JSON.parse(screen.getByTestId('polls-state').textContent);
            expect(poll.question).toBe('מה דעתך על ההצעה?');
            expect(poll.options[0]).toMatchObject({ text: 'תומך/ת', votes: 7 });
            expect(poll.options[0].voters).toEqual([{ id: 'u1', name: 'סודי' }]);
        });
        expect(JSON.stringify(AIService.ask.mock.calls[0][0])).not.toContain('סודי');
    });

    it('updates Tips actual state through an additive generation', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({ items: [{ id: 't2', title: 'בדיקה', text: 'יש לבדוק ציוד לפני יציאה.' }] }),
        });
        render(
            <StatefulAssistant
                widgetKey="tips"
                initialValue={[{ id: 't1', title: 'קיים', text: 'טיפ קיים' }]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'הפוך לנוהל: לבדוק ציוד לפני יציאה' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => expect(JSON.parse(screen.getByTestId('tips-state').textContent)).toHaveLength(2));
    });

    it('does not apply a Phonebook import with an invented number', async () => {
        const onPersist = vi.fn();
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                items: [{ name: 'ישראל ישראלי', number: '050-1111111', department: 'מטה' }],
            }),
        });
        render(<StatefulAssistant widgetKey="phonebook" initialValue={[]} onPersist={onPersist} />);

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'הוסף את ישראל ישראלי למחלקת מטה' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        expect(await screen.findByText(/לא הוחל שינוי בפועל/)).toBeVisible();
        expect(screen.getByText('תוצאה: לא הוחל שינוי')).toBeVisible();
        expect(onPersist).not.toHaveBeenCalled();
        expect(JSON.parse(screen.getByTestId('phonebook-state').textContent)).toEqual([]);
    });

    it('preserves unrelated Shuttles during schedule import', async () => {
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({
                items: [{ id: 's2', destination: 'הקריה', departureTime: '09:30', type: 'minibus' }],
            }),
        });
        render(
            <StatefulAssistant
                widgetKey="shuttles"
                initialValue={[{ id: 's1', destination: 'תחנה מרכזית', departureTime: '08:00', type: 'bus' }]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'הוסף היסע להקריה בשעה 9.30' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        await waitFor(() => {
            const state = JSON.parse(screen.getByTestId('shuttles-state').textContent);
            expect(state).toEqual([
                { id: 's1', destination: 'תחנה מרכזית', departureTime: '08:00', type: 'bus' },
                { id: 's2', destination: 'הקריה', departureTime: '09:30', type: 'minibus' },
            ]);
        });
    });

    it('shows Poll bias analysis without mutating state', async () => {
        const onPersist = vi.fn();
        AIService.ask.mockResolvedValue({ content: '## בדיקת הטיה\n\nהשאלה **מובילה** ומומלץ לנסח אותה באופן ניטרלי.' });
        render(
            <StatefulAssistant
                widgetKey="polls"
                initialValue={[{ id: 'p1', question: 'נכון שההצעה מצוינת?', active: true, options: [] }]}
                onPersist={onPersist}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'בדוק הטיה' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'בדוק אם השאלה מוטה' } });
        fireEvent.click(screen.getByRole('button', { name: 'נתח והצג תשובה' }));

        expect(await screen.findByRole('heading', { name: 'בדיקת הטיה' })).toBeVisible();
        expect(screen.getByText('מובילה').tagName).toBe('STRONG');
        expect(onPersist).not.toHaveBeenCalled();
    });
});
