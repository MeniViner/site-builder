import { parseFileExplorerTarget } from '../../../src/utils/fileExplorerTargets.js';

const DEFAULTS = Object.freeze({ entryLimit: 500, maxFileBytes: 1024 * 1024 * 1024, requestTimeoutMs: 15_000, searchDepth: 8, searchResultLimit: 80, searchVisitLimit: 2_500 });
const positiveInteger = (value, fallback) => { const parsed = Number.parseInt(value, 10); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; };
function origin(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash ? url.origin : '';
  } catch { return ''; }
}
const origins = (value) => Array.from(new Set(String(value || '').split(',').map(origin).filter(Boolean)));
const addresses = (value) => Array.from(new Set(String(value || '127.0.0.1,::1').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)));

export function parseFileExplorerRoots(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  let paths;
  if (raw.startsWith('[')) { try { paths = JSON.parse(raw); } catch { throw new Error('SITE_BUILDER_FILE_EXPLORER_ROOTS must be a JSON array or a comma/semicolon-delimited list.'); } } else paths = raw.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  if (!Array.isArray(paths) || paths.some((item) => typeof item !== 'string')) throw new Error('SITE_BUILDER_FILE_EXPLORER_ROOTS must contain only path strings.');
  const roots = paths.map(parseFileExplorerTarget);
  if (roots.some((root) => !root || root.kind === 'web')) throw new Error('SITE_BUILDER_FILE_EXPLORER_ROOTS contains an invalid file-system path.');
  return roots.filter((root, index) => roots.findIndex((candidate) => candidate.canonicalPath.toLowerCase() === root.canonicalPath.toLowerCase()) === index);
}

export function getFileExplorerConfig(env = process.env) {
  const rawRoots = String(env.SITE_BUILDER_FILE_EXPLORER_ROOTS || '').trim();
  const configured = Boolean(rawRoots);
  let roots = [];
  const errors = [];
  try { roots = parseFileExplorerRoots(rawRoots); } catch (error) { errors.push(error instanceof Error ? error.message : 'File explorer configuration is invalid.'); }
  const auth = {
    allowedOrigins: origins(env.SITE_BUILDER_FILE_EXPLORER_ALLOWED_ORIGINS || env.CORS_ORIGINS),
    apiOrigin: origin(env.SITE_BUILDER_FILE_EXPLORER_API_ORIGIN),
    mode: String(env.SITE_BUILDER_FILE_EXPLORER_AUTH_MODE || 'windows-proxy').trim().toLowerCase(),
    trustedProxyAddresses: addresses(env.SITE_BUILDER_FILE_EXPLORER_TRUSTED_PROXY_ADDRESSES),
    trustedUserHeader: String(env.SITE_BUILDER_FILE_EXPLORER_TRUSTED_USER_HEADER || 'x-site-builder-user').trim().toLowerCase(),
  };
  if (configured) {
    if (auth.mode !== 'windows-proxy') errors.push('SITE_BUILDER_FILE_EXPLORER_AUTH_MODE must be windows-proxy.');
    if (!auth.allowedOrigins.length) errors.push('SITE_BUILDER_FILE_EXPLORER_ALLOWED_ORIGINS or CORS_ORIGINS must contain exact frontend origins.');
    if (!auth.apiOrigin) errors.push('SITE_BUILDER_FILE_EXPLORER_API_ORIGIN must be an absolute API origin.');
    if (!/^[a-z0-9-]+$/.test(auth.trustedUserHeader)) errors.push('SITE_BUILDER_FILE_EXPLORER_TRUSTED_USER_HEADER is invalid.');
    if (!auth.trustedProxyAddresses.length) errors.push('SITE_BUILDER_FILE_EXPLORER_TRUSTED_PROXY_ADDRESSES must not be empty.');
    if (String(env.NODE_ENV || '').toLowerCase() === 'production' && (auth.allowedOrigins.some((item) => !item.startsWith('https://')) || !auth.apiOrigin.startsWith('https://'))) errors.push('Production file explorer origins must use HTTPS.');
  }
  return {
    auth,
    configurationError: errors.join(' ') || null,
    configured,
    entryLimit: positiveInteger(env.SITE_BUILDER_FILE_EXPLORER_ENTRY_LIMIT, DEFAULTS.entryLimit),
    frontendUrl: String(env.SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL || '').trim(),
    maxFileBytes: positiveInteger(env.SITE_BUILDER_FILE_EXPLORER_MAX_FILE_BYTES, DEFAULTS.maxFileBytes),
    requestTimeoutMs: positiveInteger(env.SITE_BUILDER_FILE_EXPLORER_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
    roots,
    searchDepth: positiveInteger(env.SITE_BUILDER_FILE_EXPLORER_SEARCH_DEPTH, DEFAULTS.searchDepth),
    searchResultLimit: positiveInteger(env.SITE_BUILDER_FILE_EXPLORER_SEARCH_RESULT_LIMIT, DEFAULTS.searchResultLimit),
    searchVisitLimit: positiveInteger(env.SITE_BUILDER_FILE_EXPLORER_SEARCH_VISIT_LIMIT, DEFAULTS.searchVisitLimit),
  };
}
