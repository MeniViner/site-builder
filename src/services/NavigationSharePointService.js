import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import {
    createSharePointProvisioningSession,
    provisionSharePointDocumentLibrary,
} from './sharePointDocumentLibrariesSetup';
import {
    ensureSharePointFolder,
    normalizeSharePointPath,
    probeSharePointFolder,
    sameSharePointPath,
} from '../utils/sharePointBrowserFilesystem';
import { resolveCurrentSharePointWebUrl } from '../utils/resolveCurrentSharePointWebUrl';
import {
    NAVIGATION_MAX_FOLDER_DEPTH,
    NAVIGATION_MAX_LEVEL,
    NAVIGATION_TARGET_KINDS,
    NAVIGATION_TARGET_MODES,
    getNavigationBindingFolderDepth,
    normalizeNavigationTargetBinding,
} from '../utils/navigationModel';

/**
 * Characters SharePoint rejects (or that break server-relative OData paths) in a
 * library/folder name. Names containing them are rejected with a clear message
 * instead of being silently rewritten, so the physical target always matches
 * exactly what the user typed.
 */
const SHAREPOINT_ILLEGAL_NAME_CHARACTERS = Object.freeze(['~', '"', '#', '%', '&', '*', ':', '<', '>', '?', '/', '\\', '{', '|', '}']);

/** Names SharePoint reserves inside a web or a document library. */
const SHAREPOINT_RESERVED_NAMES = new Set(['forms', 'lists', '_catalogs', '_private', '_vti_pvt', 'appdata', 'appfiles']);

export class NavigationSharePointProvisioningError extends Error {
    constructor(code, userMessage, cause = null, details = {}) {
        super(userMessage, cause ? { cause } : undefined);
        this.name = 'NavigationSharePointProvisioningError';
        this.code = code;
        this.userMessage = userMessage;
        this.details = Object.freeze({ ...details });
        /**
         * True only when a mutating SharePoint call (library creation / folder
         * creation) was actually reached. Callers must not treat a failure that
         * changed nothing as an attempt worth retrying idempotently.
         */
        this.mutationAttempted = false;
    }
}

function normalizeGuid(value) {
    return String(value || '').trim().replace(/^{|}$/g, '').toLowerCase();
}

function isStrictlyInside(childPath, parentPath) {
    const child = normalizeSharePointPath(childPath);
    const parent = normalizeSharePointPath(parentPath);
    if (!child || !parent) return false;
    return child.toLowerCase().startsWith(`${parent.toLowerCase()}/`);
}

/**
 * Validates a navigation display name for direct use as a physical SharePoint
 * library/folder name. Hebrew, spaces and other legal characters are preserved
 * verbatim; nothing is transliterated, slugged or suffixed.
 */
export function validateSharePointNavigationName(value) {
    const name = String(value || '').trim().replace(/\s+/g, ' ').normalize('NFC');
    if (!name) {
        throw new NavigationSharePointProvisioningError('INVALID_NAME', 'יש להזין שם לפני יצירת היעד ב-SharePoint.');
    }
    if (name.length > 128) {
        throw new NavigationSharePointProvisioningError('INVALID_NAME', 'השם ארוך מדי. ניתן להזין עד 128 תווים.');
    }
    const hasControlCharacter = [...name].some((character) => {
        const codePoint = character.codePointAt(0);
        return codePoint < 32 || codePoint === 127;
    });
    if (hasControlCharacter) {
        throw new NavigationSharePointProvisioningError('INVALID_NAME', 'השם כולל תווי בקרה שאינם נתמכים ב-SharePoint. יש לבחור שם אחר.');
    }
    const illegalCharacters = [...new Set([...name].filter((character) => SHAREPOINT_ILLEGAL_NAME_CHARACTERS.includes(character)))];
    if (illegalCharacters.length > 0) {
        throw new NavigationSharePointProvisioningError(
            'INVALID_NAME',
            `השם כולל תווים שאינם נתמכים ב-SharePoint: ${illegalCharacters.join(' ')} — יש להסיר אותם ולנסות שוב.`,
            null,
            { illegalCharacters },
        );
    }
    if (name.startsWith('.') || name.endsWith('.')) {
        throw new NavigationSharePointProvisioningError('INVALID_NAME', 'שם היעד ב-SharePoint לא יכול להתחיל או להסתיים בנקודה.');
    }
    if (SHAREPOINT_RESERVED_NAMES.has(name.toLowerCase()) || /^_vti_/i.test(name)) {
        throw new NavigationSharePointProvisioningError('INVALID_NAME', 'השם שמור לשימוש פנימי של SharePoint. יש לבחור שם אחר.');
    }
    return name;
}

/**
 * The physical SharePoint path segment for a navigation target. It is exactly
 * the validated display name — no target kind, fingerprint, hash, UUID or
 * numeric suffix is ever appended.
 */
export function buildSharePointNavigationSegment(displayName) {
    return validateSharePointNavigationName(displayName);
}

export function buildNavigationProvisionKey({ displayName, targetKind, parentBinding = null }) {
    const name = validateSharePointNavigationName(displayName).toLocaleLowerCase('he');
    const kind = targetKind === NAVIGATION_TARGET_KINDS.FOLDER
        ? NAVIGATION_TARGET_KINDS.FOLDER
        : NAVIGATION_TARGET_KINDS.LIBRARY;
    if (kind === NAVIGATION_TARGET_KINDS.LIBRARY) return `library:${name}`;

    const binding = normalizeNavigationTargetBinding(parentBinding);
    const libraryIdentity = normalizeGuid(binding?.listId)
        || normalizeSharePointPath(binding?.libraryRootServerRelativeUrl).toLowerCase();
    // The immediate parent must take part in the key so that two different
    // level-2 folders can each hold a level-3 folder with the same name.
    const parentIdentity = normalizeSharePointPath(binding?.serverRelativeUrl).toLowerCase();
    if (!libraryIdentity || !parentIdentity) {
        throw new NavigationSharePointProvisioningError(
            'INVALID_PARENT_BINDING',
            'לא ניתן ליצור תיקייה אוטומטית ללא זהות יציבה של יעד האב.',
        );
    }
    return `folder:${libraryIdentity}:${parentIdentity}:${name}`;
}

function resolveCurrentWebIdentity() {
    const siteRoot = normalizeSharePointPath(SHAREPOINT_PATHS.siteRoot);
    const currentWebUrl = resolveCurrentSharePointWebUrl();
    let currentPath = '';
    try {
        currentPath = normalizeSharePointPath(new URL(currentWebUrl, window.location.origin).pathname);
    } catch {
        currentPath = normalizeSharePointPath(currentWebUrl);
    }
    if (!siteRoot || !sameSharePointPath(currentPath, siteRoot)) {
        throw new NavigationSharePointProvisioningError(
            'SHAREPOINT_WEB_MISMATCH',
            'לא ניתן ליצור יעד אוטומטי: האתר הנוכחי אינו תואם לאתר SharePoint שהוגדר למערכת.',
            null,
            { currentWebUrl, currentPath, siteRoot },
        );
    }
    return { siteRoot, currentWebUrl };
}

export const NAVIGATION_COLLISION_MESSAGES = Object.freeze({
    [NAVIGATION_TARGET_KINDS.LIBRARY]: 'כבר קיימת ספריית מסמכים בשם הזה במיקום שנבחר. יש לבחור שם אחר או לקשר ליעד הקיים.',
    [NAVIGATION_TARGET_KINDS.FOLDER]: 'כבר קיימת תיקייה בשם הזה במיקום שנבחר. יש לבחור שם אחר או לקשר ליעד הקיים.',
});

export const NAVIGATION_COLLISION_CODES = Object.freeze({
    [NAVIGATION_TARGET_KINDS.LIBRARY]: 'SHAREPOINT_LIBRARY_ALREADY_EXISTS',
    [NAVIGATION_TARGET_KINDS.FOLDER]: 'SHAREPOINT_FOLDER_ALREADY_EXISTS',
});

function classifyProvisioningError(error, mutationAttempted = false) {
    const classified = toProvisioningError(error);
    classified.mutationAttempted = Boolean(mutationAttempted) || Boolean(error?.mutationAttempted);
    return classified;
}

function toProvisioningError(error) {
    if (error instanceof NavigationSharePointProvisioningError) return error;
    const status = Number(error?.status || error?.details?.status || error?.details?.lastProbe?.status || 0);
    const code = String(error?.code || '');
    const technicalMessage = [
        error?.message,
        error?.cause?.message,
        error?.details?.message,
    ].filter(Boolean).join(' ');
    if (status === 401
        || status === 403
        || code === 'SHAREPOINT_AUTH_FAILURE'
        || /access denied|unauthorized|forbidden|permission denied|אין הרשאה/i.test(technicalMessage)) {
        return new NavigationSharePointProvisioningError(
            'SHAREPOINT_AUTH_FAILURE',
            'יצירת ספרייה או תיקייה דורשת הרשאת ניהול מתאימה ב-SharePoint. ניתן לעבור ליעד קיים/ידני.',
            error,
        );
    }
    if (/invalid.+name|name.+invalid|not a valid.+name/i.test(technicalMessage)) {
        return new NavigationSharePointProvisioningError(
            'INVALID_NAME',
            'SharePoint דחה את שם היעד. יש לבחור שם אחר ללא תווים מיוחדים.',
            error,
        );
    }
    if (code === 'LIBRARY_URL_COLLISION' || code === 'LIBRARY_EXISTS_NOT_DOCUMENT_LIBRARY') {
        return new NavigationSharePointProvisioningError(
            code,
            NAVIGATION_COLLISION_MESSAGES[NAVIGATION_TARGET_KINDS.LIBRARY],
            error,
        );
    }
    if (code === 'FOLDER_OUTSIDE_CONFIGURED_LIBRARIES') {
        return new NavigationSharePointProvisioningError(
            code,
            'תיקיית היעד אינה נמצאת בתוך ספריית המסמכים המאומתת של הקטגוריה.',
            error,
        );
    }
    return new NavigationSharePointProvisioningError(
        code || 'SHAREPOINT_PROVISIONING_FAILED',
        'יצירת היעד ב-SharePoint נכשלה. יש לבדוק הרשאות וחיבור ולנסות שוב, או לעבור ליעד קיים/ידני.',
        error,
    );
}

function assertProbeAuthorized(probe, message) {
    if (probe?.status === 401 || probe?.status === 403) {
        throw Object.assign(new Error(message), { status: probe.status });
    }
}

/**
 * A retry is only idempotent when the caller already holds a binding that the
 * app itself previously marked verified for the exact same physical path and
 * the exact same probed list identity, or when the same creation attempt is
 * being repeated with the same provision key after a call that already reached
 * SharePoint's mutating APIs.
 *
 * `state` is read from the raw binding on purpose: normalization canonicalizes
 * every SharePoint binding to `state: 'verified'`, so reading it post-normalize
 * would make this check a tautology.
 */
function isVerifiedIdempotentRetry({ existingBinding, expectedPath, provisionKey, retryOfProvisionKey, listId = '' }) {
    const binding = normalizeNavigationTargetBinding(existingBinding);
    if (String(existingBinding?.state || '').trim() === 'verified'
        && binding
        && binding.mode === NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO
        && sameSharePointPath(binding.serverRelativeUrl, expectedPath)
        && normalizeGuid(listId)
        && normalizeGuid(binding.listId) === normalizeGuid(listId)) {
        return true;
    }
    const retryKey = String(retryOfProvisionKey || '').trim();
    return Boolean(retryKey && retryKey === String(provisionKey || '').trim());
}

function throwTargetCollision(targetKind, details) {
    throw new NavigationSharePointProvisioningError(
        NAVIGATION_COLLISION_CODES[targetKind],
        NAVIGATION_COLLISION_MESSAGES[targetKind],
        null,
        details,
    );
}

export function createNavigationSharePointService(dependencies = {}) {
    const createSession = dependencies.createSession || createSharePointProvisioningSession;
    const provisionLibrary = dependencies.provisionLibrary || provisionSharePointDocumentLibrary;
    const ensureFolder = dependencies.ensureFolder || ensureSharePointFolder;
    const probeFolder = dependencies.probeFolder || probeSharePointFolder;
    const resolveWebIdentity = dependencies.resolveWebIdentity || resolveCurrentWebIdentity;

    /**
     * Level 2 and level 3 share one provisioning path: a real SharePoint folder
     * created directly inside a verified parent, which is either the level-1
     * document library root or a verified level-2 folder within that same library.
     */
    async function provisionChildFolder({
        displayName,
        provisionKey,
        parentBinding,
        existingBinding = null,
        retryOfProvisionKey = '',
    }, attempt = { mutated: false }) {
        const name = validateSharePointNavigationName(displayName);
        const binding = normalizeNavigationTargetBinding(parentBinding);
        if (!binding
            || binding.mode !== NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO
            || String(parentBinding?.state || '').trim() !== 'verified'
            || !binding.libraryTitle
            || !binding.listId
            || !binding.libraryRootServerRelativeUrl
            || !binding.serverRelativeUrl) {
            throw new NavigationSharePointProvisioningError(
                'INVALID_SHAREPOINT_PARENT',
                'יצירת תיקייה אוטומטית זמינה רק בתוך יעד SharePoint אוטומטי מאומת.',
            );
        }

        const parentIsLibraryRoot = binding.targetKind === NAVIGATION_TARGET_KINDS.LIBRARY;
        // listId stays the authoritative library identity; the immediate parent
        // may be the library root or a nested folder inside it, never both.
        const parentDepth = getNavigationBindingFolderDepth(binding);
        if (parentIsLibraryRoot
            ? !sameSharePointPath(binding.serverRelativeUrl, binding.libraryRootServerRelativeUrl)
            : !isStrictlyInside(binding.serverRelativeUrl, binding.libraryRootServerRelativeUrl)) {
            throw new NavigationSharePointProvisioningError(
                'SHAREPOINT_PARENT_OUTSIDE_LIBRARY',
                'יעד האב אינו נמצא בתוך ספריית המסמכים המאומתת שלו. התיקייה לא נוצרה.',
                null,
                { binding },
            );
        }
        if (parentDepth < 0 || parentDepth >= NAVIGATION_MAX_FOLDER_DEPTH) {
            throw new NavigationSharePointProvisioningError(
                'NAVIGATION_DEPTH_EXCEEDED',
                `מבנה הניווט תומך ב-${NAVIGATION_MAX_LEVEL} רמות בלבד, ולכן לא ניתן ליצור תיקייה נוספת מתחת ליעד זה.`,
                null,
                { parentDepth, maxFolderDepth: NAVIGATION_MAX_FOLDER_DEPTH },
            );
        }

        const { siteRoot, currentWebUrl } = resolveWebIdentity();
        if (!isStrictlyInside(binding.libraryRootServerRelativeUrl, siteRoot)) {
            throw new NavigationSharePointProvisioningError(
                'SHAREPOINT_PARENT_OUTSIDE_CURRENT_WEB',
                'ספריית האב אינה שייכת לאתר SharePoint הנוכחי.',
            );
        }

        const libraries = [{ title: binding.libraryTitle, rootRel: binding.libraryRootServerRelativeUrl }];
        const session = await createSession({ siteRoot });

        const libraryProbe = await probeFolder({
            webUrl: currentWebUrl,
            folderRel: binding.libraryRootServerRelativeUrl,
            libraries,
            request: session.request,
            purpose: 'navigation-parent-library-verification',
        });
        assertProbeAuthorized(libraryProbe, 'SharePoint parent-library access denied.');
        if (!libraryProbe.ready || normalizeGuid(libraryProbe.id) !== normalizeGuid(binding.listId)) {
            throw new NavigationSharePointProvisioningError(
                'SHAREPOINT_PARENT_IDENTITY_MISMATCH',
                'זהות ספריית האב ב-SharePoint אינה תואמת לקישור השמור. התיקייה לא נוצרה.',
                null,
                { parentProbe: libraryProbe, binding },
            );
        }

        if (!parentIsLibraryRoot) {
            const parentFolderProbe = await probeFolder({
                webUrl: currentWebUrl,
                folderRel: binding.serverRelativeUrl,
                libraries,
                request: session.request,
                purpose: 'navigation-parent-folder-verification',
            });
            assertProbeAuthorized(parentFolderProbe, 'SharePoint parent-folder access denied.');
            if (!parentFolderProbe.ready) {
                throw new NavigationSharePointProvisioningError(
                    'SHAREPOINT_PARENT_FOLDER_NOT_READY',
                    'תיקיית האב ב-SharePoint אינה קיימת או אינה מוכנה. התיקייה לא נוצרה.',
                    null,
                    { parentProbe: parentFolderProbe, binding },
                );
            }
        }

        const folderPath = normalizeSharePointPath(`${binding.serverRelativeUrl}/${buildSharePointNavigationSegment(name)}`);
        if (!isStrictlyInside(folderPath, binding.serverRelativeUrl)
            || !isStrictlyInside(folderPath, binding.libraryRootServerRelativeUrl)) {
            throw new NavigationSharePointProvisioningError(
                'SHAREPOINT_TARGET_ESCAPES_PARENT',
                'נתיב התיקייה שנוצר חורג מתיקיית האב המאומתת. התיקייה לא נוצרה.',
                null,
                { folderPath, binding },
            );
        }

        const collisionProbe = await probeFolder({
            webUrl: currentWebUrl,
            folderRel: folderPath,
            libraries,
            request: session.request,
            purpose: 'navigation-folder-collision-check',
        });
        assertProbeAuthorized(collisionProbe, 'SharePoint folder collision check access denied.');
        if (collisionProbe.exists && !isVerifiedIdempotentRetry({
            existingBinding,
            expectedPath: folderPath,
            provisionKey,
            retryOfProvisionKey,
            listId: binding.listId,
        })) {
            throwTargetCollision(NAVIGATION_TARGET_KINDS.FOLDER, { folderPath, collisionProbe });
        }

        attempt.mutated = true;
        const folder = await ensureFolder({
            webUrl: currentWebUrl,
            siteRoot,
            folderRel: folderPath,
            libraries,
            digest: session.digest,
            request: session.request,
        });
        if (!folder?.probe?.ready || !sameSharePointPath(folder.path, folderPath)) {
            throw new NavigationSharePointProvisioningError(
                'FOLDER_VERIFICATION_FAILED',
                'התיקייה נוצרה אך לא עברה בדיקת מוכנות מלאה. פריט הניווט לא נשמר.',
                null,
                { folder, folderPath },
            );
        }
        const targetBinding = normalizeNavigationTargetBinding({
            mode: NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO,
            targetKind: NAVIGATION_TARGET_KINDS.FOLDER,
            state: 'verified',
            serverRelativeUrl: folderPath,
            listId: binding.listId,
            libraryTitle: binding.libraryTitle,
            libraryRootServerRelativeUrl: binding.libraryRootServerRelativeUrl,
            parentServerRelativeUrl: binding.serverRelativeUrl,
            physicalName: name,
            provisionKey,
        });
        if (!targetBinding) throw new Error('Verified folder binding could not be normalized.');
        return { url: targetBinding.serverRelativeUrl, targetBinding, provisioning: folder };
    }

    return Object.freeze({
        async provisionCategory({ displayName, provisionKey, existingBinding = null, retryOfProvisionKey = '' }) {
            const attempt = { mutated: false };
            try {
                const name = validateSharePointNavigationName(displayName);
                const { siteRoot, currentWebUrl } = resolveWebIdentity();
                const rootServerRelativeUrl = normalizeSharePointPath(
                    `${siteRoot}/${buildSharePointNavigationSegment(name)}`
                );
                const session = await createSession({ siteRoot });

                const libraries = [{ title: name, rootRel: rootServerRelativeUrl }];
                const collisionProbe = await probeFolder({
                    webUrl: currentWebUrl,
                    folderRel: rootServerRelativeUrl,
                    libraries,
                    request: session.request,
                    purpose: 'navigation-library-collision-check',
                });
                assertProbeAuthorized(collisionProbe, 'SharePoint library collision check access denied.');
                if (collisionProbe.exists && !isVerifiedIdempotentRetry({
                    existingBinding,
                    expectedPath: rootServerRelativeUrl,
                    provisionKey,
                    retryOfProvisionKey,
                    listId: collisionProbe.id,
                })) {
                    throwTargetCollision(NAVIGATION_TARGET_KINDS.LIBRARY, { rootServerRelativeUrl, collisionProbe });
                }

                attempt.mutated = true;
                const library = await provisionLibrary({
                    session,
                    title: name,
                    rootServerRelativeUrl,
                    description: `Site Builder navigation library: ${name}`,
                });
                if (library.baseTemplate !== 101
                    || !library.listId
                    || !sameSharePointPath(library.rootServerRelativeUrl, rootServerRelativeUrl)
                    || library.welcomePage !== 'Forms/AllItems.aspx'
                    || library.onQuickLaunch !== true) {
                    throw new NavigationSharePointProvisioningError(
                        'LIBRARY_VERIFICATION_FAILED',
                        'ספריית המסמכים נוצרה אך לא עברה את בדיקות התקינות. פריט הניווט לא נשמר.',
                        null,
                        { library, rootServerRelativeUrl },
                    );
                }
                const targetBinding = normalizeNavigationTargetBinding({
                    mode: NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO,
                    targetKind: NAVIGATION_TARGET_KINDS.LIBRARY,
                    state: 'verified',
                    serverRelativeUrl: library.rootServerRelativeUrl,
                    listId: library.listId,
                    libraryTitle: library.title,
                    libraryRootServerRelativeUrl: library.rootServerRelativeUrl,
                    physicalName: name,
                    provisionKey,
                });
                if (!targetBinding) throw new Error('Verified library binding could not be normalized.');
                return { url: targetBinding.serverRelativeUrl, targetBinding, provisioning: library };
            } catch (error) {
                throw classifyProvisioningError(error, attempt.mutated);
            }
        },

        /** Level 3 — a nested folder inside a verified level-2 folder. */
        async provisionNestedFolder(options) {
            const attempt = { mutated: false };
            try {
                return await provisionChildFolder(options, attempt);
            } catch (error) {
                throw classifyProvisioningError(error, attempt.mutated);
            }
        },

        /** Level 2 — a folder directly inside the level-1 category library. */
        async provisionSubcategory(options) {
            const attempt = { mutated: false };
            try {
                return await provisionChildFolder(options, attempt);
            } catch (error) {
                throw classifyProvisioningError(error, attempt.mutated);
            }
        },
    });
}

export const navigationSharePointService = createNavigationSharePointService();

export default navigationSharePointService;
