type RuntimeLocation = Pick<Location, 'origin' | 'pathname' | 'hostname' | 'protocol' | 'port'>;

type RuntimeEnv = {
  VITE_SP_HOST?: string;
  VITE_SP_SITE_CODE?: string;
  DEV?: boolean;
  MODE?: string;
};

const VITE_LOCAL_PORTS = new Set(['5173', '4173']);

const cleanHost = (value: unknown) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return raw
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/\/+$/g, '')
    .toLowerCase();
};

const cleanSiteCode = (value: unknown) => String(value ?? '').trim().replace(/^\/+|\/+$/g, '');

const normalizePathname = (value: string) => {
  const raw = String(value || '/').trim();
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, '/');
  const withoutTrailing = collapsed.replace(/\/+$/g, '');
  return `${withoutTrailing || '/'}/`.toLowerCase();
};

export function normalizeUrlForSiteCheck(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    const origin = url.origin.replace(/\/+$/g, '').toLowerCase();
    return `${origin}${normalizePathname(url.pathname)}`;
  } catch {
    return '';
  }
}

export function buildExpectedSharePointSiteRoot(host: string, siteCode: string): string {
  const normalizedHost = cleanHost(host);
  const normalizedSiteCode = cleanSiteCode(siteCode);
  if (!normalizedHost || !normalizedSiteCode) return '';
  return normalizeUrlForSiteCheck(`https://${normalizedHost}/sites/${normalizedSiteCode}/`);
}

export function isLocalDevelopmentLocation(location: RuntimeLocation): boolean {
  const hostname = String(location?.hostname ?? '').trim().replace(/^\[|\]$/g, '').toLowerCase();
  const protocol = String(location?.protocol ?? '').trim().toLowerCase();
  const port = String(location?.port ?? '').trim();

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }

  return protocol === 'http:' && VITE_LOCAL_PORTS.has(port);
}

export function isAllowedSharePointRuntimeLocation(
  location: RuntimeLocation,
  env: RuntimeEnv
): boolean {
  const expectedHost = String(env?.VITE_SP_HOST ?? '').trim();
  const expectedSiteCode = String(env?.VITE_SP_SITE_CODE ?? '').trim();

  if (!expectedHost || !expectedSiteCode) return true;
  if (env?.DEV === true || String(env?.MODE ?? '').toLowerCase() === 'development') return true;
  if (isLocalDevelopmentLocation(location)) return true;

  const expectedRoot = buildExpectedSharePointSiteRoot(expectedHost, expectedSiteCode);
  if (!expectedRoot) return true;

  const currentUrl = normalizeUrlForSiteCheck(`${location.origin}${location.pathname}`);
  return Boolean(currentUrl && currentUrl.startsWith(expectedRoot));
}
