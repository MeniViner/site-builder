export type AdminLogLevel = 'info' | 'warn' | 'error';

export type AdminLogEntry = {
    time: string;
    prefix: string;
    level: AdminLogLevel;
    step: string;
    message: string;
    data?: unknown;
};

const LOGS_ENABLED = String(import.meta.env.VITE_SP_ADMIN_MANAGEMENT_LOGS ?? 'false').toLowerCase() === 'true';

const sanitizeValue = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitizeValue);

    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => {
            const lower = key.toLowerCase();
            if (lower.includes('cookie') || lower.includes('authorization')) {
                return [key, '[redacted]'];
            }
            if (lower.includes('digest') && typeof entryValue === 'string') {
                return [key, `[redacted digest length ${entryValue.length}]`];
            }
            if (entryValue && typeof entryValue === 'object') {
                return [key, sanitizeValue(entryValue)];
            }
            return [key, entryValue];
        }),
    );
};

export const addAdminLogEntry = (
    logs: AdminLogEntry[],
    prefix: string,
    level: AdminLogLevel,
    step: string,
    message: string,
    data?: unknown,
) => {
    const entry: AdminLogEntry = {
        time: new Date().toISOString(),
        prefix,
        level,
        step,
        message,
        data: sanitizeValue(data),
    };

    logs.push(entry);
    if (!LOGS_ENABLED) return entry;

    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`${prefix} ${message}`, {
        step,
        ...(entry.data && typeof entry.data === 'object' ? entry.data as Record<string, unknown> : { data: entry.data }),
    });

    return entry;
};

const parseBodySafely = async (response: Response) => {
    const raw = await response.text().catch(() => '');
    if (!raw) return '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }
    return raw;
};

type SpAdminFetchArgs = {
    prefix: string;
    logs: AdminLogEntry[];
    step: string;
    purpose: string;
    endpoint: string;
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
};

export const spAdminFetchWithLogs = async ({
    prefix,
    logs,
    step,
    purpose,
    endpoint,
    method = 'GET',
    headers,
    body,
}: SpAdminFetchArgs) => {
    const startedAt = performance.now();
    addAdminLogEntry(logs, prefix, 'info', step, 'Request started', {
        purpose,
        endpoint,
        method,
        headers: sanitizeValue(headers),
    });

    try {
        const response = await fetch(endpoint, {
            method,
            headers,
            body,
            credentials: 'include',
        });

        const durationMs = Math.round(performance.now() - startedAt);
        if (!response.ok) {
            const responseBody = await parseBodySafely(response);
            addAdminLogEntry(logs, prefix, 'error', step, 'Request failed', {
                purpose,
                endpoint,
                method,
                status: response.status,
                statusText: response.statusText,
                durationMs,
                responseBody,
            });
            const error = new Error(`SharePoint REST request failed: ${response.status} ${response.statusText}`);
            (error as Error & { status?: number; statusText?: string; endpoint?: string; responseBody?: unknown; durationMs?: number }).status = response.status;
            (error as Error & { status?: number; statusText?: string; endpoint?: string; responseBody?: unknown; durationMs?: number }).statusText = response.statusText;
            (error as Error & { status?: number; statusText?: string; endpoint?: string; responseBody?: unknown; durationMs?: number }).endpoint = endpoint;
            (error as Error & { status?: number; statusText?: string; endpoint?: string; responseBody?: unknown; durationMs?: number }).responseBody = responseBody;
            (error as Error & { status?: number; statusText?: string; endpoint?: string; responseBody?: unknown; durationMs?: number }).durationMs = durationMs;
            throw error;
        }

        addAdminLogEntry(logs, prefix, 'info', step, 'Request succeeded', {
            purpose,
            endpoint,
            method,
            status: response.status,
            statusText: response.statusText,
            durationMs,
        });
        return response;
    } catch (error) {
        if ((error as { status?: number })?.status) throw error;

        const durationMs = Math.round(performance.now() - startedAt);
        addAdminLogEntry(logs, prefix, 'error', step, 'Request threw before response', {
            purpose,
            endpoint,
            method,
            durationMs,
            error: String((error as Error)?.message || error),
        });
        throw error;
    }
};

export const mapSharePointErrorToHebrewMessage = (error: unknown) => {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 403) {
        return 'רק מנהל אוסף אתרים קיים יכול להוסיף או להסיר מנהלי אוסף אתרים.';
    }
    if (status === 400) {
        return 'לא ניתן היה לזהות את המשתמש לפי המספר האישי שהוזן.';
    }
    if (status === 404) {
        return 'לא נמצא endpoint או משתמש מתאים ב־SharePoint.';
    }
    if (!(error as { status?: number })?.status) {
        return 'הקריאה ל־SharePoint נכשלה לפני שהתקבלה תשובה. בדוק דומיין, התחברות והרשאות.';
    }
    return 'הפעולה נכשלה ב־SharePoint. ניתן לפתוח לוג טכני לפרטים.';
};

export const isAdminManagementVerboseLogsEnabled = () => LOGS_ENABLED;

type OwnersStyleLogEntry = {
    level: AdminLogLevel;
    step: string;
    message: string;
    data?: unknown;
};

/** Append SharePointOwnersLogger entries into admin management logs (same panel / copy buffer). */
export const mergeSharePointOwnersLogsToAdminLogs = (
    adminLogs: AdminLogEntry[],
    ownersLogs: OwnersStyleLogEntry[],
    prefix = '[SharePointOwners]',
) => {
    ownersLogs.forEach((entry) => {
        const level: AdminLogLevel =
            entry.level === 'error' || entry.level === 'warn' || entry.level === 'info' ? entry.level : 'info';
        addAdminLogEntry(adminLogs, prefix, level, entry.step, entry.message, entry.data);
    });
};
