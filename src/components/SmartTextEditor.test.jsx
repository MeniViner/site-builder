import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SmartTextEditor from './SmartTextEditor';

function placeCaretAtEnd(element) {
    const textNode = element.firstChild;
    const range = document.createRange();
    range.setStart(textNode, textNode.nodeValue.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
}

describe('SmartTextEditor formatting toolbar', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('provides bullets, numbering, and plain-text reset controls', () => {
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
        expect(screen.queryByRole('button', { name: 'ירידת שורה' })).not.toBeInTheDocument();
    });

    it.each([
        ['plain text', 'שורה ראשונה', 'שורה ראשונה\n'],
        ['bullet list', '• פריט ראשון', '• פריט ראשון\n• '],
        ['numbered list', '1. פריט ראשון', '1. פריט ראשון\n2. '],
    ])('inserts a normal Enter line break for %s', (_kind, initialText, expectedText) => {
        const onChange = vi.fn();
        render(<SmartTextEditor value={[{ type: 'text', text: initialText }]} onChange={onChange} />);

        const editor = screen.getByRole('textbox');
        placeCaretAtEnd(editor);
        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ plainText: expectedText }));
    });
});
