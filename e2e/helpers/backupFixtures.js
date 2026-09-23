/**
 * Deterministic SharePoint backup fixtures, served over the network.
 *
 * In the `kashar-demo` boot `SHAREPOINT_CONFIG.useMock` is FALSE
 * (src/config/sharepoint.config.js:12 — `import.meta.env.MODE` is
 * "kashar-demo", not "development", and .env sets VITE_USE_MOCK=false) and
 * `isSharePointReadonlyBackend()` always returns false
 * (src/services/storage/storageBackend.js:367). AdminBackupManagement therefore
 * takes the real SharePoint branch, so every listing, file-list and payload read
 * is an ordinary fetch that `page.route` can answer.
 *
 * Three endpoints matter:
 *   GetFolderByServerRelativeUrl('<root>/Backups')/Folders  -> the backup list
 *   GetFolderByServerRelativeUrl('<backup>')/Files          -> its file metadata
 *   GET <file serverRelativeUrl>                            -> the payload text
 * (src/utils/sharepointUtils.js:342-356, 958-1016, 1016-1075)
 */

const ODATA = 'application/json;odata=verbose';

/** A promise a test resolves by hand, used to hold a response open. */
export function gate() {
    let release = () => {};
    const promise = new Promise((resolve) => { release = resolve; });
    return { promise, release };
}

/**
 * @typedef {{
 *   name: string,
 *   timeCreated?: string,
 *   timeLastModified?: string,
 *   files: Array<{ name: string, text?: string, sizeBytes?: number, gate?: {promise: Promise<any>} }>,
 *   filesGate?: { promise: Promise<any> },
 * }} BackupFolderFixture
 */

/**
 * Installs the routes and returns a live, mutable fixture the test can change
 * between interactions. Register it AFTER stubSharePointIdentityApi so it wins
 * for the backup endpoints; identity calls are handed back with route.fallback().
 */
export async function installBackupRoutes(page, initialBackups = []) {
    const fixture = {
        backups: initialBackups,
        counts: { folders: 0, files: {}, text: {} },
        /** Replaces the fixture used by every subsequent request. */
        setBackups(next) { fixture.backups = next; },
        find(name) { return fixture.backups.find((backup) => backup.name === name); },
        /**
         * Releases every gate still held open. A route handler parked on an
         * unresolved promise keeps a request in flight while Playwright closes
         * the context, which makes tracing drop its recording file; tests call
         * this from afterEach so an intentionally abandoned request never
         * destabilises the next spec.
         */
        releaseAllGates() {
            fixture.backups.forEach((backup) => {
                backup.filesGate?.release?.();
                backup.files.forEach((file) => file.gate?.release?.());
            });
        },
    };

    const decodeFolderPath = (url) => {
        const match = /GetFolderByServerRelativeUrl\('([^']*)'\)/.exec(decodeURIComponent(url));
        return match ? match[1] : '';
    };

    await page.route(/GetFolderByServerRelativeUrl/, async (route) => {
        const url = route.request().url();
        const folderPath = decodeFolderPath(url);

        if (/\/Folders(\?|$)/.test(url)) {
            fixture.counts.folders += 1;
            const results = fixture.backups.map((backup) => ({
                Name: backup.name,
                ServerRelativeUrl: `${folderPath}/${backup.name}`,
                TimeCreated: backup.timeCreated || '2026-06-10T10:00:00Z',
                TimeLastModified: backup.timeLastModified || backup.timeCreated || '2026-06-10T10:00:00Z',
                ItemCount: backup.files.length,
            }));
            return route.fulfill({ status: 200, contentType: ODATA, body: JSON.stringify({ d: { results } }) });
        }

        if (/\/Files(\?|$)/.test(url)) {
            const backupName = folderPath.split('/').filter(Boolean).pop();
            fixture.counts.files[backupName] = (fixture.counts.files[backupName] || 0) + 1;
            const backup = fixture.find(backupName);
            if (!backup) return route.fulfill({ status: 404, contentType: ODATA, body: '{}' });
            if (backup.filesGate) await backup.filesGate.promise;
            const results = backup.files.map((file) => ({
                Name: file.name,
                ServerRelativeUrl: `${folderPath}/${file.name}`,
                Length: String(file.sizeBytes ?? (file.text || '').length),
                TimeCreated: backup.timeCreated || '2026-06-10T10:00:00Z',
                TimeLastModified: backup.timeLastModified || '2026-06-10T10:00:00Z',
            }));
            return route.fulfill({ status: 200, contentType: ODATA, body: JSON.stringify({ d: { results } }) });
        }

        return route.fallback();
    });

    // The payload reads are plain GETs on the file URL, not an _api call
    // (src/utils/sharepointUtils.js:340 `buildFileValueEndpoint`).
    await page.route(/\/Backups\//, async (route) => {
        const requestUrl = route.request().url();
        // The OData folder endpoints embed the same "/Backups/" path inside the
        // quoted argument; they belong to the route registered above.
        if (requestUrl.includes('/_api/')) return route.fallback();
        const path = new URL(requestUrl).pathname;
        const segments = path.split('/').filter(Boolean);
        const fileName = segments.pop();
        const backupName = segments.pop();
        fixture.counts.text[`${backupName}/${fileName}`] = (fixture.counts.text[`${backupName}/${fileName}`] || 0) + 1;

        const backup = fixture.find(backupName);
        const file = backup?.files.find((item) => item.name === fileName);
        if (!file) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
        if (file.gate) await file.gate.promise;
        if (file.status && file.status >= 400) {
            return route.fulfill({ status: file.status, contentType: 'text/plain', body: file.text ?? 'error' });
        }
        return route.fulfill({ status: 200, contentType: 'text/plain', body: String(file.text ?? '') });
    });

    return fixture;
}

export const MASTER_FILE = 'bihs_master_config_v1.txt';
export const EVENTS_FILE = 'events_data.txt';
export const NAV_FILE = 'nav_data.txt';
export const USERS_FILE = 'users_data.txt';
export const BOOM_FILE = 'boom_data.txt';
export const GANTT_FILE = 'gantt_data.txt';

export const masterConfigText = (overrides = {}) => JSON.stringify({
    schemaVersion: '1.0.0',
    meta: { appId: 'siteBuilder' },
    ...overrides,
}, null, 2);

/** A well-formed backup folder with one record in every recognised file. */
export function fullBackup(name, { timeLastModified, siteTitle = 'גיבוי בדיקה' } = {}) {
    return {
        name,
        timeCreated: timeLastModified || '2026-06-10T10:00:00Z',
        timeLastModified: timeLastModified || '2026-06-10T10:00:00Z',
        files: [
            { name: MASTER_FILE, text: masterConfigText({ siteContent: { hero: { title: siteTitle } } }) },
            { name: EVENTS_FILE, text: JSON.stringify({ displayCount: 3, displayMode: 'default', events: [{ id: 'event-1', title: 'אירוע אחד' }] }) },
            { name: NAV_FILE, text: JSON.stringify([{ id: 'nav-1', label: 'בית' }]) },
            { name: USERS_FILE, text: JSON.stringify([{ id: 'admin-1', name: 'מנהל אחד' }]) },
            { name: BOOM_FILE, text: JSON.stringify({ enabled: true, items: [{ id: 'boom-1', title: 'משימה' }], categories: [] }) },
            { name: GANTT_FILE, text: JSON.stringify({ items: [{ id: 'gantt-1', title: 'שלב' }], categories: [] }) },
        ],
    };
}
