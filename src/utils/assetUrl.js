// src/utils/assetUrl.js
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';

const RAW_SITE_BASE_URL =
    import.meta.env.VITE_SITE_BASE_URL ||
    (import.meta.env.PROD ? SHAREPOINT_PATHS.siteBaseUrl : '');

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

export const getSiteBaseUrl = () => {
    // `VITE_SITE_BASE_URL` targets SharePoint; on localhost we serve `public/` from the Vite dev/preview server.
    if (isLocalRuntimeHost()) {
        return normalizeBaseUrl(window.location?.origin || '');
    }
    const envBase = normalizeBaseUrl(RAW_SITE_BASE_URL);
    if (envBase) return envBase;
    return normalizeBaseUrl(inferRuntimeBaseUrl());
};

export const resolveSiteImageUrl = (value) => {
    const input = String(value ?? '').trim();
    if (!input) return input;

    if (/^(?:https?:)?\/\//i.test(input) || input.startsWith('data:') || input.startsWith('blob:')) {
        return input;
    }

    if (!/^\/images(?:\/|$)/i.test(input)) {
        return input;
    }

    const base = getSiteBaseUrl();
    if (!base) return input;

    return `${base}${encodeURI(input)}`;
};

export const resolveSiteImageUrls = (values) =>
    Array.isArray(values) ? values.map((value) => resolveSiteImageUrl(value)) : [];
