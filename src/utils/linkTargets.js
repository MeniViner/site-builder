const WINDOWS_DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;
const UNC_BACKSLASH_PATH_RE = /^\\\\[^\\/]+[\\/][^\\/]+/;
const UNC_FORWARD_PATH_RE = /^\/\/[^\\/]+[\\/][^\\/]+/;
const FILE_SCHEME_RE = /^file:/i;
const MAC_ABSOLUTE_PATH_RE = /^\/(?:Users|Volumes|Applications|Library|System|private|opt|var|tmp)(?:\/|$)/i;
const MAC_NETWORK_SCHEME_RE = /^(?:smb|afp):\/\//i;
const SHAREPOINT_WEBDAV_HOST_RE = /^([^\\/]+?)(@SSL)?$/i;
const LOCAL_FILE_BRIDGE_PATH = '/__sitebuilder-local-file';

function asTrimmedText(value) {
    return String(value ?? '').trim();
}

function decodeUrlPathSegment(value) {
    try {
        return decodeURIComponent(String(value || ''));
    } catch {
        return String(value || '');
    }
}

function encodePathSegments(path) {
    return String(path || '')
        .split('/')
        .map((segment) => encodeURIComponent(segment).replace(/%3A/gi, ':'))
        .join('/');
}

function normalizeDrivePath(path) {
    const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!WINDOWS_DRIVE_PATH_RE.test(normalized)) return '';
    return `${normalized.slice(0, 2).toUpperCase()}${normalized.slice(2)}`;
}

function normalizeUncPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function webHrefFromSharePointWebDavPath(path) {
    const normalized = normalizeUncPath(path);
    const [hostWithMode, firstSegment, ...segments] = normalized.split('/').filter(Boolean);
    if (!hostWithMode || !firstSegment || segments.length === 0) return '';
    if (firstSegment.toLowerCase() !== 'davwwwroot') return '';

    const hostMatch = hostWithMode.match(SHAREPOINT_WEBDAV_HOST_RE);
    if (!hostMatch) return '';

    const host = hostMatch[1];
    if (!host || !host.includes('.')) return '';

    return `https://${host}/${encodePathSegments(segments.join('/'))}`;
}

function fileHrefFromDrivePath(path) {
    const normalized = normalizeDrivePath(path);
    if (!normalized) return '';
    return `file:///${encodePathSegments(normalized)}`;
}

function fileHrefFromUncPath(path) {
    const normalized = normalizeUncPath(path);
    const [host, ...segments] = normalized.split('/').filter(Boolean);
    if (!host || segments.length === 0) return '';
    return `file://${host}/${encodePathSegments(segments.join('/'))}`;
}

function fileHrefFromMacPath(path) {
    const normalized = String(path || '').replace(/\\/g, '/');
    if (!MAC_ABSOLUTE_PATH_RE.test(normalized)) return '';
    return `file://${encodePathSegments(normalized)}`;
}

function normalizeNetworkProtocolHref(value) {
    const raw = asTrimmedText(value);
    try {
        return new URL(raw).href;
    } catch {
        return raw.replace(/\s/g, '%20');
    }
}

function normalizeFileHref(value) {
    const raw = asTrimmedText(value).replace(/\\/g, '/');
    const fileBody = raw.replace(/^file:\/*/i, '');
    const decodedFileBody = decodeUrlPathSegment(fileBody);

    const webDavHref = webHrefFromSharePointWebDavPath(decodedFileBody);
    if (webDavHref) return webDavHref;

    if (/^\/?[A-Za-z]:[\\/]/.test(decodedFileBody)) {
        return fileHrefFromDrivePath(decodedFileBody);
    }

    const withoutFileScheme = raw.replace(/^file:/i, '');
    if (/^\/\/[^/]+\/[^/]+/.test(withoutFileScheme) && !withoutFileScheme.startsWith('///')) {
        return fileHrefFromUncPath(decodeUrlPathSegment(raw.replace(/^file:\/*/i, '')));
    }

    if (MAC_ABSOLUTE_PATH_RE.test(decodedFileBody.startsWith('/') ? decodedFileBody : `/${decodedFileBody}`)) {
        return fileHrefFromMacPath(decodedFileBody.startsWith('/') ? decodedFileBody : `/${decodedFileBody}`);
    }

    return raw;
}

export function isLocalFilePath(value) {
    const raw = asTrimmedText(value);
    if (!raw) return false;
    return FILE_SCHEME_RE.test(raw)
        || WINDOWS_DRIVE_PATH_RE.test(raw)
        || UNC_BACKSLASH_PATH_RE.test(raw)
        || UNC_FORWARD_PATH_RE.test(raw)
        || MAC_ABSOLUTE_PATH_RE.test(raw)
        || MAC_NETWORK_SCHEME_RE.test(raw);
}

export function normalizeLinkTarget(value) {
    const raw = asTrimmedText(value);
    if (!raw) return '';

    if (FILE_SCHEME_RE.test(raw)) return normalizeFileHref(raw);
    if (MAC_NETWORK_SCHEME_RE.test(raw)) return normalizeNetworkProtocolHref(raw);
    if (MAC_ABSOLUTE_PATH_RE.test(raw)) return fileHrefFromMacPath(raw);
    if (WINDOWS_DRIVE_PATH_RE.test(raw)) return fileHrefFromDrivePath(raw);
    if (UNC_BACKSLASH_PATH_RE.test(raw) || UNC_FORWARD_PATH_RE.test(raw)) {
        return webHrefFromSharePointWebDavPath(raw) || fileHrefFromUncPath(raw);
    }

    return raw;
}

export function isFileLinkTarget(value) {
    return FILE_SCHEME_RE.test(normalizeLinkTarget(value));
}

export function isSystemLinkTarget(value) {
    const href = normalizeLinkTarget(value);
    return FILE_SCHEME_RE.test(href) || MAC_NETWORK_SCHEME_RE.test(href);
}

export function getLinkTargetAttributes(value) {
    const href = normalizeLinkTarget(value);
    if (!href) return { href: '#' };

    const browserHref = getBrowserOpenHref(href);
    return {
        href: browserHref,
        target: '_blank',
        ...(isSystemLinkTarget(href) ? {} : { rel: 'noopener noreferrer' }),
    };
}

export function openLinkTarget(value) {
    const href = normalizeLinkTarget(value);
    if (!href || href === '#') return false;

    if (typeof window === 'undefined') return false;
    const browserHref = getBrowserOpenHref(href);

    if (isSystemLinkTarget(href)) {
        const opened = window.open(browserHref, '_blank');
        if (!opened) {
            window.location.href = browserHref;
        }
        return true;
    }

    window.open(browserHref, '_blank', 'noopener,noreferrer');
    return true;
}

function isLocalFileBridgeEnabled() {
    if (typeof window === 'undefined') return false;
    if (import.meta.env.VITE_LOCAL_FILE_BRIDGE !== 'true') return false;
    const hostname = String(window.location?.hostname || '').toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

function getLocalFileBridgeHref(href) {
    if (!FILE_SCHEME_RE.test(href) || !isLocalFileBridgeEnabled()) return '';
    const url = new URL(LOCAL_FILE_BRIDGE_PATH, window.location.origin);
    url.searchParams.set('href', href);
    return url.href;
}

function getBrowserOpenHref(href) {
    return getLocalFileBridgeHref(href) || href;
}
