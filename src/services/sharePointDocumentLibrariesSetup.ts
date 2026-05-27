import { SHAREPOINT_PATHS } from '../config/sharepointPaths';

const PREFIX = '[SharePointLibrarySetup]';
const ODATA_ACCEPT = 'application/json;odata=verbose';
const ODATA_CONTENT_TYPE = 'application/json;odata=verbose';
const REQUIRED_WELCOME_PAGE = 'Forms/AllItems.aspx';
const env = (import.meta as any).env || {};

type SetupLogLevel = 'info' | 'warn' | 'error';

export type SharePointLibrarySetupLogEntry = {
  time: string;
  level: SetupLogLevel;
  step: string;
  message: string;
  data?: unknown;
};

type SharePointLibrarySnapshot = {
  title: string;
  expectedRootUrl: string;
  defaultViewUrl: string;
  rootServerRelativeUrl: string;
  welcomePage: string;
  onQuickLaunch: boolean | null;
  wasCreated: boolean;
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

export type SharePointLibrarySetupResult =
  | {
      ok: true;
      status: 'already-configured' | 'configured-now';
      siteRoot: string;
      libraries: SharePointLibrarySnapshot[];
      logs: SharePointLibrarySetupLogEntry[];
    }
  | {
      ok: false;
      status: 'access-denied' | 'contextinfo-failed' | 'setup-failed' | 'invalid-config';
      userMessage: string;
      technicalError: unknown;
      logs: SharePointLibrarySetupLogEntry[];
    };

type SpFetchOptions = RequestInit & {
  purpose: string;
  step: string;
  logs: SharePointLibrarySetupLogEntry[];
};

type LibraryDefinition = {
  envName: string;
  rawValue: string;
  title: string;
  expectedRootUrl: string;
};

let setupOncePromise: Promise<SharePointLibrarySetupResult> | null = null;

const parseBooleanEnv = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
};

const isConsoleLoggingEnabled = () =>
  parseBooleanEnv(env.VITE_SP_LIBRARY_PROVISIONING_LOGS ?? env.VITE_SP_VERBOSE_LOG, false);

const recordLog = (
  logs: SharePointLibrarySetupLogEntry[],
  level: SetupLogLevel,
  step: string,
  message: string,
  data?: unknown,
) => {
  const entry: SharePointLibrarySetupLogEntry = {
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

const normalizeServerRelative = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw.replace(/\/+$/g, '');
  return `/${raw.replace(/\/+$/g, '')}`;
};

const toSegments = (value: unknown) => String(value ?? '').split('/').filter(Boolean);
const escapeODataString = (value: unknown) => String(value ?? '').replace(/'/g, "''");

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

const normalizeError = (step: string, message: string, partial: Partial<NormalizedSetupError> = {}): NormalizedSetupError => ({
  step,
  message,
  endpoint: partial.endpoint,
  status: partial.status,
  statusText: partial.statusText,
  responseBody: partial.responseBody,
  originalError: partial.originalError,
});

const resolveLibraryDefinition = (
  rawValue: unknown,
  fallbackTitle: string,
  envName: string,
  siteRoot: string,
): LibraryDefinition => {
  const raw = String(rawValue ?? '').trim();
  const segments = toSegments(raw);
  const title = segments.length ? segments[segments.length - 1] : fallbackTitle;
  if (!title) {
    throw normalizeError('configuration', `${envName} did not resolve to a valid library title.`);
  }
  return {
    envName,
    rawValue: raw,
    title,
    expectedRootUrl: normalizeServerRelative(`${siteRoot}/${title}`),
  };
};

const buildSiteApiEndpoint = (siteRoot: string, apiPath: string) => {
  const root = normalizeServerRelative(siteRoot).replace(/\/+$/g, '');
  return `${root}${apiPath}`;
};

const spFetchWithLogs = async (endpoint: string, options: SpFetchOptions) => {
  const { purpose, step, logs, ...fetchOptions } = options;
  const method = String(fetchOptions.method || 'GET').toUpperCase();
  const startedAt = performance.now();

  recordLog(logs, 'info', step, 'SharePoint REST request starting', {
    runtime: typeof window === 'undefined' ? 'node' : 'browser',
    method,
    endpoint,
    purpose,
  });

  try {
    const response = await fetch(endpoint, {
      credentials: 'include',
      ...fetchOptions,
    });
    const durationMs = Math.round(performance.now() - startedAt);

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
    const normalized = normalizeError(
      step,
      extractSharePointErrorMessage(responseBody) || 'SharePoint REST request failed',
      {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        responseBody,
      },
    );

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
    if ((error as NormalizedSetupError)?.step) throw error;
    const normalized = normalizeError(step, 'SharePoint REST request threw before receiving response', {
      endpoint,
      originalError: error,
    });
    recordLog(logs, 'error', step, 'SharePoint REST request threw', {
      method,
      endpoint,
      purpose,
      error: normalized,
    });
    throw normalized;
  }
};

const fetchJson = async <T>(endpoint: string, options: SpFetchOptions): Promise<T> => {
  const response = await spFetchWithLogs(endpoint, options);
  return response.json() as Promise<T>;
};

const requestDigest = async (siteRoot: string, logs: SharePointLibrarySetupLogEntry[]) => {
  const endpoint = buildSiteApiEndpoint(siteRoot, '/_api/contextinfo');
  const step = 'request-digest';

  recordLog(logs, 'info', step, 'Requesting SharePoint context info', { endpoint });
  const data = await fetchJson<{ d?: { GetContextWebInformation?: { FormDigestValue?: string } } }>(endpoint, {
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
    throw normalizeError(step, 'contextinfo response did not include FormDigestValue', {
      endpoint,
      responseBody: data,
    });
  }
  return digest;
};

const getCurrentUserInfo = async (siteRoot: string, logs: SharePointLibrarySetupLogEntry[]) => {
  const step = 'current-user';
  const endpoint = buildSiteApiEndpoint(siteRoot, '/_api/web/currentuser?$select=Id,Title,LoginName,Email,IsSiteAdmin');
  const data = await fetchJson<{ d?: Record<string, unknown> }>(endpoint, {
    method: 'GET',
    purpose: 'Read current SharePoint user info',
    step,
    logs,
    headers: {
      Accept: ODATA_ACCEPT,
    },
  });
  recordLog(logs, 'info', step, 'Current SharePoint user resolved', data?.d || null);
};

const readLibrary = async (siteRoot: string, libraryTitle: string, logs: SharePointLibrarySetupLogEntry[]) => {
  const step = 'read-library';
  const encodedTitle = escapeODataString(libraryTitle);
  const endpoint = buildSiteApiEndpoint(
    siteRoot,
    `/_api/web/lists/GetByTitle('${encodedTitle}')?$select=Id,Title,BaseTemplate,DefaultViewUrl,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,OnQuickLaunch&$expand=RootFolder`,
  );

  try {
    const data = await fetchJson<{ d?: Record<string, unknown> }>(endpoint, {
      method: 'GET',
      purpose: `Read library "${libraryTitle}"`,
      step,
      logs,
      headers: { Accept: ODATA_ACCEPT },
    });
    return data?.d || null;
  } catch (error) {
    const normalized = error as NormalizedSetupError;
    if (normalized?.status === 404) return null;
    throw error;
  }
};

const createDocumentLibrary = async (
  siteRoot: string,
  libraryTitle: string,
  digest: string,
  logs: SharePointLibrarySetupLogEntry[],
) => {
  const step = 'create-library';
  const endpoint = buildSiteApiEndpoint(siteRoot, '/_api/web/lists');
  await spFetchWithLogs(endpoint, {
    method: 'POST',
    purpose: `Create document library "${libraryTitle}"`,
    step,
    logs,
    headers: {
      Accept: ODATA_ACCEPT,
      'Content-Type': ODATA_CONTENT_TYPE,
      'X-RequestDigest': digest,
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.List' },
      BaseTemplate: 101,
      Title: libraryTitle,
      Description: 'Application data library',
      OnQuickLaunch: true,
    }),
  });
};

const setLibraryOnQuickLaunch = async (
  siteRoot: string,
  libraryTitle: string,
  digest: string,
  logs: SharePointLibrarySetupLogEntry[],
) => {
  const step = 'set-onquicklaunch';
  const encodedTitle = escapeODataString(libraryTitle);
  const endpoint = buildSiteApiEndpoint(siteRoot, `/_api/web/lists/GetByTitle('${encodedTitle}')`);
  await spFetchWithLogs(endpoint, {
    method: 'POST',
    purpose: `Set OnQuickLaunch=true for "${libraryTitle}"`,
    step,
    logs,
    headers: {
      Accept: ODATA_ACCEPT,
      'Content-Type': ODATA_CONTENT_TYPE,
      'X-RequestDigest': digest,
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.List' },
      OnQuickLaunch: true,
    }),
  });
};

const setFolderWelcomePage = async (
  siteRoot: string,
  folderServerRelativeUrl: string,
  digest: string,
  logs: SharePointLibrarySetupLogEntry[],
) => {
  const step = 'set-welcome-page';
  const escaped = escapeODataString(folderServerRelativeUrl);
  const endpoint = buildSiteApiEndpoint(siteRoot, `/_api/web/GetFolderByServerRelativeUrl('${escaped}')`);
  await spFetchWithLogs(endpoint, {
    method: 'POST',
    purpose: `Set folder WelcomePage=${REQUIRED_WELCOME_PAGE}`,
    step,
    logs,
    headers: {
      Accept: ODATA_ACCEPT,
      'Content-Type': ODATA_CONTENT_TYPE,
      'X-RequestDigest': digest,
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: JSON.stringify({
      __metadata: { type: 'SP.Folder' },
      WelcomePage: REQUIRED_WELCOME_PAGE,
    }),
  });
};

const validateLibrary = (
  library: Record<string, unknown> | null,
  libraryTitle: string,
  expectedRootUrl: string,
) => {
  if (!library) {
    throw normalizeError('validate-library', `Library "${libraryTitle}" was not found after provisioning.`);
  }
  const baseTemplate = Number(library.BaseTemplate ?? 0);
  const actualRoot = String((library.RootFolder as { ServerRelativeUrl?: string } | undefined)?.ServerRelativeUrl || '');
  if (baseTemplate !== 101) {
    throw normalizeError(
      'validate-library',
      `SharePoint object "${libraryTitle}" exists but is not a Document Library (BaseTemplate=${library.BaseTemplate}).`,
      { responseBody: library },
    );
  }
  if (actualRoot !== expectedRootUrl) {
    throw normalizeError(
      'validate-library',
      `Library "${libraryTitle}" root mismatch. Expected "${expectedRootUrl}" but got "${actualRoot || '(empty)'}".`,
      { responseBody: library },
    );
  }
};

const buildFolderViewUrl = (defaultViewUrl: string, folderServerRelativeUrl: string) =>
  `${defaultViewUrl}?RootFolder=${encodeURIComponent(folderServerRelativeUrl)}`;

const ensureDocumentLibraryBrowserView = async (
  siteRoot: string,
  libraryTitle: string,
  expectedRootUrl: string,
  digest: string,
  logs: SharePointLibrarySetupLogEntry[],
) => {
  const step = 'ensure-browser-view';
  let library = await readLibrary(siteRoot, libraryTitle, logs);
  validateLibrary(library, libraryTitle, expectedRootUrl);

  const welcomeBefore = String((library?.RootFolder as { WelcomePage?: string } | undefined)?.WelcomePage || '');
  const defaultViewBefore = String(library?.DefaultViewUrl || '');
  if (!defaultViewBefore) {
    throw normalizeError(step, `Library "${libraryTitle}" has no DefaultViewUrl.`, { responseBody: library });
  }

  recordLog(logs, 'info', step, 'Library browser-view state before update', {
    libraryTitle,
    expectedRootUrl,
    DefaultViewUrl: defaultViewBefore,
    RootFolderWelcomePageBefore: welcomeBefore || '(empty)',
  });

  if (welcomeBefore !== REQUIRED_WELCOME_PAGE) {
    await setFolderWelcomePage(siteRoot, expectedRootUrl, digest, logs);
    library = await readLibrary(siteRoot, libraryTitle, logs);
    validateLibrary(library, libraryTitle, expectedRootUrl);
  }

  const defaultViewUrl = String(library?.DefaultViewUrl || '');
  const rootUrl = String((library?.RootFolder as { ServerRelativeUrl?: string } | undefined)?.ServerRelativeUrl || '');
  const welcomePage = String((library?.RootFolder as { WelcomePage?: string } | undefined)?.WelcomePage || '');
  const onQuickLaunchRaw = library?.OnQuickLaunch;
  const onQuickLaunch = typeof onQuickLaunchRaw === 'boolean' ? onQuickLaunchRaw : null;

  if (!defaultViewUrl) {
    throw normalizeError(step, `Library "${libraryTitle}" still has no DefaultViewUrl after WelcomePage update.`, {
      responseBody: library,
    });
  }

  recordLog(logs, 'info', step, 'Library browser-view state after update', {
    libraryTitle,
    BaseTemplate: library?.BaseTemplate,
    DefaultViewUrl: defaultViewUrl,
    RootFolderServerRelativeUrl: rootUrl,
    RootFolderWelcomePageAfter: welcomePage || '(empty)',
    OnQuickLaunch: onQuickLaunch,
    generatedRootViewUrl: buildFolderViewUrl(defaultViewUrl, expectedRootUrl),
  });

  return { defaultViewUrl, rootUrl, welcomePage, onQuickLaunch };
};

const ensureSingleLibrary = async (
  siteRoot: string,
  def: LibraryDefinition,
  digest: string,
  logs: SharePointLibrarySetupLogEntry[],
): Promise<SharePointLibrarySnapshot> => {
  let wasCreated = false;
  let library = await readLibrary(siteRoot, def.title, logs);

  if (!library) {
    recordLog(logs, 'info', 'create-library', 'Library does not exist and will be created', {
      envName: def.envName,
      rawValue: def.rawValue,
      libraryTitle: def.title,
      expectedRootUrl: def.expectedRootUrl,
    });
    await createDocumentLibrary(siteRoot, def.title, digest, logs);
    wasCreated = true;
    library = await readLibrary(siteRoot, def.title, logs);
  } else {
    recordLog(logs, 'info', 'create-library', 'Library already exists', {
      envName: def.envName,
      rawValue: def.rawValue,
      libraryTitle: def.title,
    });
  }

  validateLibrary(library, def.title, def.expectedRootUrl);

  if (library?.OnQuickLaunch !== true) {
    await setLibraryOnQuickLaunch(siteRoot, def.title, digest, logs);
    library = await readLibrary(siteRoot, def.title, logs);
    validateLibrary(library, def.title, def.expectedRootUrl);
  }

  const browserView = await ensureDocumentLibraryBrowserView(siteRoot, def.title, def.expectedRootUrl, digest, logs);
  recordLog(logs, 'info', 'library-ready', 'Library ready for SharePoint UI/browser navigation', {
    libraryTitle: def.title,
    expectedRootUrl: def.expectedRootUrl,
    DefaultViewUrl: browserView.defaultViewUrl,
    RootFolderServerRelativeUrl: browserView.rootUrl,
    RootFolderWelcomePage: browserView.welcomePage,
    createdNow: wasCreated,
  });

  return {
    title: def.title,
    expectedRootUrl: def.expectedRootUrl,
    defaultViewUrl: browserView.defaultViewUrl,
    rootServerRelativeUrl: browserView.rootUrl || def.expectedRootUrl,
    welcomePage: browserView.welcomePage || '',
    onQuickLaunch: browserView.onQuickLaunch,
    wasCreated,
  };
};

const classifyFailure = (error: unknown): Omit<Extract<SharePointLibrarySetupResult, { ok: false }>, 'logs'> => {
  const normalized = error as NormalizedSetupError;
  const status = Number(normalized?.status || 0);
  const isContextInfoStep = normalized?.step === 'request-digest';

  if (status === 401 || status === 403 || isContextInfoStep) {
    return {
      ok: false,
      status: isContextInfoStep ? 'contextinfo-failed' : 'access-denied',
      userMessage: 'לא ניתן לבצע הקמת SharePoint. יש לפתוח את האתר כמשתמש בעל הרשאות בעל אתר.',
      technicalError: normalized || error,
    };
  }

  if (normalized?.step === 'configuration') {
    return {
      ok: false,
      status: 'invalid-config',
      userMessage: 'הגדרת ספריות SharePoint חסרה או לא תקינה (VITE_SP_SITE_DB_FOLDER / VITE_SP_USERS_DB_FOLDER).',
      technicalError: normalized || error,
    };
  }

  return {
    ok: false,
    status: 'setup-failed',
    userMessage: 'הקמת ספריות SharePoint נכשלה. יש לבדוק את לוג הדפדפן או לפנות למנהל האתר.',
    technicalError: normalized || error,
  };
};

const ensureSharePointDocumentLibrariesReadyInternal = async (): Promise<SharePointLibrarySetupResult> => {
  const logs: SharePointLibrarySetupLogEntry[] = [];
  const siteRoot = normalizeServerRelative(SHAREPOINT_PATHS.siteRoot);

  recordLog(logs, 'info', 'setup-start', 'Document library setup starting', {
    runtime: typeof window === 'undefined' ? 'node' : 'browser',
    siteRoot,
    contextinfoEndpoint: buildSiteApiEndpoint(siteRoot, '/_api/contextinfo'),
    VITE_SP_SITE_DB_FOLDER: env.VITE_SP_SITE_DB_FOLDER,
    VITE_SP_USERS_DB_FOLDER: env.VITE_SP_USERS_DB_FOLDER,
  });

  if (typeof window === 'undefined') {
    const error = normalizeError('setup-start', 'Document library setup must run in browser runtime');
    return {
      ok: false,
      status: 'setup-failed',
      userMessage: 'הקמת ספריות SharePoint חייבת לרוץ מתוך האפליקציה בדפדפן.',
      technicalError: error,
      logs,
    };
  }

  try {
    const siteDbDef = resolveLibraryDefinition(
      env.VITE_SP_SITE_DB_FOLDER,
      SHAREPOINT_PATHS.siteDbFolder || 'siteDB',
      'VITE_SP_SITE_DB_FOLDER',
      siteRoot,
    );
    const usersDbDef = resolveLibraryDefinition(
      env.VITE_SP_USERS_DB_FOLDER,
      SHAREPOINT_PATHS.usersDbFolder || 'siteUsersDb',
      'VITE_SP_USERS_DB_FOLDER',
      siteRoot,
    );

    recordLog(logs, 'info', 'configuration', 'Resolved library configuration', {
      siteDb: siteDbDef,
      usersDb: usersDbDef,
    });

    await getCurrentUserInfo(siteRoot, logs);
    const digest = await requestDigest(siteRoot, logs);

    const siteDb = await ensureSingleLibrary(siteRoot, siteDbDef, digest, logs);
    const usersDb = await ensureSingleLibrary(siteRoot, usersDbDef, digest, logs);
    const status = siteDb.wasCreated || usersDb.wasCreated ? 'configured-now' : 'already-configured';

    recordLog(logs, 'info', 'setup-success', 'Document library setup completed', {
      status,
      libraries: [siteDb, usersDb],
    });
    return {
      ok: true,
      status,
      siteRoot,
      libraries: [siteDb, usersDb],
      logs,
    };
  } catch (error) {
    const failure = classifyFailure(error);
    recordLog(logs, 'error', 'setup-failure', 'Document library setup failed', failure);
    return {
      ...failure,
      logs,
    };
  }
};

export const ensureSharePointDocumentLibrariesReady = (): Promise<SharePointLibrarySetupResult> => {
  if (setupOncePromise) return setupOncePromise;
  setupOncePromise = ensureSharePointDocumentLibrariesReadyInternal();
  return setupOncePromise;
};

export default ensureSharePointDocumentLibrariesReady;
