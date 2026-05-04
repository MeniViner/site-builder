const PREFIX = '[SharePointOwnersManagement]';

export type SharePointOwnersLogEntry = {
    time: string;
    level: 'info' | 'warn' | 'error';
    step: string;
    message: string;
    data?: unknown;
};

export const OWNERS_LOGS_ENABLED =
    import.meta.env.VITE_SP_ENABLE_OWNERS_MANAGEMENT_LOGS === 'true';

const sanitizeData = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(sanitizeData);

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
                return [key, sanitizeData(entryValue)];
            }
            return [key, entryValue];
        })
    );
};

export const addOwnersLogEntry = (
    logs: SharePointOwnersLogEntry[],
    level: SharePointOwnersLogEntry['level'],
    step: string,
    message: string,
    data?: unknown
) => {
    const sanitizedData = sanitizeData(data);
    const entry: SharePointOwnersLogEntry = {
        time: new Date().toISOString(),
        level,
        step,
        message,
        data: sanitizedData,
    };

    logs.push(entry);

    if (!OWNERS_LOGS_ENABLED) return entry;

    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`${PREFIX} ${message}`, {
        step,
        ...(sanitizedData && typeof sanitizedData === 'object' ? sanitizedData as Record<string, unknown> : { data: sanitizedData }),
    });

    return entry;
};

export const sanitizeOwnersHeadersForLog = (headers: HeadersInit | undefined) => {
    if (!headers || Array.isArray(headers)) return undefined;
    const source = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;

    return Object.fromEntries(
        Object.entries(source).map(([key, value]) => {
            const lower = key.toLowerCase();
            if (lower === 'cookie' || lower === 'authorization') {
                return [key, '[redacted]'];
            }
            if (lower === 'x-requestdigest') {
                return [key, value ? `[redacted digest length ${String(value).length}]` : '[redacted digest]'];
            }
            return [key, value];
        })
    );
};
