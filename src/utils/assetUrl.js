// src/utils/assetUrl.js
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';

const IMAGE_VERSION_STORAGE_KEY = 'site-builder-image-versions-v1';
const imageVersions = new Map();

const normalizeBaseUrl = (value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    return trimmed.replace(/\/+$/, '');
};

/** True when the app runs on the machine (dev server or vite preview), not on SharePoint. */
const isLocalRuntimeHost = () => {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname || '';
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
};

const inferRuntimeBaseUrl = () => {
    if (typeof window === 'undefined') return '';

    const origin = window.location?.origin || '';
    let path = window.location?.pathname || '';

    if (path.endsWith('/index.html')) {
        path = path.slice(0, -'/index.html'.length);
    }

    path = path.replace(/\/+$/, '');
    if (!origin) return '';
    if (!path) return origin;
    return `${origin}${path}`;
};

const readStoredImageVersions = () => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        const stored = JSON.parse(sessionStorage.getItem(IMAGE_VERSION_STORAGE_KEY) || '{}');
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
        Object.entries(stored).forEach(([reference, version]) => {
            if (typeof reference === 'string' && typeof version === 'string' && reference && version) {
                imageVersions.set(reference, version);
            }
        });
    } catch {
        // Cache versions are an optional rendering optimization; in-memory
        // versions still cover the active editor session when storage is off.
    }
};

const writeStoredImageVersions = () => {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(IMAGE_VERSION_STORAGE_KEY, JSON.stringify(Object.fromEntries(imageVersions)));
    } catch {
        // Keep the in-memory version if browser storage is unavailable.
    }
};

readStoredImageVersions();

/** Records a non-persisted, content-derived version for one uploaded asset. */
export const rememberSiteImageVersion = (reference, version) => {
    const normalizedReference = String(reference || '').trim();
    const normalizedVersion = String(version || '').trim();
    if (!normalizedReference || !normalizedVersion) return;
    imageVersions.set(normalizedReference, normalizedVersion);
    writeStoredImageVersions();
};

const withImageVersion = (resolvedUrl, reference) => {
    const version = imageVersions.get(String(reference || '').trim());
    if (!version) return resolvedUrl;

    const hashIndex = resolvedUrl.indexOf('#');
    const withoutHash = hashIndex >= 0 ? resolvedUrl.slice(0, hashIndex) : resolvedUrl;
    const hash = hashIndex >= 0 ? resolvedUrl.slice(hashIndex) : '';
    const separator = withoutHash.includes('?') ? '&' : '?';
    return `${withoutHash}${separator}sitebuilderAssetVersion=${encodeURIComponent(version)}${hash}`;
};

export const getSiteBaseUrl = () => {
    // Local development serves `public/` from Vite; deployed releases use the
    // runtime descriptor instead of a build-time SharePoint base URL.
    if (isLocalRuntimeHost()) {
        return normalizeBaseUrl(window.location?.origin || '');
    }
    const configuredBase = normalizeBaseUrl(SHAREPOINT_PATHS.siteBaseUrl);
    if (configuredBase) return configuredBase;
    return normalizeBaseUrl(inferRuntimeBaseUrl());
};

export const resolveSiteImageUrl = (value) => {
    const input = String(value ?? '').trim();
    if (!input) return input;

    if (/^(?:https?:)?\/\//i.test(input) || input.startsWith('data:') || input.startsWith('blob:')) {
        return withImageVersion(input, input);
    }

    if (!/^\/images(?:\/|$)/i.test(input)) {
        return withImageVersion(input, input);
    }

    const base = getSiteBaseUrl();
    if (!base) return withImageVersion(input, input);

    return withImageVersion(`${base}${encodeURI(input)}`, input);
};

export const resolveSiteImageUrls = (values) =>
    Array.isArray(values) ? values.map((value) => resolveSiteImageUrl(value)) : [];
