const DEFAULTS = Object.freeze({
  // Development-only fallbacks are intentionally non-production values. A
  // deployed TXT release must provide host and siteCode in runtime JSON.
  host: 'localhost',
  siteCode: 'local-site',
  siteDbFolder: 'siteDB',
  usersDbFolder: 'siteUsersDb',
  siteAssetsFolder: 'siteAssets',
  imagesFolder: 'images',
  widgetsDbTarget: 'users',
  bootstrapLibrary: 'SiteAssets',
  bootstrapFolder: 'sitebuilder-bootstrap',
});

const FILE_NAMES = Object.freeze({
  eventsFileServerRelativeUrl: 'events_data.txt',
  navigationFileServerRelativeUrl: 'nav_data.txt',
  usersFileServerRelativeUrl: 'users_data.txt',
  siteContentFileServerRelativeUrl: 'site_content_data.txt',
  themeFileServerRelativeUrl: 'theme_data.txt',
  widgetsFileServerRelativeUrl: 'widgets_data.txt',
  externalLinksFileServerRelativeUrl: 'external_links_data.txt',
  ganttFileServerRelativeUrl: 'gantt_data.txt',
  boomFileServerRelativeUrl: 'boom_data.txt',
  masterConfigFileServerRelativeUrl: 'bihs_master_config_v1.txt',
});

export class SharePointRuntimeDescriptorError extends Error {
  constructor(message, { code = 'invalid_sharepoint_runtime_config' } = {}) {
    super(message);
    this.name = 'SharePointRuntimeDescriptorError';
    this.code = code;
  }
}

const text = (value) => String(value ?? '').trim();

const ensureNoTraversal = (value, label) => {
  if (value.split('/').some((segment) => segment === '.' || segment === '..')) {
    throw new SharePointRuntimeDescriptorError(`${label} cannot contain path traversal segments.`);
  }
  return value;
};

export const normalizePathSegment = (value, fallback = '') => {
  const normalized = ensureNoTraversal(text(value).replace(/^\/+|\/+$/g, ''), 'SharePoint path segment');
  if (!normalized) return fallback;
  if (normalized.includes('/')) {
    throw new SharePointRuntimeDescriptorError(`Expected one SharePoint path segment, received "${normalized}".`);
  }
  return normalized;
};

export const normalizeServerRelativePath = (value) => {
  const raw = text(value);
  if (!raw) return '';
  let pathname = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      throw new SharePointRuntimeDescriptorError(`Invalid SharePoint URL "${raw}".`);
    }
  }
  const normalized = `/${pathname.replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  return ensureNoTraversal(normalized === '/' ? '' : normalized, 'SharePoint server-relative path');
};

export const normalizeHost = (value, fallback = '') => {
  let raw = text(value || fallback);
  if (!raw) return '';
  raw = raw.replace(/^https?:\/\//i, '').split('/')[0].replace(/\/+$/g, '');
  if (!raw || /[\s@]/.test(raw)) {
    throw new SharePointRuntimeDescriptorError(`Invalid SharePoint host "${raw || '(empty)'}".`);
  }
  return raw.toLowerCase();
};

const lastPathSegment = (value, fallback) => {
  const path = normalizeServerRelativePath(value);
  if (path) return path.split('/').filter(Boolean).pop() || fallback;
  return normalizePathSegment(value, fallback);
};

const normalizeRoot = (value, fallback) => normalizeServerRelativePath(value) || fallback;

const assertMatches = (provided, expected, label) => {
  if (!provided) return;
  if (provided.toLowerCase() !== expected.toLowerCase()) {
    throw new SharePointRuntimeDescriptorError(
      `${label} "${provided}" does not match the canonical runtime path "${expected}".`,
    );
  }
};

const normalizeAbsoluteUrl = (value, expected, label) => {
  const raw = text(value);
  if (!raw) return expected;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SharePointRuntimeDescriptorError(`${label} must be an absolute HTTP(S) URL.`);
  }
  if (!/^https?:$/.test(url.protocol)) {
    throw new SharePointRuntimeDescriptorError(`${label} must use HTTP(S).`);
  }
  const normalized = url.toString().replace(/\/+$/g, '');
  if (normalized.toLowerCase() !== expected.toLowerCase()) {
    throw new SharePointRuntimeDescriptorError(
      `${label} "${normalized}" does not match the canonical runtime URL "${expected}".`,
    );
  }
  return expected;
};

const resolveFilePath = (siteAssetsRoot, usersDbRoot, fileName, target = 'site') =>
  `${target === 'users' ? usersDbRoot : siteAssetsRoot}/${fileName}`;

/**
 * Builds the complete, immutable SharePoint identity used by a single browser
 * session. The values are intentionally derived from canonical fields so that
 * a deployment cannot mix a site code from one target with folders from another.
 */
export function createSharePointRuntimeDescriptor(input = {}, { requireIdentity = true, defaults = DEFAULTS } = {}) {
  const host = normalizeHost(input.host, requireIdentity ? '' : defaults.host);
  const siteCode = normalizePathSegment(input.siteCode || input.siteId, requireIdentity ? '' : defaults.siteCode);
  if (requireIdentity && (!host || !siteCode)) {
    throw new SharePointRuntimeDescriptorError(
      'TXT runtime configuration requires both "host" and "siteCode".',
      { code: 'missing_sharepoint_site_identity' },
    );
  }

  const siteRoot = normalizeRoot(input.siteRoot, `/sites/${siteCode}`);
  const siteRootParts = siteRoot.split('/').filter(Boolean);
  if (siteRootParts.length < 2 || !['sites', 'teams'].includes(siteRootParts[0].toLowerCase())) {
    throw new SharePointRuntimeDescriptorError(`siteRoot must identify a /sites/* or /teams/* web, received "${siteRoot}".`);
  }
  if (siteRootParts[siteRootParts.length - 1].toLowerCase() !== siteCode.toLowerCase()) {
    throw new SharePointRuntimeDescriptorError(
      `siteRoot "${siteRoot}" does not match siteCode "${siteCode}".`,
    );
  }

  const siteDbFolder = normalizePathSegment(input.siteDbFolder, defaults.siteDbFolder);
  const usersDbFolder = lastPathSegment(input.usersDbFolder, defaults.usersDbFolder);
  const siteAssetsFolder = normalizePathSegment(input.siteAssetsFolder, defaults.siteAssetsFolder);
  const imagesFolder = normalizePathSegment(input.imagesFolder, defaults.imagesFolder);
  const widgetsDbTarget = text(input.widgetsDbTarget || defaults.widgetsDbTarget).toLowerCase() === 'site' ? 'site' : 'users';
  const bootstrapLibrary = normalizePathSegment(input.bootstrapLibrary, defaults.bootstrapLibrary);
  const bootstrapFolder = normalizePathSegment(input.bootstrapFolder, defaults.bootstrapFolder);

  const siteDbRoot = `${siteRoot}/${siteDbFolder}`;
  const usersDbRoot = `${siteRoot}/${usersDbFolder}`;
  const siteAssetsRoot = `${siteDbRoot}/${siteAssetsFolder}`;
  const imagesRoot = `${siteDbRoot}/${imagesFolder}`;
  assertMatches(normalizeServerRelativePath(input.siteDbRoot), siteDbRoot, 'siteDbRoot');
  assertMatches(normalizeServerRelativePath(input.usersDbRoot), usersDbRoot, 'usersDbRoot');
  const usersDbFolderPath = normalizeServerRelativePath(input.usersDbFolder);
  if (usersDbFolderPath && usersDbFolderPath.split('/').filter(Boolean).length > 1) {
    assertMatches(usersDbFolderPath, usersDbRoot, 'usersDbFolder');
  }
  assertMatches(normalizeServerRelativePath(input.siteAssetsRoot), siteAssetsRoot, 'siteAssetsRoot');
  assertMatches(normalizeServerRelativePath(input.imagesRoot), imagesRoot, 'imagesRoot');

  const siteApiRoot = normalizeRoot(input.siteApiRoot, siteRoot);
  assertMatches(siteApiRoot, siteRoot, 'siteApiRoot');
  const targetDistPath = `${siteDbRoot}/dist`;
  assertMatches(normalizeServerRelativePath(input.targetDistPath), targetDistPath, 'targetDistPath');

  const sharePointSiteUrl = `https://${host}${siteRoot}`;
  const finalAppUrl = `https://${host}${targetDistPath}/index.html`;
  normalizeAbsoluteUrl(input.sharePointSiteUrl, sharePointSiteUrl, 'sharePointSiteUrl');
  normalizeAbsoluteUrl(input.allowedSiteRoot, sharePointSiteUrl, 'allowedSiteRoot');
  normalizeAbsoluteUrl(input.finalAppUrl, finalAppUrl, 'finalAppUrl');

  const widgetsTarget = widgetsDbTarget === 'site' ? 'site' : 'users';
  return Object.freeze({
    host,
    siteCode,
    siteRoot,
    siteApiRoot,
    siteDbFolder,
    siteDbRoot,
    usersDbFolder,
    usersDbRoot,
    siteAssetsFolder,
    siteAssetsRoot,
    imagesFolder,
    imagesRoot,
    imageBaseFolderServerRelativeUrl: imagesRoot,
    widgetsDbTarget: widgetsTarget,
    bootstrapLibrary,
    bootstrapFolder,
    sharePointSiteUrl,
    allowedSiteRoot: sharePointSiteUrl,
    targetDistPath,
    finalAppUrl,
    siteBaseUrl: `https://${host}${targetDistPath}`,
    eventsFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.eventsFileServerRelativeUrl),
    navigationFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.navigationFileServerRelativeUrl),
    usersFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.usersFileServerRelativeUrl),
    siteContentFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.siteContentFileServerRelativeUrl),
    themeFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.themeFileServerRelativeUrl),
    widgetsFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.widgetsFileServerRelativeUrl, widgetsTarget),
    externalLinksFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.externalLinksFileServerRelativeUrl),
    ganttFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.ganttFileServerRelativeUrl),
    boomFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.boomFileServerRelativeUrl),
    masterConfigFileServerRelativeUrl: resolveFilePath(siteAssetsRoot, usersDbRoot, FILE_NAMES.masterConfigFileServerRelativeUrl),
  });
}

export { DEFAULTS as SHAREPOINT_RUNTIME_DEFAULTS };
