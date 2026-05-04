import { spLog } from './spAppLog';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';

const ODATA_VERBOSE_ACCEPT = 'application/json;odata=verbose';
const ADMIN_FILTER_QUERY = '?$filter=IsSiteAdmin eq true';
const SHAREPOINT_SITE_ADMINS_ENDPOINT =
    `https://${SHAREPOINT_PATHS.host}${SHAREPOINT_PATHS.siteRoot}/_api/web/siteusers${ADMIN_FILTER_QUERY}`;
const CURRENT_WEB_ADMINS_ENDPOINT = `/_api/web/siteusers${ADMIN_FILTER_QUERY}`;
const CURRENT_SITE_ROOT_WEB_ADMINS_ENDPOINT = `/_api/site/rootweb/siteusers${ADMIN_FILTER_QUERY}`;
const SHOULD_LOG_ADMIN_FETCH =
    (String(import.meta.env.VITE_SP_LOG_FETCH_ADMINS ?? import.meta.env.VITE_SP_VERBOSE_LOG ?? 'true').toLowerCase() === 'true');
const SHOULD_LOG_ADMIN_FETCH_VERBOSE =
    (String(import.meta.env.VITE_SP_LOG_FETCH_ADMINS_VERBOSE ?? 'false').toLowerCase() === 'true');

const adminLog = {
    scan: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH) return;
        spLog.scan(message, ...args);
    },
    file: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH) return;
        spLog.file(message, ...args);
    },
    system: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH) return;
        spLog.system(message, ...args);
    },
    success: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH) return;
        spLog.success(message, ...args);
    },
    warn: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH) return;
        spLog.warn(message, ...args);
    },
    error: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH) return;
        spLog.error(message, ...args);
    },
    verbose: (message, ...args) => {
        if (!SHOULD_LOG_ADMIN_FETCH || !SHOULD_LOG_ADMIN_FETCH_VERBOSE) return;
        spLog.system(message, ...args);
    },
};

const mapSharePointSiteAdmin = (user) => ({
    id: `sp_${user?.Id ?? ''}`,
    name: String(user?.Title ?? '').trim(),
    role: 'admin',
    personalNumber: String(user?.LoginName ?? '').match(/\d{6,8}/)?.[0] || '',
    email: String(user?.Email ?? '').trim(),
    loginName: String(user?.LoginName ?? '').trim(),
});

const normalizeLoginName = (value) => String(value ?? '').trim().toLowerCase();
const normalizePersonalNumber = (value) => String(value ?? '').replace(/\D/g, '');
const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();
const normalizeName = (value) => String(value ?? '').trim().toLowerCase();

const getAdminUniqueKey = (user, fallbackIndex = 0) => {
    const loginName = normalizeLoginName(user?.loginName);
    if (loginName) return `login:${loginName}`;

    const personalNumber = normalizePersonalNumber(user?.personalNumber);
    if (personalNumber) return `pn:${personalNumber}`;

    const email = normalizeEmail(user?.email);
    if (email) return `mail:${email}`;

    const name = normalizeName(user?.name);
    if (name) return `name:${name}`;

    return `unknown:${fallbackIndex}`;
};

const extractRawResults = (data) => data?.d?.results || data?.value || [];

const fetchAdminsFromEndpoint = async ({ endpoint, label }) => {
    adminLog.scan(`ניסיון שליפת מנהלים: ${label}`);
    adminLog.file(`Endpoint (${label}): ${endpoint}`);

    const response = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        headers: {
            Accept: ODATA_VERBOSE_ACCEPT,
        },
    });

    adminLog.file(`תגובת siteusers (${label}) | status: ${response.status} ${response.statusText}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch SharePoint admins (${label}): ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const rawAdmins = extractRawResults(data);
    adminLog.verbose(`payload snapshot (${label})`, {
        hasVerboseResults: Array.isArray(data?.d?.results),
        hasOdataValue: Array.isArray(data?.value),
        rawCount: Array.isArray(rawAdmins) ? rawAdmins.length : 0,
    });

    if (!Array.isArray(rawAdmins)) {
        adminLog.warn(`פורמט לא צפוי בתשובת מנהלים (${label}) — מחזיר רשימה ריקה`);
        return [];
    }

    const mappedAdmins = rawAdmins
        .map(mapSharePointSiteAdmin)
        .filter((user) => user.name || user.loginName || user.personalNumber || user.email);

    adminLog.success(`שליפת מנהלים הצליחה (${label}) | פריטים אחרי מיפוי: ${mappedAdmins.length}`);
    return mappedAdmins;
};

const dedupeAdmins = (admins) => {
    const indexByKey = new Map();
    const merged = [];
    let duplicateCount = 0;

    (Array.isArray(admins) ? admins : []).forEach((admin, idx) => {
        const key = getAdminUniqueKey(admin, idx);
        const existingIndex = indexByKey.get(key);

        if (existingIndex === undefined) {
            indexByKey.set(key, merged.length);
            merged.push({ ...admin, role: 'admin' });
            return;
        }

        duplicateCount += 1;
        const existing = merged[existingIndex];
        merged[existingIndex] = {
            ...existing,
            ...admin,
            role: 'admin',
        };
    });

    return { admins: merged, duplicateCount };
};

export const fetchSharePointAdmins = async () => {
    try {
        adminLog.scan('טוען מנהלי Site Collection דינמית מ-SharePoint...');
        adminLog.system('קונפיגורציית שליפת מנהלים', {
            host: SHAREPOINT_PATHS.host,
            siteRoot: SHAREPOINT_PATHS.siteRoot,
            primaryEndpoint: SHAREPOINT_SITE_ADMINS_ENDPOINT,
            fallbackCurrentWebEndpoint: CURRENT_WEB_ADMINS_ENDPOINT,
            fallbackRootWebEndpoint: CURRENT_SITE_ROOT_WEB_ADMINS_ENDPOINT,
            envSiteCode: import.meta.env.VITE_SP_SITE_CODE || '(not set)',
            envShowAdminFetchLogs: SHOULD_LOG_ADMIN_FETCH,
            envShowAdminFetchVerboseLogs: SHOULD_LOG_ADMIN_FETCH_VERBOSE,
        });

        const attempts = [
            { label: 'configured-site-root', endpoint: SHAREPOINT_SITE_ADMINS_ENDPOINT },
            { label: 'current-web-fallback', endpoint: CURRENT_WEB_ADMINS_ENDPOINT },
            { label: 'current-site-rootweb-fallback', endpoint: CURRENT_SITE_ROOT_WEB_ADMINS_ENDPOINT },
        ];

        let fetchedAdmins = [];
        let usedAttemptLabel = '';

        for (let i = 0; i < attempts.length; i += 1) {
            const attempt = attempts[i];
            try {
                const admins = await fetchAdminsFromEndpoint(attempt);
                if (admins.length > 0) {
                    fetchedAdmins = admins;
                    usedAttemptLabel = attempt.label;
                    if (i > 0) {
                        adminLog.warn(`פאלבק הופעל בהצלחה דרך ${attempt.label}`);
                    }
                    break;
                }

                adminLog.warn(`ניסיון ${attempt.label} הסתיים ללא מנהלים — ממשיך לניסיון הבא`);
            } catch (error) {
                adminLog.error(`שגיאה בניסיון ${attempt.label}:`, error);
                if (i < attempts.length - 1) {
                    adminLog.warn(`עובר לפאלבק הבא אחרי כישלון ב-${attempt.label}`);
                }
            }
        }

        if (fetchedAdmins.length === 0) {
            adminLog.warn('לא נמצאו מנהלי Site Collection בכל הניסיונות');
            return [];
        }

        const { admins: dedupedAdmins, duplicateCount } = dedupeAdmins(fetchedAdmins);
        adminLog.success(
            `נטענו מנהלי Site Collection דינמית | מקור: ${usedAttemptLabel} | לפני דה-דופ: ${fetchedAdmins.length} | אחרי דה-דופ: ${dedupedAdmins.length}`
        );
        adminLog.system('סטטוס דה-דופ מנהלים דינמיים', { duplicateCount });
        adminLog.verbose('דוגמת משתמשים דינמיים (עד 8)', dedupedAdmins.slice(0, 8));

        return dedupedAdmins;
    } catch (error) {
        adminLog.warn('טעינת מנהלי Site Collection נכשלה — ממשיכים ללא הרשאות דינמיות');
        adminLog.error('שגיאה בשליפת SharePoint Site Collection Administrators:', error);
        return [];
    }
};
