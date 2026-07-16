import {
    getDeploymentMetadata,
    getRuntimeConfig,
    getRuntimeConfigSource,
    getRuntimeLog,
    isRuntimeConfigLoaded,
} from './runtimeConfig';

export const STORAGE_BACKENDS = Object.freeze({
    TXT: 'txt',
    MONGO: 'mongo',
});

const VALID_BACKENDS = new Set(Object.values(STORAGE_BACKENDS));
let storageDescriptor = null;
let lastStorageError = null;

export class StorageConfigurationError extends Error {
    constructor(message, { code = 'storage_configuration_error', details = null } = {}) {
        super(message);
        this.name = 'StorageConfigurationError';
        this.code = code;
        this.details = details;
    }
}

function text(value) {
    return String(value ?? '').trim();
}

function normalizeBackend(value, { defaultBackend = STORAGE_BACKENDS.TXT } = {}) {
    const normalized = text(value);
    if (!normalized) return defaultBackend;
    if (!VALID_BACKENDS.has(normalized)) {
        throw new StorageConfigurationError(
            `Invalid storage backend "${normalized}". Expected "txt" or "mongo".`,
            { code: 'invalid_storage_backend' },
        );
    }
    return normalized;
}

function normalizePath(value) {
    const raw = text(value);
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
        try {
            return new URL(raw).pathname.replace(/\/+$/g, '');
        } catch {
            return '';
        }
    }
    return raw.startsWith('/') ? raw.replace(/\/+$/g, '') : '';
}

function currentLocationSiteRoot() {
    if (typeof window === 'undefined') return '';
    const pathname = text(window.location?.pathname);
    if (!pathname) return '';

    const siteDbFolder = text(import.meta.env.VITE_SP_SITE_DB_FOLDER || 'siteDB');
    const marker = `/${siteDbFolder.toLowerCase()}/`;
    const lowerPath = pathname.toLowerCase();
    const markerIndex = lowerPath.indexOf(marker);
    if (markerIndex > 0) return pathname.slice(0, markerIndex).replace(/\/+$/g, '');

    const distMarker = '/dist/';
    const distIndex = lowerPath.indexOf(distMarker);
    if (distIndex > 0) return pathname.slice(0, distIndex).replace(/\/+$/g, '');

    const match = pathname.match(/^\/(sites|teams)\/([^/]+)/i);
    return match ? `/${match[1]}/${match[2]}` : '';
}

function configuredTxtSiteRoot(config) {
    return normalizePath(
        config.siteRoot
        || config.sharePointSiteUrl
        || config.allowedSiteRoot,
    );
}

function buildTimeTxtSiteRoot() {
    const siteCode = text(import.meta.env.VITE_SP_SITE_CODE || 'siteBuilder').replace(/^\/+|\/+$/g, '');
    return `/sites/${siteCode || 'siteBuilder'}`;
}

function siteIdFromSiteRoot(siteRoot) {
    const match = text(siteRoot).match(/^\/(?:sites|teams)\/(.+)$/i);
    return match ? match[1].replace(/^\/+|\/+$/g, '') : '';
}

function validateSiteId(value, { required = true } = {}) {
    const siteId = text(value);
    if (!siteId && !required) return '';
    if (!siteId) {
        throw new StorageConfigurationError('siteId is required when storageBackend=mongo.', {
            code: 'missing_site_id',
        });
    }
    if (siteId.length > 160 || !/^[a-zA-Z0-9._:/-]+$/.test(siteId)) {
        throw new StorageConfigurationError('siteId contains unsupported characters or is too long.', {
            code: 'invalid_site_id',
        });
    }
    return siteId;
}

function validateBackendUrl(value) {
    const raw = text(value).replace(/\/+$/g, '');
    if (!raw) {
        throw new StorageConfigurationError('backendApiUrl is required when storageBackend=mongo.', {
            code: 'missing_backend_url',
        });
    }

    let url;
    try {
        url = new URL(raw);
    } catch {
        throw new StorageConfigurationError('backendApiUrl must be an absolute HTTP(S) URL.', {
            code: 'invalid_backend_url',
        });
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new StorageConfigurationError('backendApiUrl must use HTTP or HTTPS.', {
            code: 'invalid_backend_url',
        });
    }
    if (url.username || url.password) {
        throw new StorageConfigurationError('backendApiUrl must not contain embedded credentials.', {
            code: 'credentialed_backend_url',
        });
    }
    if (url.search || url.hash) {
        throw new StorageConfigurationError('backendApiUrl must not contain a query string or fragment.', {
            code: 'invalid_backend_url',
        });
    }
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && url.protocol !== 'https:') {
        throw new StorageConfigurationError('An HTTPS page cannot use an insecure Mongo backendApiUrl.', {
            code: 'insecure_backend_url',
        });
    }
    return url.toString().replace(/\/+$/g, '');
}

function assertSiteRootMatchesLocation(configuredRoot, actualRoot) {
    if (!configuredRoot || !actualRoot) return;
    if (configuredRoot.toLowerCase() !== actualRoot.toLowerCase()) {
        throw new StorageConfigurationError(
            `Configured TXT site root "${configuredRoot}" does not match hosted site root "${actualRoot}".`,
            { code: 'txt_site_root_mismatch' },
        );
    }
}

function buildDescriptor() {
    if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test' && !isRuntimeConfigLoaded()) {
        throw new StorageConfigurationError('Runtime configuration must be loaded before storage is initialized.', {
            code: 'runtime_config_not_loaded',
        });
    }

    const runtimeConfig = getRuntimeConfig() || {};
    const runtimeSource = getRuntimeConfigSource();
    const hasRuntimeSelection = Boolean(runtimeConfig.storageBackend);
    const rawBackend = hasRuntimeSelection
        ? runtimeConfig.storageBackend
        : import.meta.env.VITE_STORAGE_BACKEND;
    const backend = normalizeBackend(rawBackend, { defaultBackend: STORAGE_BACKENDS.TXT });
    const source = hasRuntimeSelection ? runtimeSource : (text(rawBackend) ? 'production-env' : 'safe-default');
    const deploymentMetadata = getDeploymentMetadata() || {};

    if (deploymentMetadata.storageBackend && deploymentMetadata.storageBackend !== backend) {
        throw new StorageConfigurationError(
            `Selected storage backend "${backend}" disagrees with deployment audit backend "${deploymentMetadata.storageBackend}".`,
            { code: 'storage_backend_disagreement' },
        );
    }

    let siteId;
    let siteRoot = '';
    let backendApiUrl = '';
    if (backend === STORAGE_BACKENDS.MONGO) {
        siteId = validateSiteId(
            hasRuntimeSelection ? runtimeConfig.siteId : import.meta.env.VITE_SITE_ID,
        );
        backendApiUrl = validateBackendUrl(
            hasRuntimeSelection ? runtimeConfig.backendApiUrl : import.meta.env.VITE_BACKEND_API_URL,
        );
    } else {
        const actualRoot = currentLocationSiteRoot();
        const configuredRoot = configuredTxtSiteRoot(runtimeConfig);
        assertSiteRootMatchesLocation(configuredRoot, actualRoot);
        siteRoot = actualRoot || configuredRoot || buildTimeTxtSiteRoot();
        siteId = validateSiteId(
            runtimeConfig.siteId || siteIdFromSiteRoot(siteRoot) || import.meta.env.VITE_SP_SITE_CODE,
            { required: false },
        ) || 'siteBuilder';
    }

    return Object.freeze({
        backend,
        source,
        siteId,
        siteRoot,
        backendApiUrl,
        runtimeConfigSource: runtimeSource || source,
    });
}

export function initializeStorageDescriptor() {
    if (!storageDescriptor) storageDescriptor = buildDescriptor();
    if (typeof window !== 'undefined') {
        const diagnostics = getStorageDiagnostics();
        Object.defineProperty(window, '__SITE_BUILDER_STORAGE_DIAGNOSTICS__', {
            configurable: true,
            enumerable: false,
            writable: false,
            value: diagnostics,
        });
        Object.defineProperty(window, '__SITE_BUILDER_GET_STORAGE_DIAGNOSTICS__', {
            configurable: true,
            enumerable: false,
            writable: false,
            value: getStorageDiagnostics,
        });
    }
    return storageDescriptor;
}

export function getStorageDescriptor() {
    return initializeStorageDescriptor();
}

export function clearStorageDescriptorForTests() {
    storageDescriptor = null;
    lastStorageError = null;
    if (typeof window !== 'undefined') {
        try {
            delete window.__SITE_BUILDER_STORAGE_DIAGNOSTICS__;
            delete window.__SITE_BUILDER_GET_STORAGE_DIAGNOSTICS__;
        } catch {
            // Ignore immutable-window implementations in tests.
        }
    }
}

export function getStorageBackend() {
    return getStorageDescriptor().backend;
}

export function isMongoStorageBackend() {
    return getStorageBackend() === STORAGE_BACKENDS.MONGO;
}

export function isTxtStorageBackend() {
    return getStorageBackend() === STORAGE_BACKENDS.TXT;
}

// Kept as a transport compatibility helper for existing development-only
// services. It is not a third storage backend.
export function isLocalDevStorageBackend() {
    return import.meta.env.DEV === true && isTxtStorageBackend();
}

export function isSharePointReadonlyBackend() {
    return false;
}

export function getBackendApiBaseUrl() {
    return getStorageDescriptor().backendApiUrl;
}

export function requireBackendApiBaseUrl() {
    const descriptor = getStorageDescriptor();
    if (descriptor.backend !== STORAGE_BACKENDS.MONGO) {
        throw new StorageConfigurationError('Backend API is only available when storageBackend=mongo.', {
            code: 'wrong_storage_backend',
        });
    }
    return descriptor.backendApiUrl;
}

export function getSiteId() {
    return getStorageDescriptor().siteId;
}

export function getTxtSiteRoot() {
    const descriptor = getStorageDescriptor();
    if (descriptor.backend !== STORAGE_BACKENDS.TXT) {
        throw new StorageConfigurationError('TXT site root is only available when storageBackend=txt.', {
            code: 'wrong_storage_backend',
        });
    }
    return descriptor.siteRoot;
}

export function buildTxtStoragePath(fileName) {
    const safeFileName = text(fileName).replace(/^\/+/, '');
    if (!safeFileName || safeFileName.includes('..') || safeFileName.includes('\\')) {
        throw new StorageConfigurationError('Invalid TXT storage file name.', {
            code: 'invalid_txt_file_name',
        });
    }
    const siteDbFolder = text(import.meta.env.VITE_SP_SITE_DB_FOLDER || 'siteDB').replace(/^\/+|\/+$/g, '');
    const siteAssetsFolder = text(import.meta.env.VITE_SP_SITE_ASSETS_FOLDER || 'siteAssets').replace(/^\/+|\/+$/g, '');
    return `${getTxtSiteRoot()}/${siteDbFolder}/${siteAssetsFolder}/${safeFileName}`;
}

export function isStrictPersistentBackend() {
    return true;
}

function redactDiagnosticText(value) {
    return String(value ?? '')
        .replace(/\/\/[^/@\s]+@/g, '//[redacted]@')
        .replace(/((?:api[-_ ]?key|token|secret|password|authorization)["']?\s*[:=]\s*)["']?[^\s,"'}]+/gi, '$1[redacted]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
        .slice(0, 500);
}

export function recordStorageError(error, context = {}) {
    lastStorageError = Object.freeze({
        code: String(error?.code || 'storage_error'),
        message: redactDiagnosticText(error?.message || error || 'Unknown storage error'),
        operation: String(context.operation || ''),
        repository: String(context.repository || ''),
        occurredAt: new Date().toISOString(),
    });
}

export function clearStorageError() {
    lastStorageError = null;
}

export function getStorageDiagnostics() {
    const descriptor = storageDescriptor || buildDescriptor();
    const runtimeLog = getRuntimeLog();
    return Object.freeze({
        backend: descriptor.backend,
        source: descriptor.source,
        siteId: descriptor.siteId,
        siteRoot: descriptor.siteRoot,
        backendApiUrl: descriptor.backendApiUrl,
        repository: descriptor.backend === STORAGE_BACKENDS.MONGO ? 'mongo-api' : 'sharepoint-txt',
        runtimeConfigSource: descriptor.runtimeConfigSource,
        runtimeAttempts: runtimeLog.attempts,
        lastRuntimeError: runtimeLog.error,
        lastStorageError,
    });
}
