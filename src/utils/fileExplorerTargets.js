export const FILE_EXPLORER_ROUTE_PATH = '/file-explorer';
export const FILE_EXPLORER_TARGET_PARAM = 'target';

const INVALID_SEGMENT_RE = /[<>:"|?*]/u;
const WEBDAV_RE = /^[\\/]{2}([^\\/]+)@SSL[\\/]DavWWWRoot(?:[\\/](.*))?$/i;

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function decodePart(value) { try { return decodeURIComponent(value); } catch { return null; } }
function encodePart(value) { return encodeURIComponent(value).replace(/%2F/gi, '%252F').replace(/%5C/gi, '%255C'); }
function hasControlCharacter(value) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}
export function normalizeUncComparisonPart(value) {
  return String(value || '').normalize('NFC').toLocaleLowerCase('en-US');
}
function validSegments(segments) {
  return segments.some((segment) => typeof segment !== 'string' || !segment || segment === '.' || segment === '..' || INVALID_SEGMENT_RE.test(segment) || hasControlCharacter(segment)) ? null : segments;
}
function target({ kind, canonicalPath, canonicalHref, displayPath, server = null, share = null, ...extra }) {
  return {
    canonicalHref,
    canonicalPath,
    displayPath,
    kind,
    server,
    share,
    version: 1,
    ...extra,
  };
}

function web(input) {
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol) ? target({ kind: 'web', canonicalPath: url.href, canonicalHref: url.href, displayPath: url.href }) : null;
  } catch { return null; }
}
function webDav(input) {
  const match = input.match(WEBDAV_RE);
  if (!match) return null;
  const segments = validSegments((match[2] || '').split(/[\\/]+/).filter(Boolean).map(decodePart));
  return match[1] && segments ? web(`https://${match[1]}/${segments.map(encodePart).join('/')}`) : null;
}
function unc(input) {
  if (/^[\\/]{2}[?.][\\/]/.test(input)) return null;
  const segments = validSegments(input.replace(/^[\\/]+/, '').split(/[\\/]+/).filter(Boolean).map(decodePart));
  if (!segments || segments.length < 2) return null;
  const [server, share, ...rest] = segments;
  if (/\s/u.test(server)) return null;
  const shareRootPath = `\\\\${server}\\${share}`;
  const canonicalUncPath = `\\\\${server}\\${[share, ...rest].join('\\')}`;
  const shareKey = `unc://${normalizeUncComparisonPart(server)}/${normalizeUncComparisonPart(share)}`;
  const canonicalPrefix = [shareKey, ...rest.map(normalizeUncComparisonPart)].join('/');
  return target({
    kind: 'unc',
    canonicalPath: canonicalUncPath,
    canonicalUncPath,
    canonicalHref: `file://${server}/${[share, ...rest].map(encodePart).join('/')}`,
    canonicalPrefix,
    displayPath: canonicalUncPath,
    segments: rest,
    server,
    share,
    shareRootPath,
    shareKey,
  });
}
function fileUrl(input) {
  try {
    const url = new URL(input);
    if (url.protocol !== 'file:') return null;
    const pathname = decodePart(url.pathname);
    if (pathname === null) return null;
    if (url.hostname && url.hostname !== 'localhost') {
      const value = `\\\\${url.hostname}${pathname.replace(/\//g, '\\')}`;
      return webDav(value) || unc(value);
    }
    return null;
  } catch { return null; }
}
function smbUrl(input) {
  try {
    const url = new URL(input);
    const pathname = decodePart(url.pathname);
    return url.protocol === 'smb:' && url.hostname && pathname !== null ? unc(`\\\\${url.hostname}${pathname.replace(/\//g, '\\')}`) : null;
  } catch { return null; }
}

export function parseFileExplorerTarget(value) {
  if (value && typeof value === 'object' && typeof value.canonicalPath === 'string') return parseFileExplorerTarget(value.canonicalHref || value.canonicalPath);
  const input = text(value);
  if (!input) return null;
  return webDav(input) || (/^https?:/i.test(input) ? web(input) : null) || (/^file:/i.test(input) ? fileUrl(input) : null) || (/^smb:/i.test(input) ? smbUrl(input) : null) || (/^[\\/]{2}/.test(input) ? unc(input) : null);
}
export function isFileExplorerTarget(value) { return parseFileExplorerTarget(value)?.kind === 'unc'; }
function base64(value) {
  if (globalThis.Buffer) return globalThis.Buffer.from(value, 'utf8').toString('base64');
  return btoa(encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))));
}
function fromBase64(value) {
  try {
    if (globalThis.Buffer) return globalThis.Buffer.from(value, 'base64').toString('utf8');
    const bytes = atob(value);
    return decodeURIComponent(Array.from(bytes, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  } catch { return null; }
}
export function encodeFileExplorerTarget(value) {
  const parsed = parseFileExplorerTarget(value);
  return parsed?.kind !== 'unc' ? null : base64(JSON.stringify({ p: parsed.canonicalPath, v: 1 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function decodeFileExplorerTarget(token) {
  const compact = text(token);
  if (!/^[A-Za-z0-9_-]+$/.test(compact)) return null;
  const decoded = fromBase64(`${compact.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - (compact.length % 4)) % 4)}`);
  try {
    const payload = JSON.parse(decoded);
    const parsed = payload?.v === 1 && typeof payload.p === 'string' ? parseFileExplorerTarget(payload.p) : null;
    return parsed?.kind === 'unc' ? parsed : null;
  } catch { return null; }
}
export function buildFileExplorerHref(value) {
  const encoded = encodeFileExplorerTarget(value);
  return encoded ? `#${FILE_EXPLORER_ROUTE_PATH}?${FILE_EXPLORER_TARGET_PARAM}=${encoded}` : null;
}
