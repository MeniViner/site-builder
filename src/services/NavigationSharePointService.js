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
    NAVIGATION_TARGET_KINDS,
    NAVIGATION_TARGET_MODES,
    normalizeNavigationTargetBinding,
} from '../utils/navigationModel';

const ILLEGAL_PATH_CHAR_RE = new RegExp('[~"#%&*:<>?/\\\\{|}]+', 'g');

export class NavigationSharePointProvisioningError extends Error {
    constructor(code, userMessage, cause = null, details = {}) {
        super(userMessage, cause ? { cause } : undefined);
        this.name = 'NavigationSharePointProvisioningError';
        this.code = code;
        this.userMessage = userMessage;
        this.details = Object.freeze({ ...details });
    }
}

function fingerprint(value) {
    let hash = 2166136261;
    for (const character of String(value || '')) {
        hash ^= character.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(7, '0').slice(0, 7);
}

function normalizeGuid(value) {
    return String(value || '').trim().replace(/^{|}$/g, '').toLowerCase();
}

export function validateSharePointNavigationName(value) {
    const name = String(value || '').trim().replace(/\s+/g, ' ');
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
    if (hasControlCharacter || /[\\/]/.test(name)) {
        throw new NavigationSharePointProvisioningError('INVALID_NAME', 'השם כולל תווים שאינם נתמכים ב-SharePoint. יש להסיר קו נטוי או תווי בקרה.');
    }
    return name;
}

export function buildSharePointNavigationSegment(displayName, provisionKey, kind = 'target') {
    const name = validateSharePointNavigationName(displayName);
    const key = String(provisionKey || '').trim();
    if (!key) {
        throw new NavigationSharePointProvisioningError('INVALID_PROVISION_KEY', 'מזהה ההקמה חסר. יש לסגור את החלון ולנסות שוב.');
    }
    const slug = name
        .normalize('NFKC')
        .replace(ILLEGAL_PATH_CHAR_RE, '-')
        .replace(/\s+/g, '-')
        .replace(/[.-]+$/g, '')
        .replace(/^-+/g, '')
        .replace(/-+/g, '-')
        .slice(0, 52) || 'content';
    return `${slug}-${kind}-${fingerprint(key)}`;
}

export function buildNavigationProvisionKey({ displayName, targetKind, parentBinding = null }) {
    const name = validateSharePointNavigationName(displayName).normalize('NFKC').toLocaleLowerCase('he');
    const kind = targetKind === NAVIGATION_TARGET_KINDS.FOLDER
        ? NAVIGATION_TARGET_KINDS.FOLDER
        : NAVIGATION_TARGET_KINDS.LIBRARY;
    if (kind === NAVIGATION_TARGET_KINDS.LIBRARY) return `library:${name}`;

    const parentIdentity = normalizeGuid(parentBinding?.listId)
        || normalizeSharePointPath(parentBinding?.libraryRootServerRelativeUrl);
    if (!parentIdentity) {
        throw new NavigationSharePointProvisioningError(
            'INVALID_PARENT_BINDING',
            'לא ניתן ליצור תיקייה אוטומטית ללא זהות יציבה של ספריית האב.',
        );
    }
    return `folder:${parentIdentity}:${name}`;
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

function classifyProvisioningError(error) {
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
            'כבר קיים ב-SharePoint יעד עם שם או כתובת מתנגשים. יש לבחור שם אחר או להשתמש ביעד קיים.',
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

export function createNavigationSharePointService(dependencies = {}) {
    const createSession = dependencies.createSession || createSharePointProvisioningSession;
    const provisionLibrary = dependencies.provisionLibrary || provisionSharePointDocumentLibrary;
    const ensureFolder = dependencies.ensureFolder || ensureSharePointFolder;
    const probeFolder = dependencies.probeFolder || probeSharePointFolder;
    const resolveWebIdentity = dependencies.resolveWebIdentity || resolveCurrentWebIdentity;

    return Object.freeze({
        async provisionCategory({ displayName, provisionKey }) {
            try {
                const name = validateSharePointNavigationName(displayName);
                const { siteRoot } = resolveWebIdentity();
                const rootServerRelativeUrl = normalizeSharePointPath(
                    `${siteRoot}/${buildSharePointNavigationSegment(name, provisionKey, 'library')}`
                );
                const session = await createSession({ siteRoot });
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
                    provisionKey,
                });
                if (!targetBinding) throw new Error('Verified library binding could not be normalized.');
                return { url: targetBinding.serverRelativeUrl, targetBinding, provisioning: library };
            } catch (error) {
                throw classifyProvisioningError(error);
            }
        },

        async provisionSubcategory({ displayName, provisionKey, parentBinding }) {
            try {
                const name = validateSharePointNavigationName(displayName);
                const binding = normalizeNavigationTargetBinding(parentBinding);
                if (!binding
                    || binding.mode !== NAVIGATION_TARGET_MODES.SHAREPOINT_AUTO
                    || binding.targetKind !== NAVIGATION_TARGET_KINDS.LIBRARY
                    || !binding.libraryTitle
                    || !binding.listId) {
                    throw new NavigationSharePointProvisioningError(
                        'INVALID_SHAREPOINT_PARENT',
                        'יצירת תיקייה אוטומטית זמינה רק בתוך קטגוריה שמקושרת לספריית מסמכים מאומתת.',
                    );
                }

                const { siteRoot, currentWebUrl } = resolveWebIdentity();
                if (!binding.libraryRootServerRelativeUrl.toLowerCase().startsWith(`${siteRoot.toLowerCase()}/`)) {
                    throw new NavigationSharePointProvisioningError(
                        'SHAREPOINT_PARENT_OUTSIDE_CURRENT_WEB',
                        'ספריית האב אינה שייכת לאתר SharePoint הנוכחי.',
                    );
                }
                const libraries = [{ title: binding.libraryTitle, rootRel: binding.libraryRootServerRelativeUrl }];
                const session = await createSession({ siteRoot });
                const parentProbe = await probeFolder({
                    webUrl: currentWebUrl,
                    folderRel: binding.libraryRootServerRelativeUrl,
                    libraries,
                    request: session.request,
                    purpose: 'navigation-parent-library-verification',
                });
                if (parentProbe.status === 401 || parentProbe.status === 403) {
                    throw Object.assign(new Error('SharePoint parent-library access denied.'), {
                        status: parentProbe.status,
                    });
                }
                if (!parentProbe.ready || normalizeGuid(parentProbe.id) !== normalizeGuid(binding.listId)) {
                    throw new NavigationSharePointProvisioningError(
                        'SHAREPOINT_PARENT_IDENTITY_MISMATCH',
                        'זהות ספריית האב ב-SharePoint אינה תואמת לקישור השמור. התיקייה לא נוצרה.',
                        null,
                        { parentProbe, binding },
                    );
                }

                const folderPath = normalizeSharePointPath(
                    `${binding.libraryRootServerRelativeUrl}/${buildSharePointNavigationSegment(name, provisionKey, 'folder')}`
                );
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
                    provisionKey,
                });
                if (!targetBinding) throw new Error('Verified folder binding could not be normalized.');
                return { url: targetBinding.serverRelativeUrl, targetBinding, provisioning: folder };
            } catch (error) {
                throw classifyProvisioningError(error);
            }
        },
    });
}

export const navigationSharePointService = createNavigationSharePointService();

export default navigationSharePointService;
