const PREFIX = '[SharePointPermissionsSetup]';
const MARKER_FILE_NAME = '.permissions-setup.json';
const CONTRIBUTE_ROLE_DEF_ID = 1073741827;
const ODATA_ACCEPT = 'application/json;odata=verbose';
const ODATA_CONTENT_TYPE = 'application/json;odata=verbose';

export type PermissionSetupLogEntry = {
    time: string;
    level: 'info' | 'warn' | 'error';
    step: string;
    message: string;
    data?: unknown;
};

type PermissionSetupSuccessStatus =
    | 'already-configured'
    | 'configured-now'
    | 'permissions-already-existed';

type PermissionSetupFailureStatus =
    | 'missing-config'
    | 'folder-not-found'
    | 'access-denied'
    | 'setup-failed';

export type PermissionSetupResult =
    | {
        ok: true;
        status: PermissionSetupSuccessStatus;
        folderUrl: string;
        markerFileUrl: string;
        logs?: PermissionSetupLogEntry[];
    }
    | {
        ok: false;
        status: PermissionSetupFailureStatus;
        folderUrl?: string;
        markerFileUrl?: string;
        userMessage: string;
        technicalError: unknown;
        logs?: PermissionSetupLogEntry[];
    };

type NormalizedSetupError = {
    step: string;
    message: string;
    endpoint?: string;
    status?: number;
    statusText?: string;
    responseBody?: unknown;
    originalError?: unknown;
};

type SpFetchOptions = RequestInit & {
    purpose: string;
    step: string;
    logs: PermissionSetupLogEntry[];
};

let setupOncePromise: Promise<PermissionSetupResult> | null = null;

const parseBooleanEnv = (value: unknown, fallback: boolean) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).trim().toLowerCase() === 'true';
};

const isConsoleLoggingEnabled = () => parseBooleanEnv(
    import.meta.env.VITE_SP_PERMISSIONS_SETUP_LOGS ?? import.meta.env.VITE_SP_VERBOSE_LOG,
    true
);

const safeStringify = (value: unknown) => {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const sanitizeHeadersForLog = (headers: HeadersInit | undefined) => {
    if (!headers || Array.isArray(headers)) return undefined;
    const source = headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
    return Object.fromEntries(
        Object.entries(source).map(([key, value]) => {
            const lower = key.toLowerCase();
            if (lower === 'x-requestdigest') {
                return [key, value ? `[redacted digest length ${String(value).length}]` : '[redacted digest]'];
            }
            if (lower === 'cookie' || lower === 'authorization') {
                return [key, '[redacted]'];
            }
            return [key, value];
        })
    );
};

const recordLog = (
    logs: PermissionSetupLogEntry[],
    level: PermissionSetupLogEntry['level'],
    step: string,
    message: string,
    data?: unknown
) => {
    const entry = {
        time: new Date().toISOString(),
        level,
        step,
        message,
        data,
    };
    logs.push(entry);

    if (!isConsoleLoggingEnabled()) return;

    const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info';
    console[method](`${PREFIX} ${message}`, data ?? { step });
};

const decodeSegmentSafe = (segment: string) => {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
};

const normalizeServerRelativeFolderUrl = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
        try {
            return new URL(raw).pathname;
        } catch {
            return '';
        }
    }

    return raw.startsWith('/') ? raw : `/${raw}`;
};

const encodePathForDirectRequest = (serverRelativeUrl: string) => {
    const [pathPart, queryPart = ''] = serverRelativeUrl.split('?');
    const encodedPath = pathPart
        .split('/')
        .map((segment, index) => (index === 0 ? '' : encodeURIComponent(decodeSegmentSafe(segment))))
        .join('/');
    return queryPart ? `${encodedPath}?${queryPart}` : encodedPath;
};

const encodeServerRelativeForODataLiteral = (serverRelativeUrl: string) => {
    return serverRelativeUrl
        .split('/')
        .map((segment, index) => (index === 0 ? '' : encodeURIComponent(decodeSegmentSafe(segment))))
        .join('/')
        .replace(/'/g, "''");
};

const buildMarkerFileUrl = (folderUrl: string) => `${folderUrl.replace(/\/+$/g, '')}/${MARKER_FILE_NAME}`;

const escapeMarkerPutUrl = (markerFileUrl: string) => encodePathForDirectRequest(markerFileUrl);

const inferSiteRootFromFolder = (folderUrl: string) => {
    const explicit = normalizeServerRelativeFolderUrl(
        import.meta.env.VITE_SP_SITE_API_ROOT || import.meta.env.VITE_SP_SITE_ROOT
    );
    if (explicit) return explicit.replace(/\/+$/g, '');

    const segments = folderUrl.split('/').filter(Boolean);
    const first = String(segments[0] || '').toLowerCase();
    if ((first === 'sites' || first === 'teams') && segments.length >= 2) {
        return `/${segments[0]}/${segments[1]}`;
    }

    return '';
};

const buildSiteApiEndpoint = (siteRoot: string, apiPath: string) => {
    const root = normalizeServerRelativeFolderUrl(siteRoot).replace(/\/+$/g, '');
    return root ? `${root}${apiPath}` : apiPath;
};

const buildFolderListItemEndpoint = (siteRoot: string, folderUrl: string, suffix = '') => {
    const escapedFolderUrl = encodeServerRelativeForODataLiteral(folderUrl);
    return buildSiteApiEndpoint(
        siteRoot,
        `/_api/web/GetFolderByServerRelativeUrl('${escapedFolderUrl}')/ListItemAllFields${suffix}`
    );
};

const parseResponseBody = async (response: Response) => {
    const contentType = response.headers.get('content-type') || '';
    const raw = await response.text().catch(() => '');

    if (!raw) return '';

    if (contentType.includes('application/json')) {
        try {
            return JSON.parse(raw);
        } catch {
            return raw;
        }
    }

    return raw;
};

const extractSharePointErrorMessage = (body: unknown) => {
    if (!body || typeof body !== 'object') return typeof body === 'string' ? body : '';
    const maybe = body as {
        error?: { message?: { value?: string } | string };
        ['odata.error']?: { message?: { value?: string } | string };
    };
    const message = maybe.error?.message ?? maybe['odata.error']?.message;
    if (typeof message === 'string') return message;
    return message?.value || '';
};

const normalizeError = (
    step: string,
    message: string,
    partial: Partial<NormalizedSetupError> = {}
): NormalizedSetupError => ({
    step,
    message,
    endpoint: partial.endpoint,
    status: partial.status,
    statusText: partial.statusText,
    responseBody: partial.responseBody,
    originalError: partial.originalError,
});

export const spFetchWithLogs = async (endpoint: string, options: SpFetchOptions) => {
    const { purpose, step, logs, ...fetchOptions } = options;
    const method = String(fetchOptions.method || 'GET').toUpperCase();
    const startedAt = new Date();
    const startMs = performance.now();

    recordLog(logs, 'info', step, 'SharePoint REST request starting', {
        method,
        endpoint,
        purpose,
        startedAt: startedAt.toISOString(),
        headers: sanitizeHeadersForLog(fetchOptions.headers),
    });

    try {
        const response = await fetch(endpoint, {
            credentials: 'include',
            ...fetchOptions,
        });
        const durationMs = Math.round(performance.now() - startMs);

        if (response.ok) {
            recordLog(logs, 'info', step, 'SharePoint REST request succeeded', {
                method,
                endpoint,
                purpose,
                status: response.status,
                statusText: response.statusText,
                durationMs,
            });
            return response;
        }

        const responseBody = await parseResponseBody(response);
        const normalized = normalizeError(step, extractSharePointErrorMessage(responseBody) || 'SharePoint REST request failed', {
            endpoint,
            status: response.status,
            statusText: response.statusText,
            responseBody,
        });

        recordLog(logs, 'error', step, 'SharePoint REST request failed', {
            method,
            endpoint,
            purpose,
            status: response.status,
            statusText: response.statusText,
            durationMs,
            responseBody,
            error: normalized,
        });

        throw normalized;
    } catch (error) {
        if ((error as NormalizedSetupError)?.step) {
            throw error;
        }

        const durationMs = Math.round(performance.now() - startMs);
        const normalized = normalizeError(step, 'SharePoint REST request threw before receiving a response', {
            endpoint,
            originalError: error,
        });

        recordLog(logs, 'error', step, 'SharePoint REST request threw', {
            method,
            endpoint,
            purpose,
            durationMs,
            error: normalized,
        });

        throw normalized;
    }
};

const fetchJson = async <T>(endpoint: string, options: SpFetchOptions): Promise<T> => {
    const response = await spFetchWithLogs(endpoint, options);
    return response.json() as Promise<T>;
};

const fetchText = async (endpoint: string, options: SpFetchOptions) => {
    const response = await spFetchWithLogs(endpoint, options);
    return response.text();
};

const requestDigest = async (siteRoot: string, logs: PermissionSetupLogEntry[]) => {
    const step = 'request-digest';
    const endpoint = buildSiteApiEndpoint(siteRoot, '/_api/contextinfo');
    recordLog(logs, 'info', step, 'Before requesting SharePoint context info', { endpoint, siteRoot });

    const data = await fetchJson<{
        d?: { GetContextWebInformation?: { FormDigestValue?: string } };
    }>(endpoint, {
        method: 'POST',
        purpose: 'Get SharePoint request digest',
        step,
        logs,
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
        },
    });

    const digest = data?.d?.GetContextWebInformation?.FormDigestValue || '';
    if (!digest) {
        throw normalizeError(step, 'SharePoint contextinfo response did not include FormDigestValue', { endpoint, responseBody: data });
    }

    recordLog(logs, 'info', step, 'Request digest received successfully', {
        endpoint,
        digestExists: true,
        digestLength: digest.length,
    });
    return digest;
};

const resolveAssociatedMembersGroup = async (siteRoot: string, logs: PermissionSetupLogEntry[]) => {
    const step = 'resolve-associated-members-group';
    const endpoint = buildSiteApiEndpoint(siteRoot, '/_api/web/associatedmembergroup');
    recordLog(logs, 'info', step, 'Before resolving Associated Members Group', { endpoint });

    const data = await fetchJson<{ d?: { Id?: number; Title?: string } }>(endpoint, {
        method: 'GET',
        purpose: 'Resolve current site Associated Members Group',
        step,
        logs,
        headers: { Accept: ODATA_ACCEPT },
    });
    const group = data?.d;

    if (!group?.Id) {
        throw normalizeError(step, 'Could not resolve Associated Members Group ID', { endpoint, responseBody: data });
    }

    recordLog(logs, 'info', step, 'Associated Members Group resolved', {
        title: group.Title,
        id: group.Id,
    });

    return { id: group.Id, title: group.Title || 'Associated Members Group' };
};

const checkFolderUniquePermissions = async (siteRoot: string, folderUrl: string, logs: PermissionSetupLogEntry[]) => {
    const step = 'check-folder-permissions-state';
    const endpoint = buildFolderListItemEndpoint(siteRoot, folderUrl, '?$select=HasUniqueRoleAssignments');
    recordLog(logs, 'info', step, 'Before checking folder permission inheritance state', { folderUrl, endpoint });

    const data = await fetchJson<{ d?: { HasUniqueRoleAssignments?: boolean } }>(endpoint, {
        method: 'GET',
        purpose: 'Check if folder already has unique role assignments',
        step,
        logs,
        headers: { Accept: ODATA_ACCEPT },
    });

    const hasUniqueRoleAssignments = Boolean(data?.d?.HasUniqueRoleAssignments);
    recordLog(logs, 'info', step, 'Folder permission inheritance state resolved', {
        folderUrl,
        hasUniqueRoleAssignments,
    });

    return hasUniqueRoleAssignments;
};

const breakFolderPermissionInheritance = async (
    siteRoot: string,
    folderUrl: string,
    digest: string,
    logs: PermissionSetupLogEntry[]
) => {
    const step = 'break-permission-inheritance';
    const endpoint = buildFolderListItemEndpoint(
        siteRoot,
        folderUrl,
        '/breakroleinheritance(copyRoleAssignments=true,clearSubscopes=true)'
    );

    recordLog(logs, 'info', step, 'Before breaking folder permission inheritance', { folderUrl, endpoint });

    await spFetchWithLogs(endpoint, {
        method: 'POST',
        purpose: 'Break folder ListItemAllFields permission inheritance',
        step,
        logs,
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
            'X-RequestDigest': digest,
        },
    });

    recordLog(logs, 'info', step, 'Folder permission inheritance break succeeded', { folderUrl, endpoint });
};

const getRoleAssignments = async (siteRoot: string, folderUrl: string, logs: PermissionSetupLogEntry[]) => {
    const step = 'check-existing-role-assignments';
    const endpoint = buildFolderListItemEndpoint(
        siteRoot,
        folderUrl,
        '/roleassignments?$expand=Member,RoleDefinitionBindings'
    );

    recordLog(logs, 'info', step, 'Before checking existing role assignments', { folderUrl, endpoint });

    const data = await fetchJson<{
        d?: {
            results?: Array<{
                PrincipalId?: number;
                Member?: { Id?: number; Title?: string; LoginName?: string };
                RoleDefinitionBindings?: { results?: Array<{ Id?: number; Name?: string }> };
            }>;
        };
    }>(endpoint, {
        method: 'GET',
        purpose: 'Read current folder role assignments',
        step,
        logs,
        headers: { Accept: ODATA_ACCEPT },
    });

    const assignments = data?.d?.results || [];
    recordLog(logs, 'info', step, 'Existing role assignments resolved', {
        count: assignments.length,
        assignments: assignments.map((assignment) => ({
            principalId: assignment.PrincipalId ?? assignment.Member?.Id,
            title: assignment.Member?.Title,
            loginName: assignment.Member?.LoginName,
            roles: assignment.RoleDefinitionBindings?.results?.map((role) => ({ id: role.Id, name: role.Name })) || [],
        })),
    });

    return assignments;
};

const addContributeRoleAssignment = async (
    siteRoot: string,
    folderUrl: string,
    digest: string,
    principalId: number,
    logs: PermissionSetupLogEntry[]
) => {
    const step = 'add-contribute-role-assignment';
    const endpoint = buildFolderListItemEndpoint(
        siteRoot,
        folderUrl,
        `/roleassignments/addroleassignment(principalid=${principalId},roledefid=${CONTRIBUTE_ROLE_DEF_ID})`
    );

    recordLog(logs, 'info', step, 'Before adding Contribute role assignment', {
        folderUrl,
        endpoint,
        principalId,
        roleDefId: CONTRIBUTE_ROLE_DEF_ID,
    });

    await spFetchWithLogs(endpoint, {
        method: 'POST',
        purpose: 'Grant Associated Members Group Contribute permissions on folder',
        step,
        logs,
        headers: {
            Accept: ODATA_ACCEPT,
            'Content-Type': ODATA_CONTENT_TYPE,
            'X-RequestDigest': digest,
        },
    });

    recordLog(logs, 'info', step, 'Contribute role assignment succeeded', {
        folderUrl,
        principalId,
        roleDefId: CONTRIBUTE_ROLE_DEF_ID,
    });
};

const writeMarkerFile = async (
    markerFileUrl: string,
    marker: Record<string, unknown>,
    logs: PermissionSetupLogEntry[]
) => {
    const step = 'write-marker-file';
    const endpoint = escapeMarkerPutUrl(markerFileUrl);
    const text = JSON.stringify(marker, null, 2);

    recordLog(logs, 'info', step, 'Before writing permissions setup marker file', {
        markerFileUrl,
        endpoint,
        marker: {
            ...marker,
            completedAt: marker.completedAt,
        },
    });

    await spFetchWithLogs(endpoint, {
        method: 'PUT',
        purpose: 'Create or update permissions setup marker file',
        step,
        logs,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: text,
    });

    recordLog(logs, 'info', step, 'Marker file created successfully', { markerFileUrl });
};

const hasContributeAssignment = (
    assignments: Awaited<ReturnType<typeof getRoleAssignments>>,
    principalId: number
) => assignments.some((assignment) => {
    const assignmentPrincipalId = assignment.PrincipalId ?? assignment.Member?.Id;
    const roles = assignment.RoleDefinitionBindings?.results || [];
    return assignmentPrincipalId === principalId && roles.some((role) => role.Id === CONTRIBUTE_ROLE_DEF_ID);
});

const isDuplicateRoleAssignmentError = (error: unknown) => {
    const normalized = error as NormalizedSetupError;
    const message = [
        normalized?.message,
        extractSharePointErrorMessage(normalized?.responseBody),
        typeof normalized?.responseBody === 'string' ? normalized.responseBody : safeStringify(normalized?.responseBody),
    ].filter(Boolean).join(' ');

    return /already exists|role assignment.*exist|assignment.*already/i.test(message);
};

const classifyFailure = (error: unknown, folderUrl?: string, markerFileUrl?: string) => {
    const normalized = error as NormalizedSetupError;
    const status = Number(normalized?.status || 0);

    if (status === 403 || /access denied|unauthorized|forbidden/i.test(normalized?.message || '')) {
        return {
            ok: false as const,
            status: 'access-denied' as const,
            folderUrl,
            markerFileUrl,
            userMessage: 'נדרשת פתיחה חד-פעמית של האפליקציה על ידי בעלים/מנהל אתר SharePoint כדי להשלים את הגדרת ההרשאות הראשונית.',
            technicalError: normalized || error,
        };
    }

    if (status === 404) {
        return {
            ok: false as const,
            status: 'folder-not-found' as const,
            folderUrl,
            markerFileUrl,
            userMessage: 'תיקיית מסד הנתונים ב-SharePoint לא נמצאה. יש לבדוק שהערך VITE_SP_USERS_DB_FOLDER נכון ושהתיקייה קיימת.',
            technicalError: normalized || error,
        };
    }

    return {
        ok: false as const,
        status: 'setup-failed' as const,
        folderUrl,
        markerFileUrl,
        userMessage: 'הגדרת ההרשאות הראשונית נכשלה. ניתן להמשיך להשתמש באתר, אך יש לפנות למנהל האתר ולבדוק את לוג הדפדפן.',
        technicalError: normalized || error,
    };
};

const ensureUsersDbFolderPermissionsReadyInternal = async (): Promise<PermissionSetupResult> => {
    const logs: PermissionSetupLogEntry[] = [];
    const configuredFolder = import.meta.env.VITE_SP_USERS_DB_FOLDER;
    const folderUrl = normalizeServerRelativeFolderUrl(configuredFolder);
    const markerFileUrl = folderUrl ? buildMarkerFileUrl(folderUrl) : undefined;
    const siteRoot = folderUrl ? inferSiteRootFromFolder(folderUrl) : '';

    recordLog(logs, 'info', 'setup-start', 'Setup starts', {
        configuredValue: configuredFolder,
        folderUrl,
        siteRoot,
        logsEnabled: isConsoleLoggingEnabled(),
        logEnv: {
            VITE_SP_PERMISSIONS_SETUP_LOGS: import.meta.env.VITE_SP_PERMISSIONS_SETUP_LOGS,
            VITE_SP_VERBOSE_LOG: import.meta.env.VITE_SP_VERBOSE_LOG,
        },
    });
    recordLog(logs, 'info', 'configuration', 'Configured VITE_SP_USERS_DB_FOLDER value resolved', { configuredFolder, folderUrl });
    recordLog(logs, 'info', 'configuration', 'Resolved SharePoint site/web URL', { siteRoot });
    recordLog(logs, 'info', 'configuration', 'Resolved marker file path', { markerFileUrl });

    if (!folderUrl) {
        const error = normalizeError('configuration', 'VITE_SP_USERS_DB_FOLDER is missing', {
            responseBody: {
                VITE_SP_USERS_DB_FOLDER: configuredFolder ?? null,
                mode: import.meta.env.MODE,
                prod: import.meta.env.PROD,
            },
        });
        recordLog(logs, 'error', 'configuration', 'Final failure result', error);
        return {
            ok: false,
            status: 'missing-config',
            userMessage: 'נתיב תיקיית מסד הנתונים של SharePoint לא מוגדר. חסר הערך VITE_SP_USERS_DB_FOLDER.',
            technicalError: error,
            logs,
        };
    }

    try {
        const markerEndpoint = escapeMarkerPutUrl(markerFileUrl!);
        recordLog(logs, 'info', 'check-marker-file', 'Before checking marker file', {
            folderUrl,
            markerFileUrl,
            endpoint: markerEndpoint,
        });

        try {
            const markerContent = await fetchText(markerEndpoint, {
                method: 'GET',
                purpose: 'Check if one-time permissions setup marker exists',
                step: 'check-marker-file',
                logs,
                headers: { Accept: 'application/json, text/plain, */*' },
            });

            recordLog(logs, 'info', 'check-marker-file', 'Marker file exists. Setup already completed.', {
                markerFileUrl,
                markerContent,
            });
            recordLog(logs, 'info', 'setup-success', 'Final success result', {
                status: 'already-configured',
                folderUrl,
                markerFileUrl,
            });

            return {
                ok: true,
                status: 'already-configured',
                folderUrl,
                markerFileUrl: markerFileUrl!,
                logs,
            };
        } catch (markerError) {
            const normalizedMarkerError = markerError as NormalizedSetupError;
            if (normalizedMarkerError.status !== 404) {
                throw markerError;
            }
            recordLog(logs, 'info', 'check-marker-file', 'Marker file does not exist. Setup will run.', {
                markerFileUrl,
                status: normalizedMarkerError.status,
            });
        }

        const digest = await requestDigest(siteRoot, logs);
        const group = await resolveAssociatedMembersGroup(siteRoot, logs);
        const hadUniquePermissions = await checkFolderUniquePermissions(siteRoot, folderUrl, logs);

        if (hadUniquePermissions) {
            recordLog(logs, 'info', 'break-permission-inheritance', 'Folder already has unique permissions. Skipping inheritance break.', {
                folderUrl,
            });
        } else {
            await breakFolderPermissionInheritance(siteRoot, folderUrl, digest, logs);
        }

        const assignments = await getRoleAssignments(siteRoot, folderUrl, logs);
        const roleAlreadyExists = hasContributeAssignment(assignments, group.id);

        if (roleAlreadyExists) {
            recordLog(logs, 'info', 'add-contribute-role-assignment', 'Contribute role assignment already exists. Setup continues.', {
                folderUrl,
                principalId: group.id,
                roleDefId: CONTRIBUTE_ROLE_DEF_ID,
            });
        } else {
            try {
                await addContributeRoleAssignment(siteRoot, folderUrl, digest, group.id, logs);
            } catch (addRoleError) {
                if (!isDuplicateRoleAssignmentError(addRoleError)) {
                    throw addRoleError;
                }

                recordLog(logs, 'warn', 'add-contribute-role-assignment', 'Role assignment already exists according to SharePoint response. Setup continues.', {
                    folderUrl,
                    principalId: group.id,
                    roleDefId: CONTRIBUTE_ROLE_DEF_ID,
                    error: addRoleError,
                });
            }
        }

        await writeMarkerFile(markerFileUrl!, {
            completed: true,
            folder: folderUrl,
            role: 'Contribute',
            roleDefId: CONTRIBUTE_ROLE_DEF_ID,
            target: 'Associated Members Group',
            targetPrincipalId: group.id,
            targetTitle: group.title,
            completedAt: new Date().toISOString(),
        }, logs);

        const status: PermissionSetupSuccessStatus = roleAlreadyExists || hadUniquePermissions
            ? 'permissions-already-existed'
            : 'configured-now';

        recordLog(logs, 'info', 'setup-success', 'Final success result', {
            status,
            folderUrl,
            markerFileUrl,
            associatedMembersGroup: group,
        });

        return {
            ok: true,
            status,
            folderUrl,
            markerFileUrl: markerFileUrl!,
            logs,
        };
    } catch (error) {
        const failure = classifyFailure(error, folderUrl, markerFileUrl);
        recordLog(logs, 'error', 'setup-failure', 'Final failure result', {
            ...failure,
            logs: undefined,
            technicalError: failure.technicalError,
        });

        return {
            ...failure,
            logs,
        };
    }
};

export const ensureUsersDbFolderPermissionsReady = (): Promise<PermissionSetupResult> => {
    if (setupOncePromise) {
        return setupOncePromise;
    }

    setupOncePromise = ensureUsersDbFolderPermissionsReadyInternal();
    return setupOncePromise;
};

export default ensureUsersDbFolderPermissionsReady;
