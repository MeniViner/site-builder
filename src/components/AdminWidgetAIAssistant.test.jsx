import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminWidgetAIAssistant from './AdminWidgetAIAssistant';
import AIService from '../services/AIService';

vi.mock('../config/uiFeatures.config', () => ({
    UI_FEATURES: {
        showAiUi: true,
        showWidgetAiButtons: true,
    },
}));

vi.mock('../config/ai.config', () => ({
    getSafeAiRuntimeConfig: () => ({ defaultModel: 'test-model' }),
}));

vi.mock('../services/AIService', () => ({
    default: {
        ask: vi.fn(),
        isEnabled: vi.fn(() => true),
    },
}));

describe('AdminWidgetAIAssistant', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
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
            content: 'מצאתי שני מבזקים דומים. מומלץ לאחד אותם.',
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

        expect(await screen.findByText('מצאתי שני מבזקים דומים. מומלץ לאחד אותם.')).toBeVisible();
        expect(onChange).not.toHaveBeenCalled();
    });
});
