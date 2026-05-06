import { getRequestDigest as getSharePointRequestDigest } from '../utils/sharepointUtils';
import resolveCurrentSharePointWebUrl from '../utils/resolveCurrentSharePointWebUrl';
import { fetchSharePointAdmins } from '../utils/sharepointAdmins';
import {
    addAdminLogEntry,
    mapSharePointErrorToHebrewMessage,
    spAdminFetchWithLogs,
    type AdminLogEntry,
} from './adminManagementLogger';
import { normalizeAdminRecord } from './adminSourcesSyncService';

const PREFIX = '[SiteCollectionAdmins]';
const ODATA_ACCEPT = 'application/json;odata=verbose';
const ODATA_CONTENT_TYPE = 'application/json;odata=verbose';
const DEFAULT_EMAIL_DOMAIN = 'army.idf.il';

const getWebUrl = (logs: AdminLogEntry[] = []) =>
    resolveCurrentSharePointWebUrl({
        onResolved: (data) =>
            addAdminLogEntry(logs, '[SharePointWebUrl]', 'info', 'resolve-current-web-url', 'Resolved SharePoint web URL', data),
    });

const buildEndpoint = (path: string, logs: AdminLogEntry[] = []) => `${getWebUrl(logs)}${path}`;

const parseJson = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);

const normalizeDigits = (value: string) => value.replace(/\D/g, '');

export const normalizePersonalNumberInput = (rawValue: string) => {
    const input = String(rawValue ?? '').trim().toLowerCase();
    if (!input) {
        return { ok: false as const, message: 'יש להזין מספר אישי.' };
    }

    if (input.includes('@')) {
        if (!isValidEmail(input)) {
            return { ok: false as const, message: 'הערך שהוזן אינו מספר אישי או כתובת מייל תקינה.' };
        }
        const localPart = input.split('@')[0] || '';
        if (!/^s\d{6,8}$/i.test(localPart)) {
            return { ok: false as const, message: 'כאשר מזינים מייל, חלק המשתמש חייב להיות בפורמט s1234567.' };
        }
        return {
            ok: true as const,
            personalNumber: localPart.toLowerCase(),
            email: input,
            normalizedInput: input,
        };
    }

    const digits = normalizeDigits(input);
    if (digits.length >= 6 && digits.length <= 8) {
        const personalNumber = `s${digits}`;
        return {
            ok: true as const,
            personalNumber,
            email: `${personalNumber}@${DEFAULT_EMAIL_DOMAIN}`,
            normalizedInput: personalNumber,
        };
    }

    if (/^s\d{6,8}$/i.test(input)) {
        const personalNumber = input.toLowerCase();
        return {
            ok: true as const,
            personalNumber,
            email: `${personalNumber}@${DEFAULT_EMAIL_DOMAIN}`,
            normalizedInput: personalNumber,
        };
    }

    return {
        ok: false as const,
        message: 'מספר אישי לא תקין. יש להזין בפורמט 1234567 או s1234567.',
    };
};

export const getCurrentSharePointUser = async (logs: AdminLogEntry[] = []) => {
    const endpoint = buildEndpoint('/_api/web/currentuser?$select=Id,Title,Email,LoginName,IsSiteAdmin', logs);
    const response = await spAdminFetchWithLogs({
        prefix: PREFIX,
        logs,
        step: 'current-user',
        purpose: 'Get current SharePoint user',
        endpoint,
        headers: { Accept: ODATA_ACCEPT },
    });
    const data = await parseJson<{ d?: Record<string, unknown> }>(response);
    return data?.d || {};
};

export const getRequestDigest = async (logs: AdminLogEntry[] = []) => {
    const digest = await getSharePointRequestDigest(getWebUrl(logs));
    addAdminLogEntry(logs, PREFIX, 'info', 'request-digest', 'Digest received', {
        digestLength: String(digest || '').length,
    });
    return digest;
};

const tryEnsureUser = async (emailOrLoginName: string, digest: string, logs: AdminLogEntry[]) => {
    const endpoint = buildEndpoint('/_api/web/ensureuser', logs);
    const response = await spAdminFetchWithLogs({
        prefix: PREFIX,
        logs,
        step: 'ensure-user',
        purpose: 'Ensure SharePoint user',
        endpoint,
        method: 'POST',
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
            'X-RequestDigest': digest,
        },
        body: JSON.stringify({ logonName: emailOrLoginName }),
    });
    const data = await parseJson<{ d?: { Id?: number; LoginName?: string; Email?: string; Title?: string } }>(response);
    return data?.d || {};
};

export const ensureUserByEmail = async (email: string, logs: AdminLogEntry[] = []) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
        throw new Error('invalid-email');
    }
    addAdminLogEntry(logs, PREFIX, 'info', 'normalize-email', 'Normalized email', { normalizedEmail });

    const digest = await getRequestDigest(logs);
    const attempts = [normalizedEmail];

    try {
        const currentUser = await getCurrentSharePointUser(logs);
        const currentLoginName = String(currentUser?.LoginName || '').toLowerCase();
        if (currentLoginName.includes('|membership|')) {
            attempts.push(`i:0#.f|membership|${normalizedEmail}`);
        } else if (currentLoginName.includes('\\')) {
            addAdminLogEntry(logs, PREFIX, 'warn', 'ensure-user-fallback', 'Current environment appears Windows claims style', {
                currentUserLoginName: currentUser?.LoginName,
                note: 'Domain\\username may be required in this farm.',
            });
        }
    } catch (error) {
        addAdminLogEntry(logs, PREFIX, 'warn', 'ensure-user-fallback', 'Failed to inspect current user login format', {
            error: String((error as Error)?.message || error),
        });
    }

    let lastError: unknown = null;
    for (const attempt of attempts) {
        addAdminLogEntry(logs, PREFIX, 'info', 'ensure-user-attempt', 'Trying ensureUser candidate', { attempt });
        try {
            const ensured = await tryEnsureUser(attempt, digest, logs);
            if (!ensured?.Id || !ensured?.LoginName) {
                throw new Error('ensureuser-missing-id-or-login');
            }
            addAdminLogEntry(logs, PREFIX, 'info', 'ensure-user-result', 'ensureUser succeeded', {
                id: ensured.Id,
                loginName: ensured.LoginName,
                email: ensured.Email,
                title: ensured.Title,
            });
            return ensured;
        } catch (error) {
            lastError = error;
            addAdminLogEntry(logs, PREFIX, 'warn', 'ensure-user-attempt', 'ensureUser attempt failed', {
                attempt,
                error: String((error as Error)?.message || error),
                status: (error as { status?: number })?.status,
            });
        }
    }

    throw lastError || new Error('ensure-user-failed');
};

export const ensureUserByPersonalNumber = async (personalNumberInput: string, logs: AdminLogEntry[] = []) => {
    const normalized = normalizePersonalNumberInput(personalNumberInput);
    if (!normalized.ok) {
        throw new Error(normalized.message);
    }
    addAdminLogEntry(logs, PREFIX, 'info', 'normalize-personal-number', 'Normalized personal number', {
        input: personalNumberInput,
        normalizedPersonalNumber: normalized.personalNumber,
        generatedEmail: normalized.email,
    });
    return ensureUserByEmail(normalized.email, logs);
};

const mapFetchedAdminToSiteUserRow = (admin: Record<string, unknown>, idx: number) => {
    const normalized = normalizeAdminRecord(admin, idx);
    const idStr = String(admin?.id ?? normalized.id ?? '');
    const match = idStr.match(/^sp_(\d+)$/i);
    const Id = match ? Number(match[1]) : Number(admin?.Id ?? 0) || 0;
    return {
        Id,
        Title: normalized.name,
        Email: normalized.email,
        LoginName: normalized.loginName,
        IsSiteAdmin: true,
        PrincipalType: 1,
    };
};

const listSiteCollectionAdminsViaRestFilter = async (logs: AdminLogEntry[]) => {
    const endpoint = buildEndpoint(
        '/_api/web/siteusers?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType&$filter=IsSiteAdmin eq true',
        logs,
    );
    const response = await spAdminFetchWithLogs({
        prefix: PREFIX,
        logs,
        step: 'list-site-admins-fallback-rest',
        purpose: 'List Site Collection Administrators (REST siteusers IsSiteAdmin filter)',
        endpoint,
        headers: { Accept: ODATA_ACCEPT },
    });
    const data = await parseJson<{ d?: { results?: Array<Record<string, unknown>> } }>(response);
    return Array.isArray(data?.d?.results) ? data.d.results : [];
};

export const listSiteCollectionAdmins = async (logs: AdminLogEntry[] = []) => {
    addAdminLogEntry(logs, PREFIX, 'info', 'list-site-admins-start', 'Starting Site Collection Admins panel refresh', {});

    addAdminLogEntry(logs, PREFIX, 'info', 'list-site-admins-source', 'Using fetchSharePointAdmins as primary data source', {
        path: 'primary-existing-fetchSharePointAdmins',
    });

    try {
        const sharePointAdmins = await fetchSharePointAdmins();
        const primaryCount = Array.isArray(sharePointAdmins) ? sharePointAdmins.length : 0;
        const rows = (Array.isArray(sharePointAdmins) ? sharePointAdmins : []).map((admin, idx) =>
            mapFetchedAdminToSiteUserRow(admin as Record<string, unknown>, idx),
        );

        const primarySample = rows.slice(0, 8).map((r) => ({
            Id: r.Id,
            Title: r.Title,
            Email: r.Email,
            LoginName: r.LoginName,
            IsSiteAdmin: r.IsSiteAdmin,
        }));

        addAdminLogEntry(logs, PREFIX, 'info', 'list-site-admins-primary-result', 'Primary fetchSharePointAdmins completed', {
            path: 'primary-existing-fetchSharePointAdmins',
            primaryResultCount: primaryCount,
            primaryResultSample: primarySample,
        });

        addAdminLogEntry(logs, PREFIX, 'info', 'list-site-admins-final', 'Site Collection Admins list final count', {
            finalCount: rows.length,
            source: 'primary-existing-fetchSharePointAdmins',
        });

        return rows;
    } catch (primaryError) {
        addAdminLogEntry(logs, PREFIX, 'warn', 'list-site-admins-primary-failed', 'fetchSharePointAdmins threw; using REST fallback', {
            path: 'fallback-rest-siteusers-isSiteAdmin',
            reason: String((primaryError as Error)?.message || primaryError),
        });

        const fallbackEndpoint = buildEndpoint(
            '/_api/web/siteusers?$select=Id,Title,Email,LoginName,IsSiteAdmin,PrincipalType&$filter=IsSiteAdmin eq true',
            logs,
        );

        try {
            const fallbackRows = await listSiteCollectionAdminsViaRestFilter(logs);
            addAdminLogEntry(logs, PREFIX, 'info', 'list-site-admins-fallback-result', 'REST fallback completed', {
                path: 'fallback-rest-siteusers-isSiteAdmin',
                fallbackEndpoint,
                fallbackStatus: 'ok',
                fallbackCount: fallbackRows.length,
                finalCount: fallbackRows.length,
            });
            return fallbackRows;
        } catch (fallbackError) {
            addAdminLogEntry(logs, PREFIX, 'error', 'list-site-admins-fallback-failed', 'REST fallback failed', {
                path: 'fallback-rest-siteusers-isSiteAdmin',
                fallbackEndpoint,
                error: String((fallbackError as Error)?.message || fallbackError),
                status: (fallbackError as { status?: number })?.status,
            });
            throw fallbackError;
        }
    }
};

const setSiteAdminFlag = async (userId: number, flag: boolean, logs: AdminLogEntry[] = []) => {
    const digest = await getRequestDigest(logs);
    const attempts = [
        buildEndpoint(`/_api/web/getuserbyid(${userId})`, logs),
        buildEndpoint(`/_api/web/siteusers/getbyid(${userId})`, logs),
    ];

    let lastError: unknown = null;
    for (let idx = 0; idx < attempts.length; idx += 1) {
        const endpoint = attempts[idx];
        try {
            await spAdminFetchWithLogs({
                prefix: PREFIX,
                logs,
                step: idx === 0 ? 'set-site-admin-primary' : 'set-site-admin-fallback',
                purpose: flag ? 'Set IsSiteAdmin=true' : 'Set IsSiteAdmin=false',
                endpoint,
                method: 'POST',
                headers: {
                    Accept: ODATA_ACCEPT,
                    'Content-Type': ODATA_CONTENT_TYPE,
                    'X-RequestDigest': digest,
                    'X-HTTP-Method': 'MERGE',
                    'IF-MATCH': '*',
                },
                body: JSON.stringify({
                    __metadata: { type: 'SP.User' },
                    IsSiteAdmin: flag,
                }),
            });
            return true;
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error('set-site-admin-failed');
};

export const verifyIsSiteAdmin = async (userId: number, logs: AdminLogEntry[] = []) => {
    const endpoint = buildEndpoint(`/_api/web/getuserbyid(${userId})?$select=Id,Title,Email,LoginName,IsSiteAdmin`, logs);
    const response = await spAdminFetchWithLogs({
        prefix: PREFIX,
        logs,
        step: 'verify-site-admin',
        purpose: 'Verify IsSiteAdmin flag',
        endpoint,
        headers: { Accept: ODATA_ACCEPT },
    });
    const data = await parseJson<{ d?: Record<string, unknown> }>(response);
    return data?.d || {};
};

export const addSiteCollectionAdminByEmail = async (email: string, logs: AdminLogEntry[] = []) => {
    try {
        const ensuredUser = await ensureUserByEmail(email, logs);
        const userId = Number(ensuredUser?.Id || 0);
        const before = await verifyIsSiteAdmin(userId, logs);
        await setSiteAdminFlag(userId, true, logs);
        const after = await verifyIsSiteAdmin(userId, logs);
        addAdminLogEntry(logs, PREFIX, 'info', 'add-site-admin-final', 'Site Collection Admin update completed', {
            userId,
            isSiteAdminBefore: before?.IsSiteAdmin,
            isSiteAdminAfter: after?.IsSiteAdmin,
            ensuredUser,
        });
        if (!after?.IsSiteAdmin) {
            throw new Error('verify-is-site-admin-failed');
        }
        return { ok: true, ensuredUser, before, after, logs };
    } catch (error) {
        return {
            ok: false,
            userMessage: mapSharePointErrorToHebrewMessage(error),
            error,
            logs,
        };
    }
};

export const addSiteCollectionAdminByPersonalNumber = async (personalNumber: string, logs: AdminLogEntry[] = []) => {
    const normalized = normalizePersonalNumberInput(personalNumber);
    if (!normalized.ok) {
        return {
            ok: false,
            userMessage: normalized.message,
            error: new Error(normalized.message),
            logs,
        };
    }
    return addSiteCollectionAdminByEmail(normalized.email, logs);
};

export const removeSiteCollectionAdmin = async (userId: number, logs: AdminLogEntry[] = []) => {
    try {
        const before = await verifyIsSiteAdmin(userId, logs);
        await setSiteAdminFlag(userId, false, logs);
        const after = await verifyIsSiteAdmin(userId, logs);
        addAdminLogEntry(logs, PREFIX, 'info', 'remove-site-admin-final', 'Site Collection Admin remove completed', {
            userId,
            isSiteAdminBefore: before?.IsSiteAdmin,
            isSiteAdminAfter: after?.IsSiteAdmin,
        });
        return { ok: true, before, after, logs };
    } catch (error) {
        return {
            ok: false,
            userMessage: mapSharePointErrorToHebrewMessage(error),
            error,
            logs,
        };
    }
};
