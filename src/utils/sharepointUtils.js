// src/utils/sharepointUtils.js
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import { isKasharDemoProfile } from '../demo-data/demoProfile';
import { spLog, spLogDigestCache } from './spAppLog';
import {
    SharePointBrowserFilesystemError,
    ensureSharePointFolder as ensureVerifiedSharePointFolder,
    uploadSharePointFileBytes,
} from './sharePointBrowserFilesystem';

const requestDigestCache = new Map();
const CACHE_EXPIRATION_MS = 25 * 60 * 1000; // 25 minutes (SharePoint digest ~30m)

const getImageBaseFolder = () => SHAREPOINT_PATHS.imageBaseFolderServerRelativeUrl;
const getRuntimeSiteApiRoot = () => SHAREPOINT_PATHS.siteApiRoot;
const ODATA_ACCEPT = 'application/json;odata=verbose';
const ODATA_CONTENT_TYPE = 'application/json;odata=verbose';
const ROOT_CACHE_KEY = '__root__';
const KNOWN_LIBRARY_SEGMENTS = new Set([
    'siteassets',
    'shared documents',
    'shared%20documents',
    'documents',
    'style library',
    'sitepages',
    'site pages',
    'lists',
]);

const normalizeServerRelativeUrl = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    return raw.startsWith('/') ? raw : `/${raw}`;
};

const splitPathSegments = (path) => normalizeServerRelativeUrl(path).split('/').filter(Boolean);

const decodeSafe = (value) => {
    try {
        return decodeURIComponent(String(value ?? ''));
    } catch {
        return String(value ?? '');
    }
};

const isKnownLibrarySegment = (segment) => {
    const raw = String(segment ?? '').trim().toLowerCase();
    if (!raw) return false;
    const decoded = decodeSafe(raw).toLowerCase();
    return KNOWN_LIBRARY_SEGMENTS.has(raw) || KNOWN_LIBRARY_SEGMENTS.has(decoded);
};

const toPathname = (urlOrPath) => {
    const raw = String(urlOrPath ?? '').trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
        try {
            return normalizeServerRelativeUrl(new URL(raw).pathname || '/');
        } catch {
            return '';
        }
    }

    return normalizeServerRelativeUrl(raw);
};

const toRequestUrl = (urlOrPath) => {
    const raw = String(urlOrPath ?? '').trim();
    if (!raw) {
        throw new Error('Missing SharePoint URL');
    }

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    return normalizeServerRelativeUrl(raw);
};

const toSharePointAbsoluteUrl = (serverRelativeUrl) => {
    const normalizedPath = toPathname(serverRelativeUrl);
    if (!normalizedPath) return '';

    const rawHost = String(SHAREPOINT_PATHS.host || '').trim();
    const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
    if (!host) return normalizedPath;

    return `https://${host}${normalizedPath}`;
};

const responseTextSafe = async (response) => {
    try {
        return await response.text();
    } catch {
        return '';
    }
};

const summarizeErrorText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 320);
const escapeODataString = (value) => String(value ?? '').replace(/'/g, "''");
const asArray = (value) => (Array.isArray(value) ? value : []);

const parseODataResults = (payload, nestedCollectionKey = '') => {
    const root = payload?.d;
    if (!root) return [];
    if (Array.isArray(root.results)) return root.results;
    if (!nestedCollectionKey) return [];

    const nested = root?.[nestedCollectionKey];
    if (Array.isArray(nested?.results)) return nested.results;
    if (Array.isArray(nested)) return nested;
    return [];
};

const splitServerRelativeFileUrl = (serverRelativeUrl) => {
    const fileServerRelativeUrl = toPathname(serverRelativeUrl);
    const requestUrl = toRequestUrl(serverRelativeUrl);

    const lastSlashIndex = fileServerRelativeUrl.lastIndexOf('/');
    if (lastSlashIndex <= 0 || lastSlashIndex === fileServerRelativeUrl.length - 1) {
        throw new Error(`Invalid server-relative file URL: "${serverRelativeUrl}"`);
    }

    return {
        requestUrl,
        fileServerRelativeUrl,
        folderServerRelativeUrl: fileServerRelativeUrl.slice(0, lastSlashIndex),
        fileName: fileServerRelativeUrl.slice(lastSlashIndex + 1),
    };
};

const extractSiteRootFromPath = (path) => {
    const normalizedPath = toPathname(path);
    const segments = splitPathSegments(normalizedPath);
    if (segments.length === 0) {
        return { siteRoot: '', siteSegmentsLength: 0 };
    }

    const first = segments[0].toLowerCase();

    if (first === 'sites' || first === 'teams') {
        let libraryIndex = -1;
        for (let i = 2; i < segments.length; i += 1) {
            if (isKnownLibrarySegment(segments[i])) {
                libraryIndex = i;
                break;
            }
        }

        if (libraryIndex !== -1) {
            return {
                siteRoot: `/${segments.slice(0, libraryIndex).join('/')}`,
                siteSegmentsLength: libraryIndex,
            };
        }

        if (segments.length >= 3) {
            return {
                siteRoot: `/${segments.slice(0, 3).join('/')}`,
                siteSegmentsLength: 3,
            };
        }

        return {
            siteRoot: `/${segments.slice(0, Math.min(2, segments.length)).join('/')}`,
            siteSegmentsLength: Math.min(2, segments.length),
        };
    }

    const libraryIndex = segments.findIndex((segment) => isKnownLibrarySegment(segment));
    if (libraryIndex > 0) {
        return {
            siteRoot: `/${segments.slice(0, libraryIndex).join('/')}`,
            siteSegmentsLength: libraryIndex,
        };
    }

    return { siteRoot: '', siteSegmentsLength: 0 };
};

const inferTopLevelSiteRoot = (value = '') => {
    const normalizedPath = toPathname(value);
    if (!normalizedPath) return '';

    const segments = splitPathSegments(normalizedPath);
    if (segments.length < 2) return '';

    const first = segments[0].toLowerCase();
    if (first !== 'sites' && first !== 'teams') return '';

    return `/${segments[0]}/${segments[1]}`;
};

const resolveApiSiteRoot = (value = '') => {
    const configured = toPathname(getRuntimeSiteApiRoot());
    if (configured) return configured;

    const normalizedPath = toPathname(value);
    if (!normalizedPath) return '';

    const apiMarker = '/_api/';
    const apiIndex = normalizedPath.indexOf(apiMarker);
    if (apiIndex >= 0) {
        const fromApiPath = normalizedPath.slice(0, apiIndex) || '';
        const topFromApiPath = inferTopLevelSiteRoot(fromApiPath);
        return topFromApiPath || fromApiPath;
    }

    const topLevel = inferTopLevelSiteRoot(normalizedPath);
    if (topLevel) return topLevel;

    const { siteRoot } = extractSiteRootFromPath(normalizedPath);
    return siteRoot || '';
};

const buildSiteApiUrl = (siteRoot, apiPath) => {
    const root = normalizeServerRelativeUrl(siteRoot || '');
    if (!root) return apiPath;
    return `${root}${apiPath}`;
};

const buildFolderCreationPlan = (folderServerRelativeUrl) => {
    const normalizedFolder = normalizeServerRelativeUrl(folderServerRelativeUrl);
    const segments = splitPathSegments(normalizedFolder);
    const extracted = extractSiteRootFromPath(normalizedFolder);
    const siteRoot = resolveApiSiteRoot(normalizedFolder) || extracted.siteRoot;
    const siteSegmentsLength = splitPathSegments(siteRoot).length;
    const folderSegments = segments.slice(siteSegmentsLength);

    return {
        siteRoot,
        folderSegments,
    };
};

const getConfiguredSharePointLibraries = () => ([
    {
        title: SHAREPOINT_PATHS.siteDbFolder,
        rootRel: SHAREPOINT_PATHS.siteDbRoot,
    },
    {
        title: SHAREPOINT_PATHS.usersDbFolder,
        rootRel: SHAREPOINT_PATHS.usersDbRoot,
    },
]);

const browserSharePointRequest = ({ url, method = 'GET', headers, body }) => fetch(url, {
    method,
    credentials: 'include',
    cache: method === 'GET' ? 'no-store' : undefined,
    headers,
    body,
});

const mapFilesystemErrorToHebrew = (error, action = 'הפעולה') => {
    const code = String(error?.code || '');
    const status = Number(
        error?.details?.status
        || error?.details?.firstProbe?.status
        || error?.details?.lastProbe?.status
        || 0
    );
    if (code.includes('AUTHORIZATION') || status === 401 || status === 403) {
        return new Error(`אין הרשאה מתאימה לביצוע ${action} ב-SharePoint. יש לפנות למנהל המערכת.`, { cause: error });
    }
    if (code === 'FOLDER_RECONCILIATION_REQUIRED') {
        return new Error('התיקייה קיימת ב-SharePoint אך אינה מחוברת באופן תקין לספריית המסמכים. לא בוצעה יצירה מחדש; יש לבצע אבחון ותיקון מבוקר.', { cause: error });
    }
    if (code.includes('VERIFY') || code.includes('MISMATCH')) {
        return new Error(`${action} הסתיימה ללא אימות תקין ב-SharePoint. הערך הקודם נשמר; יש לנסות שוב.`, { cause: error });
    }
    if (code.includes('FOLDER') || code.includes('DIRECTORY')) {
        return new Error(`נתיב היעד ב-SharePoint אינו מוכן לביצוע ${action}. יש לרענן את מצב התיקיות ולנסות שוב.`, { cause: error });
    }
    return new Error(`${action} ב-SharePoint נכשלה. יש לבדוק את החיבור ולנסות שוב.`, { cause: error });
};

const putTextFile = async (requestUrl, text, contentType) => {
    return fetch(requestUrl, {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': contentType,
        },
        body: text,
    });
};

/**
 * For compatibility with existing services, this returns the fetchable file URL.
 * We intentionally use direct file URL reads/writes (GET/PUT), not _api/$value.
 */
export const buildFileValueEndpoint = (serverRelativeUrl) => toRequestUrl(serverRelativeUrl);

export const readSharePointTextFile = async (serverRelativeUrl) => {
    const endpoint = buildFileValueEndpoint(serverRelativeUrl);
    const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'text/plain, */*' },
    });

    if (!response.ok) {
        const errorText = summarizeErrorText(await responseTextSafe(response));
        throw new Error(`SharePoint read failed (${response.status}): ${errorText}`);
    }

    return response.text();
};

/**
 * Ensures a full SharePoint folder path exists (creates missing folders in order).
 */
export const ensureSharePointFolderHierarchy = async (folderServerRelativeUrl, digest = null) => {
    const normalizedFolder = normalizeServerRelativeUrl(folderServerRelativeUrl);
    if (!normalizedFolder) {
        throw new Error('ensureSharePointFolderHierarchy expects a valid folder URL');
    }

    const { siteRoot } = buildFolderCreationPlan(normalizedFolder);
    const digestValue = digest || await getRequestDigest(siteRoot);
    try {
        await ensureVerifiedSharePointFolder({
            webUrl: buildSiteApiUrl(siteRoot, ''),
            siteRoot,
            folderRel: normalizedFolder,
            libraries: getConfiguredSharePointLibraries(),
            digest: digestValue,
            request: browserSharePointRequest,
            log: (message) => spLog.file(message),
        });
    } catch (error) {
        if (error instanceof SharePointBrowserFilesystemError) {
            throw mapFilesystemErrorToHebrew(error, 'הכנת התיקייה');
        }
        throw error;
    }
};

/**
 * Creates a SharePoint file only if it does not exist (no overwrite).
 * Uses direct GET/PUT flow with credentials include.
 */
export const ensureSharePointTextFileExists = async ({
    serverRelativeUrl,
    text,
    contentType = 'text/plain; charset=utf-8',
    digest = null,
}) => {
    if (typeof text !== 'string') {
        throw new Error('ensureSharePointTextFileExists expects "text" as a string');
    }

    const { requestUrl, fileServerRelativeUrl, folderServerRelativeUrl } = splitServerRelativeFileUrl(serverRelativeUrl);

    const readResponse = await fetch(requestUrl, {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Content-Type': 'text/plain',
        },
    });

    if (readResponse.ok) {
        return { created: false, response: readResponse };
    }

    if (readResponse.status !== 404) {
        const readError = summarizeErrorText(await responseTextSafe(readResponse));
        throw new Error(`SharePoint read failed (${readResponse.status}): ${readError}`);
    }

    spLog.warn(`קובץ לא קיים, מנסה ליצור ישירות: ${fileServerRelativeUrl}`);

    const createResponse = await putTextFile(requestUrl, text, contentType);
    if (createResponse.ok) {
        spLog.success(`נוצר קובץ התחלתי: ${fileServerRelativeUrl}`);
        return { created: true, response: createResponse };
    }

    // If parent folders are missing, try creating hierarchy once, then retry PUT.
    if (createResponse.status === 404) {
        const siteRoot = resolveApiSiteRoot(fileServerRelativeUrl);
        const digestValue = digest || await getRequestDigest(siteRoot);
        await ensureSharePointFolderHierarchy(folderServerRelativeUrl, digestValue);

        const retryResponse = await putTextFile(requestUrl, text, contentType);
        if (retryResponse.ok) {
            spLog.success(`נוצר קובץ התחלתי לאחר יצירת תיקיות: ${fileServerRelativeUrl}`);
            return { created: true, response: retryResponse };
        }

        const retryError = summarizeErrorText(await responseTextSafe(retryResponse));
        throw new Error(`SharePoint create file failed (${retryResponse.status}): ${retryError}`);
    }

    const createError = summarizeErrorText(await responseTextSafe(createResponse));
    throw new Error(`SharePoint create file failed (${createResponse.status}): ${createError}`);
};

/**
 * Saves text content into a SharePoint file.
 * Direct PUT first; only if parent path is missing (404), tries creating folders then retries.
 */
export const upsertSharePointTextFile = async ({
    serverRelativeUrl,
    text,
    contentType = 'text/plain; charset=utf-8',
    digest = null,
}) => {
    if (typeof text !== 'string') {
        throw new Error('upsertSharePointTextFile expects "text" as a string');
    }

    const { requestUrl, fileServerRelativeUrl, folderServerRelativeUrl } = splitServerRelativeFileUrl(serverRelativeUrl);

    const saveResponse = await putTextFile(requestUrl, text, contentType);
    if (saveResponse.ok) {
        const created = saveResponse.status === 201;
        return { created, response: saveResponse };
    }

    // Most common missing-file/folder case in bootstrapping.
    if (saveResponse.status === 404) {
        spLog.warn(`קובץ/תיקייה חסרים, מנסה להקים נתיב ואז לשמור: ${fileServerRelativeUrl}`);
        const siteRoot = resolveApiSiteRoot(fileServerRelativeUrl);
        const digestValue = digest || await getRequestDigest(siteRoot);
        await ensureSharePointFolderHierarchy(folderServerRelativeUrl, digestValue);

        const retryResponse = await putTextFile(requestUrl, text, contentType);
        if (retryResponse.ok) {
            return { created: true, response: retryResponse };
        }

        const retryError = summarizeErrorText(await responseTextSafe(retryResponse));
        throw new Error(`SharePoint save failed after folder ensure (${retryResponse.status}): ${retryError}`);
    }

    const saveError = summarizeErrorText(await responseTextSafe(saveResponse));
    throw new Error(`SharePoint save failed (${saveResponse.status}): ${saveError}`);
};

/**
 * Gets a SharePoint Request Digest token, with per-site caching.
 * @param {string} [scope=''] Optional site root or any URL/path under target site.
 * @returns {Promise<string>}
 */
export const invalidateRequestDigest = (scope = '') => {
    const siteRoot = resolveApiSiteRoot(scope);
    requestDigestCache.delete(siteRoot || ROOT_CACHE_KEY);
};

export const getRequestDigest = async (scope = '', { forceRefresh = false } = {}) => {
    const siteRoot = resolveApiSiteRoot(scope);
    const cacheKey = siteRoot || ROOT_CACHE_KEY;
    const now = Date.now();
    const cached = requestDigestCache.get(cacheKey);

    if (!forceRefresh && cached && now - cached.time < CACHE_EXPIRATION_MS) {
        spLogDigestCache(true);
        return cached.value;
    }

    const endpoint = buildSiteApiUrl(siteRoot, '/_api/contextinfo');

    try {
        spLogDigestCache(false);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Accept: ODATA_ACCEPT,
                'Content-Type': ODATA_CONTENT_TYPE,
            },
            credentials: 'include',
        });

        spLog.file(`תגובת contextinfo | status: ${response.status} ${response.statusText}`);
        if (!response.ok) {
            const body = summarizeErrorText(await responseTextSafe(response));
            throw new Error(`HTTP error! status: ${response.status}. ${body}`);
        }

        const data = await response.json();
        const digest = data?.d?.GetContextWebInformation?.FormDigestValue || '';
        requestDigestCache.set(cacheKey, { value: digest, time: now });
        spLog.success('Request Digest התקבל בהצלחה');
        return digest;
    } catch (error) {
        spLog.error('שגיאה בקבלת Request Digest:', error);
        throw error;
    }
};

const normalizeCreateBackupOptions = (options) => {
    if (Array.isArray(options)) {
        return { filesToBackup: options };
    }
    if (options && typeof options === 'object') {
        return options;
    }
    return {};
};

const emitBackupProgress = (onProgress, payload) => {
    if (typeof onProgress !== 'function') return;
    try {
        onProgress(payload);
    } catch (progressError) {
        spLog.warn('שגיאה ב-callback של התקדמות גיבוי:', progressError);
    }
};

const readBackupTextNoStore = async (serverRelativeUrl) => {
    const requestUrl = toRequestUrl(serverRelativeUrl);
    const endpoint = `${requestUrl}${requestUrl.includes('?') ? '&' : '?'}sitebuilder_backup_verify=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        headers: {
            Accept: 'text/plain, */*',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        },
    });
    if (!response.ok) {
        const body = summarizeErrorText(await responseTextSafe(response));
        const error = new Error(`SharePoint read failed (${response.status}): ${body}`);
        error.status = response.status;
        throw error;
    }
    return response.text();
};

/**
 * Creates a backup folder and copies data files into it.
 */
export const createBackup = async (options = {}) => {
    const {
        filesToBackup: requestedFiles = [],
        onProgress = null,
        trigger = 'manual',
        backupIo = {},
    } = normalizeCreateBackupOptions(options);

    let totalFiles = 0;
    let copiedFiles = 0;
    let skippedFiles = 0;
    let failedFiles = 0;
    let processedFiles = 0;
    let backupFolderPath = '';
    let backupFolderUrl = '';
    let backupFolderName = '';
    let firstFailure = null;

    try {
        const {
            beginTxtBackup,
            classifyTxtBackupError,
            createBackupOperationId,
            finalizeTxtBackup,
        } = await import('./txtBackupPersistence');
        const io = {
            createOperationId: createBackupOperationId,
            ensureFolder: ensureSharePointFolderHierarchy,
            readSource: async (serverRelativeUrl) => {
                const response = await fetch(buildFileValueEndpoint(serverRelativeUrl), {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: {
                        Accept: 'text/plain, */*',
                        'Cache-Control': 'no-cache',
                    },
                });
                if (response.status === 404) return undefined;
                if (!response.ok) {
                    const body = summarizeErrorText(await responseTextSafe(response));
                    const error = new Error(`שגיאה בקריאת קובץ לגיבוי (${response.status}): ${body}`);
                    error.status = response.status;
                    throw error;
                }
                return response.text();
            },
            writeText: async (serverRelativeUrl, text) => {
                const result = await upsertSharePointTextFile({
                    serverRelativeUrl,
                    text,
                    contentType: 'text/plain; charset=utf-8',
                });
                if (!result?.response?.ok) {
                    const error = new Error(`SharePoint save failed (${result?.response?.status || 0}).`);
                    error.status = result?.response?.status || 0;
                    throw error;
                }
            },
            readText: readBackupTextNoStore,
            beginBackup: beginTxtBackup,
            finalizeBackup: finalizeTxtBackup,
            ...backupIo,
        };

        spLog.boot('מתחיל גיבוי מערכת ל-SharePoint...');
        const filesToBackup = Array.isArray(requestedFiles) && requestedFiles.length > 0
            ? requestedFiles
            : [
                SHAREPOINT_PATHS.masterConfigFileServerRelativeUrl,
                SHAREPOINT_CONFIG.fileServerRelativeUrl,
                SHAREPOINT_CONFIG.navFileServerRelativeUrl,
                SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl,
                SHAREPOINT_CONFIG.themeFileServerRelativeUrl,
                SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl,
                SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl,
                SHAREPOINT_CONFIG.ganttFileServerRelativeUrl,
                SHAREPOINT_CONFIG.boomFileServerRelativeUrl,
                SHAREPOINT_CONFIG.usersFileServerRelativeUrl,
            ];
        totalFiles = filesToBackup.length;

        emitBackupProgress(onProgress, {
            stage: 'capture',
            trigger,
            percent: 5,
            message: 'מצלם מצב עקבי לגיבוי...',
            totalFiles,
            processedFiles: 0,
            copiedFiles: 0,
            skippedFiles: 0,
            failedFiles: 0,
        });

        const firstFilePath = toPathname(filesToBackup[0]);
        const { siteRoot } = extractSiteRootFromPath(firstFilePath);
        if (!siteRoot) {
            spLog.error('לא ניתן לזהות נתיב אתר מתוך', firstFilePath);
            return {
                success: false,
                trigger,
                error: `לא ניתן לזהות נתיב אתר מתוך: ${firstFilePath}`,
                totalFiles,
                copiedFiles: 0,
                skippedFiles: 0,
                failedFiles: totalFiles,
                processedFiles: 0,
                backupFolderPath: '',
                backupFolderUrl: '',
            };
        }

        const backupBaseFolder = `${SHAREPOINT_PATHS.siteAssetsRoot}/Backups`;
        const now = new Date();
        backupFolderName = io.createOperationId('backup');
        backupFolderPath = `${backupBaseFolder}/${backupFolderName}`;
        backupFolderUrl = toSharePointAbsoluteUrl(backupFolderPath);

        const capturedFiles = await Promise.all(filesToBackup.map(async (filePath) => {
            const fileName = toPathname(filePath).split('/').pop();
            if (!fileName) {
                return { filePath, fileName: '', status: 'failed', error: new Error('חסר שם קובץ לגיבוי.') };
            }
            try {
                const text = await io.readSource(filePath);
                if (text === undefined) return { filePath, fileName, status: 'missing' };
                if (typeof text !== 'string') {
                    throw new Error(`קריאת המקור עבור ${fileName} לא החזירה טקסט.`);
                }
                return { filePath, fileName, status: 'captured', text };
            } catch (error) {
                return { filePath, fileName, status: 'failed', error };
            }
        }));
        const fileNames = capturedFiles.map((file) => file.fileName).filter(Boolean);
        if (new Set(fileNames).size !== fileNames.length) {
            throw new Error('רשימת הגיבוי מכילה שמות קבצים כפולים.');
        }
        const expectedTextsByName = new Map(
            capturedFiles
                .filter((file) => file.status === 'captured')
                .map((file) => [file.fileName, file.text]),
        );
        skippedFiles = capturedFiles.filter((file) => file.status === 'missing').length;

        emitBackupProgress(onProgress, {
            stage: 'prepare-folder',
            trigger,
            percent: 12,
            message: 'מכין תיקיית גיבוי ב-SharePoint...',
            totalFiles,
            processedFiles: 0,
            copiedFiles: 0,
            skippedFiles: 0,
            failedFiles: 0,
            backupFolderPath,
            backupFolderUrl,
        });
        await io.ensureFolder(backupFolderPath);
        spLog.file(`תיקיית גיבוי נוצרה/אומתה: ${backupFolderPath}`);
        const requiredFileNames = capturedFiles
            .filter((file) => file.status === 'captured')
            .map((file) => file.fileName);
        const pendingManifest = await io.beginBackup({
            backupFolderPath,
            requiredFileNames,
            writeText: io.writeText,
            readText: io.readText,
            expectedTextsByName,
            operationId: backupFolderName,
        });

        for (let index = 0; index < capturedFiles.length; index += 1) {
            const captured = capturedFiles[index];
            const { filePath, fileName } = captured;

            emitBackupProgress(onProgress, {
                stage: 'file-progress',
                trigger,
                percent: Math.max(15, Math.min(95, Math.round(15 + ((index / totalFiles) * 80)))),
                message: `מגבה קובץ ${index + 1} מתוך ${totalFiles}${fileName ? `: ${fileName}` : ''}`,
                currentFilePath: filePath,
                currentFileName: fileName || '',
                totalFiles,
                processedFiles: index,
                copiedFiles,
                skippedFiles,
                failedFiles,
                backupFolderPath,
                backupFolderUrl,
            });

            try {
                if (captured.status === 'missing') {
                    spLog.warn(`קובץ לא נמצא לגיבוי: ${filePath}`);
                    continue;
                }
                if (captured.status === 'failed') {
                    throw captured.error;
                }
                await io.writeText(`${backupFolderPath}/${fileName}`, captured.text);
                spLog.success(`הועתק לגיבוי: ${fileName}`);
                copiedFiles += 1;
            } catch (fileErr) {
                const classified = classifyTxtBackupError(fileErr);
                if (!firstFailure || classified.code === 'backup_path_conflict') firstFailure = classified;
                spLog.error(`שגיאה בגיבוי קובץ ${filePath}:`, classified);
                failedFiles += 1;
            } finally {
                processedFiles = Math.min(index + 1, totalFiles);
                emitBackupProgress(onProgress, {
                    stage: 'file-progress',
                    trigger,
                    percent: Math.max(20, Math.min(98, Math.round(15 + ((processedFiles / totalFiles) * 80)))),
                    message: `סטטוס גיבוי: ${processedFiles}/${totalFiles} קבצים`,
                    totalFiles,
                    processedFiles,
                    copiedFiles,
                    skippedFiles,
                    failedFiles,
                    backupFolderPath,
                    backupFolderUrl,
                });
            }
        }

        const manifest = await io.finalizeBackup({
            backupFolderPath,
            requiredFileNames,
            readText: io.readText,
            writeText: io.writeText,
            expectedTextsByName,
            pendingManifest,
            forcePartial: failedFiles > 0,
        });
        const success = manifest.status === 'complete'
            && copiedFiles > 0
            && failedFiles === 0;
        const status = success ? 'complete' : 'partial';
        if (success) {
            spLog.success('גיבוי הושלם בהצלחה');
        } else {
            spLog.warn(`גיבוי הסתיים עם שגיאות | failed: ${failedFiles} | copied: ${copiedFiles} | skipped: ${skippedFiles}`);
        }

        emitBackupProgress(onProgress, {
            stage: status,
            trigger,
            percent: 100,
            message: success ? 'גיבוי הושלם ואומת' : 'הגיבוי חלקי',
            totalFiles,
            processedFiles: totalFiles,
            copiedFiles,
            skippedFiles,
            failedFiles,
            backupFolderPath,
            backupFolderUrl,
        });

        return {
            success,
            status,
            trigger,
            totalFiles,
            processedFiles,
            copiedFiles,
            skippedFiles,
            failedFiles,
            verifiedFiles: manifest.verifiedFileCount,
            manifest,
            error: firstFailure?.message || (success ? '' : 'הגיבוי חלקי ואינו מאומת במלואו.'),
            errorCode: firstFailure?.code || '',
            errorCategory: firstFailure?.category || '',
            backupFolderPath,
            backupFolderUrl,
            backupFolderName,
            backupCreatedAt: now.toISOString(),
        };
    } catch (error) {
        const { classifyTxtBackupError } = await import('./txtBackupPersistence');
        const classified = classifyTxtBackupError(error);
        spLog.error('שגיאה בתהליך הגיבוי:', classified);
        emitBackupProgress(onProgress, {
            stage: 'failed',
            trigger,
            percent: 100,
            message: 'הגיבוי נכשל',
            error: classified?.message || String(classified),
        });
        return {
            success: false,
            status: copiedFiles > 0 ? 'partial' : 'failed',
            trigger,
            error: classified?.message || String(classified),
            errorCode: classified?.code || '',
            errorCategory: classified?.category || '',
            totalFiles,
            processedFiles,
            copiedFiles,
            skippedFiles,
            failedFiles,
            backupFolderPath,
            backupFolderUrl,
            backupFolderName,
        };
    }
};

const parseBackupTimestampFromName = (folderName) => {
    const name = String(folderName ?? '').trim();
    const match = /^backup-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})$/i.exec(name);
    if (!match) return null;

    const [, datePart, hh, mm, ss] = match;
    const parsed = Date.parse(`${datePart}T${hh}:${mm}:${ss}Z`);
    return Number.isFinite(parsed) ? parsed : null;
};

const readLatestBackupTimestamp = async () => {
    const { backups } = await listSharePointBackups({ includeFiles: true });
    return backups
        .filter((backup) => backup.status === 'complete')
        .reduce((latest, backup) => {
            const modified = Date.parse(String(backup?.timeLastModified ?? ''));
            const created = Date.parse(String(backup?.timeCreated ?? ''));
            const fromName = parseBackupTimestampFromName(backup?.name);
            const candidate = [modified, created, fromName].find(Number.isFinite);
            return Number.isFinite(candidate) ? Math.max(latest, candidate) : latest;
        }, 0) || null;
};

export const listSharePointBackupFiles = async (
    backupFolderServerRelativeUrl,
    { siteRoot: providedSiteRoot = '', includeManifest = false } = {},
) => {
    const normalizedFolder = toPathname(backupFolderServerRelativeUrl);
    if (!normalizedFolder) return [];

    const detectedSiteRoot =
        providedSiteRoot
        || resolveApiSiteRoot(normalizedFolder)
        || extractSiteRootFromPath(normalizedFolder).siteRoot;
    if (!detectedSiteRoot) {
        throw new Error(`Cannot detect SharePoint site root from backup folder: ${normalizedFolder}`);
    }

    const escapedFolder = escapeODataString(normalizedFolder);
    const endpoint =
        `${buildSiteApiUrl(detectedSiteRoot, '')}` +
        `/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')/Files` +
        `?$select=Name,ServerRelativeUrl,Length,TimeCreated,TimeLastModified&$orderby=Name asc`;

    const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: ODATA_ACCEPT,
        },
    });

    if (response.status === 404) {
        return [];
    }

    if (!response.ok) {
        const errorText = summarizeErrorText(await responseTextSafe(response));
        throw new Error(`Failed to read backup files (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const files = parseODataResults(data, 'Files');

    const mappedFiles = asArray(files).map((file) => {
        const serverRelativeUrl = toPathname(file?.ServerRelativeUrl || '');
        const sizeBytes = Number(file?.Length ?? 0);
        return {
            name: String(file?.Name ?? '').trim(),
            serverRelativeUrl,
            url: toSharePointAbsoluteUrl(serverRelativeUrl),
            sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
            timeCreated: file?.TimeCreated || null,
            timeLastModified: file?.TimeLastModified || null,
        };
    });
    return includeManifest
        ? mappedFiles
        : mappedFiles.filter((file) => file.name !== 'backup-manifest.txt');
};

export const listSharePointBackups = async ({ includeFiles = true } = {}) => {
    const backupBaseFolder = `${SHAREPOINT_PATHS.siteAssetsRoot}/Backups`;
    const normalizedBackupBaseFolder = toPathname(backupBaseFolder);
    const siteRoot =
        resolveApiSiteRoot(normalizedBackupBaseFolder)
        || extractSiteRootFromPath(normalizedBackupBaseFolder).siteRoot;

    if (!siteRoot) {
        throw new Error(`Cannot detect SharePoint site root from backup path: ${normalizedBackupBaseFolder}`);
    }

    const escapedFolder = escapeODataString(normalizedBackupBaseFolder);
    const endpoint =
        `${buildSiteApiUrl(siteRoot, '')}` +
        `/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')/Folders` +
        `?$select=Name,ServerRelativeUrl,TimeCreated,TimeLastModified,ItemCount&$orderby=TimeLastModified desc&$top=200`;

    const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: ODATA_ACCEPT,
        },
    });

    if (response.status === 404) {
        return {
            baseFolderPath: normalizedBackupBaseFolder,
            baseFolderUrl: toSharePointAbsoluteUrl(normalizedBackupBaseFolder),
            backups: [],
        };
    }

    if (!response.ok) {
        const errorText = summarizeErrorText(await responseTextSafe(response));
        throw new Error(`Failed to read backups folder (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const folders = parseODataResults(data, 'Folders');
    const backupFolders = asArray(folders)
        .map((folder) => {
            const serverRelativeUrl = toPathname(folder?.ServerRelativeUrl || '');
            return {
                name: String(folder?.Name ?? '').trim(),
                serverRelativeUrl,
                url: toSharePointAbsoluteUrl(serverRelativeUrl),
                timeCreated: folder?.TimeCreated || null,
                timeLastModified: folder?.TimeLastModified || null,
                itemCount: Number(folder?.ItemCount ?? 0),
            };
        })
        .filter((folder) => folder.name.toLowerCase().startsWith('backup-'));

    const backups = await Promise.all(
        backupFolders.map(async (folder) => {
            let files = [];
            if (includeFiles) {
                try {
                    files = await listSharePointBackupFiles(folder.serverRelativeUrl, {
                        siteRoot,
                        includeManifest: true,
                    });
                } catch (error) {
                    spLog.warn(`לא ניתן לקרוא קבצים מתיקיית גיבוי "${folder.name}"`, error);
                }
            }
            const manifestFile = files.find((file) => file.name === 'backup-manifest.txt');
            let manifest = null;
            if (manifestFile?.serverRelativeUrl) {
                try {
                    const parsed = JSON.parse(await readBackupTextNoStore(manifestFile.serverRelativeUrl));
                    if (parsed?.kind === 'bihs-txt-backup-manifest') manifest = parsed;
                } catch (error) {
                    spLog.warn(`מניפסט הגיבוי "${folder.name}" אינו תקין`, error);
                }
            }
            const dataFiles = files.filter((file) => file.name !== 'backup-manifest.txt');
            const totalSizeBytes = dataFiles.reduce((sum, file) => sum + (Number(file?.sizeBytes) || 0), 0);
            return {
                ...folder,
                status: manifest?.status || (manifestFile ? 'partial' : 'legacy'),
                manifest,
                files: dataFiles,
                fileCount: includeFiles ? dataFiles.length : Math.max(0, folder.itemCount),
                totalSizeBytes,
            };
        }),
    );

    backups.sort((a, b) => {
        const aTs = Date.parse(String(a?.timeLastModified ?? a?.timeCreated ?? ''));
        const bTs = Date.parse(String(b?.timeLastModified ?? b?.timeCreated ?? ''));
        const aScore = Number.isFinite(aTs) ? aTs : 0;
        const bScore = Number.isFinite(bTs) ? bTs : 0;
        return bScore - aScore;
    });

    return {
        baseFolderPath: normalizedBackupBaseFolder,
        baseFolderUrl: toSharePointAbsoluteUrl(normalizedBackupBaseFolder),
        backups,
    };
};

export const deleteSharePointBackup = async (backupFolderServerRelativeUrl) => {
    const normalizedFolder = toPathname(backupFolderServerRelativeUrl);
    if (!normalizedFolder) {
        throw new Error('Missing backup folder path');
    }

    const siteRoot = resolveApiSiteRoot(normalizedFolder) || extractSiteRootFromPath(normalizedFolder).siteRoot;
    if (!siteRoot) {
        throw new Error(`Cannot detect SharePoint site root from backup folder: ${normalizedFolder}`);
    }

    const digest = await getRequestDigest(siteRoot);
    const escapedFolder = escapeODataString(normalizedFolder);
    const endpoint = `${buildSiteApiUrl(siteRoot, '')}/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')`;

    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
            'X-RequestDigest': digest,
            'IF-MATCH': '*',
            'X-HTTP-Method': 'DELETE',
        },
    });

    if (response.ok || response.status === 404) {
        return { success: true };
    }

    const errorText = summarizeErrorText(await responseTextSafe(response));
    throw new Error(`Failed to delete backup (${response.status}): ${errorText}`);
};

/**
 * Ensures there is at least one backup in the last `maxAgeMs`.
 * If not, triggers an immediate backup.
 */
export const ensureRecentBackup = async ({
    maxAgeMs = 24 * 60 * 60 * 1000,
    trigger = 'auto-login',
    onProgress = null,
} = {}) => {
    try {
        const latestBackupTimestamp = await readLatestBackupTimestamp();
        const now = Date.now();

        if (Number.isFinite(latestBackupTimestamp)) {
            const ageMs = now - latestBackupTimestamp;
            if (ageMs <= maxAgeMs) {
                spLog.system(
                    `נמצא גיבוי עדכני (${new Date(latestBackupTimestamp).toLocaleString('he-IL')}) — אין צורך בגיבוי נוסף כרגע.`
                );
                return {
                    hasRecentBackup: true,
                    attemptedBackup: false,
                    performedBackup: false,
                    latestBackupAt: new Date(latestBackupTimestamp).toISOString(),
                    backupResult: null,
                };
            }
        }

        const maxAgeHours = Math.round(maxAgeMs / (60 * 60 * 1000));
        spLog.warn(`לא נמצא גיבוי ב-${maxAgeHours} השעות האחרונות — מתחיל גיבוי אוטומטי.`);
        const backupResult = await createBackup({
            trigger,
            onProgress,
        });

        if (backupResult?.success) {
            return {
                hasRecentBackup: false,
                attemptedBackup: true,
                performedBackup: true,
                latestBackupAt: new Date().toISOString(),
                backupFolderPath: backupResult.backupFolderPath,
                backupFolderUrl: backupResult.backupFolderUrl,
                backupResult,
            };
        }

        return {
            hasRecentBackup: false,
            attemptedBackup: true,
            performedBackup: false,
            latestBackupAt: Number.isFinite(latestBackupTimestamp)
                ? new Date(latestBackupTimestamp).toISOString()
                : null,
            backupResult,
        };
    } catch (error) {
        spLog.error('שגיאה בבדיקת גיבוי אוטומטית:', error);
        return {
            hasRecentBackup: false,
            attemptedBackup: false,
            performedBackup: false,
            latestBackupAt: null,
            error: error?.message || String(error),
            backupResult: null,
        };
    }
};

const createAssetContentVersion = (arrayBuffer) => {
    const bytes = new Uint8Array(arrayBuffer);
    // A content-derived FNV-1a value is a cache version, not a security hash.
    // It is deterministic for the uploaded bytes and remains out of config.
    let hash = 2166136261;
    bytes.forEach((byte) => {
        hash ^= byte;
        hash = Math.imul(hash, 16777619);
    });
    return (hash >>> 0).toString(36);
};

/**
 * Uploads an image file. In mock mode, converts to Base64 data URL.
 * In production, uploads to SharePoint under the runtime images root.
 */
export const uploadImage = async (file, categoryFolder) => {
    if (!file) throw new Error('לא סופק קובץ להעלאה');

    if (isKasharDemoProfile()) {
        const [{ kasharAssetStore }, { default: kasharDraftStore }] = await Promise.all([
            import('../services/KasharAssetStore'),
            import('../services/KasharDraftStore'),
        ]);
        return kasharDraftStore.runExclusive(async () => (
            (await kasharAssetStore.put(file, { category: categoryFolder })).reference
        ));
    }

    if (SHAREPOINT_CONFIG.useMock) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const MAX_SIZE = 400;

                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/webp', 0.6));
                };
                img.onerror = () => reject(new Error('שגיאה בטעינת התמונה לדחיסה'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('שגיאה בקריאת הקובץ'));
            reader.readAsDataURL(file);
        });
    }

    const category = String(categoryFolder || '').trim().normalize('NFC');
    if (!category || category === '.' || category === '..' || /[/\\]/.test(category)) {
        throw new Error('קטגוריית התמונות אינה תקינה. לא בוצעה העלאה.');
    }
    const targetFolder = `${normalizeServerRelativeUrl(getImageBaseFolder())}/${category}`;
    const siteUrl = resolveApiSiteRoot(targetFolder);
    spLog.file(`מעלה תמונה ל-SharePoint | תיקייה: ${targetFolder} | קובץ: ${file.name}`);

    const arrayBuffer = await file.arrayBuffer();
    const assetContentVersion = createAssetContentVersion(arrayBuffer);
    const digest = await getRequestDigest(siteUrl);
    let upload;
    try {
        upload = await uploadSharePointFileBytes({
            webUrl: buildSiteApiUrl(siteUrl, ''),
            siteRoot: siteUrl,
            folderRel: targetFolder,
            fileName: file.name,
            bytes: arrayBuffer,
            libraries: getConfiguredSharePointLibraries(),
            digest,
            request: browserSharePointRequest,
            log: (message) => spLog.file(message),
            contentType: String(file.type || 'application/octet-stream'),
            refreshDigest: () => getRequestDigest(siteUrl, { forceRefresh: true }),
        });
    } catch (error) {
        if (error instanceof SharePointBrowserFilesystemError) {
            throw mapFilesystemErrorToHebrew(error, 'העלאת התמונה');
        }
        throw error;
    }
    const url = normalizeServerRelativeUrl(upload?.fileRel);
    if (!url) {
        throw new Error('SharePoint לא אימת את נתיב התמונה שהועלתה. הערך הקודם נשמר; יש לנסות שוב.');
    }
    const { rememberSiteImageVersion } = await import('./assetUrl');
    rememberSiteImageVersion(url, assetContentVersion);
    spLog.success(`העלאת תמונה הצליחה | נתיב: ${url}`);
    return url;
};

/** Preserves a feature's legacy inline-image behavior outside Kashar. */
export const uploadImageWithLocalFallback = async (file, categoryFolder, localFallback) => {
    if (isKasharDemoProfile()) return uploadImage(file, categoryFolder);
    return localFallback(file);
};
