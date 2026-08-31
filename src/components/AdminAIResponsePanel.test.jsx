import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminAIResponsePanel from './AdminAIResponsePanel';

const MARKDOWN = `
## תמונת מצב

נמצאו **3 בעיות עיקריות** וגם *בעיה משנית*.

1. משימה ללא אחראי.
2. משימה ללא תאריך.

- פריט ראשון
  - פריט פנימי
- פריט שני

- [x] נבדק
- [ ] טרם טופל

> מומלץ לטפל קודם במשימות הקריטיות.

הפקודה היא \`npm test\`.

\`\`\`json
{"status":"blocked"}
\`\`\`

| משימה | אחראי | מצב |
|---|---|---|
| אישור תוכנית | דני | חסום |
| הפצת מסמך | רועי | בתהליך |

---

[קישור בטוח](https://example.com)
`;

describe('AdminAIResponsePanel', () => {
    afterEach(cleanup);

    it('renders Hebrew Markdown and GFM as semantic content', () => {
        const { container } = render(<AdminAIResponsePanel content={MARKDOWN} modelLabel="test-model" />);

        expect(screen.getByRole('heading', { name: 'תמונת מצב' })).toBeVisible();
        expect(screen.getByText('3 בעיות עיקריות').tagName).toBe('STRONG');
        expect(screen.getByText('בעיה משנית').tagName).toBe('EM');
        expect(container.querySelector('ol')).toBeInTheDocument();
        expect(container.querySelectorAll('ul').length).toBeGreaterThan(1);
        expect(container.querySelector('blockquote')).toHaveTextContent('מומלץ');
        expect(container.querySelector('code')).toHaveTextContent('npm test');
        expect(container.querySelector('pre')).toHaveTextContent('{"status":"blocked"}');
        expect(container.querySelector('hr')).toBeInTheDocument();
        expect(screen.getByText(/מודל: test-model/)).toBeVisible();
        expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
    });

    it('renders a GFM table inside a horizontal overflow container', () => {
        const { container } = render(<AdminAIResponsePanel content={MARKDOWN} />);
        const table = screen.getByRole('table');
        expect(table).toHaveTextContent('אישור תוכנית');
        expect(table.parentElement).toHaveClass('overflow-x-auto');
        expect(container.querySelectorAll('th')).toHaveLength(3);
        expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    });

    it('keeps code LTR and long content constrained', () => {
        const { container } = render(
            <AdminAIResponsePanel content={'```text\n' + 'x'.repeat(500) + '\n```'} />
        );
        expect(container.querySelector('pre')).toHaveAttribute('dir', 'ltr');
        expect(container.querySelector('pre')).toHaveClass('overflow-x-auto');
        expect(container.querySelector('code')).toHaveClass('min-w-max');
    });

    it('renders safe links in a separate protected tab', () => {
        render(<AdminAIResponsePanel content="[אתר](https://example.com)" />);
        expect(screen.getByRole('link', { name: 'אתר' })).toMatchObject({
            target: '_blank',
            rel: 'noopener noreferrer',
        });
    });

    it('does not render unsafe raw HTML or javascript links', () => {
        window.__unsafeAiMarkupExecuted = false;
        const content = '<img src=x onerror="window.__unsafeAiMarkupExecuted=true"><script>window.__unsafeAiMarkupExecuted=true</script>\n[מסוכן](javascript:alert(1))';
        const { container } = render(<AdminAIResponsePanel content={content} />);

        expect(container.querySelector('img')).not.toBeInTheDocument();
        expect(container.querySelector('script')).not.toBeInTheDocument();
        expect(screen.getByText('מסוכן').closest('a')).not.toHaveAttribute('href', 'javascript:alert(1)');
        expect(window.__unsafeAiMarkupExecuted).toBe(false);
        delete window.__unsafeAiMarkupExecuted;
    });

    it('copies the original response and can clear it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { writeText },
        });
        const onClear = vi.fn();
        render(<AdminAIResponsePanel content={MARKDOWN} onClear={onClear} />);

        fireEvent.click(screen.getByRole('button', { name: 'העתק תשובה' }));
        expect(writeText).toHaveBeenCalledWith(MARKDOWN);
        expect(await screen.findByText('הועתק')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'נקה תשובה' }));
        expect(onClear).toHaveBeenCalledOnce();
    });

    it('shows an in-panel analysis loading state', () => {
        render(<AdminAIResponsePanel isLoading />);
        expect(screen.getByText('ה-AI מנתח את המידע...')).toBeVisible();
        expect(screen.getByLabelText('תשובת AI')).toHaveAttribute('aria-live', 'polite');
    });

    it('renders a malformed-mutation notice with the raw response', () => {
        render(
            <AdminAIResponsePanel
                content="לא הצלחתי ליצור מבנה תקין."
                notice="לא הוחל שינוי בפועל. תשובת ה-AI מוצגת למטה."
                outcome="no-change"
            />
        );
        expect(screen.getByText('תוצאה: לא הוחל שינוי')).toBeVisible();
        expect(screen.getByText('לא הוחל שינוי בפועל. תשובת ה-AI מוצגת למטה.')).toBeVisible();
        expect(screen.getByText('לא הצלחתי ליצור מבנה תקין.')).toBeVisible();
    });
});
