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
 * (src/utils/adminEditSession.js:280). See e2e/backup-preview-races.spec.js for
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

let activeFixture = null;

test.beforeEach(async ({ context, page }) => {
    activeFixture = null;
    await installRecoveryHarness(context);
    await stubSharePointIdentityApi(page);
});

test.afterEach(async ({ page }) => {
    activeFixture?.releaseAllGates();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a required source that cannot be read stops the preview with a Hebrew message and offers no restore', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    // The master config is a required source for the preview; make it unreadable.
    backup.files = backup.files.map((file) => (
        file.name === MASTER_FILE
            ? { ...file, status: 500, text: 'Internal Server Error: source unavailable' }
            : file
    ));
    activeFixture = await installBackupRoutes(page, [backup]);

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
    // The fixture owns persistence: a restore reads each file back to verify the
    // stored bytes, so a write stub that does not serve the value back makes the
    // app's own verification fail and the restore never completes.
    activeFixture = await installBackupRoutes(page, [backup]);

    await openAdmin(page, '/#/admin/backups');
    const boomBefore = await readLiveBranch(page, ['boom']);
    await openHydratedPreview(page);

    // Restore the navigation only.
    await page.getByRole('button', { name: /נקה בחירה/ }).click();
    await page.getByRole('checkbox', { name: /גיבוי ניווט/ }).check();
    await page.getByRole('button', { name: /שחזור מהגיבוי הזה/ }).click();
    await page.getByRole('button', { name: 'שחזור מהגיבוי', exact: true }).click();

     
    // The persisted data and the rendered state both reflect the selection.
    await expect(page.getByText(/תוצאות השחזור/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/פריטים שנבחרו: 1/)).toBeVisible();
    await expect.poll(async () => JSON.stringify(await readLiveBranch(page, ['configEnvelope', 'navigation', 'items'])))
        .toContain('nav-restored');

    // And the unselected BOOM branch was not touched.
    expect(await readLiveBranch(page, ['boom'])).toEqual(boomBefore);
    // Only LIVE destinations count here. The pre-restore safety backup copies
    // every source file, BOOM included, into its own /Backups/ folder — that is
    // the safety net working, not the unselected branch being overwritten.
    const liveWrites = activeFixture.writes.filter((write) => !write.path.includes('/Backups/'));
    expect(
        liveWrites.some((write) => write.path.endsWith(BOOM_FILE)),
        'the unselected BOOM data file must not be overwritten',
    ).toBe(false);
    expect(
        liveWrites.map((write) => write.path),
        'only the selected unit may be written to the live site',
    ).toEqual([`/sites/schedule/siteDB/siteAssets/${NAV_FILE}`]);
});

test('a failed safety backup stops the restore before anything is written', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    activeFixture = await installBackupRoutes(page, [backup]);
    // Every live write fails, so the pre-restore safety backup cannot complete.
    activeFixture.failWritesMatching = '/siteAssets/';

    await openAdmin(page, '/#/admin/backups');
    const navBefore = await readLiveBranch(page, ['configEnvelope', 'navigation']);
    await openHydratedPreview(page);

    await page.getByRole('button', { name: /שחזור מהגיבוי הזה/ }).click();
    await page.getByRole('button', { name: 'שחזור מהגיבוי', exact: true }).click();

    // The restore must refuse to proceed and say WHICH step stopped it, durably
    // in the modal rather than only in a toast that auto-dismisses.
    // Rendered in more than one place (modal error region and summary line).
    const failure = page.getByText(/יצירת גיבוי הבטיחות נכשלה/).first();
    await expect(failure).toBeVisible({ timeout: 20_000 });
    await expect(failure).toContainText('לא בוצע שינוי בנתונים');
    // Still on screen after any toast would have expired: this is the durable
    // evidence the operator acts on.
    await page.waitForTimeout(6_000);
    await expect(failure).toBeVisible();
    // Raw transport text must never reach the operator.
    await expect(page.getByText(/SharePoint save failed|HTTP 500|write failed/)).toHaveCount(0);
    await expect(page.getByText(/תוצאות השחזור/)).toHaveCount(0);
    expect(await readLiveBranch(page, ['configEnvelope', 'navigation'])).toEqual(navBefore);
    expect(
        activeFixture.writes.filter((write) => write.ok).every((write) => write.path.includes('/Backups/')),
        'no live data file may be written once the safety backup failed',
    ).toBe(true);
});

test('a mid-restore failure reports per-unit outcomes and preserves the evidence', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    activeFixture = await installBackupRoutes(page, [backup]);
    // The safety backup and the FIRST restored unit succeed; the second is
    // refused. Driven through the fixture so every successful write is still
    // stored and read back, which is what the app verifies.
    activeFixture.failWrite = (path, liveWriteIndex) => liveWriteIndex >= 1 && !path.includes('/Backups/');

    await openAdmin(page, '/#/admin/backups');
    const boomBefore = await readLiveBranch(page, ['boom']);
    await openHydratedPreview(page);

    // Two independent units so one can succeed and one can fail.
    await page.getByRole('button', { name: /נקה בחירה/ }).click();
    await page.getByRole('checkbox', { name: /גיבוי ניווט/ }).check();
    await page.getByRole('checkbox', { name: /גיבוי אירועים/ }).check();
    await page.getByRole('button', { name: /שחזור מהגיבוי הזה/ }).click();
    await page.getByRole('button', { name: 'שחזור מהגיבוי', exact: true }).click();

    // The run must end in an explicit partial state, not a silent stop.
    const outcome = page.getByText(/תוצאות השחזור|השחזור הושלם חלקית|שחזור הגיבוי נכשל/).first();
    await expect(outcome).toBeVisible({ timeout: 25_000 });

    // Per-unit evidence: exactly one unit was written, the other was refused.
    const liveWrites = activeFixture.writes.filter((write) => !write.path.includes('/Backups/'));
    expect(liveWrites.filter((write) => write.ok).length, 'one unit must have been written').toBe(1);
    expect(liveWrites.filter((write) => !write.ok).length, 'one unit must have been refused').toBeGreaterThan(0);

    // The safety backup is preserved as recovery evidence.
    const safetyWrites = activeFixture.writes.filter((write) => write.path.includes('/Backups/') && write.ok);
    expect(safetyWrites.length, 'the safety backup must survive a failed restore').toBeGreaterThan(0);
    expect(
        safetyWrites.some((write) => write.path.endsWith('backup-manifest.txt')),
        'the safety backup manifest is the evidence of what was captured',
    ).toBe(true);

    // Unselected data is untouched, and the failure never claims success.
    expect(await readLiveBranch(page, ['boom'])).toEqual(boomBefore);
    await expect(page.getByText(/השחזור בוצע וכל הנתונים הנטענים עודכנו/)).toHaveCount(0);
});
