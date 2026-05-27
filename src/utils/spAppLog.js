/**
 * לוגים מובנים ל-SharePoint / משתמשים — קידומת [Portal], אימוג'י, עברית.
 * ניתן לעקוף את שם האפליקציה עם VITE_APP_LOG_PREFIX.
 */

const PREFIX = import.meta.env.VITE_APP_LOG_PREFIX || '[Portal]';

const parseEnvFlag = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).trim().toLowerCase() === 'true';
};

const APP_LOGS_ENABLED = parseEnvFlag(
    import.meta.env.VITE_SP_APP_LOGS ?? import.meta.env.VITE_SP_VERBOSE_LOG,
    false,
);
const APP_WARN_ERROR_LOGS_ENABLED = parseEnvFlag(
    import.meta.env.VITE_SP_APP_WARN_ERROR_LOGS ?? import.meta.env.VITE_SP_APP_LOGS ?? import.meta.env.VITE_SP_VERBOSE_LOG,
    false,
);
const BOOTSTRAP_SETUP_LOGS_ENABLED = parseEnvFlag(
    import.meta.env.VITE_SP_BOOTSTRAP_SETUP_LOGS ?? import.meta.env.VITE_SP_VERBOSE_LOG,
    false,
);

const E = {
    system: '⚙️',
    boot: '🚀',
    scan: '🔍',
    ok: '✅',
    user: '👤',
    file: '📂',
    warn: '⚠️',
    err: '❌',
};

const line = (emoji, message, ...args) => {
    if (!APP_LOGS_ENABLED) return;
    const head = `${PREFIX} ${emoji} ${message}`;
    if (args.length) {
        console.log(head, ...args);
    } else {
        console.log(head);
    }
};

export const spLog = {
    system: (message, ...args) => line(E.system, message, ...args),
    boot: (message, ...args) => line(E.boot, message, ...args),
    scan: (message, ...args) => line(E.scan, message, ...args),
    success: (message, ...args) => line(E.ok, message, ...args),
    user: (message, ...args) => line(E.user, message, ...args),
    file: (message, ...args) => line(E.file, message, ...args),
    warn: (message, ...args) => {
        if (!APP_WARN_ERROR_LOGS_ENABLED) return;
        console.warn(`${PREFIX} ${E.warn} ${message}`, ...args);
    },
    error: (message, ...args) => {
        if (!APP_WARN_ERROR_LOGS_ENABLED) return;
        console.error(`${PREFIX} ${E.err} ${message}`, ...args);
    },
    /** ללא אימוג'י — מידע כללי */
    info: (message, ...args) => line('ℹ️', message, ...args),
};

export const spBootstrapLog = {
    info: (message, ...args) => {
        if (!BOOTSTRAP_SETUP_LOGS_ENABLED) return;
        console.log(`${PREFIX} ${E.boot} ${message}`, ...args);
    },
    warn: (message, ...args) => {
        if (!BOOTSTRAP_SETUP_LOGS_ENABLED) return;
        console.warn(`${PREFIX} ${E.warn} ${message}`, ...args);
    },
    error: (message, ...args) => {
        if (!BOOTSTRAP_SETUP_LOGS_ENABLED) return;
        console.error(`${PREFIX} ${E.err} ${message}`, ...args);
    },
};

/** שם קובץ מנתיב SharePoint */
export const spFileName = (serverRelativeUrl) => {
    const s = String(serverRelativeUrl ?? '');
    const parts = s.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
};

/** לפני fetch לקובץ ב-SharePoint */
export const spLogFileReadStart = (labelHebrew, serverRelativeUrl) => {
    const name = spFileName(serverRelativeUrl);
    spLog.file(`קורא קובץ ${name} (${labelHebrew}) | URL: ${serverRelativeUrl}`);
};

/** אחרי תגובת GET לקובץ */
export const spLogFileReadResponse = (serverRelativeUrl, response) => {
    const name = spFileName(serverRelativeUrl);
    spLog.file(`תגובת קריאה ${name} | status: ${response.status} ${response.statusText}`);
};

/** הצלחה בקריאה (אופציונלי: מספר פריטים / סיכום) */
export const spLogFileReadOk = (serverRelativeUrl, detail = '') => {
    const name = spFileName(serverRelativeUrl);
    const suffix = detail ? ` | ${detail}` : '';
    spLog.success(`קריאה הצליחה ${name}${suffix}`);
};

/** לפני שמירה לקובץ */
export const spLogFileSaveStart = (labelHebrew, serverRelativeUrl) => {
    const name = spFileName(serverRelativeUrl);
    spLog.file(`שומר קובץ ${name} (${labelHebrew}) | URL: ${serverRelativeUrl}`);
};

/** אחרי תגובת POST שמירה */
export const spLogFileSaveResponse = (serverRelativeUrl, response) => {
    const name = spFileName(serverRelativeUrl);
    spLog.file(`תגובת שמירה ${name} | status: ${response.status} ${response.statusText}`);
};

export const spLogDigestCache = (hit) => {
    spLog.system(hit ? 'משתמש ב-Request Digest מהמטמון' : 'מבקש Request Digest חדש מ-/_api/contextinfo');
};
