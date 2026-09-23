import { expect, test } from '@playwright/test';
import { RONI, stubSharePointIdentityApi } from './helpers/sharepointStubs.js';
import {
    KASHAR_DRAFT_KEY,
    activateRefreshByKeyboard,
    clearStorageFailures,
    failStorageWritesMatching,
    installRecoveryHarness,
    localOnlyRefreshButton,
    makeSessionGenuinelyStale,
    openAdmin,
    readDocumentLoads,
    readPersistedAlerts,
    readRecoveryDraftViaApp,
    readRecoveryState,
    refreshButton,
    waitForRecoveryScope,
} from './helpers/adminRecovery.js';

/**
 * BOOM carries two things across a stale reload: the unsaved task draft itself,
 * and the assignment notification that the draft has queued but not yet
 * published (src/components/AdminBoom.jsx:304-340, 341-375).
 *
 * The dangerous failure is a DUPLICATE publication: the notification is
 * published during the safe reload AND again from the restored envelope, so the
 * assignee is notified twice for one assignment. Every assertion below counts
 * the published notifications in the store the app really writes.
 */

const TASK_TITLE = 'משימת שחזור E2E';
const TASK_CATEGORY = 'בדיקות';
const ASSIGNMENT_TITLE = 'משימת BOOM חדשה';

const boomHeading = (page) => page.getByRole('heading', { name: 'ניהול בום' });

/** Every published BOOM assignment notification, from the app's own store. */
async function readAssignmentNotifications(page) {
    const alerts = await readPersistedAlerts(page);
    return alerts.filter((item) => item?.source === 'boom-assignment');
}

async function createAssignedTask(page, { ensureUserCalls }) {
    await openAdmin(page, '/#/admin/boom');
    await page.getByRole('tab', { name: 'ניהול משימות' }).click();
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    await expect(page.getByLabel('שם המשימה')).toBeVisible();

    await page.getByLabel('שם המשימה').fill(TASK_TITLE);
    await page.getByLabel('תחום / קטגוריה').fill(TASK_CATEGORY);

    await page.getByRole('button', { name: 'בחירת אחראי משימה' }).click();
    const picker = page.getByRole('dialog', { name: 'בחירת אחראי משימה' });
    await picker.getByRole('textbox', { name: 'חיפוש אחראי משימה' }).fill('1234567');
    await picker.getByRole('button', { name: 'חיפוש' }).click();
    await expect(picker).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'אחראי משימה', exact: true })).toHaveValue(RONI.Title);
    expect(ensureUserCalls.count, 'the identity really was resolved over the network').toBeGreaterThan(0);

    await page.getByRole('button', { name: 'הוספת משימה' }).click();
    await expect(page.getByText('המשימה נוספה')).toBeVisible();
    await expect(page.getByText(TASK_TITLE).first()).toBeVisible();
}

test.beforeEach(async ({ context }) => {
    await installRecoveryHarness(context);
});

test('a dirty BOOM draft plus its pending notification survive the stale reload and publish exactly once', async ({ page }) => {
    const ensureUserCalls = { count: 0 };
    await stubSharePointIdentityApi(page, {
        ensureUser: () => RONI,
        onEnsureUser: () => { ensureUserCalls.count += 1; },
    });

    // Break the store BEFORE the task is created, so the autosave that follows
    // genuinely fails and leaves the draft dirty with the notification queued.
    await openAdmin(page, '/#/admin/boom');
    await failStorageWritesMatching(page, KASHAR_DRAFT_KEY);
    await createAssignedTask(page, { ensureUserCalls });

    await expect(page.getByText('שגיאה בשמירה')).toBeVisible();
    expect(await readAssignmentNotifications(page)).toHaveLength(0);

    await expect.poll(async () => {
        const state = await readRecoveryState(page);
        return state.persistence.some((entry) => entry.dirty === true);
    }, { message: 'the boom-workflow controller must report the unsaved draft' }).toBe(true);

    // Go stale for real and take the safe reload. The drain cannot succeed
    // while the store is broken, so the guard must offer the local-only path
    // instead of pretending the work was persisted.
    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: boomHeading(page) });
    await refreshButton(dialog).focus();
    await page.keyboard.press('Enter');
    await expect(localOnlyRefreshButton(dialog)).toBeVisible();
    expect(await readDocumentLoads(page)).toBe(1);

    // The envelope carries both the draft and the queued notification.
    const captured = await readRecoveryDraftViaApp(page, 'persistence:boom-workflow');
    expect(captured).not.toBeNull();
    expect(JSON.stringify(captured.draft)).toContain(TASK_TITLE);
    expect(captured.pendingAssignmentNotifications).toHaveLength(1);
    expect(captured.pendingAssignmentNotifications[0].title).toBe(ASSIGNMENT_TITLE);
    const eventKey = captured.pendingAssignmentNotifications[0].eventKey;

    const reloaded = await activateRefreshByKeyboard(page, localOnlyRefreshButton(dialog));
    await reloaded;
    await page.waitForLoadState('domcontentloaded');
    expect(await readDocumentLoads(page)).toBe(2);

    // The store works again (the init script reinstalls a clean wrapper on
    // every document), so the restored draft must now save and publish.
    await clearStorageFailures(page);
    await waitForRecoveryScope(page);
    await page.getByRole('tab', { name: 'ניהול משימות' }).click();
    await expect(page.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 20_000 });

    await expect.poll(async () => (await readAssignmentNotifications(page)).length, {
        message: 'the queued assignment notification must be published after recovery',
        timeout: 20_000,
    }).toBe(1);

    const published = await readAssignmentNotifications(page);
    expect(published[0].eventKey).toBe(eventKey);

    // And it stays exactly one: no late duplicate from a second autosave.
    await page.waitForTimeout(3_000);
    expect(await readAssignmentNotifications(page)).toHaveLength(1);
});

test('a notification published during the safe reload is not published again from the restored envelope', async ({ page }) => {
    const ensureUserCalls = { count: 0 };
    await stubSharePointIdentityApi(page, {
        ensureUser: () => RONI,
        onEnsureUser: () => { ensureUserCalls.count += 1; },
    });

    await createAssignedTask(page, { ensureUserCalls });
    await expect.poll(async () => (await readAssignmentNotifications(page)).length, {
        message: 'the assignment notification should publish on the normal autosave path',
        timeout: 20_000,
    }).toBe(1);
    const [firstPublication] = await readAssignmentNotifications(page);

    // Now dirty the draft again and take the stale reload.
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    await page.getByLabel('שם המשימה').fill('משימה שנייה ללא אחראי');
    await page.getByLabel('תחום / קטגוריה').fill(TASK_CATEGORY);
    await page.getByRole('button', { name: 'הוספת משימה' }).click();

    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: boomHeading(page) });
    const reloaded = await activateRefreshByKeyboard(page, refreshButton(dialog));
    await reloaded;
    await page.waitForLoadState('domcontentloaded');

    await waitForRecoveryScope(page);
    await page.getByRole('tab', { name: 'ניהול משימות' }).click();
    await expect(page.getByText(TASK_TITLE).first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(3_000);

    const published = await readAssignmentNotifications(page);
    expect(published, 'recovery must not republish an already published assignment').toHaveLength(1);
    expect(published[0].eventKey).toBe(firstPublication.eventKey);
});
