import { SHAREPOINT_PATHS } from '../config/sharepointPaths';

const stripTrailingSlashes = (value) => String(value ?? '').replace(/\/+$/g, '');

const normalizeServerRelativeUrl = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) {
        try {
            return stripTrailingSlashes(new URL(raw).pathname || '') || '';
        } catch {
            return '';
        }
    }
    return raw.startsWith('/') ? stripTrailingSlashes(raw) : stripTrailingSlashes(`/${raw}`);
};

const hostOnly = (value) => String(value ?? '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/g, '');

const pathnameSitesFallback = () => {
    if (typeof window === 'undefined') return '';
    const segments = window.location.pathname.split('/').filter(Boolean);
    const first = String(segments[0] || '').toLowerCase();
    if ((first === 'sites' || first === 'teams') && segments.length >= 2) {
        const host = hostOnly(SHAREPOINT_PATHS.host || import.meta.env.VITE_SP_HOST || window.location.host);
        if (!host) return '';
        return stripTrailingSlashes(`https://${host}/${segments[0]}/${segments[1]}`);
    }
    return '';
};

const envApiRootToAbsolute = () => {
    const apiRootRaw = String(import.meta.env.VITE_SP_SITE_API_ROOT || '').trim();
    const viteHost = hostOnly(import.meta.env.VITE_SP_HOST || SHAREPOINT_PATHS.host || '');
    if (!apiRootRaw || !viteHost) return '';

    if (/^https?:\/\//i.test(apiRootRaw)) {
        return stripTrailingSlashes(apiRootRaw);
    }

    const path = apiRootRaw.startsWith('/') ? apiRootRaw : `/${apiRootRaw}`;
    return stripTrailingSlashes(`https://${viteHost}${path}`);
};

const sharePointPathsToAbsolute = () => {
    const h = hostOnly(SHAREPOINT_PATHS.host || import.meta.env.VITE_SP_HOST || '');
    const sr = normalizeServerRelativeUrl(SHAREPOINT_PATHS.siteApiRoot || SHAREPOINT_PATHS.siteRoot);
    if (!h || !sr) return '';
    const path = sr.startsWith('/') ? sr : `/${sr}`;
    return stripTrailingSlashes(`https://${h}${path}`);
};

/**
 * Resolves the SharePoint web URL for REST calls (current site web, e.g. https://portal.army.idf/sites/schedule).
 * Order: _spPageContextInfo.webAbsoluteUrl → VITE_SP_SITE_API_ROOT + VITE_SP_HOST → SHAREPOINT_PATHS → pathname sites/*.
 *
 * @param {{ onResolved?: (info: Record<string, unknown>) => void }} [options]
 * @returns {string}
 */
export const resolveCurrentSharePointWebUrl = (options = {}) => {
    const { onResolved } = options;

    const logResolution = (finalWebUrl, source) => {
        const pageContext = typeof window !== 'undefined' ? window._spPageContextInfo : undefined;
        const payload = {
            source,
            windowLocationHref: typeof window !== 'undefined' ? window.location.href : '',
            windowLocationOrigin: typeof window !== 'undefined' ? window.location.origin : '',
            spPageContextWebAbsoluteUrl: pageContext?.webAbsoluteUrl,
            VITE_SP_HOST: import.meta.env.VITE_SP_HOST,
            VITE_SP_SITE_CODE: import.meta.env.VITE_SP_SITE_CODE,
            VITE_SP_SITE_API_ROOT: import.meta.env.VITE_SP_SITE_API_ROOT,
            finalWebUrl,
        };
        if (typeof onResolved === 'function') {
            onResolved(payload);
        }
    };

    const pageContext = typeof window !== 'undefined' ? window._spPageContextInfo : undefined;
    const fromPageContext = pageContext?.webAbsoluteUrl ? stripTrailingSlashes(pageContext.webAbsoluteUrl) : '';
    if (fromPageContext) {
        logResolution(fromPageContext, '_spPageContextInfo.webAbsoluteUrl');
        return fromPageContext;
    }

    const fromEnv = envApiRootToAbsolute();
    if (fromEnv) {
        logResolution(fromEnv, 'VITE_SP_SITE_API_ROOT+VITE_SP_HOST');
        return fromEnv;
    }

    const fromPaths = sharePointPathsToAbsolute();
    if (fromPaths) {
        logResolution(fromPaths, 'SHAREPOINT_PATHS.siteApiRoot/siteRoot');
        return fromPaths;
    }

    const fromPathname = pathnameSitesFallback();
    if (fromPathname) {
        logResolution(fromPathname, 'window.location.pathname-sites-fallback');
        return fromPathname;
    }

    const origin = typeof window !== 'undefined' ? stripTrailingSlashes(window.location.origin) : '';
    logResolution(origin, 'window.location.origin-fallback');
    return origin;
};

export default resolveCurrentSharePointWebUrl;
