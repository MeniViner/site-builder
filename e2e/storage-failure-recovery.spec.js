import { expect, test } from '@playwright/test';
import { stubSharePointIdentityApi } from './helpers/sharepointStubs.js';
import {
    KASHAR_DRAFT_KEY,
    failStorageWritesMatching,
    installRecoveryHarness,
    openAdmin,
    readRecoveryState,
    storageFailureCalls,
} from './helpers/adminRecovery.js';

/**
 * What the admin console does when persistence FAILS while an editor is dirty.
 *
 * Two independent failures are exercised against the running app:
 *   1. the storage transport this boot actually persists through
 *      (src/services/KasharDraftStore.js -> localStorage) starts throwing, as a
 *      full quota would;
 *   2. a genuinely network-backed write (the manual SharePoint backup) is
 *      routed to HTTP 500.
 *
 * In both cases the contract is the same: no success is claimed, the work stays
 * dirty and recoverable, and the operator is told in Hebrew — never with a raw
 * English or server-generated string.
 */

const TITLE_PLACEHOLDER = 'למשל: ביקורת כושר רבעונית';
const DRAFT_TITLE = 'התראה שנכשלה בשמירה';
const DRAFT_BODY = 'הטקסט חייב להישאר על המסך';

const editorOf = (page) => page.locator('div[contenteditable][role="textbox"]');
const toastArea = (page) => page.locator('.Toastify');

/**
 * Latin runs long enough to be a leaked English sentence or server string.
 * Product and protocol nouns the Hebrew copy legitimately embeds are removed
 * first, so "נתיב היעד ב-SharePoint..." passes while
 * "Kashar demo changes could not be saved." does not.
 */
const ALLOWED_LATIN_TOKENS = /\b(SharePoint|MongoDB|Mongo|Kashar|BOOM|JSON|HTTPS?|URL|API|siteBuilder|Excel|Word|PDF|Site|Builder)\b/gi;
const LATIN_RUN = /[A-Za-z]{4,}/;
const withoutBrandTokens = (text) => String(text).replace(ALLOWED_LATIN_TOKENS, ' ');

async function composeAlert(page) {
    await openAdmin(page, '/#/admin/alerts');
    await page.getByRole('button', { name: 'התראה חדשה' }).click();
    await page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`).fill(DRAFT_TITLE);
    await editorOf(page).click();
    await page.keyboard.type(DRAFT_BODY, { delay: 15 });
    await expect(page.getByText('שינויים שלא נשמרו')).toBeVisible();
}

test.beforeEach(async ({ context, page }) => {
    await installRecoveryHarness(context);
    await stubSharePointIdentityApi(page);
});

test('a failing storage transport never lets the app claim the alert was saved', async ({ page }) => {
    await composeAlert(page);
    await failStorageWritesMatching(page, KASHAR_DRAFT_KEY);

    await page.getByRole('button', { name: /המשך להצגה ותזמון/ }).click();
    await page.getByRole('button', { name: /שמירה כטיוטה/ }).click();

    // The write really was attempted and really did fail.
    await expect.poll(() => storageFailureCalls(page)).toBeGreaterThan(0);

    // No success claim, in any of the three places the app would make one.
    await expect(page.getByText('ההתראה נשמרה כטיוטה')).toHaveCount(0);
    await expect(page.getByRole('button', { name: `עריכת ${DRAFT_TITLE}` })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'הצגה ותזמון' })).toHaveAttribute('aria-selected', 'true');

    // The work is still marked unsaved, and going back to the content tab
    // shows it is all still there.
    await expect(page.getByText('שינויים שלא נשמרו')).toBeVisible();
    await page.getByRole('tab', { name: 'תוכן ההתראה' }).click();
    await expect(page.locator(`input[placeholder="${TITLE_PLACEHOLDER}"]`)).toHaveValue(DRAFT_TITLE);
    await expect(editorOf(page)).toContainText(DRAFT_BODY);
});

test('a failed save leaves the editor and the config controller genuinely dirty for recovery', async ({ page }) => {
    await composeAlert(page);
    await failStorageWritesMatching(page, KASHAR_DRAFT_KEY);
    await page.getByRole('button', { name: /המשך להצגה ותזמון/ }).click();
    await page.getByRole('button', { name: /שמירה כטיוטה/ }).click();
    await expect.poll(() => storageFailureCalls(page)).toBeGreaterThan(0);

    await expect.poll(async () => {
        const state = await readRecoveryState(page);
        return state.persistence.some((entry) => entry.dirty === true);
    }, { message: 'the master-config controller must stay dirty after a failed save' }).toBe(true);

    // A dirty admin session must still warn before the tab is abandoned.
    const warns = await page.evaluate(
        async () => (await import('/src/utils/adminEditSession.js')).shouldWarnBeforeAdminUnload(),
    );
    expect(warns).toBe(true);
});

/**
 * KNOWN FAILING — PRODUCT DEFECT, NOT A TEST BUG.
 *
 * AdminAlerts.commitEdit passes the raw error message straight to the toast
 * (`toast.error(saveError?.message || 'שמירת ההתראה נכשלה.')`,
 * src/components/AdminAlerts.jsx:306), so the store's English text
 * "Kashar demo changes could not be saved. Your previous draft is unchanged."
 * (src/services/KasharDraftStore.js:506) is shown verbatim in a Hebrew RTL
 * console. Every other admin screen routes the same failure through
 * `toSafeHebrewError` (src/utils/userFacingError.js), which is why AdminBoom
 * and AdminBackupManagement pass the equivalent assertions.
 */
test('the storage failure is reported to the operator in Hebrew, not as a raw store string', async ({ page }) => {
    await composeAlert(page);
    await failStorageWritesMatching(page, KASHAR_DRAFT_KEY);
    await page.getByRole('button', { name: /המשך להצגה ותזמון/ }).click();
    await page.getByRole('button', { name: /שמירה כטיוטה/ }).click();

    await expect(toastArea(page)).not.toBeEmpty();
    const message = (await toastArea(page).innerText()).trim();

    expect(message, 'the operator must be told something').not.toBe('');
    expect(
        withoutBrandTokens(message),
        'a Hebrew RTL console must not surface an English store message',
    ).not.toMatch(LATIN_RUN);
    expect(message).toMatch(/[֐-׿]/);
});

test('a routed HTTP 500 on a network-backed save is reported in Hebrew and claims no success', async ({ page }) => {
    // Registered after the identity stub, so it wins for everything except the
    // identity calls the stub still has to answer.
    await page.route('**/_api/**', async (route) => {
        const url = route.request().url();
        if (url.includes('/_api/contextinfo') || url.includes('/_api/web/currentuser')) {
            return route.fallback();
        }
        return route.fulfill({
            status: 500,
            contentType: 'text/plain',
            body: 'Internal Server Error: SPFileCollectionAddFailed at /sites/schedule/siteDB',
        });
    });

    await openAdmin(page, '/#/admin/backups');
    await page.getByRole('button', { name: 'גיבוי מערכת ידני' }).click();

    // The real confirmation toast, not a stubbed window.confirm.
    await page.getByRole('button', { name: 'צור גיבוי' }).click();

    await expect(page.getByText('גיבוי הושלם')).toHaveCount(0);
    await expect.poll(async () => (await toastArea(page).innerText()).trim(), {
        message: 'a failure message should appear',
        timeout: 20_000,
    }).not.toBe('');

    const message = (await toastArea(page).innerText()).trim();
    expect(message, 'the raw server body must never reach the operator').not.toContain('SPFileCollectionAddFailed');
    expect(
        withoutBrandTokens(message),
        'a Hebrew RTL console must not surface an English server string',
    ).not.toMatch(LATIN_RUN);
    expect(message).toMatch(/[֐-׿]/);

    // And nothing was added to the listing.
    await expect(page.getByText('לא נמצאו גיבויים.')).toBeVisible();
});
