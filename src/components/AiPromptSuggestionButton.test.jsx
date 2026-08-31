import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiPromptSuggestionButton from './AiPromptSuggestionButton';

describe('AiPromptSuggestionButton', () => {
    afterEach(cleanup);

    it('fills the owning input and avoids an immediate repeat', () => {
        const onChange = vi.fn();
        render(
            <AiPromptSuggestionButton
                surfaceKey="news"
                currentValue=""
                onChange={onChange}
                suggestions={['הצעה ראשונה', 'הצעה שנייה', 'הצעה שלישית']}
                random={() => 0}
            />
        );

        const button = screen.getByRole('button', { name: 'הצע ניסוח' });
        fireEvent.click(button);
        fireEvent.click(button);

        expect(onChange).toHaveBeenNthCalledWith(1, 'הצעה ראשונה');
        expect(onChange).toHaveBeenNthCalledWith(2, 'הצעה שנייה');
    });

    it('is a non-submit button with an explanatory tooltip', () => {
        render(
            <form onSubmit={vi.fn()}>
                <AiPromptSuggestionButton suggestions={['דוגמה']} onChange={vi.fn()} />
            </form>
        );

        const button = screen.getByRole('button', { name: 'הצע ניסוח' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveAttribute('title', expect.stringContaining('הטקסט לא נשלח'));
    });

    it('is disabled when no suggestions are available', () => {
        render(<AiPromptSuggestionButton suggestions={[]} onChange={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'הצע ניסוח' })).toBeDisabled();
    });
});
