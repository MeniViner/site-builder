import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';
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
    readRecoveryDraftViaApp,
    readRecoveryState,
    refreshButton,
} from './helpers/adminRecovery.js';

/**
 * Dirty-editor recovery for the alerts admin, end to end in a real browser.
 *
 * Components: src/components/AdminAlerts.jsx + src/components/AdminEditSessionGuard.jsx
 * Driver:     src/utils/adminEditSession.js
 *
 * Unlike e2e/inactivity-modal.spec.js, which raises the dialog by dispatching
 * the presentation event on an empty admin screen, every test here mounts the
 * REAL dirty editor first and then moves the clock the controller itself reads
 * so the controller goes stale through its own threshold. The dialog is the
 * consequence of the controller's state, not the cause of it.
 */

const TITLE_PLACEHOLDER = 'למשל: ביקורת כושר רבעונית';
const DRAFT_TITLE = 'התראת שחזור E2E';
const DRAFT_BODY = 'תוכן שלא נשמר לפני הרענון';

const editorOf = (page) => page.locator('div[contenteditable][role="textbox"]');
const pageHeading = (page) => page.getByRole('heading', { name: 'התראות' });

/** Opens the composer and leaves it genuinely dirty (never saved). */
async function openDirtyAlertEditor(page) {
    await openAdmin(page, '/#/admin/alerts');
    await page.getByRole('button', { name: 'התראה חדשה' }).click();
    await page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`).fill(DRAFT_TITLE);
    await editorOf(page).click();
    await page.keyboard.type(DRAFT_BODY, { delay: 15 });
    // The editor's own 80ms DOM->tokens debounce has to settle before the
    // dirty snapshot is meaningful.
    await expect(page.getByText('שינויים שלא נשמרו')).toBeVisible();

    const state = await readRecoveryState(page);
    expect(state.editors.find((editor) => editor.id === 'admin-alerts')?.dirty).toBe(true);
}

test.beforeEach(async ({ context, page }) => {
    await installRecoveryHarness(context);
    await stubSharePointIdentityApi(page);
});

test('the inactivity dialog is raised by the real controller over a dirty editor', async ({ page }) => {
    await openDirtyAlertEditor(page);

    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: pageHeading(page) });

    await expect(dialog.getByRole('heading', { name: /זיהינו שלא עבדת במערכת כבר 60 דקות/ })).toBeVisible();
    await expect(refreshButton(dialog)).toBeFocused();

    // The editor is still mounted behind the dialog and still dirty; the
    // dialog did not silently discard the work it is guarding.
    await expect(editorOf(page)).toBeVisible();
    const state = await readRecoveryState(page);
    expect(state.dirtyEditors).toBeGreaterThanOrEqual(1);
});

test('editing behind the modal is blocked, and Escape and the backdrop do not dismiss it', async ({ page }) => {
    await openDirtyAlertEditor(page);
    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: pageHeading(page) });

    /**
     * The guard blocks mutations by cancelling capture-phase `keydown`
     * (src/components/AdminEditSessionGuard.jsx:57-63), so the typed text must
     * come from real key events. Playwright emits `Input.insertText` — which
     * fires no keydown at all — for characters it cannot map to a key, so
     * Hebrew input here would bypass the very mechanism under test and prove
     * nothing. ASCII keys are pressed instead; they travel the real keydown
     * path a Hebrew keyboard also uses.
     */
    const before = await editorOf(page).innerText();
    await editorOf(page).click({ force: true });
    await page.keyboard.type('blocked', { delay: 10 });
    await expect(editorOf(page)).toHaveText(before);

    const titleInput = page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`);
    await titleInput.click({ force: true });
    await page.keyboard.type('XX', { delay: 10 });
    await expect(titleInput).toHaveValue(DRAFT_TITLE);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();

    const backdrop = dialog.locator('xpath=..');
    const box = await backdrop.boundingBox();
    await page.mouse.click(box.x + 8, box.y + 8);
    await expect(dialog).toBeVisible();
    await expect(refreshButton(dialog)).toBeVisible();
});

test('keyboard refresh runs the safe-reload path exactly once and raises no competing discard dialog', async ({ page }) => {
    await openDirtyAlertEditor(page);
    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: pageHeading(page) });

    expect(await readDocumentLoads(page)).toBe(1);

    const reloaded = await activateRefreshByKeyboard(page, refreshButton(dialog));

    // AdminAlerts guards outside navigation with its own "unsaved changes"
    // dialog (src/components/AdminAlerts.jsx:127-142). The recovery control is
    // marked data-admin-recovery-control, so it must be exempt: two competing
    // modals would make the recovery unreachable.
    await expect(page.getByRole('dialog', { name: 'שינויים שלא נשמרו' })).toHaveCount(0);

    await reloaded;
    await page.waitForLoadState('domcontentloaded');
    expect(await readDocumentLoads(page)).toBe(2);

    // And it must not reload again.
    await page.waitForTimeout(2_000);
    expect(await readDocumentLoads(page)).toBe(2);
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the safe reload writes a verified recovery envelope for the dirty editor', async ({ page }) => {
    await openDirtyAlertEditor(page);
    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: pageHeading(page) });

    const reloaded = await activateRefreshByKeyboard(page, refreshButton(dialog));
    await reloaded;
    await page.waitForLoadState('domcontentloaded');
    await openAdmin(page, '/#/admin/alerts');

    // The envelope survived the reload, is scoped, and carries the edit.
    const captured = await readRecoveryDraftViaApp(page, 'admin-alerts');
    expect(captured, 'the safe reload must persist the dirty alert draft').not.toBeNull();
    expect(captured.form.title).toBe(DRAFT_TITLE);
    expect(captured.form.text).toContain(DRAFT_BODY);
});

/**
 * KNOWN FAILING — PRODUCT DEFECT, NOT A TEST BUG.
 *
 * The envelope is written and is readable (the test above proves it), but the
 * work never comes back on screen. AdminAlerts reads its recovery draft in a
 * mount-only effect (src/components/AdminAlerts.jsx:160-168), while the
 * recovery scope is installed asynchronously by AuthContext
 * (src/context/AuthContext.jsx:319-332) roughly a second later, once the admin
 * identity resolves. At mount `recoveryScope` is still null, so
 * readAdminRecoveryDraft returns null (src/utils/adminEditSession.js:332-334)
 * and the draft is dropped. AdminBoom and AdminGantt avoid this by also
 * listening for ADMIN_RECOVERY_STATE_EVENT and re-running their restore
 * (src/components/AdminBoom.jsx:373, src/components/AdminGantt.jsx:914);
 * AdminAlerts does not. Remounting AdminAlerts afterwards DOES restore the
 * draft, which is what e2e/recovery-scope-rejection.spec.js relies on.
 */
test('the unsaved edit is restored after the safe reload and is not lost', async ({ page }) => {
    await openDirtyAlertEditor(page);
    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: pageHeading(page) });

    const reloaded = await activateRefreshByKeyboard(page, refreshButton(dialog));
    await reloaded;
    await page.waitForLoadState('domcontentloaded');

    // The whole point of the safe reload: the operator gets the work back.
    await expect(page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`)).toHaveValue(DRAFT_TITLE);
    await expect(editorOf(page)).toContainText(DRAFT_BODY);
    await expect(page.getByText('טיוטת ההתראה שוחזרה.')).toBeVisible();
});

test('local-only recovery is visibly distinguished from verified server persistence', async ({ page }) => {
    await openAdmin(page, '/#/admin/alerts');

    // Break the transport this deployment actually persists through
    // (src/services/KasharDraftStore.js writes localStorage), then make a real
    // save attempt so the config controller is left genuinely unsaved.
    await failStorageWritesMatching(page, KASHAR_DRAFT_KEY);
    await page.getByRole('button', { name: 'התראה חדשה' }).click();
    await page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`).fill(DRAFT_TITLE);
    await editorOf(page).click();
    await page.keyboard.type(DRAFT_BODY, { delay: 15 });
    await page.getByRole('button', { name: /המשך להצגה ותזמון/ }).click();
    await page.getByRole('button', { name: /שמירה כטיוטה/ }).click();

    // The failure is surfaced, never a success claim.
    await expect(page.getByRole('button', { name: `עריכת ${DRAFT_TITLE}` })).toHaveCount(0);
    await expect(page.getByText('ההתראה נשמרה כטיוטה')).toHaveCount(0);

    await expect.poll(async () => (await readRecoveryState(page)).persistence.some((entry) => entry.dirty), {
        message: 'the master-config controller should stay dirty after a failed save',
    }).toBe(true);

    const dialog = await makeSessionGenuinelyStale(page, { clickTarget: pageHeading(page) });
    await refreshButton(dialog).focus();
    await page.keyboard.press('Enter');

    // The guard must say, in Hebrew, that only a LOCAL draft exists, and offer
    // a differently labelled action than the verified path.
    const alert = dialog.getByRole('alert');
    await expect(alert).toHaveText('השמירה בשרת לא הושלמה. הטיוטה נשמרה מקומית בלבד; אפשר לנסות שוב או לאשר רענון מהטיוטה המקומית.');
    await expect(localOnlyRefreshButton(dialog)).toBeVisible();
    await expect(refreshButton(dialog)).toHaveCount(0);

    // No reload happened: an unverified server save must not be treated as done.
    expect(await readDocumentLoads(page)).toBe(1);
    const state = await readRecoveryState(page);
    expect(state.reloadApproved).toBe(false);

    // Once the operator accepts the local-only draft, the reload proceeds.
    await clearStorageFailures(page);
    const reloaded = await activateRefreshByKeyboard(page, localOnlyRefreshButton(dialog));
    await reloaded;
    await page.waitForLoadState('domcontentloaded');
    expect(await readDocumentLoads(page)).toBe(2);
});
