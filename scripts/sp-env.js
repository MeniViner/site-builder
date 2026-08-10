// scripts/sp-env.js
import fs from 'fs';
import path from 'path';

const DEFAULTS = {
  host: 'portal.army.idf',
  siteCode: 'siteBuilder',
  // siteCode: 'bihs7134',
  siteDbFolder: 'siteDB',
  usersDbFolder: 'siteUsersDb',
  bootstrapLibrary: 'SiteAssets',
  bootstrapFolder: 'sitebuilder-bootstrap',
  bootstrapSetupLogs: 'false',
  siteAssetsFolder: 'siteAssets',
  imagesFolder: 'images',
  widgetsDbTarget: 'users',
  autoDeploy: 'false',
  storageBackend: 'txt',
  backendApiUrl: '',
};

export function parseCliArgs(argv = process.argv.slice(2)) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith('--')) continue;

    const maybeEq = current.indexOf('=');
    if (maybeEq >= 0) {
      const key = current.slice(2, maybeEq);
      const value = current.slice(maybeEq + 1);
      args[key] = value === '' ? true : value;
      continue;
    }

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

export function loadEnvFile(envFilePath) {
  const envValues = {};
  if (!fs.existsSync(envFilePath)) {
    return envValues;
  }

  const raw = fs.readFileSync(envFilePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    envValues[key] = value;
  }

  return envValues;
}

const pick = (primary, secondary, fallback) => {
  const first = String(primary ?? '').trim();
  if (first) return first;
  const second = String(secondary ?? '').trim();
  if (second) return second;
  return fallback;
};

const normalizePathSegment = (value, fallback) => {
  const raw = String(value ?? '').trim().replace(/^\/+|\/+$/g, '');
  return raw || fallback;
};

const extractLibraryTitle = (value, fallback) => {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  const withoutHost = raw.replace(/^https?:\/\/[^/]+/i, '');
  const segments = withoutHost.split('/').filter(Boolean);
  if (segments.length === 0) return fallback;
  return segments[segments.length - 1] || fallback;
};

export function resolveConfig({ envFilePath = path.resolve(process.cwd(), '.env.production'), cli = {}, environment = process.env } = {}) {
  const envFromFile = loadEnvFile(envFilePath);

  // Deployment must never silently fall back to the historical default site.
  // Keep the provenance separate from resolved defaults so local helpers may
  // still display defaults while deploy tooling can fail safely.
  const explicitHost = pick(cli.host, environment.VITE_SP_HOST || envFromFile.VITE_SP_HOST, '');
  const explicitSiteCode = pick(
    cli.site || cli['site-code'],
    environment.VITE_SP_SITE_CODE || envFromFile.VITE_SP_SITE_CODE,
    '',
  );

  const host = pick(cli.host, environment.VITE_SP_HOST || envFromFile.VITE_SP_HOST, DEFAULTS.host);
  const siteCode = pick(
    cli.site || cli['site-code'],
    environment.VITE_SP_SITE_CODE || envFromFile.VITE_SP_SITE_CODE,
    DEFAULTS.siteCode,
  );
  const siteDbFolder = extractLibraryTitle(pick(
    cli['site-db'],
    environment.VITE_SP_SITE_DB_FOLDER || envFromFile.VITE_SP_SITE_DB_FOLDER,
    DEFAULTS.siteDbFolder,
  ), DEFAULTS.siteDbFolder);
  const usersDbFolder = extractLibraryTitle(pick(
    cli['users-db'],
    environment.VITE_SP_USERS_DB_FOLDER || envFromFile.VITE_SP_USERS_DB_FOLDER,
    DEFAULTS.usersDbFolder,
  ), DEFAULTS.usersDbFolder);
  const siteAssetsFolder = pick(
    cli['site-assets'],
    environment.VITE_SP_SITE_ASSETS_FOLDER || envFromFile.VITE_SP_SITE_ASSETS_FOLDER,
    DEFAULTS.siteAssetsFolder,
  );
  const imagesFolder = pick(
    cli.images,
    environment.VITE_SP_IMAGES_FOLDER || envFromFile.VITE_SP_IMAGES_FOLDER,
    DEFAULTS.imagesFolder,
  );
  const widgetsDbTarget = pick(
    cli['widgets-db-target'],
    environment.VITE_SP_WIDGETS_DB_TARGET || envFromFile.VITE_SP_WIDGETS_DB_TARGET,
    DEFAULTS.widgetsDbTarget,
  ).toLowerCase() === 'site' ? 'site' : 'users';

  const autoDeploy = pick(
    cli['auto-deploy'],
    environment.VITE_AUTO_DEPLOY || envFromFile.VITE_AUTO_DEPLOY,
    DEFAULTS.autoDeploy,
  );
  const explicitStorageBackend = String(
    cli['storage-backend'] || cli.storageBackend
    || environment.VITE_STORAGE_BACKEND || envFromFile.VITE_STORAGE_BACKEND
    || '',
  ).trim();
  const storageBackend = explicitStorageBackend || DEFAULTS.storageBackend;
  if (!['txt', 'mongo'].includes(storageBackend)) {
    throw new Error(`Invalid VITE_STORAGE_BACKEND "${storageBackend}". Expected txt or mongo.`);
  }
  const backendApiUrl = pick(
    cli['backend-url'] || cli.backendUrl || cli['api-url'],
    environment.VITE_BACKEND_API_URL || envFromFile.VITE_BACKEND_API_URL,
    DEFAULTS.backendApiUrl,
  ).replace(/\/+$/g, '');
  const bootstrapLibrary = normalizePathSegment(pick(
    cli['bootstrap-library'],
    environment.VITE_SP_BOOTSTRAP_LIBRARY || envFromFile.VITE_SP_BOOTSTRAP_LIBRARY,
    DEFAULTS.bootstrapLibrary,
  ), DEFAULTS.bootstrapLibrary);
  const bootstrapFolder = normalizePathSegment(pick(
    cli['bootstrap-folder'],
    environment.VITE_SP_BOOTSTRAP_FOLDER || envFromFile.VITE_SP_BOOTSTRAP_FOLDER,
    DEFAULTS.bootstrapFolder,
  ), DEFAULTS.bootstrapFolder);
  const bootstrapSetupLogs = pick(
    cli['bootstrap-setup-logs'],
    environment.VITE_SP_BOOTSTRAP_SETUP_LOGS || envFromFile.VITE_SP_BOOTSTRAP_SETUP_LOGS,
    DEFAULTS.bootstrapSetupLogs,
  );

  const siteRootRel = `/sites/${siteCode}`;
  const siteDbRel = `${siteRootRel}/${siteDbFolder}`;
  const usersDbRel = `${siteRootRel}/${usersDbFolder}`;
  const bootstrapBaseRel = `${siteRootRel}/${bootstrapLibrary}/${bootstrapFolder}`;
  const bootstrapDistRel = `${bootstrapBaseRel}/dist`;
  const siteAssetsRel = `${siteDbRel}/${siteAssetsFolder}`;
  const imagesRel = `${siteDbRel}/${imagesFolder}`;
  const distRel = `${siteDbRel}/dist`;
  const siteApiRootRel = pick(
    cli['api-root'],
    environment.VITE_SP_SITE_API_ROOT || envFromFile.VITE_SP_SITE_API_ROOT,
    siteRootRel,
  );
  const siteBaseUrl = pick(
    cli['site-base-url'],
    environment.VITE_SITE_BASE_URL || envFromFile.VITE_SITE_BASE_URL,
    `https://${host}${distRel}`,
  );
  const siteId = pick(
    cli['site-id'] || cli.siteId,
    environment.VITE_SITE_ID || envFromFile.VITE_SITE_ID,
    siteCode,
  );

  const fileMap = {
    masterConfig: `${siteAssetsRel}/bihs_master_config_v1.txt`,
    users: `${siteAssetsRel}/users_data.txt`,
    events: `${siteAssetsRel}/events_data.txt`,
    navigation: `${siteAssetsRel}/nav_data.txt`,
    siteContent: `${siteAssetsRel}/site_content_data.txt`,
    theme: `${siteAssetsRel}/theme_data.txt`,
    widgets: `${widgetsDbTarget === 'site' ? siteAssetsRel : usersDbRel}/widgets_data.txt`,
    externalLinks: `${siteAssetsRel}/external_links_data.txt`,
    gantt: `${siteAssetsRel}/gantt_data.txt`,
  };

  const webDavRoot = `\\\\${host}@SSL\\DavWWWRoot`;
  const toWebDav = (serverRelativePath) => {
    const segments = String(serverRelativePath || '').split('/').filter(Boolean);
    return path.win32.join(webDavRoot, ...segments);
  };

  return {
    envFilePath,
    envFromFile,
    cli,
    hasExplicitSiteIdentity: Boolean(explicitHost && explicitSiteCode),
    host,
    siteCode,
    siteDbFolder,
    usersDbFolder,
    siteAssetsFolder,
    imagesFolder,
    widgetsDbTarget,
    autoDeploy,
    storageBackend,
    storageBackendSource: explicitStorageBackend ? 'production-environment' : 'safe-production-default',
    backendApiUrl,
    siteId,
    bootstrapLibrary,
    bootstrapFolder,
    bootstrapSetupLogs,
    siteRootRel,
    siteDbRel,
    usersDbRel,
    bootstrapBaseRel,
    bootstrapDistRel,
    siteAssetsRel,
    imagesRel,
    distRel,
    siteApiRootRel,
    siteBaseUrl,
    fileMap,
    webDavRoot,
    toWebDav,
  };
}

export function writeEnvProduction(config, outputPath = path.resolve(process.cwd(), '.env.production')) {
  const lines = [
    `VITE_SP_HOST=${config.host}`,
    `VITE_SP_SITE_CODE=${config.siteCode}`,
    `VITE_SP_SITE_DB_FOLDER=${config.siteDbFolder}`,
    `VITE_SP_USERS_DB_FOLDER=${config.usersDbFolder}`,
    `VITE_SP_BOOTSTRAP_LIBRARY=${config.bootstrapLibrary}`,
    `VITE_SP_BOOTSTRAP_FOLDER=${config.bootstrapFolder}`,
    `VITE_SP_SITE_ASSETS_FOLDER=${config.siteAssetsFolder}`,
    `VITE_SP_IMAGES_FOLDER=${config.imagesFolder}`,
    `VITE_SP_WIDGETS_DB_TARGET=${config.widgetsDbTarget}`,
    `VITE_SP_SITE_API_ROOT=${config.siteApiRootRel}`,
    `VITE_SITE_BASE_URL=${config.siteBaseUrl}`,
    `VITE_STORAGE_BACKEND=${config.storageBackend || 'txt'}`,
    `VITE_BACKEND_API_URL=${config.backendApiUrl || ''}`,
    `VITE_SITE_ID=${config.siteId || config.siteCode}`,
    '',
    '# Logging (מרוכז)',
    'VITE_SP_VERBOSE_LOG=false',
    'VITE_SP_APP_LOGS=false',
    'VITE_SP_APP_WARN_ERROR_LOGS=false',
    'VITE_SP_PERMISSIONS_SETUP_LOGS=false',
    'VITE_SP_LIBRARY_PROVISIONING_LOGS=false',
    'VITE_SP_ADMIN_MANAGEMENT_LOGS=false',
    'VITE_SP_ENABLE_OWNERS_MANAGEMENT_LOGS=false',
    'VITE_SP_LOG_FETCH_ADMINS=false',
    'VITE_SP_LOG_FETCH_ADMINS_VERBOSE=false',
    `VITE_SP_BOOTSTRAP_SETUP_LOGS=${config.bootstrapSetupLogs}`,
    'VITE_ALPHA_AI_DEBUG=false',
    '',
    'VITE_AUTO_DEPLOY=true',
    'VITE_AUTO_DEPLOY_STRICT=true',
    '',
  ];

  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
  return outputPath;
}
