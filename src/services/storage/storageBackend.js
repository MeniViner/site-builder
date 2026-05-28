import { SHAREPOINT_PATHS } from '../../config/sharepointPaths';

export const STORAGE_BACKENDS = Object.freeze({
    MONGO: 'mongo',
    SHAREPOINT_READONLY: 'sharepoint-readonly',
    LOCAL_DEV: 'local-dev',
});

export function getStorageBackend() {
    const configured = String(import.meta.env.VITE_STORAGE_BACKEND || import.meta.env.STORAGE_BACKEND || '').trim().toLowerCase();
    if (configured) return configured;
    return import.meta.env.DEV ? STORAGE_BACKENDS.LOCAL_DEV : STORAGE_BACKENDS.SHAREPOINT_READONLY;
}

export function isMongoStorageBackend() {
    return getStorageBackend() === STORAGE_BACKENDS.MONGO;
}

export function isSharePointReadonlyBackend() {
    return getStorageBackend() === STORAGE_BACKENDS.SHAREPOINT_READONLY;
}

export function isLocalDevStorageBackend() {
    return getStorageBackend() === STORAGE_BACKENDS.LOCAL_DEV;
}

export function getBackendApiBaseUrl() {
    return String(import.meta.env.VITE_BACKEND_API_URL || '').trim().replace(/\/+$/g, '');
}

export function getSiteId() {
    return String(
        import.meta.env.VITE_SITE_ID
        || import.meta.env.VITE_SP_SITE_CODE
        || SHAREPOINT_PATHS.siteCode
        || 'siteBuilder'
    ).trim();
}

export function isStrictPersistentBackend() {
    return isMongoStorageBackend();
}
