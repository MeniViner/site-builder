import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAIActionCard from './AdminAIActionCard';
import AIService from '../services/AIService';
import { getAiPromptSuggestions } from '../utils/aiPromptSuggestions';

vi.mock('../config/ai.config', () => ({
    getSafeAiRuntimeConfig: () => ({ defaultModel: 'test-model', apiBase: '/test-ai' }),
    formatAiEngineLabel: () => 'test-model',
}));

vi.mock('../services/AIService', () => ({
    default: {
        ask: vi.fn(),
        isEnabled: vi.fn(() => true),
    },
}));

describe('AdminAIActionCard prompt suggestions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AIService.ask.mockResolvedValue({
            content: JSON.stringify({ events: [] }),
            modelUsed: 'test-model',
        });
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('fills the existing field locally and Generate sends the filled text', async () => {
        const buildPrompt = vi.fn((instruction) => `PROMPT:${instruction}`);
        vi.spyOn(Math, 'random').mockReturnValue(0);
        render(
            <AdminAIActionCard
                suggestionSurfaceKey="events"
                buildPrompt={buildPrompt}
                onApply={vi.fn()}
                autoApplyLatest={false}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));
        const input = screen.getByRole('textbox');
        const suggestion = input.value;

        expect(getAiPromptSuggestions('events')).toContain(suggestion);
        expect(AIService.ask).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'צור עם AI' }));
        await waitFor(() => expect(AIService.ask).toHaveBeenCalledOnce());
        expect(buildPrompt).toHaveBeenCalledWith(suggestion, {
            action: undefined,
            readOnly: false,
        });
        expect(AIService.ask.mock.calls[0][0]).toBe(`PROMPT:${suggestion}`);
    });

    it('uses the selected shared-card action pool', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        render(
            <AdminAIActionCard
                suggestionSurfaceKey="events"
                buildPrompt={vi.fn()}
                onApply={vi.fn()}
                suggestedActions={[
                    { id: 'paste', label: 'לו״ז → אירועים', prompt: 'טקסט התחלתי' },
                    { id: 'audit', label: 'בדוק את הלוח', prompt: 'בדיקה התחלתית', readOnly: true },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'בדוק את הלוח' }));
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));

        expect(getAiPromptSuggestions('events', 'audit')).toContain(screen.getByRole('textbox').value);
        expect(AIService.ask).not.toHaveBeenCalled();
    });
});
