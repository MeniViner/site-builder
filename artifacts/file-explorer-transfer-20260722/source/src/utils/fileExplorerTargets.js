export const FILE_EXPLORER_ROUTE_PATH = '/file-explorer';
export const FILE_EXPLORER_TARGET_PARAM = 'target';

const INVALID_SEGMENT_RE = /[<>:"|?*]/;
const MAC_ABSOLUTE_PATH_RE = /^\/(?:Users|Volumes|Applications|Library|System|private|opt|var|tmp)(?:\/|$)/i;
const WINDOWS_DRIVE_RE = /^([a-zA-Z]):[\\/](.*)$/;
const WEBDAV_RE = /^[\\/]{2}([^\\/]+)@SSL[\\/]DavWWWRoot(?:[\\/](.*))?$/i;

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function decodePart(value) { try { return decodeURIComponent(value); } catch { return null; } }
function encodePart(value) { return encodeURIComponent(value).replace(/%2F/gi, '%252F').replace(/%5C/gi, '%255C'); }
function hasControlCharacter(value) {
  return Array.from(value).some((character) => character.charCodeAt(0) < 32);
}
function validSegments(segments) {
  return segments.some((segment) => !segment || segment === '.' || segment === '..' || INVALID_SEGMENT_RE.test(segment) || hasControlCharacter(segment)) ? null : segments;
}
function target({ kind, canonicalPath, canonicalHref, displayPath, server = null, share = null }) { return { canonicalHref, canonicalPath, displayPath, kind, server, share, version: 1 }; }

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
  if (!/^[a-zA-Z0-9.-]+$/.test(server) || share.endsWith('$')) return null;
  const canonicalPath = `\\\\${server}\\${[share, ...rest].join('\\')}`;
  return target({ kind: 'unc', canonicalPath, canonicalHref: `file://${server}/${[share, ...rest].map(encodePart).join('/')}`, displayPath: canonicalPath, server, share });
}
function windowsPath(input) {
  const match = input.match(WINDOWS_DRIVE_RE);
  if (!match) return null;
  const segments = validSegments(match[2].split(/[\\/]+/).filter(Boolean).map(decodePart));
  if (!segments) return null;
  const drive = match[1].toUpperCase();
  const canonicalPath = `${drive}:\\${segments.join('\\')}`;
  return target({ kind: 'windows-drive', canonicalPath, canonicalHref: `file:///${drive}:/${segments.map(encodePart).join('/')}`, displayPath: canonicalPath });
}
function macPath(input) {
  if (!MAC_ABSOLUTE_PATH_RE.test(input)) return null;
  const segments = validSegments(input.split('/').filter(Boolean).map(decodePart));
  if (!segments) return null;
  const canonicalPath = `/${segments.join('/')}`;
  return target({ kind: 'mac-local', canonicalPath, canonicalHref: `file:///${segments.map(encodePart).join('/')}`, displayPath: canonicalPath });
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
    return windowsPath(pathname.replace(/^\//, '')) || macPath(pathname);
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
  return webDav(input) || (/^https?:/i.test(input) ? web(input) : null) || (/^file:/i.test(input) ? fileUrl(input) : null) || (/^smb:/i.test(input) ? smbUrl(input) : null) || (/^[\\/]{2}/.test(input) ? unc(input) : null) || (WINDOWS_DRIVE_RE.test(input) ? windowsPath(input) : null) || macPath(input);
}
export function isFileExplorerTarget(value) { const parsed = parseFileExplorerTarget(value); return Boolean(parsed && parsed.kind !== 'web'); }
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
  return !parsed || parsed.kind === 'web' ? null : base64(JSON.stringify({ p: parsed.canonicalPath, v: 1 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
export function decodeFileExplorerTarget(token) {
  const compact = text(token);
  if (!/^[A-Za-z0-9_-]+$/.test(compact)) return null;
  const decoded = fromBase64(`${compact.replace(/-/g, '+').replace(/_/g, '/')}${'='.repeat((4 - (compact.length % 4)) % 4)}`);
  try {
    const payload = JSON.parse(decoded);
    const parsed = payload?.v === 1 && typeof payload.p === 'string' ? parseFileExplorerTarget(payload.p) : null;
    return parsed && parsed.kind !== 'web' ? parsed : null;
  } catch { return null; }
}
export function buildFileExplorerHref(value) {
  const encoded = encodeFileExplorerTarget(value);
  return encoded ? `#${FILE_EXPLORER_ROUTE_PATH}?${FILE_EXPLORER_TARGET_PARAM}=${encoded}` : null;
}
