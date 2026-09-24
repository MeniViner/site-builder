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

    /**
     * The document libraries this site really has. A folder is "ready" only when
     * the app can see which library owns it, so the fixture has to model that
     * ownership consistently across every probe shape rather than answering each
     * endpoint in isolation.
     */
    const LIBRARIES = [
        { title: 'siteDB', id: '11111111-1111-4111-8111-111111111111', root: '/sites/schedule/siteDB' },
        { title: 'siteUsersDb', id: '22222222-2222-4222-8222-222222222222', root: '/sites/schedule/siteUsersDb' },
    ];
    const parentOf = (p) => String(p || '').split('/').slice(0, -1).join('/');
    /**
     * One stable list-item id per folder path.
     *
     * The readiness check compares the id from the ListItemAllFields probe with
     * the id from the parent enumeration and refuses the folder when they differ
     * (sharePointBrowserFilesystem.js:461). Hard-coding a different constant in
     * each handler made every freshly created backup folder look inconsistent,
     * so the restore retried and gave up before writing anything.
     */
    const listItemIdFor = (p) => {
        let hash = 0;
        for (const ch of String(p || '')) hash = ((hash * 31) + ch.charCodeAt(0)) % 100000;
        return hash + 1;
    };
    const owningLibrary = (p) => LIBRARIES.find((lib) => String(p || '').startsWith(lib.root)) || LIBRARIES[0];

    // Library resolution: _api/web/lists/GetByTitle('<title>') with RootFolder.
    await page.route(/_api\/web\/lists\/GetByTitle/i, (route) => {
        const title = /GetByTitle\('([^']*)'\)/.exec(decodeURIComponent(route.request().url()))?.[1] || '';
        const library = LIBRARIES.find((lib) => lib.title.toLowerCase() === title.toLowerCase());
        if (!library) {
            return route.fulfill({ status: 404, contentType: ODATA, body: JSON.stringify({ error: { message: { value: 'List not found.' } } }) });
        }
        return route.fulfill({
            status: 200,
            contentType: ODATA,
            body: JSON.stringify({ d: {
                Id: library.id,
                Title: library.title,
                // 101 is a document library; anything else would not be a valid
                // restore destination.
                BaseTemplate: 101,
                RootFolder: { ServerRelativeUrl: library.root },
            } }),
        });
    });

    const decodeFolderPath = (url) => {
        const match = /GetFolderByServerRelativeUrl\('([^']*)'\)/.exec(decodeURIComponent(url));
        return match ? match[1] : '';
    };

    await page.route(/GetFolderByServerRelativeUrl/, async (route) => {
        const url = route.request().url();
        const folderPath = decodeFolderPath(url);

        // Folder READINESS probes. A restore prepares its safety-backup folder
        // first and refuses to write until the destination is list-backed and
        // ready (src/utils/sharePointBrowserFilesystem.js:127-140). Without
        // these the restore stops at "the destination is not ready", which is
        // correct behaviour against an unanswered probe but means the scenario
        // never reaches what it is actually testing.
        if (fixture.failSafetyBackup && /\/Backups/.test(folderPath)) {
            return route.fulfill({ status: 403, contentType: ODATA, body: JSON.stringify({ error: { message: { value: 'Access denied.' } } }) });
        }

        if (/\/ListItemAllFields/.test(url)) {
            // The readiness classifier wants OWNING-LIBRARY evidence, not just a
            // list item id: ParentList with its Id, Title and RootFolder. Without
            // it the folder reads as "not list-bound" and the restore refuses to
            // prepare its safety-backup folder.
            const owner = owningLibrary(folderPath);
            return route.fulfill({
                status: 200,
                contentType: ODATA,
                body: JSON.stringify({ d: {
                    Id: listItemIdFor(folderPath),
                    FileSystemObjectType: 1,
                    FileRef: folderPath,
                    FileDirRef: parentOf(folderPath),
                    ContentTypeId: { StringValue: '0x0120009B1F1A' },
                    Folder: { ServerRelativeUrl: folderPath },
                    ParentList: {
                        Id: owner.id,
                        Title: owner.title,
                        RootFolder: { ServerRelativeUrl: owner.root },
                    },
                } }),
            });
        }

        if (/\/Folders\/add\(/.test(url)) {
            return route.fulfill({ status: 200, contentType: ODATA, body: JSON.stringify({ d: { ServerRelativeUrl: folderPath, Exists: true } }) });
        }

        // A parent enumeration filtered to one leaf, used to confirm the folder
        // is visible from its parent and list-backed.
        if (/\/Folders\?.*\$filter=Name/.test(decodeURIComponent(url))) {
            const leaf = /Name eq '([^']*)'/.exec(decodeURIComponent(url))?.[1] || '';
            const childPath = `${folderPath}/${leaf}`;
            return route.fulfill({
                status: 200,
                contentType: ODATA,
                body: JSON.stringify({ d: { results: [{
                    Name: leaf,
                    ServerRelativeUrl: childPath,
                    Exists: true,
                    ListItemAllFields: {
                        Id: listItemIdFor(childPath),
                        FileSystemObjectType: 1,
                        FileRef: childPath,
                        FileDirRef: folderPath,
                        ParentList: {
                            Id: owningLibrary(childPath).id,
                            Title: owningLibrary(childPath).title,
                            RootFolder: { ServerRelativeUrl: owningLibrary(childPath).root },
                        },
                    },
                }] } }),
            });
        }

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

        if (/\$select=[^&]*Exists/.test(decodeURIComponent(url))) {
            return route.fulfill({
                status: 200,
                contentType: ODATA,
                body: JSON.stringify({ d: { ServerRelativeUrl: folderPath, Name: folderPath.split('/').pop(), Exists: true, ItemCount: 0 } }),
            });
        }

        return route.fallback();
    });

    // The payload reads are plain GETs on the file URL, not an _api call
    // (src/utils/sharepointUtils.js:340 `buildFileValueEndpoint`).
    await page.route(/\/Backups\//, async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        // The OData folder endpoints embed the same "/Backups/" path inside the
        // quoted argument; they belong to the route registered above.
        if (requestUrl.includes('/_api/')) return route.fallback();
        const path = new URL(requestUrl).pathname;

        // A safety backup WRITES into a freshly created backup folder (its
        // manifest and a copy of every source file). Treating /Backups/ as
        // read-only made those writes 404 and the restore abort after readiness
        // had already succeeded.
        if (request.method() === 'PUT') {
            if (fixture.failWritesMatching && path.includes(fixture.failWritesMatching)) {
                fixture.writes.push({ path, ok: false });
                return route.fulfill({ status: 500, contentType: 'text/plain', body: 'write failed' });
            }
            const body = request.postData() ?? '';
            fixture.live.set(path, body);
            fixture.writes.push({ path, ok: true, bytes: body.length });
            return route.fulfill({ status: 200, contentType: ODATA, body: JSON.stringify({ d: {} }) });
        }
        // Anything written during this test reads back as written.
        if (fixture.live.has(path)) {
            return route.fulfill({ status: 200, contentType: 'text/plain', body: fixture.live.get(path) });
        }
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

    // ---------------------------------------------------------------- writes
    //
    // A selective restore is not a read-only flow: it creates a safety backup,
    // writes each selected file, and READS EACH ONE BACK to verify the stored
    // bytes. Stubbing only the read endpoints left every restore stalled at the
    // first write, so these scenarios could never reach their real assertions.
    //
    // This is a writable store rather than a blanket 200: the read-back has to
    // return exactly what was written, or the app's own verification fails --
    // which is the behaviour under test.

    /** Server-relative URL -> stored text, for everything written or seeded. */
    fixture.live = new Map();
    /** Ordered log of writes, so a test can assert what was and was not touched. */
    fixture.writes = [];
    /** Set to a URL substring to make the NEXT matching write fail. */
    fixture.failWritesMatching = null;
    /** Set true to make safety-backup folder creation fail. */
    fixture.failSafetyBackup = false;

    fixture.seedLive = (serverRelativeUrl, text) => fixture.live.set(serverRelativeUrl, text);
    fixture.readLive = (serverRelativeUrl) => fixture.live.get(serverRelativeUrl);

    // FormDigest. Every SharePoint write asks for one first.
    await page.route(/_api\/contextinfo/, (route) => route.fulfill({
        status: 200,
        contentType: ODATA,
        body: JSON.stringify({ d: { GetContextWebInformation: { FormDigestValue: 'e2e-digest', FormDigestTimeoutSeconds: 3600 } } }),
    }));

    // Folder creation, used by the safety backup and by parent recovery.
    await page.route(/_api\/web\/folders/i, (route) => {
        if (fixture.failSafetyBackup) {
            return route.fulfill({ status: 403, contentType: ODATA, body: JSON.stringify({ error: { message: { value: 'Access denied.' } } }) });
        }
        return route.fulfill({ status: 200, contentType: ODATA, body: JSON.stringify({ d: {} }) });
    });

    // Direct file GET/PUT on the live site (NOT under /Backups/, which the
    // read-only route above owns).
    await page.route(
        (url) => /\/sites\//.test(url.pathname) && !url.pathname.includes('/Backups/') && !url.pathname.includes('/_api/'),
        async (route) => {
            const request = route.request();
            const pathname = new URL(request.url()).pathname;

            if (request.method() === 'PUT') {
                if (fixture.failWritesMatching && pathname.includes(fixture.failWritesMatching)) {
                    fixture.writes.push({ path: pathname, ok: false });
                    return route.fulfill({ status: 500, contentType: 'text/plain', body: 'write failed' });
                }
                const body = request.postData() ?? '';
                fixture.live.set(pathname, body);
                fixture.writes.push({ path: pathname, ok: true, bytes: body.length });
                return route.fulfill({ status: 200, contentType: ODATA, body: JSON.stringify({ d: {} }) });
            }

            if (request.method() === 'GET' && fixture.live.has(pathname)) {
                return route.fulfill({ status: 200, contentType: 'text/plain', body: fixture.live.get(pathname) });
            }
            return route.fallback();
        },
    );

    // Seed the LIVE site. A safety backup copies the current files, so an empty
    // site makes it report zero copied files and refuse to continue — which is
    // correct behaviour, just not the scenario under test.
    const SITE_ASSETS = '/sites/schedule/siteDB/siteAssets';
    const seedDefaults = {
        [`${SITE_ASSETS}/bihs_master_config_v1.txt`]: masterConfigText({ siteContent: { hero: { title: 'כותרת חיה' } } }),
        [`${SITE_ASSETS}/events_data.txt`]: JSON.stringify({ displayCount: 1, displayMode: 'default', events: [{ id: 'event-live', title: 'אירוע חי' }] }),
        [`${SITE_ASSETS}/nav_data.txt`]: JSON.stringify([{ id: 'nav-live', label: 'ניווט חי' }]),
        [`${SITE_ASSETS}/site_content_data.txt`]: JSON.stringify({ hero: { title: 'כותרת חיה' } }),
        [`${SITE_ASSETS}/theme_data.txt`]: JSON.stringify({ mode: 'light' }),
        [`${SITE_ASSETS}/external_links_data.txt`]: JSON.stringify([]),
        [`${SITE_ASSETS}/gantt_data.txt`]: JSON.stringify({ items: [{ id: 'gantt-live', title: 'שלב חי' }], categories: [] }),
        [`${SITE_ASSETS}/boom_data.txt`]: JSON.stringify({ enabled: true, items: [{ id: 'boom-live', title: 'משימה חיה' }], categories: [] }),
        [`${SITE_ASSETS}/users_data.txt`]: JSON.stringify([{ id: 'admin-live', name: 'מנהל חי' }]),
        '/sites/schedule/siteUsersDb/widgets_data.txt': JSON.stringify({ active: [] }),
    };
    Object.entries(seedDefaults).forEach(([url, text]) => fixture.live.set(url, text));

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
