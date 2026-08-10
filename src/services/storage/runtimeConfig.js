import { createSharePointRuntimeDescriptor, SharePointRuntimeDescriptorError } from '../../config/sharepointRuntimeDescriptor';

const RUNTIME_CONFIG_FILENAMES = Object.freeze([
  'sitebuilder-runtime-config.json',
  'runtime-config.json',
]);
const DEPLOYMENT_METADATA_FILENAMES = Object.freeze(['sitebuilder-deployment.json']);
const VALID_STORAGE_BACKENDS = new Set(['txt', 'mongo']);
const BODY_PREFIX_LIMIT = 160;

let runtimeConfigPromise = null;
let runtimeConfigLoaded = false;
let runtimeConfigSource = null;
let lastResolvedConfig = null;
let deploymentMetadataSource = null;
let lastDeploymentMetadata = null;
let lastConsoleMessage = null;
let lastRuntimeError = null;
let runtimeAttempts = [];

export class RuntimeConfigError extends Error {
  constructor(message, { code = 'runtime_config_error', details = null } = {}) {
    super(message);
    this.name = 'RuntimeConfigError';
    this.code = code;
    this.details = details;
  }
}

function asString(value) {
  return String(value ?? '').trim();
}

function sanitizeBackend(value, { allowEmpty = true } = {}) {
  const normalized = asString(value);
  if (!normalized && allowEmpty) return '';
  if (!VALID_STORAGE_BACKENDS.has(normalized)) {
    throw new RuntimeConfigError(
      `Invalid storage backend "${normalized || '(empty)'}". Expected "txt" or "mongo".`,
      { code: 'invalid_storage_backend' },
    );
  }
  return normalized;
}

export const SITE_BUILD_MODES = Object.freeze({
  LEGACY: 'legacy',
  UNIVERSAL: 'universal',
});

const isDevelopmentRuntime = () => import.meta.env.DEV === true || import.meta.env.MODE === 'test';

/** The production artifact selects this before the browser executes any app code. */
export function getSiteBuildMode() {
  const configured = asString(import.meta.env.VITE_SITE_BUILD_MODE).toLowerCase();
  if (configured === SITE_BUILD_MODES.LEGACY || configured === SITE_BUILD_MODES.UNIVERSAL) return configured;
  return isDevelopmentRuntime() ? 'development' : SITE_BUILD_MODES.LEGACY;
}

const isLegacyBuild = () => getSiteBuildMode() === SITE_BUILD_MODES.LEGACY;
const requiresRuntimeOverlay = () => getSiteBuildMode() === SITE_BUILD_MODES.UNIVERSAL;

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const SHAREPOINT_RUNTIME_FIELDS = Object.freeze([
  'host', 'siteCode', 'siteRoot', 'siteApiRoot',
  'siteDbFolder', 'siteDbRoot', 'usersDbFolder', 'usersDbRoot',
  'siteAssetsFolder', 'siteAssetsRoot', 'imagesFolder', 'imagesRoot',
  'widgetsDbTarget', 'sharePointSiteUrl', 'allowedSiteRoot', 'finalAppUrl',
  'targetDistPath', 'bootstrapLibrary', 'bootstrapFolder',
]);

function hasSharePointRuntimeFields(candidate) {
  return SHAREPOINT_RUNTIME_FIELDS.some((field) => hasOwn(candidate, field));
}

function deriveSharePointIdentityFromUrl(candidate) {
  if (asString(candidate.host) && asString(candidate.siteCode)) return candidate;
  const rawUrl = asString(candidate.sharePointSiteUrl || candidate.allowedSiteRoot || candidate.targetSiteUrl);
  if (!rawUrl) return candidate;
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2 || !['sites', 'teams'].includes(String(parts[0]).toLowerCase())) return candidate;
    const siteRoot = `/${parts[0]}/${parts[1]}`;
    return {
      ...candidate,
      host: asString(candidate.host) || url.host,
      siteCode: asString(candidate.siteCode) || parts[1],
      siteRoot: asString(candidate.siteRoot) || siteRoot,
    };
  } catch {
    return candidate;
  }
}

function createDevelopmentFallback() {
  return normalizeCandidate({
    schemaVersion: 2,
    storageBackend: import.meta.env.VITE_STORAGE_BACKEND || 'txt',
    backendApiUrl: import.meta.env.VITE_BACKEND_API_URL,
    siteId: import.meta.env.VITE_SITE_ID || import.meta.env.VITE_SP_SITE_CODE,
    host: import.meta.env.VITE_SP_HOST,
    siteCode: import.meta.env.VITE_SP_SITE_CODE,
    siteDbFolder: import.meta.env.VITE_SP_SITE_DB_FOLDER,
    usersDbFolder: import.meta.env.VITE_SP_USERS_DB_FOLDER,
    siteAssetsFolder: import.meta.env.VITE_SP_SITE_ASSETS_FOLDER,
    imagesFolder: import.meta.env.VITE_SP_IMAGES_FOLDER,
    widgetsDbTarget: import.meta.env.VITE_SP_WIDGETS_DB_TARGET,
    siteApiRoot: import.meta.env.VITE_SP_SITE_API_ROOT,
    bootstrapLibrary: import.meta.env.VITE_SP_BOOTSTRAP_LIBRARY,
    bootstrapFolder: import.meta.env.VITE_SP_BOOTSTRAP_FOLDER,
  }, { source: 'development environment', requireTxtIdentity: false });
}

function finalAppUrlFromBuildBaseUrl(value) {
  const baseUrl = asString(value);
  if (!baseUrl || /\/index\.html(?:$|[?#])/i.test(baseUrl)) return baseUrl;
  return `${baseUrl.replace(/\/+$/g, '')}/index.html`;
}

/**
 * Legacy builds intentionally freeze their descriptor from values compiled by
 * Vite. Runtime JSON is ignored in this mode so a stale or absent overlay can
 * never change how an existing traditional SharePoint deployment boots.
 */
function createLegacyBuildConfig() {
  const config = normalizeCandidate({
    schemaVersion: 2,
    storageBackend: import.meta.env.VITE_STORAGE_BACKEND || 'txt',
    backendApiUrl: import.meta.env.VITE_BACKEND_API_URL,
    siteId: import.meta.env.VITE_SITE_ID || import.meta.env.VITE_SP_SITE_CODE,
    host: import.meta.env.VITE_SP_HOST,
    siteCode: import.meta.env.VITE_SP_SITE_CODE,
    siteDbFolder: import.meta.env.VITE_SP_SITE_DB_FOLDER,
    usersDbFolder: import.meta.env.VITE_SP_USERS_DB_FOLDER,
    siteAssetsFolder: import.meta.env.VITE_SP_SITE_ASSETS_FOLDER,
    imagesFolder: import.meta.env.VITE_SP_IMAGES_FOLDER,
    widgetsDbTarget: import.meta.env.VITE_SP_WIDGETS_DB_TARGET,
    siteApiRoot: import.meta.env.VITE_SP_SITE_API_ROOT,
    bootstrapLibrary: import.meta.env.VITE_SP_BOOTSTRAP_LIBRARY,
    bootstrapFolder: import.meta.env.VITE_SP_BOOTSTRAP_FOLDER,
    finalAppUrl: finalAppUrlFromBuildBaseUrl(import.meta.env.VITE_SITE_BASE_URL),
  }, { source: 'legacy build environment', requireTxtIdentity: true });
  if (!config) {
    throw new RuntimeConfigError('Legacy build is missing its compiled storage configuration.', {
      code: 'missing_legacy_build_config',
    });
  }
  return config;
}

function sanitizeBodyPrefix(text, { parsedJson = false } = {}) {
  if (parsedJson) return '[valid JSON payload omitted]';
  return asString(text)
    .replace(/("?(?:api[-_]?key|token|secret|password)"?\s*[:=]\s*)["'][^"']*["']/gi, '$1"[redacted]"')
    .replace(/\s+/g, ' ')
    .slice(0, BODY_PREFIX_LIMIT);
}

function looksLikeHtml(text, contentType = '') {
  const prefix = asString(text).slice(0, 256).toLowerCase();
  return String(contentType || '').toLowerCase().includes('text/html')
    || prefix.startsWith('<!doctype html')
    || prefix.startsWith('<html')
    || prefix.includes('<head>');
}

function normalizeCandidate(candidate = {}, { source = 'runtime config', requireTxtIdentity = false } = {}) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new RuntimeConfigError(`${source} must contain a JSON object.`, {
      code: 'invalid_runtime_shape',
    });
  }

  const unsupportedBackendKey = ['backendStorage', 'storage', 'BACKEND']
    .find((key) => Object.prototype.hasOwnProperty.call(candidate, key));
  if (unsupportedBackendKey) {
    throw new RuntimeConfigError(
      `Unsupported storage selector "${unsupportedBackendKey}". Use "storageBackend" with exactly "txt" or "mongo".`,
      { code: 'unsupported_storage_selector' },
    );
  }
  const rawBackend = candidate.storageBackend;
  const storageBackend = sanitizeBackend(rawBackend, { allowEmpty: true });
  const backendApiUrl = asString(candidate.backendApiUrl || candidate.backendUrl || candidate.apiUrl || candidate.API_URL);
  const rawSiteId = asString(candidate.siteId || candidate.site || candidate.siteCode);
  const releaseVersion = asString(candidate.releaseVersion || candidate.siteBuilderVersion || candidate.appVersion || candidate.version);
  const releaseId = asString(candidate.releaseId);
  const deployedAt = asString(candidate.deployedAt);
  const allowedSiteRoot = asString(candidate.allowedSiteRoot || candidate.sharePointSiteUrl || candidate.siteRoot || candidate.targetSiteUrl);
  const sharePointSiteUrl = asString(candidate.sharePointSiteUrl || candidate.targetSiteUrl || candidate.allowedSiteRoot || candidate.siteRoot);
  const finalAppUrl = asString(candidate.finalAppUrl || candidate.appUrl);
  const targetDistPath = asString(candidate.targetDistPath || candidate.distPath);
  const deploymentGeneratedBy = asString(candidate.deploymentGeneratedBy || candidate.generatedBy);

  if (
    !storageBackend
    && !backendApiUrl
    && !rawSiteId
    && !releaseVersion
    && !releaseId
    && !deployedAt
    && !allowedSiteRoot
    && !sharePointSiteUrl
    && !finalAppUrl
    && !targetDistPath
    && !deploymentGeneratedBy
    && !hasSharePointRuntimeFields(candidate)
  ) {
    return null;
  }

  if (requireTxtIdentity && !storageBackend) {
    throw new RuntimeConfigError('Production runtime configuration requires "storageBackend".', {
      code: 'missing_storage_backend',
    });
  }

  const sharePointCandidate = deriveSharePointIdentityFromUrl(candidate);
  let sharePointDescriptor = null;
  const hasCanonicalSharePointIdentity = Boolean(asString(sharePointCandidate.host) || asString(sharePointCandidate.siteCode));
  if (hasCanonicalSharePointIdentity || (storageBackend === 'txt' && requireTxtIdentity)) {
    try {
      sharePointDescriptor = createSharePointRuntimeDescriptor(sharePointCandidate, {
        requireIdentity: requireTxtIdentity && storageBackend === 'txt',
      });
    } catch (error) {
      const message = error instanceof SharePointRuntimeDescriptorError ? error.message : String(error);
      throw new RuntimeConfigError(message, { code: error?.code || 'invalid_sharepoint_runtime_config' });
    }
  }

  if (requireTxtIdentity && storageBackend === 'txt' && !sharePointDescriptor) {
    throw new RuntimeConfigError('TXT runtime configuration requires SharePoint site identity.', {
      code: 'missing_sharepoint_site_identity',
    });
  }

  // API keys, tokens, and credentials are intentionally never accepted from a
  // publicly hosted runtime configuration file.
  return Object.freeze({
    schemaVersion: Number(candidate.schemaVersion || 2),
    storageBackend,
    backendApiUrl,
    siteId: rawSiteId || sharePointDescriptor?.siteCode || '',
    releaseVersion,
    releaseId,
    deployedAt,
    allowedSiteRoot,
    sharePointSiteUrl,
    finalAppUrl,
    targetDistPath,
    deploymentGeneratedBy,
    ...(sharePointDescriptor || {}),
  });
}

function loadEmbeddedRuntimeConfig() {
  const runtimeGlobal = typeof window !== 'undefined'
    ? (window.SITE_BUILDER_RUNTIME_CONFIG || window.__SITE_BUILDER_RUNTIME_CONFIG__)
    : null;
  if (!runtimeGlobal) return null;
  const normalized = normalizeCandidate(runtimeGlobal, {
    source: 'window runtime config',
    requireTxtIdentity: requiresRuntimeOverlay(),
  });
  if (!normalized) return null;
  return { source: 'window-runtime-config', config: normalized };
}

function addBaseUrl(target, seen, value) {
  try {
    const url = value instanceof URL ? new URL(value.toString()) : new URL(String(value));
    url.hash = '';
    url.search = '';
    const path = url.pathname;
    const lastSegment = path.split('/').filter(Boolean).pop() || '';
    if (!path.endsWith('/') && (!lastSegment.includes('.') || lastSegment.toLowerCase() === 'dist')) {
      url.pathname = `${path}/`;
    } else if (!path.endsWith('/')) {
      url.pathname = path.slice(0, path.lastIndexOf('/') + 1);
    }
    const key = url.toString();
    if (!seen.has(key)) {
      seen.add(key);
      target.push(url);
    }
  } catch {
    // Ignore malformed optional bases; the current location base is added next.
  }
}

export function buildRuntimeConfigCandidateUrls(locationLike, documentBaseUri = '') {
  const bases = [];
  const seenBases = new Set();
  const href = asString(locationLike?.href || locationLike);
  if (href) addBaseUrl(bases, seenBases, href);

  if (locationLike?.origin && locationLike?.pathname) {
    addBaseUrl(bases, seenBases, `${locationLike.origin}${locationLike.pathname}`);
  }

  if (documentBaseUri) {
    try {
      const documentUrl = new URL(documentBaseUri);
      const locationUrl = href ? new URL(href) : null;
      if (!locationUrl || documentUrl.origin === locationUrl.origin) {
        addBaseUrl(bases, seenBases, documentUrl);
      }
    } catch {
      // Ignore a malformed or cross-origin document base URI.
    }
  }

  const candidates = [];
  const seenCandidates = new Set();
  for (const base of bases) {
    for (const filename of RUNTIME_CONFIG_FILENAMES) {
      const url = new URL(filename, base).toString();
      if (!seenCandidates.has(url)) {
        seenCandidates.add(url);
        candidates.push(url);
      }
    }
  }
  return candidates;
}

function deploymentCandidateUrls(runtimeUrls) {
  const results = [];
  const seen = new Set();
  for (const runtimeUrl of runtimeUrls) {
    const base = new URL('./', runtimeUrl);
    for (const filename of DEPLOYMENT_METADATA_FILENAMES) {
      const candidate = new URL(filename, base).toString();
      if (!seen.has(candidate)) {
        seen.add(candidate);
        results.push(candidate);
      }
    }
  }
  return results;
}

async function loadJsonCandidate(url, { kind = 'runtime' } = {}) {
  const attempt = {
    kind,
    url,
    status: 0,
    ok: false,
    contentType: '',
    bodyPrefix: '',
    error: '',
  };

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    attempt.status = Number(response.status || 0);
    attempt.contentType = asString(response.headers?.get?.('content-type'));
    const text = await response.text();

    if (!response.ok) {
      attempt.bodyPrefix = sanitizeBodyPrefix(text);
      attempt.error = `HTTP ${response.status}`;
      runtimeAttempts.push(Object.freeze(attempt));
      return null;
    }

    if (looksLikeHtml(text, attempt.contentType)) {
      attempt.bodyPrefix = sanitizeBodyPrefix(text);
      attempt.error = 'HTML response rejected; expected JSON';
      runtimeAttempts.push(Object.freeze(attempt));
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      attempt.bodyPrefix = sanitizeBodyPrefix(text);
      attempt.error = `Invalid JSON: ${error.message}`;
      runtimeAttempts.push(Object.freeze(attempt));
      throw new RuntimeConfigError(`${kind} file ${url} contains invalid JSON.`, {
        code: 'invalid_runtime_json',
      });
    }

    let normalized;
    try {
      normalized = normalizeCandidate(parsed, {
        source: `${kind} file ${url}`,
        requireTxtIdentity: kind === 'runtime' && requiresRuntimeOverlay(),
      });
    } catch (error) {
      attempt.bodyPrefix = sanitizeBodyPrefix(text, { parsedJson: true });
      attempt.error = error.message;
      runtimeAttempts.push(Object.freeze(attempt));
      throw error;
    }

    attempt.ok = Boolean(normalized);
    attempt.bodyPrefix = sanitizeBodyPrefix(text, { parsedJson: true });
    attempt.error = normalized ? '' : 'JSON object did not contain recognized configuration fields';
    runtimeAttempts.push(Object.freeze(attempt));
    return normalized ? { source: `fetch:${url}`, config: normalized } : null;
  } catch (error) {
    if (error instanceof RuntimeConfigError) throw error;
    attempt.error = error?.message || String(error);
    runtimeAttempts.push(Object.freeze(attempt));
    return null;
  }
}

function assertNoBackendDisagreement(runtimeConfig, deploymentMetadata) {
  const runtimeBackend = runtimeConfig?.storageBackend || '';
  const auditBackend = deploymentMetadata?.storageBackend || '';
  if (runtimeBackend && auditBackend && runtimeBackend !== auditBackend) {
    throw new RuntimeConfigError(
      `Runtime storage backend "${runtimeBackend}" disagrees with deployment audit backend "${auditBackend}".`,
      { code: 'storage_backend_disagreement' },
    );
  }
}

async function resolveRuntimeConfig() {
  runtimeAttempts = [];
  lastRuntimeError = null;

  if (typeof window === 'undefined') {
    runtimeConfigLoaded = true;
    runtimeConfigSource = 'node';
    lastResolvedConfig = Object.freeze({});
    lastDeploymentMetadata = Object.freeze({});
    lastConsoleMessage = 'Runtime config is not applicable on Node runtime.';
    return lastResolvedConfig;
  }

  try {
    if (isLegacyBuild()) {
      const legacyConfig = createLegacyBuildConfig();
      runtimeConfigLoaded = true;
      runtimeConfigSource = 'legacy-build-env';
      deploymentMetadataSource = null;
      lastResolvedConfig = Object.freeze({ ...legacyConfig });
      lastDeploymentMetadata = Object.freeze({});
      lastConsoleMessage = 'Loaded site-specific runtime identity compiled into the legacy build.';
      console.info(`[site-builder-runtime-config] ${lastConsoleMessage}`);
      return lastResolvedConfig;
    }

    const runtimeUrls = buildRuntimeConfigCandidateUrls(
      window.location,
      typeof document !== 'undefined' ? document.baseURI : '',
    );
    const embedded = loadEmbeddedRuntimeConfig();
    let resolved = embedded;

    if (!resolved) {
      for (const candidateUrl of runtimeUrls) {
        const loaded = await loadJsonCandidate(candidateUrl, { kind: 'runtime' });
        if (loaded) {
          resolved = loaded;
          break;
        }
      }
    }

    let deployment = null;
    for (const candidateUrl of deploymentCandidateUrls(runtimeUrls)) {
      const loaded = await loadJsonCandidate(candidateUrl, { kind: 'deployment-audit' });
      if (loaded) {
        deployment = loaded;
        break;
      }
    }

    if (!resolved && isDevelopmentRuntime()) {
      resolved = { source: 'development-env', config: createDevelopmentFallback() };
    }
    if (!resolved) {
      throw new RuntimeConfigError(
        'Production runtime configuration is missing. Deploy sitebuilder-runtime-config.json beside index.html.',
        { code: 'missing_runtime_config' },
      );
    }

    assertNoBackendDisagreement(resolved.config, deployment?.config);

    runtimeConfigLoaded = true;
    runtimeConfigSource = resolved.source;
    deploymentMetadataSource = deployment?.source || null;
    lastResolvedConfig = Object.freeze({ ...resolved.config });
    lastDeploymentMetadata = Object.freeze({ ...(deployment?.config || {}) });
    lastConsoleMessage = resolved.source === 'development-env'
      ? 'No runtime config file found; using development-only Vite fallback values.'
      : `Loaded runtime config from ${resolved.source}.`;
    console.info(`[site-builder-runtime-config] ${lastConsoleMessage}`);
    return lastResolvedConfig;
  } catch (error) {
    runtimeConfigLoaded = true;
    runtimeConfigSource = 'error';
    lastResolvedConfig = Object.freeze({});
    lastDeploymentMetadata = Object.freeze({});
    lastRuntimeError = {
      code: error?.code || 'runtime_config_error',
      message: error?.message || String(error),
    };
    lastConsoleMessage = lastRuntimeError.message;
    throw error;
  }
}

export function getRuntimeConfigSource() {
  return runtimeConfigSource;
}

export function isRuntimeConfigLoaded() {
  return runtimeConfigLoaded;
}

export function getRuntimeConfig() {
  return runtimeConfigLoaded ? lastResolvedConfig : null;
}

export function getDeploymentMetadata() {
  return runtimeConfigLoaded ? lastDeploymentMetadata : null;
}

export function clearRuntimeConfigForTests() {
  runtimeConfigPromise = null;
  runtimeConfigLoaded = false;
  runtimeConfigSource = null;
  lastResolvedConfig = null;
  deploymentMetadataSource = null;
  lastDeploymentMetadata = null;
  lastConsoleMessage = null;
  lastRuntimeError = null;
  runtimeAttempts = [];
}

export function setRuntimeConfigForTests(config = {}, deploymentMetadata = {}) {
  runtimeConfigPromise = null;
  runtimeConfigLoaded = true;
  runtimeConfigSource = 'test';
  lastResolvedConfig = normalizeCandidate(config, { source: 'test runtime config' }) || Object.freeze({});
  lastDeploymentMetadata = normalizeCandidate(deploymentMetadata, {
    source: 'test deployment metadata',
    requireTxtIdentity: false,
  }) || Object.freeze({});
  assertNoBackendDisagreement(lastResolvedConfig, lastDeploymentMetadata);
  deploymentMetadataSource = Object.keys(lastDeploymentMetadata).length > 0 ? 'test' : null;
  lastConsoleMessage = 'Runtime config was forced for tests.';
  lastRuntimeError = null;
  runtimeAttempts = [];
}

export async function loadRuntimeConfig() {
  if (runtimeConfigLoaded && runtimeConfigPromise === null) {
    if (lastRuntimeError) {
      throw new RuntimeConfigError(lastRuntimeError.message, {
        code: lastRuntimeError.code,
      });
    }
    return lastResolvedConfig || {};
  }

  if (!runtimeConfigPromise) runtimeConfigPromise = resolveRuntimeConfig();
  return runtimeConfigPromise;
}

export function getRuntimeLog() {
  return Object.freeze({
    source: runtimeConfigSource,
    deploymentSource: deploymentMetadataSource,
    message: lastConsoleMessage,
    loaded: runtimeConfigLoaded,
    error: lastRuntimeError ? Object.freeze({ ...lastRuntimeError }) : null,
    attempts: Object.freeze(runtimeAttempts.map((attempt) => Object.freeze({ ...attempt }))),
  });
}

export function getRuntimeValue(key, fallback = '') {
  const config = getRuntimeConfig() || {};
  if (Object.prototype.hasOwnProperty.call(config, key)) return config[key] || fallback;
  switch (key) {
    case 'storageBackend': return config.storageBackend || '';
    case 'backendApiUrl': return config.backendApiUrl || '';
    case 'siteId': return config.siteId || '';
    case 'siteRoot': return config.siteRoot || '';
    case 'releaseVersion':
    case 'siteBuilderVersion':
    case 'appVersion': return config.releaseVersion || '';
    case 'releaseId': return config.releaseId || '';
    case 'deployedAt': return config.deployedAt || '';
    case 'allowedSiteRoot': return config.allowedSiteRoot || '';
    case 'sharePointSiteUrl': return config.sharePointSiteUrl || '';
    case 'finalAppUrl': return config.finalAppUrl || '';
    case 'targetDistPath': return config.targetDistPath || '';
    default: return fallback;
  }
}

export { RUNTIME_CONFIG_FILENAMES, DEPLOYMENT_METADATA_FILENAMES };
