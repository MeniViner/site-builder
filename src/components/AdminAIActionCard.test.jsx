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

    it('renders a read-only action response without applying or showing mutation controls', async () => {
        const onApply = vi.fn();
        AIService.ask.mockResolvedValue({
            content: '## בדיקת לוח\n\n| בעיה | פרטים |\n|---|---|\n| כפילות | שני אירועים דומים |',
            modelUsed: 'test-model',
        });
        render(
            <AdminAIActionCard
                suggestionSurfaceKey="events"
                buildPrompt={vi.fn(() => 'AUDIT PROMPT')}
                onApply={onApply}
                autoApplyLatest={false}
                onUndo={vi.fn()}
                onRedo={vi.fn()}
                suggestedActions={[
                    { id: 'generate', label: 'צור אירועים', prompt: 'צור אירועים' },
                    { id: 'audit', label: 'בדוק את הלוח', prompt: 'בדוק', readOnly: true },
                ]}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'בדוק את הלוח' }));
        fireEvent.click(screen.getByRole('button', { name: 'נתח והצג תשובה' }));

        expect(await screen.findByRole('heading', { name: 'בדיקת לוח' })).toBeVisible();
        expect(screen.getByRole('table')).toHaveTextContent('כפילות');
        expect(onApply).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'החל הצעה' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /בטל שינוי AI|בצע מחדש/ })).not.toBeInTheDocument();
    });

    it('shows raw model prose instead of applying an invalid mutating response', async () => {
        const onApply = vi.fn();
        AIService.ask.mockResolvedValue({
            content: 'לא הצלחתי להפיק אירועים מובנים מהמידע שסופק.',
            modelUsed: 'test-model',
        });
        render(
            <AdminAIActionCard
                defaultInput="צור אירועים"
                buildPrompt={vi.fn(() => 'MUTATION PROMPT')}
                onApply={onApply}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'צור עם AI' }));

        expect(await screen.findByText('לא זוהה שינוי שניתן להחיל. תשובת ה-AI מוצגת למטה.')).toBeVisible();
        expect(screen.getByText('לא הצלחתי להפיק אירועים מובנים מהמידע שסופק.')).toBeVisible();
        expect(onApply).not.toHaveBeenCalled();
    });

    it('keeps valid mutating auto-apply behavior', async () => {
        const parsed = { events: [{ id: 'e1', title: 'אירוע' }] };
        const onApply = vi.fn(async () => true);
        AIService.ask.mockResolvedValue({
            content: JSON.stringify(parsed),
            modelUsed: 'test-model',
        });
        render(
            <AdminAIActionCard
                defaultInput="צור אירועים"
                buildPrompt={vi.fn(() => 'MUTATION PROMPT')}
                onApply={onApply}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'צור עם AI' }));
        await waitFor(() => expect(onApply).toHaveBeenCalledWith(parsed, JSON.stringify(parsed)));
        expect(screen.queryByText(/לא זוהה שינוי/)).not.toBeInTheDocument();
    });
});
