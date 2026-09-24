import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';

/**
 * Real-browser acceptance for the smart text editor used by the alerts admin.
 *
 * Component: src/components/SmartTextEditor.jsx
 * Host:      src/components/AdminAlerts.jsx (alert content tab)
 *
 * Everything here uses real keyboard input against the contenteditable, so the
 * component's own Enter handling (`getEnterText` + `insertPlainTextAtSelection`)
 * and its 80ms input-sync debounce are exercised rather than bypassed.
 */

const DEMO_DRAFT_KEY = 'site-builder:demo:kashar:draft:v1';
const TITLE_PLACEHOLDER = 'למשל: ביקורת כושר רבעונית';

const editorOf = (page) => page.locator('div[contenteditable][role="textbox"]');

/** Lets the component's debounced DOM->tokens sync and re-render settle. */
const settle = (page) => page.waitForTimeout(300);

async function typeText(page, text) {
    // A human-plausible cadence; see the note in the report about typing that
    // outruns the 80ms sync debounce.
    await page.keyboard.type(text, { delay: 30 });
    await settle(page);
}

async function pressKey(page, key) {
    await page.keyboard.press(key);
    await settle(page);
}

/**
 * Caret movement only. Home/End are not used: on macOS Chromium they are not a
 * reliable line-start/line-end gesture, and arrow steps are identical on every
 * platform. Arrow keys emit no input event, so no sync has to settle.
 */
async function moveCaret(page, key, times) {
    for (let index = 0; index < times; index += 1) {
        await page.keyboard.press(key);
    }
}

/**
 * The text the operator can actually see, derived from the live DOM while
 * ignoring the editor-only caret placeholder <br>.
 */
function visibleStructure(page) {
    return editorOf(page).evaluate((root) => {
        let text = '';
        let breaks = 0;
        let placeholders = 0;
        const walk = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.nodeValue;
                return;
            }
            if (node.nodeName === 'BR') {
                if (node.dataset?.caretPlaceholder === 'true') {
                    placeholders += 1;
                    return;
                }
                breaks += 1;
                text += '\n';
                return;
            }
            Array.from(node.childNodes || []).forEach(walk);
        };
        Array.from(root.childNodes || []).forEach(walk);
        return { text, breaks, placeholders, html: root.innerHTML };
    });
}

async function openNewAlert(page) {
    await page.goto('/#/admin/alerts');
    await page.getByRole('button', { name: 'התראה חדשה' }).click();
    await expect(editorOf(page)).toBeVisible();
    await editorOf(page).click();
}

async function saveAsDraft(page, title) {
    await page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`).fill(title);
    await page.getByRole('button', { name: /המשך להצגה ותזמון/ }).click();
    await page.getByRole('button', { name: /שמירה כטיוטה/ }).click();
    await expect(page.getByRole('button', { name: `עריכת ${title}` })).toBeVisible();
}

/** Reads the notification the app actually persisted, by title. */
function readPersistedAlert(page, title) {
    return page.evaluate(([key, wantedTitle]) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        let found = null;
        const walk = (node) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node.items)) {
                const hit = node.items.find((item) => item && item.title === wantedTitle);
                if (hit) found = hit;
            }
            Object.values(node).forEach(walk);
        };
        walk(JSON.parse(raw));
        return found;
    }, [DEMO_DRAFT_KEY, title]);
}

test.beforeEach(async ({ page }) => {
    await stubSharePointIdentityApi(page);
});

test('Enter pressed once produces exactly one visible newline', async ({ page }) => {
    await openNewAlert(page);

    await typeText(page, 'first line');
    await pressKey(page, 'Enter');
    await typeText(page, 'second line');

    const structure = await visibleStructure(page);
    expect(structure.text).toBe('first line\nsecond line');
    expect(structure.breaks).toBe(1);
});

test('Enter pressed twice preserves the intentional blank line', async ({ page }) => {
    await openNewAlert(page);

    await typeText(page, 'first line');
    await pressKey(page, 'Enter');
    await pressKey(page, 'Enter');
    await typeText(page, 'third line');

    const structure = await visibleStructure(page);
    expect(structure.text).toBe('first line\n\nthird line');
    expect(structure.breaks).toBe(2);
});

test('Shift+Enter breaks the line without continuing the list, unlike Enter', async ({ page }) => {
    await openNewAlert(page);

    // A manually authored bullet line: plain Enter continues the list.
    await typeText(page, '• alpha');
    await pressKey(page, 'Enter');
    await typeText(page, 'beta');
    expect((await visibleStructure(page)).text).toBe('• alpha\n• beta');

    // Shift+Enter is the deliberate "just break the line" gesture.
    await pressKey(page, 'Shift+Enter');
    await typeText(page, 'gamma');

    const structure = await visibleStructure(page);
    expect(structure.text).toBe('• alpha\n• beta\ngamma');
    expect(structure.breaks).toBe(2);
});

test('the caret inserts at the end, in the middle and at the start of a line', async ({ page }) => {
    await openNewAlert(page);

    // End of content.
    await typeText(page, 'ABCD');
    await typeText(page, 'E');
    expect((await visibleStructure(page)).text).toBe('ABCDE');

    // Middle: step back two characters and insert.
    await moveCaret(page, 'ArrowLeft', 2);
    await typeText(page, 'X');
    expect((await visibleStructure(page)).text).toBe('ABCXDE');

    // Start of the line: the caret sits after X (offset 4).
    await moveCaret(page, 'ArrowLeft', 4);
    await typeText(page, 'Z');
    expect((await visibleStructure(page)).text).toBe('ZABCXDE');

    // Start of a second line, after a break. The caret sits after Z (offset 1)
    // and 'ZABCXDE' is 7 characters long.
    await moveCaret(page, 'ArrowRight', 6);
    await pressKey(page, 'Enter');
    await typeText(page, 'second');
    await moveCaret(page, 'ArrowLeft', 6);
    await typeText(page, 'Q');

    const structure = await visibleStructure(page);
    expect(structure.text).toBe('ZABCXDE\nQsecond');
    expect(structure.breaks).toBe(1);
});

test('line structure survives save and reopen, and no caret-only <br> is persisted', async ({ page }) => {
    const title = 'מבנה שורות E2E';
    await openNewAlert(page);

    await typeText(page, 'line one');
    await pressKey(page, 'Enter');
    await pressKey(page, 'Enter');
    await typeText(page, 'line three');
    // A deliberate trailing break: this one IS authored content.
    await pressKey(page, 'Enter');

    const beforeSave = await visibleStructure(page);
    expect(beforeSave.text).toBe('line one\n\nline three\n');
    expect(beforeSave.breaks).toBe(3);
    // The trailing blank line renders an editor-only placeholder.
    expect(beforeSave.placeholders).toBe(1);

    await saveAsDraft(page, title);

    const persisted = await readPersistedAlert(page, title);
    expect(persisted).not.toBeNull();
    // `richContent` is the authoritative structure; `text` is the plain-text
    // mirror that normalizeNotification (src/utils/notificationData.js) trims.
    expect(persisted.text).toBe(beforeSave.text.trim());

    const persistedBreaks = persisted.richContent.filter((token) => token.type === 'break').length;
    expect(persistedBreaks).toBe(beforeSave.breaks);
    // The placeholder must never reach the persisted document.
    expect(JSON.stringify(persisted.richContent)).not.toContain('caretPlaceholder');
    expect(persisted.richContent.filter((token) => token.type === 'text').map((token) => token.text))
        .toEqual(['line one', 'line three']);

    // Reopen: the visible structure must match what was persisted.
    await page.getByRole('button', { name: `עריכת ${title}` }).click();
    await expect(editorOf(page)).toBeVisible();
    await settle(page);

    const afterReopen = await visibleStructure(page);
    expect(afterReopen.text).toBe(beforeSave.text);
    expect(afterReopen.breaks).toBe(persistedBreaks);
    expect(afterReopen.placeholders).toBe(1);
    expect(afterReopen.html).not.toContain('<br><br data-caret-placeholder="true" aria-hidden="true"><br');
});
