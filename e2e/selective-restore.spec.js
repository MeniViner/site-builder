import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';
import {
    BOOM_FILE,
    EVENTS_FILE,
    GANTT_FILE,
    MASTER_FILE,
    NAV_FILE,
    USERS_FILE,
    fullBackup,
    installBackupRoutes,
    masterConfigText,
} from './helpers/backupFixtures.js';
import { installRecoveryHarness, openAdmin } from './helpers/adminRecovery.js';

/**
 * Selective restore, orchestrated against routed SharePoint fixtures.
 *
 * Component: src/components/AdminBackupManagement.jsx:1225-1490
 *
 * BLOCKED, AND DELIBERATELY LEFT FAILING: every scenario that needs a hydrated
 * restore preview dies before it can assert anything, because rendering the
 * preview tears the whole admin document down. <BackupSiteLivePreview>
 * (src/components/BackupSiteLivePreview.jsx:4-11) mounts a second
 * NavigationProvider and ExternalLinksProvider, whose fixed recovery ids collide
 * with the live ones and make registerAdminRecoveryParticipant throw
 * (src/utils/adminEditSession.js:279). See e2e/backup-preview-races.spec.js for
 * the isolated proof. The first test below does NOT need a hydrated preview and
 * passes; the rest are the real orchestration, waiting on that fix.
 */

const PREVIEW_LABEL = 'תצוגה מקדימה לשחזור';
const PREVIEW_LOADING = 'בודק קבצי גיבוי ומכין תצוגה מקדימה...';

const backupRows = (page) => page.getByRole('button', { name: /^בחר גיבוי מלא/ });
const selectBackupRow = (row) => row.press('Enter');

/** Opens the preview and waits for the payload hydration to finish. */
async function openHydratedPreview(page) {
    await expect(page.getByText('1 פריטים')).toBeVisible();
    await selectBackupRow(backupRows(page).first());
    await expect(page.getByText(PREVIEW_LABEL)).toBeVisible();
    await expect(page.getByText(PREVIEW_LOADING)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'בחירת פריטים לשחזור' })).toBeVisible();
}

/** The live site data the app persists, read from its own store. */
const readLiveBranch = (page, path) => page.evaluate((branchPath) => {
    const raw = localStorage.getItem('site-builder:demo:kashar:draft:v1');
    if (!raw) return null;
    let node = JSON.parse(raw);
    for (const key of branchPath) {
        if (!node || typeof node !== 'object') return null;
        node = node[key];
    }
    return node ?? null;
}, path);

test.beforeEach(async ({ context, page }) => {
    await installRecoveryHarness(context);
    await stubSharePointIdentityApi(page);
});

test('a required source that cannot be read stops the preview with a Hebrew message and offers no restore', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    // The master config is a required source for the preview; make it unreadable.
    backup.files = backup.files.map((file) => (
        file.name === MASTER_FILE
            ? { ...file, status: 500, text: 'Internal Server Error: source unavailable' }
            : file
    ));
    await installBackupRoutes(page, [backup]);

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('1 פריטים')).toBeVisible();
    await selectBackupRow(backupRows(page).first());

    await expect(page.getByText(PREVIEW_LABEL)).toBeVisible();
    await expect(page.getByText(PREVIEW_LOADING)).toHaveCount(0, { timeout: 15_000 });

    // A failure, stated in Hebrew, with no restore action anywhere near it.
    const modalText = await page.getByText(PREVIEW_LABEL).locator('xpath=ancestor::div[3]').innerText();
    expect(modalText).toMatch(/[֐-׿]/);
    expect(modalText, 'the raw server body must not reach the operator').not.toContain('Internal Server Error');
    await expect(page.getByRole('button', { name: /שחזור מהגיבוי הזה/ })).toBeDisabled();

    // Nothing was restored, and the console is still usable.
    await expect(page.getByRole('heading', { name: 'ניהול גיבויים' })).toBeVisible();
});

test('a selective restore writes only the selected units and preserves everything unselected', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10', { siteTitle: 'כותרת מהגיבוי' });
    backup.files = [
        { name: MASTER_FILE, text: masterConfigText({ siteContent: { hero: { title: 'כותרת מהגיבוי' } } }) },
        { name: NAV_FILE, text: JSON.stringify([{ id: 'nav-restored', label: 'ניווט מהגיבוי' }]) },
        { name: EVENTS_FILE, text: JSON.stringify({ displayCount: 1, displayMode: 'default', events: [{ id: 'event-restored', title: 'אירוע מהגיבוי' }] }) },
        { name: USERS_FILE, text: JSON.stringify([{ id: 'admin-restored', name: 'מנהל מהגיבוי' }]) },
        { name: BOOM_FILE, text: JSON.stringify({ enabled: true, items: [{ id: 'boom-restored', title: 'משימה מהגיבוי' }], categories: [] }) },
        { name: GANTT_FILE, text: JSON.stringify({ items: [{ id: 'gantt-restored', title: 'שלב מהגיבוי' }], categories: [] }) },
    ];
    const writes = [];
    await installBackupRoutes(page, [backup]);
    await page.route(/\/siteDB\/siteAssets\/[^/]+\.txt$/, async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        writes.push({ url: new URL(route.request().url()).pathname, body: route.request().postData() });
        return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    });

    await openAdmin(page, '/#/admin/backups');
    const boomBefore = await readLiveBranch(page, ['boom']);
    await openHydratedPreview(page);

    // Restore the navigation only.
    await page.getByRole('button', { name: /נקה בחירה/ }).click();
    await page.getByRole('checkbox', { name: /גיבוי ניווט/ }).check();
    await page.getByRole('button', { name: /שחזור מהגיבוי הזה/ }).click();
    await page.getByRole('button', { name: 'שחזור מהגיבוי' }).click();

    // The persisted data and the rendered state both reflect the selection.
    await expect(page.getByText(/תוצאות השחזור/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/פריטים שנבחרו: 1/)).toBeVisible();
    await expect.poll(async () => JSON.stringify(await readLiveBranch(page, ['configEnvelope', 'navigation', 'items'])))
        .toContain('nav-restored');

    // And the unselected BOOM branch was not touched.
    expect(await readLiveBranch(page, ['boom'])).toEqual(boomBefore);
    expect(writes.some((write) => write.url.endsWith(BOOM_FILE)), 'BOOM was not selected').toBe(false);
});

test('a failed safety backup stops the restore before anything is written', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    const writes = [];
    await installBackupRoutes(page, [backup]);
    await page.route(/\/siteDB\/siteAssets\/[^/]+\.txt$/, async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        writes.push(new URL(route.request().url()).pathname);
        // Every write fails, so the pre-restore safety backup cannot complete.
        return route.fulfill({ status: 500, contentType: 'text/plain', body: 'safety backup write refused' });
    });

    await openAdmin(page, '/#/admin/backups');
    const navBefore = await readLiveBranch(page, ['configEnvelope', 'navigation']);
    await openHydratedPreview(page);

    await page.getByRole('button', { name: /שחזור מהגיבוי הזה/ }).click();
    await page.getByRole('button', { name: 'שחזור מהגיבוי' }).click();

    // The restore must refuse to proceed, say so in Hebrew, and change nothing.
    await expect(page.getByText(/גיבוי הבטיחות|יצירת גיבוי בטיחות/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/תוצאות השחזור/)).toHaveCount(0);
    expect(await readLiveBranch(page, ['configEnvelope', 'navigation'])).toEqual(navBefore);
    expect(
        writes.every((path) => path.includes('/Backups/')),
        'no live data file may be written once the safety backup failed',
    ).toBe(true);
});

test('a mid-restore failure reports per-unit outcomes and preserves the evidence', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    await installBackupRoutes(page, [backup]);

    // The safety backup and the first restored file succeed; a later unit fails.
    let restoreWrites = 0;
    await page.route(/\/siteDB\/siteAssets\/[^/]+\.txt$/, async (route) => {
        if (route.request().method() !== 'PUT') return route.fallback();
        const path = new URL(route.request().url()).pathname;
        if (path.includes('/Backups/')) return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
        restoreWrites += 1;
        if (restoreWrites > 1) {
            return route.fulfill({ status: 500, contentType: 'text/plain', body: 'unit write refused' });
        }
        return route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
    });

    await openAdmin(page, '/#/admin/backups');
    await openHydratedPreview(page);

    await page.getByRole('button', { name: /שחזור מהגיבוי הזה/ }).click();
    await page.getByRole('button', { name: 'שחזור מהגיבוי' }).click();

    // A partial result, with the per-unit outcome still on screen as evidence.
    await expect(page.getByText(/תוצאות השחזור/)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/שוחזרו: \d+ · נכשלים: [1-9]/)).toBeVisible();
    await expect(page.getByText(/השחזור הושלם חלקית|נכשל/)).toBeVisible();
});
