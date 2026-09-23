import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';
import {
    EVENTS_FILE,
    MASTER_FILE,
    NAV_FILE,
    USERS_FILE,
    fullBackup,
    gate,
    installBackupRoutes,
    masterConfigText,
} from './helpers/backupFixtures.js';
import { installRecoveryHarness, openAdmin } from './helpers/adminRecovery.js';

/**
 * Races and unknown-vs-zero semantics in the backup restore preview, driven
 * against the running app with every SharePoint response routed
 * (see e2e/helpers/backupFixtures.js).
 *
 * Component: src/components/AdminBackupManagement.jsx
 *
 * NOTE ON A BLOCKING DEFECT: as soon as a preview payload hydrates,
 * AdminBackupManagement renders <BackupSiteLivePreview> (line 1974), which
 * mounts a SECOND NavigationProvider and ExternalLinksProvider. Both register
 * the fixed recovery ids "navigation-save-debounce" and
 * "external-links-save-debounce" (src/context/NavigationContext.jsx:210,
 * src/context/ExternalLinksContext.jsx:86 ->
 * src/context/useOptimisticBranchPersistence.js:43), and
 * registerAdminRecoveryParticipant throws for a duplicate id
 * (src/utils/adminEditSession.js:280). The throw escapes from an effect with no
 * error boundary above it and the whole admin document is torn down. The tests
 * below are split accordingly: the ones that stop before hydration pass, the
 * ones that need a hydrated preview fail on that crash.
 */

const PREVIEW_LABEL = 'תצוגה מקדימה לשחזור';
const PREVIEW_LOADING = 'בודק קבצי גיבוי ומכין תצוגה מקדימה...';

const backupRows = (page) => page.getByRole('button', { name: /^בחר גיבוי מלא/ });
const previewHeading = (page) => page.getByText(PREVIEW_LABEL).locator('xpath=..').locator('h2');
const closePreview = (page) => page.getByRole('button', { name: 'סגור חלון שחזור' });

/**
 * The backup rows are `role="button"` containers whose centre is empty space
 * between the title and the action cluster, so they are activated the way a
 * keyboard operator does (src/components/AdminBackupManagement.jsx:1769).
 */
const selectBackupRow = (row) => row.press('Enter');

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

test('opening a restore preview must not destroy the admin console', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    activeFixture = await installBackupRoutes(page, [fullBackup('backup-2026-06-10')]);
    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('1 פריטים')).toBeVisible();

    await selectBackupRow(backupRows(page).first());
    await expect(page.getByText(PREVIEW_LABEL)).toBeVisible();

    // Once the payloads arrive the preview must render, and the console behind
    // it must still exist.
    await expect(page.getByText(PREVIEW_LOADING)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'בחירת פריטים לשחזור' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ניהול גיבויים' })).toBeVisible();
    expect(pageErrors, 'rendering a restore preview must not throw').toEqual([]);
});

/**
 * An unreadable folder is UNKNOWN, not empty: telling an operator a backup holds
 * zero files invites them to delete one that is actually intact. The row says so
 * explicitly (src/components/AdminBackupManagement.jsx:1791-1797).
 */
test('a backup whose file listing failed is never reported as having 0 files', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    const fixture = await installBackupRoutes(page, [backup]);
    activeFixture = fixture;

    // Metadata only: the folder is known, its contents are not.
    let failedListings = 0;
    await page.route(/GetFolderByServerRelativeUrl.*\/Files/, (route) => {
        failedListings += 1;
        return route.fulfill({ status: 500, contentType: 'text/plain', body: 'listing unavailable' });
    });

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('1 פריטים')).toBeVisible();

    // The listing really was attempted and really did fail.
    expect(fixture.counts.folders).toBeGreaterThan(0);
    expect(failedListings, 'the per-folder file listing must have been requested').toBeGreaterThan(0);

    // An unknown file count must not be rendered as the factual claim "0".
    await expect(page.getByText('מספר הקבצים אינו ידוע')).toBeVisible();
    await expect(page.getByText(/^0 קבצים/)).toHaveCount(0);
});

test('a later successful file listing hydrates the unknown count into a known one', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    let failListing = true;
    const fixture = await installBackupRoutes(page, [backup]);
    activeFixture = fixture;
    await page.route(/GetFolderByServerRelativeUrl.*\/Files/, async (route) => {
        if (failListing) {
            return route.fulfill({ status: 500, contentType: 'text/plain', body: 'listing unavailable' });
        }
        return route.fallback();
    });

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('1 פריטים')).toBeVisible();

    failListing = false;
    await page.getByRole('button', { name: 'רענון' }).click();

    // Known, and specifically the real number of files in the fixture.
    await expect(page.getByText(`${backup.files.length} קבצים · `, { exact: false })).toBeVisible();
    expect(fixture.counts.files['backup-2026-06-10']).toBeGreaterThan(0);
});

test('two selections whose file-list responses resolve out of order keep the NEWEST selection', async ({ page }) => {
    const older = fullBackup('backup-older', { timeLastModified: '2026-06-10T10:00:00Z' });
    const newer = fullBackup('backup-newer', { timeLastModified: '2026-06-11T10:00:00Z' });
    const olderFiles = gate();
    const newerFiles = gate();
    const payloads = gate();
    older.filesGate = olderFiles;
    newer.filesGate = newerFiles;
    // Hold every payload so the preview never hydrates (see the file header).
    [...older.files, ...newer.files].forEach((file) => { file.gate = payloads; });
    // `listSharePointBackups({ includeFiles: true }) also reads the file lists,
    // so the initial listing has to get through before the gates close.
    activeFixture = await installBackupRoutes(page, [newer, older]);
    olderFiles.release();
    newerFiles.release();

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('2 פריטים')).toBeVisible();

    // Now make both file listings blocking again for the two selections.
    const secondOlder = gate();
    const secondNewer = gate();
    older.filesGate = secondOlder;
    newer.filesGate = secondNewer;

    const rows = backupRows(page);
    await selectBackupRow(rows.nth(1)); // the older backup
    await selectBackupRow(rows.nth(0)); // then the newer one

    // The newest selection answers first; the abandoned one answers afterwards.
    secondNewer.release();
    await expect(page.getByText(PREVIEW_LABEL)).toBeVisible();
    await expect(previewHeading(page)).toHaveText(/11\.6\.2026/);

    secondOlder.release();
    await page.waitForTimeout(1_000);
    await expect(previewHeading(page), 'a late response must not replace the newer selection')
        .toHaveText(/11\.6\.2026/);
});

test('closing the preview while a payload request is pending must not reopen it', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    const payloads = gate();
    backup.files.forEach((file) => { file.gate = payloads; });
    activeFixture = await installBackupRoutes(page, [backup]);

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('1 פריטים')).toBeVisible();

    await selectBackupRow(backupRows(page).first());
    await expect(page.getByText(PREVIEW_LOADING)).toBeVisible();

    await closePreview(page).click();
    await expect(page.getByText(PREVIEW_LABEL)).toHaveCount(0);

    // The abandoned hydration finally answers.
    payloads.release();
    await page.waitForTimeout(1_500);
    await expect(page.getByText(PREVIEW_LABEL)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'ניהול גיבויים' })).toBeVisible();
});

test('a later user choice is not overwritten by an in-flight payload hydration', async ({ page }) => {
    const older = fullBackup('backup-older', { timeLastModified: '2026-06-10T10:00:00Z' });
    const newer = fullBackup('backup-newer', { timeLastModified: '2026-06-11T10:00:00Z' });
    const olderPayloads = gate();
    const newerPayloads = gate();
    older.files.forEach((file) => { file.gate = olderPayloads; });
    newer.files.forEach((file) => { file.gate = newerPayloads; });
    activeFixture = await installBackupRoutes(page, [newer, older]);

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('2 פריטים')).toBeVisible();

    const rows = backupRows(page);
    await selectBackupRow(rows.nth(1));
    await expect(previewHeading(page)).toHaveText(/10\.6\.2026/);

    // The operator changes their mind while the first hydration is still open.
    await selectBackupRow(rows.nth(0));
    await expect(previewHeading(page)).toHaveText(/11\.6\.2026/);

    olderPayloads.release();
    await page.waitForTimeout(1_500);
    await expect(previewHeading(page), 'the stale hydration must not reclaim the window')
        .toHaveText(/11\.6\.2026/);
});

// UNFINISHED SCAFFOLDING, not a verified result. The flow reaches the restore
// confirmation, but the fixture does not yet drive the orchestration far enough
// for these assertions to mean anything. Marked fixme so the suite reports it as
// outstanding work rather than either a silent pass or permanent red. The
// equivalent behaviour IS covered at unit level in
// src/components/AdminBackupManagement.test.jsx.
test.fixme('known-empty, invalid JSON and JSON null are three distinct states, and none of them reads as the others', async ({ page }) => {
    const backup = fullBackup('backup-2026-06-10');
    backup.files = [
        { name: MASTER_FILE, text: masterConfigText() },
        // Known empty: a valid payload with zero records.
        { name: NAV_FILE, text: '[]' },
        // Not parseable at all.
        { name: EVENTS_FILE, text: '{ this is not json' },
        // Parseable, but null is not a backup payload.
        { name: USERS_FILE, text: 'null' },
    ];
    activeFixture = await installBackupRoutes(page, [backup]);

    await openAdmin(page, '/#/admin/backups');
    await expect(page.getByText('1 פריטים')).toBeVisible();
    await selectBackupRow(backupRows(page).first());
    await expect(page.getByText(PREVIEW_LOADING)).toHaveCount(0, { timeout: 15_000 });

    const emptyRow = page.getByText(NAV_FILE).locator('xpath=..');
    await expect(emptyRow).toContainText('ריק');
    await expect(emptyRow).toContainText('0 רשומות');
    await expect(emptyRow).not.toContainText('מספר רשומות לא ידוע');

    const invalidRow = page.getByText(EVENTS_FILE).locator('xpath=..');
    await expect(invalidRow).toContainText('לא תקין');
    await expect(invalidRow).toContainText('מספר רשומות לא ידוע');
    await expect(invalidRow).not.toContainText('0 רשומות');
    await expect(page.getByRole('checkbox', { name: /גיבוי אירועים/ })).toBeDisabled();

    const nullRow = page.getByText(USERS_FILE).locator('xpath=..');
    await expect(nullRow).toContainText('לא תקין');
    await expect(nullRow).not.toContainText('ריק');
    await expect(page.getByRole('checkbox', { name: /גיבוי מנהלים/ })).toBeDisabled();
});

// UNFINISHED SCAFFOLDING, not a verified result. The flow reaches the restore
// confirmation, but the fixture does not yet drive the orchestration far enough
// for these assertions to mean anything. Marked fixme so the suite reports it as
// outstanding work rather than either a silent pass or permanent red. The
// equivalent behaviour IS covered at unit level in
// src/components/AdminBackupManagement.test.jsx.
test.fixme('a valid downloaded payload overrides stale metadata that says the file is missing or empty', async ({ page }) => {
    activeFixture = await installBackupRoutes(page, []);
    await openAdmin(page, '/#/admin/backups');

    // The import path is the only one in this deployment that carries a
    // package's own meta.restoreEntries, which is where stale metadata lives
    // (src/components/AdminBackupManagement.jsx:1537-1600).
    const staleEntries = [
        { fileName: MASTER_FILE, status: 'hasData', restoreAction: 'will_restore', willRestore: true, recordCount: 1 },
        { fileName: USERS_FILE, status: 'missing', restoreStatus: 'missing', missing: true, willRestore: false, restoreAction: 'skipped', recordCount: 0 },
    ];
    const importedPackage = {
        kind: 'bihs-backup-package',
        version: '1.0.0',
        id: 'imported-one',
        exportedAt: '2026-06-12T10:00:00.000Z',
        source: 'admin-backup-management',
        backup: { id: 'imported-one', name: 'imported-one', timeLastModified: '2026-06-12T10:00:00.000Z' },
        files: [
            { name: MASTER_FILE, text: masterConfigText() },
            // The payload is present and healthy, contradicting the metadata.
            { name: USERS_FILE, text: JSON.stringify([{ id: 'admin-1', name: 'מנהל אחד' }, { id: 'admin-2', name: 'מנהל שני' }]) },
        ],
        meta: { restoreEntries: staleEntries },
    };

    await page.setInputFiles('input[type="file"]', {
        name: 'bihs-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(importedPackage), 'utf8'),
    });

    await expect(page.getByText(PREVIEW_LABEL)).toBeVisible();
    const usersRow = page.getByText(USERS_FILE).locator('xpath=..');
    await expect(usersRow, 'the real payload must win over stale "missing" metadata').toContainText('יש נתונים');
    await expect(usersRow).toContainText('2 רשומות');
    await expect(page.getByRole('checkbox', { name: /גיבוי מנהלים/ })).not.toBeDisabled();
});
