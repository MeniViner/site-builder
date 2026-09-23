import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';

/**
 * Typing fidelity at a human cadence.
 *
 * SmartTextEditor derived the contenteditable's React `key` from its own content
 * (`editorKey = JSON.stringify(tokens)`), so EVERY token change unmounted and
 * remounted the editor. Combined with the 80ms DOM->tokens debounce and the
 * caret restore that follows, keystrokes landing inside the remount window were
 * dropped or reordered.
 *
 * 80ms/keystroke is roughly 30wpm -- ordinary typing, not a stress test.
 */

const TITLE_PLACEHOLDER = 'למשל: ביקורת כושר רבעונית';
const editorOf = (page) => page.locator('div[contenteditable][role="textbox"]');

async function openNewAlert(page) {
    await page.goto('/#/admin/alerts');
    await page.getByRole('button', { name: 'התראה חדשה' }).click();
    await expect(editorOf(page)).toBeVisible();
    await editorOf(page).click();
}

/** Visible text and structure, ignoring the editor-only caret filler. */
function readStructure(page) {
    return editorOf(page).evaluate((root) => {
        let text = '';
        let breaks = 0;
        let placeholders = 0;
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) { text += node.textContent; return; }
            if (node.nodeName === 'BR') {
                if (node.dataset?.caretPlaceholder === 'true') { placeholders += 1; return; }
                breaks += 1; text += '\n'; return;
            }
            Array.from(node.childNodes || []).forEach(walk);
        };
        Array.from(root.childNodes || []).forEach(walk);
        return { text, breaks, placeholders, html: root.innerHTML };
    });
}

test.beforeEach(async ({ page }) => {
    await stubSharePointIdentityApi(page);
});

test('every character survives typing at ~30wpm', async ({ page }) => {
    await openNewAlert(page);
    await page.keyboard.type('abcdefghij', { delay: 80 });
    await page.waitForTimeout(400);

    const { text } = await readStructure(page);
    expect(text).toBe('abcdefghij');
});

test('a line break typed mid-sentence keeps both lines intact', async ({ page }) => {
    await openNewAlert(page);
    await page.keyboard.type('AAA', { delay: 80 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('BBB', { delay: 80 });
    await page.waitForTimeout(400);

    const { text, breaks } = await readStructure(page);
    expect(text).toBe('AAA\nBBB');
    expect(breaks).toBe(1);
});

test('fast typing does not drop characters either', async ({ page }) => {
    await openNewAlert(page);
    await page.keyboard.type('The quick brown fox', { delay: 20 });
    await page.waitForTimeout(400);

    const { text } = await readStructure(page);
    expect(text).toBe('The quick brown fox');
});

test('no caret placeholder is persisted after typing and saving', async ({ page }) => {
    await openNewAlert(page);
    await page.keyboard.type('שורה ראשונה', { delay: 80 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('שורה שנייה', { delay: 80 });
    await page.waitForTimeout(400);

    const title = `fidelity-${Date.now()}`;
    await page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`).fill(title);
    await page.getByRole('button', { name: /המשך להצגה ותזמון/ }).click();
    await page.getByRole('button', { name: /שמירה כטיוטה/ }).click();
    await expect(page.getByRole('button', { name: `עריכת ${title}` })).toBeVisible();

    const persisted = await page.evaluate(([key, wanted]) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        let found = null;
        const walk = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node.items)) {
                const hit = node.items.find((item) => item && item.title === wanted);
                if (hit) found = hit;
            }
            Object.values(node).forEach(walk);
        };
        walk(JSON.parse(raw));
        return found;
    }, ['site-builder:demo:kashar:draft:v1', title]);

    expect(persisted).toBeTruthy();
    const serialized = JSON.stringify(persisted);
    expect(serialized).not.toContain('caretPlaceholder');
    expect(serialized).not.toContain('caret-placeholder');
    expect(persisted.text).toContain('שורה ראשונה');
    expect(persisted.text).toContain('שורה שנייה');
});
