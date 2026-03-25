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
