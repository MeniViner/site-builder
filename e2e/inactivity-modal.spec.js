import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';

/**
 * Real-browser acceptance for the stale admin edit dialog.
 *
 * Component: src/components/AdminEditSessionGuard.jsx
 * Driver:    src/utils/adminEditSession.js
 *
 * The threshold is intentionally left at its default (60 minutes), because the
 * heading copy is derived from the threshold that actually fired
 * (`staleInactivityTitle` in src/utils/adminEditSession.js) and the gate is
 * specifically about the "60 דקות" wording. The dialog is therefore raised by
 * dispatching the documented window event `site-builder:stale-admin-edit`
 * instead of by lowering VITE_ADMIN_STALE_EDIT_THRESHOLD_MS.
 */

const STALE_EVENT = 'site-builder:stale-admin-edit';
const DOC_LOAD_KEY = '__e2eDocumentLoads';

const readDocumentLoads = (page) => page.evaluate(
    (key) => Number(sessionStorage.getItem(key) || '0'),
    DOC_LOAD_KEY,
);

test.beforeEach(async ({ context, page }) => {
    /**
     * `window.location.reload` is an [[Unforgeable]] own property of the
     * Location instance in Chromium: neither `window.location = ...`,
     * `Object.defineProperty(window.location, 'reload', ...)` nor
     * `Object.defineProperty(Location.prototype, 'reload', ...)` can replace
     * it, and AdminHub mounts <AdminEditSessionGuard /> without overriding its
     * `reloadPage` prop (src/components/AdminHub.jsx:329), so the default
     * `() => window.location.reload()` is what runs.
     *
     * The reload is therefore observed rather than faked: this init script runs
     * once per document, so a genuine reload of the same tab is visible as
     * exactly one increment of a sessionStorage-backed counter. The test still
     * asserts "exactly once" — one extra document load and no more.
     */
    await context.addInitScript((key) => {
        try {
            sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || '0') + 1));
        } catch {
            // Private-mode style failures are irrelevant for this harness.
        }
    }, DOC_LOAD_KEY);

    await stubSharePointIdentityApi(page);
    await page.goto('/#/admin');
    // The guard only exists once AdminHub itself is mounted.
    await expect(page.getByRole('button', { name: 'חזרה לאתר' })).toBeVisible();
});

async function raiseStaleDialog(page) {
    await page.evaluate((eventName) => {
        window.dispatchEvent(new CustomEvent(eventName));
    }, STALE_EVENT);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
}

test('shows the 60 minute inactivity dialog with its documented copy and focused refresh button', async ({ page }) => {
    const dialog = await raiseStaleDialog(page);

    await expect(dialog.getByRole('heading', { name: /זיהינו שלא עבדת במערכת כבר 60 דקות/ })).toBeVisible();
    await expect(dialog.getByText('כפתור הריענון יחזיר אותך לעניינים.')).toBeVisible();

    const refresh = dialog.getByRole('button', { name: 'ריענון' });
    await expect(refresh).toBeVisible();
    await expect(refresh).toBeFocused();
});

test('cannot be dismissed with Escape or by clicking the backdrop', async ({ page }) => {
    const dialog = await raiseStaleDialog(page);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    // The backdrop is the dialog's parent element; click it far away from the
    // dialog box itself.
    const backdrop = dialog.locator('xpath=..');
    const box = await backdrop.boundingBox();
    await page.mouse.click(box.x + 8, box.y + 8);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'ריענון' })).toBeVisible();
});

test('keeps the page behind the dialog recognisable (translucent backdrop, visible content)', async ({ page }) => {
    const dialog = await raiseStaleDialog(page);
    const backdrop = dialog.locator('xpath=..');

    const backgroundColor = await backdrop.evaluate((el) => getComputedStyle(el).backgroundColor);
    const alpha = Number(/rgba?\([^)]*?,\s*([\d.]+)\s*\)$/.exec(backgroundColor)?.[1] ?? '1');
    expect(backgroundColor).toMatch(/^rgba\(/);
    expect(alpha).toBeLessThan(0.5);

    // Something that belongs to the page behind the dialog is still rendered.
    const behind = page.getByRole('button', { name: 'חזרה לאתר' });
    await expect(behind).toBeVisible();
    const behindOpacity = await behind.evaluate((el) => Number(getComputedStyle(el).opacity));
    expect(behindOpacity).toBeGreaterThan(0);
});

test('runs the safe-reload path exactly once when the refresh button is activated with Enter', async ({ page }) => {
    const dialog = await raiseStaleDialog(page);
    const refresh = dialog.getByRole('button', { name: 'ריענון' });
    await refresh.focus();
    await expect(refresh).toBeFocused();

    const loadsBefore = await readDocumentLoads(page);
    expect(loadsBefore).toBe(1);

    const reloaded = page.waitForEvent('load');
    await page.keyboard.press('Enter');
    await reloaded;
    await page.waitForLoadState('domcontentloaded');

    expect(await readDocumentLoads(page)).toBe(loadsBefore + 1);

    // And it must not reload again.
    await page.waitForTimeout(2_000);
    expect(await readDocumentLoads(page)).toBe(loadsBefore + 1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
});
