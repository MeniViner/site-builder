import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminAIHelp from './AdminAIHelp';
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

describe('AdminAIHelp prompt suggestions', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('replaces the existing question locally and sends it only after Ask', async () => {
        AIService.ask.mockResolvedValue({ content: 'תשובה', modelUsed: 'test-model' });
        vi.spyOn(Math, 'random').mockReturnValue(0);
        render(<AdminAIHelp />);

        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));
        const question = screen.getByLabelText('השאלה שלך').value;

        expect(getAiPromptSuggestions('ai-help')).toContain(question);
        expect(AIService.ask).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'שאל את העוזר' }));
        await waitFor(() => expect(AIService.ask).toHaveBeenCalledOnce());
        expect(AIService.ask.mock.calls[0][0]).toContain(`השאלה: ${question}`);
    });
});
