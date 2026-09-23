import { expect } from '@playwright/test';

/**
 * Shared machinery for the dirty-state / recovery acceptance specs.
 *
 * Everything here drives the REAL controller in src/utils/adminEditSession.js.
 * Nothing simulates the recovery contract: the session is made stale by moving
 * the clock the controller itself reads, the safe reload is observed as a real
 * document load, and the recovery envelope is read from the same sessionStorage
 * key the app writes.
 */

/** The module specifier Vite serves for the recovery controller in dev mode. */
const RECOVERY_MODULE = '/src/utils/adminEditSession.js';

export const DOC_LOAD_KEY = '__e2eDocumentLoads';
export const KASHAR_DRAFT_KEY = 'site-builder:demo:kashar:draft:v1';

/**
 * `Date.now` is the only clock `markStaleIfExpired`
 * (src/utils/adminEditSession.js) consults, so shifting it forward makes the
 * session genuinely stale through the real 60-minute threshold instead of
 * faking the presentation event. VITE_ADMIN_STALE_EDIT_THRESHOLD_MS is
 * deliberately left alone: lowering it would change the dialog copy that
 * e2e/inactivity-modal.spec.js pins.
 *
 * The same init script counts real document loads. `window.location.reload` is
 * an [[Unforgeable]] own property in Chromium and cannot be stubbed, so the
 * reload is observed rather than intercepted (see the note in
 * e2e/inactivity-modal.spec.js).
 */
export async function installRecoveryHarness(context, { docLoadKey = DOC_LOAD_KEY } = {}) {
    await context.addInitScript((key) => {
        const realNow = Date.now.bind(Date);
        let offset = 0;
        window.__e2eAdvanceClock = (ms) => { offset += Number(ms) || 0; return offset; };
        window.__e2eClockOffset = () => offset;
        Date.now = () => realNow() + offset;

        // Storage failure injection. The kashar demo boot persists every admin
        // branch through localStorage (src/services/KasharDraftStore.js), so a
        // throwing setItem IS this deployment's storage failure, not a mock.
        const nativeSetItem = Storage.prototype.setItem;
        window.__e2eStorageFailure = { pattern: null, calls: 0 };
        Storage.prototype.setItem = function setItem(storageKey, value) {
            const failure = window.__e2eStorageFailure;
            if (failure?.pattern && String(storageKey).includes(failure.pattern)) {
                failure.calls += 1;
                const error = new Error('QuotaExceededError: persistent storage is full');
                error.name = 'QuotaExceededError';
                throw error;
            }
            return nativeSetItem.call(this, storageKey, value);
        };

        try {
            sessionStorage.setItem(key, String(Number(sessionStorage.getItem(key) || '0') + 1));
        } catch {
            // A private-mode style failure is irrelevant to this harness.
        }
    }, docLoadKey);
}

export const readDocumentLoads = (page, key = DOC_LOAD_KEY) => page.evaluate(
    (storageKey) => Number(sessionStorage.getItem(storageKey) || '0'),
    key,
);

export const advanceClock = (page, ms) => page.evaluate((amount) => window.__e2eAdvanceClock(amount), ms);

export const failStorageWritesMatching = (page, pattern) => page.evaluate((value) => {
    window.__e2eStorageFailure.pattern = value;
    window.__e2eStorageFailure.calls = 0;
}, pattern);

export const clearStorageFailures = (page) => page.evaluate(() => {
    window.__e2eStorageFailure.pattern = null;
});

export const storageFailureCalls = (page) => page.evaluate(() => window.__e2eStorageFailure.calls);

/** The live state the controller reports, read from the app's own module. */
export const readRecoveryState = (page) => page.evaluate(
    async (specifier) => (await import(specifier)).getAdminRecoveryState(),
    RECOVERY_MODULE,
);

export const readRecoveryStorageKey = (page) => page.evaluate(
    async (specifier) => (await import(specifier)).getAdminRecoveryStorageKey(),
    RECOVERY_MODULE,
);

export const readRecoveryConstants = (page) => page.evaluate(
    async (specifier) => {
        const mod = await import(specifier);
        return {
            prefix: mod.ADMIN_RECOVERY_DRAFT_STORAGE_PREFIX,
            legacyKey: mod.ADMIN_RECOVERY_DRAFT_STORAGE_KEY,
            schemaVersion: mod.ADMIN_RECOVERY_SCHEMA_VERSION,
            thresholdMs: mod.ADMIN_STALE_THRESHOLD_MS,
            drainTimeoutMs: mod.ADMIN_RECOVERY_DRAIN_TIMEOUT_MS,
            staleEvent: mod.STALE_ADMIN_EDIT_EVENT,
        };
    },
    RECOVERY_MODULE,
);

/**
 * The live scope, recovered from the storage key the app computed.
 * `scopeStorageKey` (src/utils/adminEditSession.js:76-79) percent-encodes each
 * part, so no raw ':' can appear inside one and a plain split is exact.
 */
export async function readRecoveryScope(page) {
    const key = await readRecoveryStorageKey(page);
    if (!key) return null;
    const [, backend, target, user] = key.split(':');
    return {
        key,
        scope: {
            backend: decodeURIComponent(backend),
            target: decodeURIComponent(target),
            user: decodeURIComponent(user),
        },
    };
}

/** Reads the recovery participant draft through the app's own accessor. */
export const readRecoveryDraftViaApp = (page, participantId) => page.evaluate(
    async ([specifier, id]) => (await import(specifier)).readAdminRecoveryDraft(id),
    [RECOVERY_MODULE, participantId],
);

/** Every recovery envelope currently in sessionStorage, raw. */
export const readRecoveryEnvelopes = (page) => page.evaluate(() => {
    const out = {};
    for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('siteBuilder.adminRecoveryDraft')) out[key] = sessionStorage.getItem(key);
    }
    return out;
});

export const writeRecoveryEnvelope = (page, key, envelope) => page.evaluate(
    ([storageKey, value]) => sessionStorage.setItem(storageKey, JSON.stringify(value)),
    [key, envelope],
);

export const removeRecoveryEnvelopes = (page) => page.evaluate(() => {
    Object.keys(sessionStorage)
        .filter((key) => key.startsWith('siteBuilder.adminRecoveryDraft'))
        .forEach((key) => sessionStorage.removeItem(key));
});

/**
 * Opens an admin screen and waits until the recovery scope really exists.
 *
 * The scope is installed asynchronously by AuthContext (src/context/AuthContext.jsx:327)
 * once the admin identity resolves; before that every recovery read and write
 * is a no-op. Tests that care about a written envelope must wait for it.
 */
export async function openAdmin(page, route) {
    await page.goto(route);
    await waitForRecoveryScope(page);
}

/**
 * Waits until the scope exists WITHOUT navigating. After a safe reload the
 * page is already on the right route, and re-issuing the identical URL through
 * `page.goto` would be a second document load — which would both corrupt the
 * "reloaded exactly once" counter and discard the state under test.
 */
export async function waitForRecoveryScope(page) {
    await expect(page.getByRole('button', { name: 'חזרה לאתר' })).toBeVisible();
    await expect.poll(() => readRecoveryStorageKey(page), {
        message: 'the admin recovery scope was never installed',
        timeout: 15_000,
    }).not.toBeNull();
}

/**
 * Drives the session into REAL stale state.
 *
 * The clock is moved past the controller's own threshold and then a genuine
 * user interaction is performed. `recordAdminActivity` re-checks staleness
 * BEFORE it refreshes `lastActivityAt` (src/utils/adminEditSession.js:236-241),
 * so the interaction flips the controller, which emits the real
 * `site-builder:stale-admin-edit` event; the guard's dialog is a consequence,
 * not the trigger.
 */
export async function makeSessionGenuinelyStale(page, { thresholdMs = 60 * 60 * 1000, clickTarget } = {}) {
    await advanceClock(page, thresholdMs + 60_000);
    const target = clickTarget || page.locator('body');
    await target.click({ position: { x: 4, y: 4 }, force: true }).catch(() => page.mouse.click(4, 4));
    const state = await readRecoveryState(page);
    expect(state.stale, 'the real controller must report a stale session').toBe(true);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
}

export const refreshButton = (dialog) => dialog.getByRole('button', { name: 'ריענון' });
export const localOnlyRefreshButton = (dialog) => dialog.getByRole('button', { name: 'רענון עם טיוטה מקומית' });

/** Activates the recovery control by KEYBOARD and waits for the real reload. */
export async function activateRefreshByKeyboard(page, button) {
    await button.focus();
    await expect(button).toBeFocused();
    const reloaded = page.waitForEvent('load');
    await page.keyboard.press('Enter');
    return reloaded;
}

/** The notification list the app actually persisted, read from its own store. */
export const readPersistedAlerts = (page) => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const found = [];
    const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.alerts && Array.isArray(node.alerts.items)) found.push(...node.alerts.items);
        Object.values(node).forEach(walk);
    };
    try {
        walk(JSON.parse(raw));
    } catch {
        return [];
    }
    return found;
}, KASHAR_DRAFT_KEY);
