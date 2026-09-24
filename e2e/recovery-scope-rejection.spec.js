import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';
import {
    installRecoveryHarness,
    openAdmin,
    readDocumentLoads,
    readRecoveryConstants,
    readRecoveryScope,
} from './helpers/adminRecovery.js';

/**
 * A recovery envelope is scoped by backend + site/data target + user + schema
 * version (src/utils/adminEditSession.js:60-90, 330-343). This spec proves, in
 * a real browser and through the real editor, that an envelope which does not
 * match the live scope is REJECTED rather than replayed into the wrong context
 * — a replay would leak one operator's unsaved text into another operator's
 * session, or one site's draft into a different site.
 *
 * Every case is driven the same way: the envelope is planted in sessionStorage
 * exactly as the app writes it, then the alerts admin is mounted through an
 * in-app route change so AdminAlerts runs its own recovery read.
 */

const TITLE_PLACEHOLDER = 'למשל: ביקורת כושר רבעונית';
const FOREIGN_TITLE = 'טיוטה של מישהו אחר';
const FOREIGN_BODY = 'תוכן שאסור לדלוף לסשן הזה';
const RESTORED_TOAST = 'טיוטת ההתראה שוחזרה.';

const editorOf = (page) => page.locator('div[contenteditable][role="textbox"]');
const titleInput = (page) => page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`);

function buildEnvelope({ scope, version }) {
    return {
        version,
        capturedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
        scope,
        participants: {
            'admin-alerts': {
                activeTab: 'content',
                editingId: 'new',
                baseline: '',
                form: {
                    id: 'planted-draft',
                    title: FOREIGN_TITLE,
                    text: FOREIGN_BODY,
                    richContent: [{ type: 'text', text: FOREIGN_BODY, marks: [] }],
                    status: 'draft',
                    displayMode: 'popup',
                    audience: { type: 'all', identities: [] },
                },
            },
        },
    };
}

const plant = (page, key, envelope) => page.evaluate(
    ([storageKey, value]) => sessionStorage.setItem(storageKey, JSON.stringify(value)),
    [key, envelope],
);

const readRaw = (page, key) => page.evaluate((storageKey) => sessionStorage.getItem(storageKey), key);

/**
 * Mounts AdminAlerts, so its recovery read runs against the live scope.
 *
 * This is an in-app hash route change, NOT a document load: the counter below
 * proves the page was not reloaded, so the mount is the same remount a operator
 * gets from the sidebar. The sidebar button itself is not used because the admin
 * hub relabels it when the sidebar collapses, which makes it an unreliable
 * handle rather than an interesting assertion.
 */
async function openAlerts(page) {
    const loadsBefore = await readDocumentLoads(page);
    await page.goto('/#/admin/alerts');
    // The tab strip is present in every tab of the alerts admin; "התראה חדשה"
    // is not, because a restored draft lands straight in the content tab.
    await expect(page.getByRole('tablist', { name: 'מקטעי מסך ההתראות' })).toBeVisible();
    expect(await readDocumentLoads(page), 'this must be a remount, not a reload').toBe(loadsBefore);
}

/** Nothing from the planted envelope reached the editor. */
async function expectNotReplayed(page) {
    await expect(page.getByRole('tab', { name: 'התראות שמורות' })).toHaveAttribute('aria-selected', 'true');
    await expect(titleInput(page)).toHaveCount(0);
    await expect(editorOf(page)).toHaveCount(0);
    await expect(page.getByText(FOREIGN_BODY)).toHaveCount(0);
    await expect(page.getByText(RESTORED_TOAST)).toHaveCount(0);
}

test.beforeEach(async ({ context, page }) => {
    await installRecoveryHarness(context);
    await stubSharePointIdentityApi(page);
    await openAdmin(page, '/#/admin');
});

test('a matching envelope IS replayed (the control for every rejection below)', async ({ page }) => {
    const { key, scope } = await readRecoveryScope(page);
    const { schemaVersion } = await readRecoveryConstants(page);
    await plant(page, key, buildEnvelope({ scope, version: schemaVersion }));

    await openAlerts(page);

    await expect(titleInput(page)).toHaveValue(FOREIGN_TITLE);
    await expect(editorOf(page)).toContainText(FOREIGN_BODY);
    await expect(page.getByText(RESTORED_TOAST)).toBeVisible();
    // A consumed envelope is cleared, so it cannot be replayed a second time.
    await expect.poll(() => readRaw(page, key)).toBeNull();
});

test('an envelope captured by a DIFFERENT user is rejected', async ({ page }) => {
    const { key, scope } = await readRecoveryScope(page);
    const { schemaVersion } = await readRecoveryConstants(page);
    await plant(page, key, buildEnvelope({
        scope: { ...scope, user: 'i:0#.f|membership|someone.else@army.idf.il' },
        version: schemaVersion,
    }));

    await openAlerts(page);

    await expectNotReplayed(page);
    // Rejected, not silently destroyed: it still belongs to its real owner.
    expect(await readRaw(page, key)).not.toBeNull();
});

test('an envelope captured against a DIFFERENT site/data target is rejected', async ({ page }) => {
    const { key, scope } = await readRecoveryScope(page);
    const { schemaVersion } = await readRecoveryConstants(page);
    await plant(page, key, buildEnvelope({
        scope: { ...scope, target: 'other-site|/sites/other-site' },
        version: schemaVersion,
    }));

    await openAlerts(page);

    await expectNotReplayed(page);
    expect(await readRaw(page, key)).not.toBeNull();
});

test('an envelope written against a DIFFERENT storage backend is rejected', async ({ page }) => {
    const { key, scope } = await readRecoveryScope(page);
    const { schemaVersion } = await readRecoveryConstants(page);
    await plant(page, key, buildEnvelope({
        scope: { ...scope, backend: 'mongo' },
        version: schemaVersion,
    }));

    await openAlerts(page);

    await expectNotReplayed(page);
    expect(await readRaw(page, key)).not.toBeNull();
});

test('an envelope with an OLDER schema version is rejected', async ({ page }) => {
    const { key, scope } = await readRecoveryScope(page);
    const { schemaVersion } = await readRecoveryConstants(page);
    expect(schemaVersion).toBeGreaterThan(1);
    await plant(page, key, buildEnvelope({ scope, version: schemaVersion - 1 }));

    await openAlerts(page);

    await expectNotReplayed(page);
    expect(await readRaw(page, key)).not.toBeNull();
});

test('an UNSCOPED legacy v1 envelope is never replayed', async ({ page }) => {
    const { scope } = await readRecoveryScope(page);
    const { legacyKey, schemaVersion } = await readRecoveryConstants(page);
    expect(legacyKey).toBe('siteBuilder.adminRecoveryDraft.v1');

    // The legacy key carries no scope at all, in both shapes it ever had: the
    // current envelope shape and the bare participant map that predated it.
    await plant(page, legacyKey, buildEnvelope({ scope, version: schemaVersion }));
    await page.evaluate((key) => sessionStorage.setItem(`${key}:bare`, JSON.stringify({
        'admin-alerts': { activeTab: 'content', editingId: 'new', form: { title: 'legacy' } },
    })), legacyKey);

    await openAlerts(page);

    await expectNotReplayed(page);
});

test('a scoped envelope belonging to another user is not read across scopes', async ({ page }) => {
    const { key, scope } = await readRecoveryScope(page);
    const { prefix, schemaVersion } = await readRecoveryConstants(page);
    const foreignKey = `${prefix}:${encodeURIComponent(scope.backend)}:${encodeURIComponent(scope.target)}:${encodeURIComponent('someone.else@army.idf.il')}`;
    expect(foreignKey).not.toBe(key);
    await plant(page, foreignKey, buildEnvelope({
        scope: { ...scope, user: 'someone.else@army.idf.il' },
        version: schemaVersion,
    }));

    await openAlerts(page);

    await expectNotReplayed(page);
    expect(await readRaw(page, foreignKey)).not.toBeNull();
});
