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

    it('preserves an intentional blank line when Enter is pressed twice in a row', () => {
        const onChange = vi.fn();
        render(<SmartTextEditor value={[{ type: 'text', text: 'שורה ראשונה' }]} onChange={onChange} />);

        const editor = screen.getByRole('textbox');
        placeCaretAtEnd(editor);
        fireEvent.keyDown(editor, { key: 'Enter' });
        fireEvent.keyDown(editor, { key: 'Enter' });

        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ plainText: 'שורה ראשונה\n\n' }));
    });

    it('does not continue a bullet marker on Shift+Enter', () => {
        const onChange = vi.fn();
        render(<SmartTextEditor value={[{ type: 'text', text: '• פריט ראשון' }]} onChange={onChange} />);

        const editor = screen.getByRole('textbox');
        placeCaretAtEnd(editor);
        fireEvent.keyDown(editor, { key: 'Enter', shiftKey: true });

        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ plainText: '• פריט ראשון\n' }));
    });

    it('ignores Enter key presses while an IME composition is in progress', () => {
        const onChange = vi.fn();
        render(<SmartTextEditor value={[{ type: 'text', text: 'שורה ראשונה' }]} onChange={onChange} />);

        const editor = screen.getByRole('textbox');
        placeCaretAtEnd(editor);
        fireEvent.keyDown(editor, { key: 'Enter', isComposing: true });

        expect(onChange).not.toHaveBeenCalled();
    });

    it('renders an editor-only caret placeholder for a trailing blank line without persisting it', () => {
        const onChange = vi.fn();
        const value = [
            { type: 'text', text: 'שורה ראשונה', marks: [] },
            { type: 'break' },
        ];
        render(<SmartTextEditor value={value} onChange={onChange} />);

        const editor = screen.getByRole('textbox');
        const placeholderBr = editor.querySelector('br[data-caret-placeholder="true"]');
        expect(placeholderBr).not.toBeNull();

        fireEvent.input(editor);

        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ plainText: 'שורה ראשונה\n' }));
    });

    it('shows a neutral Hebrew link instruction regardless of whether text is selected', () => {
        const onChange = vi.fn();
        render(<SmartTextEditor value={[{ type: 'text', text: 'שורה ראשונה' }]} onChange={onChange} />);

        const editor = screen.getByRole('textbox');
        placeCaretAtEnd(editor);
        fireEvent.mouseDown(screen.getByRole('button', { name: 'הוספת קישור' }));

        expect(screen.getByText('מלאו שם שיוצג בטקסט ואת הכתובת שאליה הוא יוביל.')).toBeInTheDocument();
        expect(screen.queryByText(/בחרת|טקסט מסומן|הטקסט שנבחר/)).not.toBeInTheDocument();
    });
});
