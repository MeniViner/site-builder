import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmartTextEditor from './SmartTextEditor';

describe('SmartTextEditor formatting toolbar', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('provides bullets, numbering, line breaks, and plain-text reset controls', () => {
        const execCommand = vi.fn();
        Object.defineProperty(document, 'execCommand', {
            configurable: true,
            value: execCommand,
        });
        render(<SmartTextEditor value={[]} plainText="טקסט" onChange={() => {}} />);

        fireEvent.mouseDown(screen.getByRole('button', { name: 'רשימת תבליטים' }));
        fireEvent.mouseDown(screen.getByRole('button', { name: 'רשימה ממוספרת' }));
        fireEvent.mouseDown(screen.getByRole('button', { name: 'טקסט רגיל' }));

        expect(execCommand).toHaveBeenCalledWith('insertUnorderedList', false, null);
        expect(execCommand).toHaveBeenCalledWith('insertOrderedList', false, null);
        expect(execCommand).toHaveBeenCalledWith('removeFormat', false, null);
        expect(execCommand).toHaveBeenCalledWith('unlink', false, null);
        expect(screen.getByRole('button', { name: 'ירידת שורה' })).toBeInTheDocument();
    });
});
