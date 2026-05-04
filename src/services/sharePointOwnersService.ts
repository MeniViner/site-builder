import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import {
    addOwnersLogEntry,
    sanitizeOwnersHeadersForLog,
    type SharePointOwnersLogEntry,
} from './sharePointOwnersLogger';

const ODATA_ACCEPT = 'application/json;odata=verbose';
const ODATA_CONTENT_TYPE = 'application/json;odata=verbose';

export type AddSiteOwnerResult =
    | {
        ok: true;
        status: 'added' | 'already-owner';
        userEmail: string;
        userLoginName?: string;
        userId?: number;
        ownersGroupId?: number;
        ownersGroupTitle?: string;
        logs?: SharePointOwnersLogEntry[];
    }
    | {
        ok: false;
        status:
            | 'missing-email'
            | 'invalid-email'
            | 'access-denied'
            | 'user-not-found-or-not-resolvable'
            | 'owners-group-not-found'
            | 'already-owner-check-failed'
            | 'add-owner-failed'
            | 'unknown-error';
        userEmail?: string;
        userMessage: string;
        technicalError?: unknown;
        logs?: SharePointOwnersLogEntry[];
    };

type NormalizedOwnersError = {
    step: string;
    message: string;
    endpoint?: string;
    status?: number;
    statusText?: string;
    responseBody?: unknown;
    durationMs?: number;
    originalError?: unknown;
};

type OwnersFetchArgs = {
    step: string;
    purpose: string;
    endpoint: string;
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit | null;
    logs: SharePointOwnersLogEntry[];
};

const normalizeServerRelativeUrl = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
        try {
            return new URL(raw).pathname.replace(/\/+$/g, '') || '';
        } catch {
            return '';
        }
    }
    return raw.startsWith('/') ? raw.replace(/\/+$/g, '') : raw;
};

const resolveCurrentWebUrl = () => {
    const pageContext = (window as unknown as {
        _spPageContextInfo?: {
            webAbsoluteUrl?: string;
            webServerRelativeUrl?: string;
            siteServerRelativeUrl?: string;
        };
    })._spPageContextInfo;

    const explicit = String(import.meta.env.VITE_SP_SITE_API_ROOT || import.meta.env.VITE_SP_SITE_ROOT || '').trim();
    if (explicit) return explicit.replace(/\/+$/g, '');

    if (pageContext?.webAbsoluteUrl) return pageContext.webAbsoluteUrl.replace(/\/+$/g, '');
    if (pageContext?.webServerRelativeUrl) return normalizeServerRelativeUrl(pageContext.webServerRelativeUrl);
    if (pageContext?.siteServerRelativeUrl) return normalizeServerRelativeUrl(pageContext.siteServerRelativeUrl);
    if (SHAREPOINT_PATHS.siteApiRoot) return normalizeServerRelativeUrl(SHAREPOINT_PATHS.siteApiRoot);

    const segments = window.location.pathname.split('/').filter(Boolean);
    const first = String(segments[0] || '').toLowerCase();
    if ((first === 'sites' || first === 'teams') && segments.length >= 2) {
        return `/${segments[0]}/${segments[1]}`;
    }

    return '';
};

const buildEndpoint = (webUrl: string, path: string) => {
    const root = String(webUrl || '').replace(/\/+$/g, '');
    return root ? `${root}${path}` : path;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value);

const parseResponseBody = async (response: Response) => {
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

const stringifySafe = (value: unknown) => {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
};

const extractSharePointMessage = (body: unknown) => {
    if (!body || typeof body !== 'object') return typeof body === 'string' ? body : '';
    const maybe = body as {
        error?: { message?: { value?: string } | string };
        ['odata.error']?: { message?: { value?: string } | string };
    };
    const message = maybe.error?.message ?? maybe['odata.error']?.message;
    if (typeof message === 'string') return message;
    return message?.value || '';
};

const makeError = (
    step: string,
    message: string,
    details: Partial<NormalizedOwnersError> = {}
): NormalizedOwnersError => ({
    step,
    message,
    endpoint: details.endpoint,
    status: details.status,
    statusText: details.statusText,
    responseBody: details.responseBody,
    durationMs: details.durationMs,
    originalError: details.originalError,
});

export const spOwnersFetchWithLogs = async ({
    step,
    purpose,
    endpoint,
    method = 'GET',
    headers,
    body,
    logs,
}: OwnersFetchArgs) => {
    const startedAt = new Date();
    const startMs = performance.now();

    addOwnersLogEntry(logs, 'info', step, 'Request started', {
        method,
        endpoint,
        purpose,
        startedAt: startedAt.toISOString(),
        headers: sanitizeOwnersHeadersForLog(headers),
    });

    try {
        const response = await fetch(endpoint, {
            method,
            credentials: 'include',
            headers,
            body,
        });
        const durationMs = Math.round(performance.now() - startMs);
        const endedAt = new Date().toISOString();

        if (response.ok) {
            addOwnersLogEntry(logs, 'info', step, 'Request succeeded', {
                method,
                endpoint,
                purpose,
                status: response.status,
                statusText: response.statusText,
                startedAt: startedAt.toISOString(),
                endedAt,
                durationMs,
            });
            return response;
        }

        const responseBody = await parseResponseBody(response);
        const error = makeError(step, extractSharePointMessage(responseBody) || 'SharePoint REST request failed', {
            endpoint,
            status: response.status,
            statusText: response.statusText,
            responseBody,
            durationMs,
        });

        addOwnersLogEntry(logs, 'error', step, 'Step failed', {
            endpoint,
            status: response.status,
            statusText: response.statusText,
            responseBody,
            durationMs,
            error,
        });

        throw error;
    } catch (error) {
        if ((error as NormalizedOwnersError)?.step) throw error;

        const durationMs = Math.round(performance.now() - startMs);
        const normalized = makeError(step, 'SharePoint REST request failed before a response was received', {
            endpoint,
            durationMs,
            originalError: error,
        });

        addOwnersLogEntry(logs, 'error', step, 'Step failed', {
            endpoint,
            durationMs,
            error: normalized,
        });

        throw normalized;
    }
};

const fetchJson = async <T>(args: OwnersFetchArgs): Promise<T> => {
    const response = await spOwnersFetchWithLogs(args);
    return response.json() as Promise<T>;
};

const getRequestDigest = async (webUrl: string, logs: SharePointOwnersLogEntry[]) => {
    const step = 'request-digest';
    const endpoint = buildEndpoint(webUrl, '/_api/contextinfo');
    const data = await fetchJson<{
        d?: { GetContextWebInformation?: { FormDigestValue?: string } };
    }>({
        step,
        purpose: 'Get SharePoint request digest',
        endpoint,
        method: 'POST',
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
        },
        logs,
    });

    const digest = data?.d?.GetContextWebInformation?.FormDigestValue || '';
    if (!digest) {
        throw makeError(step, 'SharePoint contextinfo response did not include a request digest', { endpoint, responseBody: data });
    }

    addOwnersLogEntry(logs, 'info', step, 'Digest received successfully', {
        endpoint,
        digestExists: true,
        digestLength: digest.length,
    });

    return digest;
};

const getAssociatedOwnersGroup = async (webUrl: string, logs: SharePointOwnersLogEntry[]) => {
    const step = 'resolve-associated-owners-group';
    const endpoint = buildEndpoint(webUrl, '/_api/web/associatedownergroup');
    addOwnersLogEntry(logs, 'info', step, 'Resolving Associated Owners Group', { endpoint, webUrl });

    const data = await fetchJson<{ d?: { Id?: number; Title?: string } }>({
        step,
        purpose: "Resolve current site's Associated Owners Group",
        endpoint,
        headers: { Accept: ODATA_ACCEPT },
        logs,
    });

    const group = data?.d;
    if (!group?.Id) {
        throw makeError(step, 'Associated Owners Group response did not include an Id', { endpoint, responseBody: data });
    }

    addOwnersLogEntry(logs, 'info', step, 'Associated Owners Group resolved', {
        endpoint,
        ownersGroupId: group.Id,
        ownersGroupTitle: group.Title,
    });

    return { id: group.Id, title: group.Title || 'Associated Owners Group' };
};

/** GET current user to record the LoginName format used by this SharePoint farm (non-blocking). */
const logCurrentSharePointUserForDebug = async (webUrl: string, logs: SharePointOwnersLogEntry[]) => {
    const step = 'debug-current-user';
    const endpoint = buildEndpoint(webUrl, '/_api/web/currentuser?$select=Id,Title,Email,LoginName');
    addOwnersLogEntry(logs, 'info', step, 'Debug: GET current SharePoint user', { endpoint });

    try {
        const response = await fetch(endpoint, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: ODATA_ACCEPT },
        });
        const responseBody = await parseResponseBody(response);
        if (!response.ok) {
            addOwnersLogEntry(logs, 'warn', step, 'Debug current user request failed', {
                endpoint,
                status: response.status,
                statusText: response.statusText,
                responseBody,
            });
            return;
        }
        const data = responseBody as { d?: { Id?: number; Title?: string; Email?: string; LoginName?: string } };
        const u = data?.d;
        addOwnersLogEntry(logs, 'info', step, 'Current SharePoint user LoginName (debug)', {
            endpoint,
            currentUserId: u?.Id,
            currentUserTitle: u?.Title,
            currentUserEmail: u?.Email,
            currentUserLoginName: u?.LoginName,
        });
    } catch (error) {
        addOwnersLogEntry(logs, 'warn', step, 'Debug current user request threw before handling response', {
            endpoint,
            error,
        });
    }
};

const ensureUser = async (webUrl: string, digest: string, trimmedEmail: string, logs: SharePointOwnersLogEntry[]) => {
    const step = 'ensure-user';
    const endpoint = buildEndpoint(webUrl, '/_api/web/ensureuser');
    const ensureUserRequestBody = { logonName: trimmedEmail };

    addOwnersLogEntry(logs, 'info', step, 'ensureUser request', {
        enteredEmail: trimmedEmail,
        endpoint,
        ensureUserRequestBody,
    });

    let data: { d?: { Id?: number; LoginName?: string; Title?: string; Email?: string } };
    try {
        data = await fetchJson<{
            d?: { Id?: number; LoginName?: string; Title?: string; Email?: string };
        }>({
            step,
            purpose: 'Ensure target user exists in current SharePoint site',
            endpoint,
            method: 'POST',
            headers: {
                Accept: ODATA_ACCEPT,
                'Content-Type': ODATA_CONTENT_TYPE,
                'X-RequestDigest': digest,
            },
            body: JSON.stringify(ensureUserRequestBody),
            logs,
        });
    } catch (error) {
        const normalized = error as NormalizedOwnersError;
        addOwnersLogEntry(logs, 'error', step, 'SharePoint could not resolve the user from the provided email.', {
            enteredEmail: trimmedEmail,
            endpoint: normalized.endpoint ?? endpoint,
            ensureUserRequestBody,
            status: normalized.status,
            statusText: normalized.statusText,
            responseBody: normalized.responseBody,
            underlyingMessage: normalized.message,
        });
        throw error;
    }

    const user = data?.d;
    if (!user?.LoginName) {
        addOwnersLogEntry(logs, 'error', step, 'SharePoint could not resolve the user from the provided email.', {
            enteredEmail: trimmedEmail,
            endpoint,
            ensureUserRequestBody,
            responseBody: data,
            note: 'ensureUser response did not include LoginName',
        });
        throw makeError(step, 'SharePoint ensureuser response did not include LoginName', { endpoint, responseBody: data });
    }

    addOwnersLogEntry(logs, 'info', step, 'ensureUser succeeded — using SharePoint user object', {
        enteredEmail: trimmedEmail,
        endpoint,
        ensureUserResponse: {
            Id: user.Id,
            Title: user.Title,
            Email: user.Email,
            LoginName: user.LoginName,
        },
    });

    return {
        id: user.Id,
        loginName: user.LoginName,
        title: user.Title,
        email: user.Email || trimmedEmail,
    };
};

const getOwnersGroupUsers = async (
    webUrl: string,
    ownersGroupId: number,
    logs: SharePointOwnersLogEntry[]
) => {
    const step = 'check-already-owner';
    const endpoint = buildEndpoint(webUrl, `/_api/web/sitegroups(${ownersGroupId})/users`);
    addOwnersLogEntry(logs, 'info', step, 'Checking existing Associated Owners Group users', {
        endpoint,
        ownersGroupId,
    });

    const data = await fetchJson<{
        d?: { results?: Array<{ Id?: number; LoginName?: string; Title?: string; Email?: string }> };
    }>({
        step,
        purpose: 'Check whether target user is already in the Associated Owners Group',
        endpoint,
        headers: { Accept: ODATA_ACCEPT },
        logs,
    });

    const users = data?.d?.results || [];
    addOwnersLogEntry(logs, 'info', step, 'Associated Owners Group users resolved', {
        endpoint,
        ownersGroupId,
        count: users.length,
        users: users.map((user) => ({
            id: user.Id,
            loginName: user.LoginName,
            email: user.Email,
            title: user.Title,
        })),
    });

    return users;
};

const sameSharePointUser = (
    candidate: { Id?: number; LoginName?: string; Email?: string },
    ensuredUser: { id?: number; loginName?: string; email?: string },
    userEmail: string
) => {
    const candidateLogin = String(candidate.LoginName || '').toLowerCase();
    const ensuredLogin = String(ensuredUser.loginName || '').toLowerCase();
    const candidateEmail = String(candidate.Email || '').toLowerCase();
    const ensuredEmail = String(ensuredUser.email || userEmail).toLowerCase();

    const emailLower = String(userEmail || '').toLowerCase();
    return (
        (candidate.Id !== undefined && ensuredUser.id !== undefined && candidate.Id === ensuredUser.id) ||
        (candidateLogin && ensuredLogin && candidateLogin === ensuredLogin) ||
        (candidateEmail && ensuredEmail && candidateEmail === ensuredEmail) ||
        (candidateLogin && emailLower && candidateLogin.endsWith(`|${emailLower}`))
    );
};

const isAlreadyExistsError = (error: unknown) => {
    const normalized = error as NormalizedOwnersError;
    const message = [
        normalized?.message,
        extractSharePointMessage(normalized?.responseBody),
        typeof normalized?.responseBody === 'string' ? normalized.responseBody : stringifySafe(normalized?.responseBody),
    ].filter(Boolean).join(' ');

    return /already exists|already.*member|user.*exists/i.test(message);
};

const addUserToOwnersGroup = async (
    webUrl: string,
    digest: string,
    ownersGroup: { id: number; title: string },
    ensuredUser: { loginName: string; id?: number; email?: string },
    userEmail: string,
    logs: SharePointOwnersLogEntry[]
) => {
    const step = 'add-owner';
    const endpoint = buildEndpoint(webUrl, `/_api/web/sitegroups(${ownersGroup.id})/users`);
    const ownersGroupAddRequestBody = {
        __metadata: { type: 'SP.User' },
        LoginName: ensuredUser.loginName,
    };

    addOwnersLogEntry(logs, 'info', step, 'Owners group add request', {
        endpoint,
        ownersGroupId: ownersGroup.id,
        ownersGroupTitle: ownersGroup.title,
        enteredEmail: userEmail,
        ensureUserLoginName: ensuredUser.loginName,
        ownersGroupAddRequestBody,
    });

    await spOwnersFetchWithLogs({
        step,
        purpose: 'Add ensured user to current site Associated Owners Group',
        endpoint,
        method: 'POST',
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
            'X-RequestDigest': digest,
        },
        body: JSON.stringify(ownersGroupAddRequestBody),
        logs,
    });

    addOwnersLogEntry(logs, 'info', step, 'User added to Associated Owners Group successfully', {
        endpoint,
        ownersGroupId: ownersGroup.id,
        ownersGroupTitle: ownersGroup.title,
        enteredEmail: userEmail,
        ensureUserLoginName: ensuredUser.loginName,
        targetUserId: ensuredUser.id,
    });
};

const classifyError = (
    error: unknown,
    userEmail: string,
    logs: SharePointOwnersLogEntry[]
): AddSiteOwnerResult => {
    const normalized = error as NormalizedOwnersError;
    const status = Number(normalized?.status || 0);
    const step = normalized?.step || 'unknown';
    const message = normalized?.message || '';

    if (status === 403 || /access denied|forbidden|unauthorized/i.test(message)) {
        return {
            ok: false,
            status: 'access-denied',
            userEmail,
            userMessage: 'Only an existing SharePoint site owner can add another site owner.',
            technicalError: normalized || error,
            logs,
        };
    }

    if (step === 'resolve-associated-owners-group' && status === 404) {
        return {
            ok: false,
            status: 'owners-group-not-found',
            userEmail,
            userMessage: 'לא ניתן היה לאתר את קבוצת בעלי האתר המשויכת לאתר SharePoint הנוכחי.',
            technicalError: normalized || error,
            logs,
        };
    }

    if (step === 'ensure-user' && (status === 400 || status === 404)) {
        return {
            ok: false,
            status: 'user-not-found-or-not-resolvable',
            userEmail,
            userMessage: 'לא ניתן היה לאתר או לזהות את המשתמש ב-SharePoint.',
            technicalError: normalized || error,
            logs,
        };
    }

    if (step === 'check-already-owner') {
        return {
            ok: false,
            status: 'already-owner-check-failed',
            userEmail,
            userMessage: 'לא ניתן היה לבדוק אם המשתמש כבר מוגדר כבעל אתר.',
            technicalError: normalized || error,
            logs,
        };
    }

    if (step === 'add-owner') {
        return {
            ok: false,
            status: 'add-owner-failed',
            userEmail,
            userMessage: 'הוספת המשתמש כבעל אתר נכשלה.',
            technicalError: normalized || error,
            logs,
        };
    }

    return {
        ok: false,
        status: 'unknown-error',
        userEmail,
        userMessage: 'הפעולה נכשלה. ניתן לפתוח את פרטי השגיאה לבדיקה טכנית.',
        technicalError: normalized || error,
        logs,
    };
};

export const addUserToAssociatedOwnersGroup = async (userEmail: string): Promise<AddSiteOwnerResult> => {
    const logs: SharePointOwnersLogEntry[] = [];
    const trimmedEmail = String(userEmail || '').trim();

    addOwnersLogEntry(logs, 'info', 'validate-email', 'Validating target email', {
        inputProvided: Boolean(userEmail),
        enteredEmail: trimmedEmail,
    });

    if (!trimmedEmail) {
        const result: AddSiteOwnerResult = {
            ok: false,
            status: 'missing-email',
            userMessage: 'יש להזין כתובת מייל.',
            logs,
        };
        addOwnersLogEntry(logs, 'warn', 'validate-email', 'Email validation failed: missing email', result);
        return result;
    }

    if (!isValidEmail(trimmedEmail)) {
        const result: AddSiteOwnerResult = {
            ok: false,
            status: 'invalid-email',
            userEmail: trimmedEmail,
            userMessage: 'כתובת המייל אינה תקינה.',
            logs,
        };
        addOwnersLogEntry(logs, 'warn', 'validate-email', 'Email validation failed: invalid format', result);
        return result;
    }

    addOwnersLogEntry(logs, 'info', 'validate-email', 'Email validation succeeded', { enteredEmail: trimmedEmail });

    try {
        const webUrl = resolveCurrentWebUrl();
        addOwnersLogEntry(logs, 'info', 'resolve-web-url', 'Resolved current SharePoint site/web URL', { webUrl });

        await logCurrentSharePointUserForDebug(webUrl, logs);

        const digest = await getRequestDigest(webUrl, logs);
        const ownersGroup = await getAssociatedOwnersGroup(webUrl, logs);
        const ensuredUser = await ensureUser(webUrl, digest, trimmedEmail, logs);
        const ownersUsers = await getOwnersGroupUsers(webUrl, ownersGroup.id, logs);
        const alreadyOwner = ownersUsers.some((candidate) => sameSharePointUser(candidate, ensuredUser, trimmedEmail));

        if (alreadyOwner) {
            addOwnersLogEntry(logs, 'info', 'check-already-owner', 'User is already a SharePoint site owner', {
                enteredEmail: trimmedEmail,
                ensureUserLoginName: ensuredUser.loginName,
                userId: ensuredUser.id,
                ownersGroupId: ownersGroup.id,
                ownersGroupTitle: ownersGroup.title,
            });
            return {
                ok: true,
                status: 'already-owner',
                userEmail: trimmedEmail,
                userLoginName: ensuredUser.loginName,
                userId: ensuredUser.id,
                ownersGroupId: ownersGroup.id,
                ownersGroupTitle: ownersGroup.title,
                logs,
            };
        }

        try {
            await addUserToOwnersGroup(webUrl, digest, ownersGroup, ensuredUser, trimmedEmail, logs);
        } catch (addError) {
            if (!isAlreadyExistsError(addError)) {
                throw addError;
            }

            addOwnersLogEntry(logs, 'warn', 'add-owner', 'SharePoint reported the user is already in the owners group; treating as success', {
                enteredEmail: trimmedEmail,
                ensureUserLoginName: ensuredUser.loginName,
                ownersGroupId: ownersGroup.id,
                ownersGroupTitle: ownersGroup.title,
                error: addError,
            });

            return {
                ok: true,
                status: 'already-owner',
                userEmail: trimmedEmail,
                userLoginName: ensuredUser.loginName,
                userId: ensuredUser.id,
                ownersGroupId: ownersGroup.id,
                ownersGroupTitle: ownersGroup.title,
                logs,
            };
        }

        addOwnersLogEntry(logs, 'info', 'final-result', 'Add site owner succeeded', {
            status: 'added',
            enteredEmail: trimmedEmail,
            ensureUserLoginName: ensuredUser.loginName,
            userId: ensuredUser.id,
            ownersGroupId: ownersGroup.id,
            ownersGroupTitle: ownersGroup.title,
        });

        return {
            ok: true,
            status: 'added',
            userEmail: trimmedEmail,
            userLoginName: ensuredUser.loginName,
            userId: ensuredUser.id,
            ownersGroupId: ownersGroup.id,
            ownersGroupTitle: ownersGroup.title,
            logs,
        };
    } catch (error) {
        const result = classifyError(error, trimmedEmail, logs);
        addOwnersLogEntry(logs, 'error', 'final-result', 'Add site owner failed', {
            status: result.status,
            enteredEmail: trimmedEmail,
            error: !result.ok ? result.technicalError : undefined,
        });
        return result;
    }
};

export default addUserToAssociatedOwnersGroup;
