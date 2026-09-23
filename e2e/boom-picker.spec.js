import { expect, test } from '@playwright/test';
import { NOA, RONI, gate, stubSharePointIdentityApi } from './helpers/sharepointStubs.js';

/**
 * Real-browser acceptance for the BOOM assignee picker.
 *
 * Component: src/components/BoomAssigneePicker.jsx
 * Host:      src/components/AdminBoom.jsx (task create/edit dialog)
 *
 * The identity lookups are routed at the network layer
 * (see e2e/helpers/sharepointStubs.js) so the resolver, its normalisation and
 * its Hebrew error mapping all run for real.
 */

const PICKER_TRIGGER = 'בחירת אחראי משימה';
const PICKER_TITLE = 'בחירת אחראי משימה';
const QUERY_INPUT = 'חיפוש אחראי משימה';
const SEARCH_BUTTON = 'חיפוש';
const CLOSE_BUTTON = 'סגירת בחירת אחראי';

const pickerDialog = (page) => page.getByRole('dialog', { name: PICKER_TITLE });
const queryInput = (page) => pickerDialog(page).getByRole('textbox', { name: QUERY_INPUT });
const searchButton = (page) => pickerDialog(page).getByRole('button', { name: SEARCH_BUTTON });
const ownerField = (page) => page.getByRole('textbox', { name: 'אחראי משימה', exact: true });

async function openNewTaskDialog(page) {
    await page.goto('/#/admin/boom');
    await page.getByRole('tab', { name: 'ניהול משימות' }).click();
    await page.getByRole('button', { name: 'משימה חדשה' }).click();
    await expect(page.getByLabel('שם המשימה')).toBeVisible();
}

async function openPicker(page) {
    await page.getByRole('button', { name: PICKER_TRIGGER }).click();
    await expect(pickerDialog(page)).toBeVisible();
}

test('resolves an exact identity, closes, and the SAME picker is fully usable when reopened', async ({ page }) => {
    await stubSharePointIdentityApi(page, { ensureUser: () => RONI });
    await openNewTaskDialog(page);

    await openPicker(page);
    await queryInput(page).fill('1234567');
    await searchButton(page).click();

    // Selection succeeds and the picker closes.
    await expect(pickerDialog(page)).toHaveCount(0);
    await expect(ownerField(page)).toHaveValue('רוני');

    // The known regression: reopening the same picker in the same task dialog.
    await openPicker(page);
    await expect(queryInput(page)).toBeEnabled();
    await expect(queryInput(page)).toHaveValue('');
    await expect(searchButton(page)).toBeEnabled();

    // ...and it is genuinely usable again, not merely enabled.
    await queryInput(page).fill('7654321');
    await searchButton(page).click();
    await expect(pickerDialog(page)).toHaveCount(0);
    await expect(ownerField(page)).toHaveValue('רוני');
});

test('cancelling a pending lookup leaves the picker reopenable and empty', async ({ page }) => {
    const pending = gate();
    await stubSharePointIdentityApi(page, {
        ensureUser: async () => {
            await pending.promise;
            return RONI;
        },
    });
    await openNewTaskDialog(page);

    await openPicker(page);
    await queryInput(page).fill('1234567');
    await searchButton(page).click();

    // While the lookup is in flight the controls are busy.
    await expect(queryInput(page)).toBeDisabled();
    await expect(searchButton(page)).toBeDisabled();

    // Cancel mid-flight.
    await pickerDialog(page).getByRole('button', { name: CLOSE_BUTTON }).click();
    await expect(pickerDialog(page)).toHaveCount(0);

    await openPicker(page);
    await expect(queryInput(page)).toBeEnabled();
    await expect(queryInput(page)).toHaveValue('');
    await expect(searchButton(page)).toBeEnabled();

    // The abandoned lookup must not select anybody once it finally answers.
    pending.release();
    await page.waitForTimeout(500);
    await expect(ownerField(page)).toHaveValue('');
    await expect(queryInput(page)).toBeEnabled();
});

test('a late response for an abandoned query never overwrites the newer picker state', async ({ page }) => {
    const stale = gate();
    let call = 0;
    await stubSharePointIdentityApi(page, {
        ensureUser: async () => {
            call += 1;
            if (call === 1) {
                await stale.promise;
                return RONI;
            }
            return NOA;
        },
    });
    await openNewTaskDialog(page);

    await openPicker(page);
    await queryInput(page).fill('1234567');
    await searchButton(page).click();
    await expect(queryInput(page)).toBeDisabled();

    // The operator abandons that query and starts a new one.
    await pickerDialog(page).getByRole('button', { name: CLOSE_BUTTON }).click();
    await openPicker(page);
    await queryInput(page).fill('noa@army.idf.il');

    // The stale lookup answers only now.
    stale.release();
    await page.waitForTimeout(500);

    await expect(pickerDialog(page)).toBeVisible();
    await expect(queryInput(page)).toHaveValue('noa@army.idf.il');
    await expect(queryInput(page)).toBeEnabled();
    await expect(ownerField(page)).toHaveValue('');

    // The newer query still resolves normally.
    await searchButton(page).click();
    await expect(pickerDialog(page)).toHaveCount(0);
    await expect(ownerField(page)).toHaveValue('נועה');
});

test('a failed lookup surfaces a Hebrew error and stays retryable', async ({ page }) => {
    let shouldFail = true;
    await stubSharePointIdentityApi(page, {
        ensureUser: () => (shouldFail ? null : RONI),
    });
    await openNewTaskDialog(page);

    await openPicker(page);
    await queryInput(page).fill('1234567');
    await searchButton(page).click();

    const error = pickerDialog(page).locator('p.text-red-600');
    await expect(error).toBeVisible();
    await expect(error).not.toBeEmpty();

    await expect(queryInput(page)).toBeEnabled();
    await expect(searchButton(page)).toBeEnabled();
    await expect(ownerField(page)).toHaveValue('');

    // Retry in place, without reopening the picker.
    shouldFail = false;
    await queryInput(page).fill('1234567');
    await searchButton(page).click();
    await expect(pickerDialog(page)).toHaveCount(0);
    await expect(ownerField(page)).toHaveValue('רוני');
});

test('a name search resolves the picked candidate and the picker reopens usable', async ({ page }) => {
    await stubSharePointIdentityApi(page, {
        searchUsers: () => [NOA],
        ensureUser: () => NOA,
    });
    await openNewTaskDialog(page);

    await openPicker(page);
    await queryInput(page).fill('נועה');
    await searchButton(page).click();

    await pickerDialog(page).getByRole('button', { name: /נועה/ }).click();
    await expect(pickerDialog(page)).toHaveCount(0);
    await expect(ownerField(page)).toHaveValue('נועה');

    await openPicker(page);
    await expect(queryInput(page)).toBeEnabled();
    await expect(searchButton(page)).toBeEnabled();
});
