export const DEFAULT_FILE_EXPLORER_BRIDGE_PATH = '/_site-builder/file-explorer';

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

export function normalizeFileExplorerBridgePath(value) {
  const path = text(value).replace(/\/+$/g, '');
  if (!path || !path.startsWith('/') || path.includes('//') || path.split('/').some((segment) => segment === '.' || segment === '..')) return DEFAULT_FILE_EXPLORER_BRIDGE_PATH;
  return path;
}

export function resolveFileExplorerEndpoint({ apiOverride = '', bridgePath = '' } = {}) {
  const override = text(apiOverride);
  if (override) {
    try {
      const url = new URL(override);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash) {
        const base = url.toString().replace(/\/+$/, '');
        return base.endsWith('/api/file-explorer') ? base : `${base}/api/file-explorer`;
      }
    } catch { /* Explicit local/test overrides must be valid absolute URLs. */ }
  }
  return normalizeFileExplorerBridgePath(bridgePath);
}

export function buildFileExplorerUrl(endpoint, token = '', suffix = '') {
  const base = String(endpoint || DEFAULT_FILE_EXPLORER_BRIDGE_PATH).replace(/\/+$/, '');
  const path = suffix ? `${base}/${String(suffix).replace(/^\/+/, '')}` : base;
  return token ? `${path}?target=${encodeURIComponent(token)}` : path;
}
