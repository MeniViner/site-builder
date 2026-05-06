// src/utils/sharepointUtils.js
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import { spLog, spLogDigestCache } from './spAppLog';

const requestDigestCache = new Map();
const CACHE_EXPIRATION_MS = 25 * 60 * 1000; // 25 minutes (SharePoint digest ~30m)

const IMAGE_BASE_FOLDER = import.meta.env.VITE_SP_IMAGE_BASE_FOLDER || SHAREPOINT_PATHS.imageBaseFolderServerRelativeUrl;
const RAW_SITE_API_ROOT =
    import.meta.env.VITE_SP_SITE_API_ROOT ||
    import.meta.env.VITE_SP_SITE_ROOT ||
    SHAREPOINT_PATHS.siteApiRoot;
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
    const configured = toPathname(RAW_SITE_API_ROOT);
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

const ensureSharePointFolder = async (folderServerRelativeUrl, digest, siteRoot) => {
    const endpoint = buildSiteApiUrl(siteRoot, '/_api/web/folders');
    const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
            'X-RequestDigest': digest,
        },
        body: JSON.stringify({
            __metadata: { type: 'SP.Folder' },
            ServerRelativeUrl: folderServerRelativeUrl,
        }),
    });

    if (response.ok || response.status === 409) {
        return;
    }

    const errorText = summarizeErrorText(await responseTextSafe(response));
    const alreadyExists = response.status === 500 && /already exists/i.test(errorText);
    if (alreadyExists) {
        return;
    }

    throw new Error(`Failed to create folder "${folderServerRelativeUrl}" (${response.status}): ${errorText}`);
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

/**
 * Ensures a full SharePoint folder path exists (creates missing folders in order).
 */
export const ensureSharePointFolderHierarchy = async (folderServerRelativeUrl, digest = null) => {
    const normalizedFolder = normalizeServerRelativeUrl(folderServerRelativeUrl);
    if (!normalizedFolder) {
        throw new Error('ensureSharePointFolderHierarchy expects a valid folder URL');
    }

    const { siteRoot, folderSegments } = buildFolderCreationPlan(normalizedFolder);
    if (folderSegments.length === 0) return;

    const digestValue = digest || await getRequestDigest(siteRoot);
    let currentPath = siteRoot || '';

    for (const segment of folderSegments) {
        currentPath = `${currentPath}/${segment}`;
        await ensureSharePointFolder(currentPath, digestValue, siteRoot);
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
export const getRequestDigest = async (scope = '') => {
    const siteRoot = resolveApiSiteRoot(scope);
    const cacheKey = siteRoot || ROOT_CACHE_KEY;
    const now = Date.now();
    const cached = requestDigestCache.get(cacheKey);

    if (cached && now - cached.time < CACHE_EXPIRATION_MS) {
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

/**
 * Creates a backup folder and copies data files into it.
 */
export const createBackup = async (options = {}) => {
    const {
        filesToBackup: requestedFiles = [],
        onProgress = null,
        trigger = 'manual',
    } = normalizeCreateBackupOptions(options);

    try {
        spLog.boot('מתחיל גיבוי מערכת ל-SharePoint...');
        const filesToBackup = Array.isArray(requestedFiles) && requestedFiles.length > 0
            ? requestedFiles
            : [
                SHAREPOINT_CONFIG.fileServerRelativeUrl,
                SHAREPOINT_CONFIG.navFileServerRelativeUrl,
                SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl,
                SHAREPOINT_CONFIG.themeFileServerRelativeUrl,
                SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl,
                SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl,
                SHAREPOINT_CONFIG.usersFileServerRelativeUrl,
            ];
        const totalFiles = filesToBackup.length;

        emitBackupProgress(onProgress, {
            stage: 'start',
            trigger,
            percent: 5,
            message: 'מתחיל גיבוי...',
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
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const backupFolderName = `backup-${timestamp}`;
        const targetFolderPath = `${backupBaseFolder}/${backupFolderName}`;
        const backupFolderUrl = toSharePointAbsoluteUrl(targetFolderPath);

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
            backupFolderPath: targetFolderPath,
            backupFolderUrl,
        });
        await ensureSharePointFolderHierarchy(targetFolderPath);
        spLog.file(`תיקיית גיבוי נוצרה/אומתה: ${targetFolderPath}`);

        let copiedFiles = 0;
        let skippedFiles = 0;
        let failedFiles = 0;

        for (let index = 0; index < filesToBackup.length; index += 1) {
            const filePath = filesToBackup[index];
            const fileName = toPathname(filePath).split('/').pop();

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
                backupFolderPath: targetFolderPath,
                backupFolderUrl,
            });

            try {
                const sourceEndpoint = buildFileValueEndpoint(filePath);
                spLog.file(`גיבוי: קורא מקור | ${sourceEndpoint}`);

                const readRes = await fetch(sourceEndpoint, {
                    method: 'GET',
                    credentials: 'include',
                    headers: { 'Content-Type': 'text/plain' },
                });

                if (!readRes.ok) {
                    if (readRes.status === 404) {
                        spLog.warn(`קובץ לא נמצא לגיבוי (מדלג): ${filePath}`);
                        skippedFiles += 1;
                        continue;
                    }
                    const readErr = summarizeErrorText(await responseTextSafe(readRes));
                    throw new Error(`שגיאה בקריאת קובץ לגיבוי (${readRes.status}): ${readErr}`);
                }

                const fileContent = await readRes.text();
                if (!fileName) continue;

                const targetFilePath = `${targetFolderPath}/${fileName}`;
                const { response: writeRes } = await upsertSharePointTextFile({
                    serverRelativeUrl: targetFilePath,
                    text: fileContent,
                    contentType: 'text/plain; charset=utf-8',
                });

                if (!writeRes.ok) {
                    spLog.error(`שגיאה בכתיבת קובץ גיבוי ${fileName}:`, writeRes.status);
                    failedFiles += 1;
                } else {
                    spLog.success(`הועתק לגיבוי: ${fileName}`);
                    copiedFiles += 1;
                }
            } catch (fileErr) {
                spLog.error(`שגיאה בגיבוי קובץ ${filePath}:`, fileErr);
                failedFiles += 1;
            } finally {
                const processedFiles = Math.min(index + 1, totalFiles);
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
                    backupFolderPath: targetFolderPath,
                    backupFolderUrl,
                });
            }
        }

        const success = failedFiles === 0;
        if (success) {
            spLog.success('גיבוי הושלם בהצלחה');
        } else {
            spLog.warn(`גיבוי הסתיים עם שגיאות | failed: ${failedFiles} | copied: ${copiedFiles} | skipped: ${skippedFiles}`);
        }

        emitBackupProgress(onProgress, {
            stage: 'complete',
            trigger,
            percent: 100,
            message: success ? 'גיבוי הושלם בהצלחה' : 'גיבוי הושלם עם שגיאות',
            totalFiles,
            processedFiles: totalFiles,
            copiedFiles,
            skippedFiles,
            failedFiles,
            backupFolderPath: targetFolderPath,
            backupFolderUrl,
        });

        return {
            success,
            trigger,
            totalFiles,
            processedFiles: totalFiles,
            copiedFiles,
            skippedFiles,
            failedFiles,
            backupFolderPath: targetFolderPath,
            backupFolderUrl,
            backupFolderName,
            backupCreatedAt: now.toISOString(),
        };
    } catch (error) {
        spLog.error('שגיאה בתהליך הגיבוי:', error);
        emitBackupProgress(onProgress, {
            stage: 'failed',
            trigger,
            percent: 100,
            message: 'הגיבוי נכשל',
            error: error?.message || String(error),
        });
        return {
            success: false,
            trigger,
            error: error?.message || String(error),
            totalFiles: 0,
            processedFiles: 0,
            copiedFiles: 0,
            skippedFiles: 0,
            failedFiles: 0,
            backupFolderPath: '',
            backupFolderUrl: '',
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
    const backupBaseFolder = `${SHAREPOINT_PATHS.siteAssetsRoot}/Backups`;
    const normalizedBackupBaseFolder = toPathname(backupBaseFolder);
    const siteRoot = resolveApiSiteRoot(normalizedBackupBaseFolder) || extractSiteRootFromPath(normalizedBackupBaseFolder).siteRoot;

    if (!siteRoot) {
        throw new Error(`Cannot detect SharePoint site root from backup path: ${normalizedBackupBaseFolder}`);
    }

    const escapedFolder = normalizedBackupBaseFolder.replace(/'/g, "''");
    const endpoint =
        `${buildSiteApiUrl(siteRoot, '')}` +
        `/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')/Folders` +
        `?$select=Name,TimeCreated,TimeLastModified&$orderby=TimeLastModified desc&$top=25`;

    const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: ODATA_ACCEPT,
        },
    });

    if (response.status === 404) {
        return null;
    }

    if (!response.ok) {
        const errorText = summarizeErrorText(await responseTextSafe(response));
        throw new Error(`Failed to read backups folder (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const folders =
        data?.d?.results
        || data?.d?.Folders?.results
        || data?.d?.Folders
        || [];

    if (!Array.isArray(folders) || folders.length === 0) {
        return null;
    }

    let latestTimestamp = null;
    for (const folder of folders) {
        const modified = Date.parse(String(folder?.TimeLastModified ?? ''));
        const created = Date.parse(String(folder?.TimeCreated ?? ''));
        const fromName = parseBackupTimestampFromName(folder?.Name);
        const candidate = [modified, created, fromName]
            .find((value) => Number.isFinite(value));

        if (!Number.isFinite(candidate)) continue;
        if (latestTimestamp === null || candidate > latestTimestamp) {
            latestTimestamp = candidate;
        }
    }

    return latestTimestamp;
};

export const listSharePointBackupFiles = async (
    backupFolderServerRelativeUrl,
    { siteRoot: providedSiteRoot = '' } = {},
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

    return asArray(files).map((file) => {
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
                    files = await listSharePointBackupFiles(folder.serverRelativeUrl, { siteRoot });
                } catch (error) {
                    spLog.warn(`לא ניתן לקרוא קבצים מתיקיית גיבוי "${folder.name}"`, error);
                }
            }
            const totalSizeBytes = files.reduce((sum, file) => sum + (Number(file?.sizeBytes) || 0), 0);
            return {
                ...folder,
                files,
                fileCount: includeFiles ? files.length : Math.max(0, folder.itemCount),
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

/**
 * Uploads an image file. In mock mode, converts to Base64 data URL.
 * In production, uploads to SharePoint under IMAGE_BASE_FOLDER/<categoryFolder>.
 */
export const uploadImage = async (file, categoryFolder) => {
    if (!file) throw new Error('לא סופק קובץ להעלאה');

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

    const targetFolder = `${normalizeServerRelativeUrl(IMAGE_BASE_FOLDER)}/${String(categoryFolder || '').trim()}`;
    const siteUrl = resolveApiSiteRoot(targetFolder);
    spLog.file(`מעלה תמונה ל-SharePoint | תיקייה: ${targetFolder} | קובץ: ${file.name}`);

    const digest = await getRequestDigest(siteUrl);
    await ensureSharePointFolderHierarchy(targetFolder, digest);

    const arrayBuffer = await file.arrayBuffer();
    const escapedFolder = targetFolder.replace(/'/g, "''");
    const encodedFileName = encodeURIComponent(file.name).replace(/'/g, '%27');
    const uploadUrl =
        `${buildSiteApiUrl(siteUrl, '')}/_api/web/GetFolderByServerRelativeUrl('${escapedFolder}')/Files/add(url='${encodedFileName}',overwrite=true)`;

    const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
            Accept: ODATA_ACCEPT,
            'X-RequestDigest': digest,
        },
        body: arrayBuffer,
    });

    spLog.file(`תגובת העלאת תמונה | status: ${uploadRes.status} ${uploadRes.statusText}`);
    if (!uploadRes.ok) {
        const errorText = summarizeErrorText(await responseTextSafe(uploadRes));
        throw new Error(`העלאת תמונה נכשלה (${uploadRes.status}): ${errorText}`);
    }

    const data = await uploadRes.json();
    const url = data?.d?.ServerRelativeUrl;
    spLog.success(`העלאת תמונה הצליחה | נתיב: ${url}`);
    return url;
};
