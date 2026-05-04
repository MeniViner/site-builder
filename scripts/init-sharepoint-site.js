// scripts/init-sharepoint-site.js
import fs from 'fs';
import path from 'path';
import { parseCliArgs, resolveConfig, writeEnvProduction } from './sp-env.js';

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });
const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
const libProvisioningLogs = String(
  process.env.VITE_SP_LIBRARY_PROVISIONING_LOGS ?? config.envFromFile.VITE_SP_LIBRARY_PROVISIONING_LOGS ?? 'false',
).toLowerCase() === 'true';

const log = (message) => {
  console.log(`[init-site] ${message}`);
};

const encodeODataTitle = (value) => String(value || '').replace(/'/g, "''");
const toPathSegments = (value) => String(value || '').split('/').filter(Boolean);
const normalizeServerRelative = (...parts) => `/${parts.flatMap((part) => toPathSegments(part)).join('/')}`;
const REQUIRED_WELCOME_PAGE = 'Forms/AllItems.aspx';

const resolveDocumentLibrary = (rawValue, siteRootRel, fallbackTitle, envName) => {
  const value = String(rawValue || '').trim();
  const segments = toPathSegments(value);
  const title = segments.length ? segments[segments.length - 1] : fallbackTitle;
  if (!title) {
    throw new Error(`${envName} must resolve to a non-empty SharePoint library title.`);
  }
  return {
    envName,
    title,
    expectedRootRel: normalizeServerRelative(siteRootRel, title),
    rawValue: value,
  };
};

const webUrl = `https://${config.host}${config.siteRootRel}`;

const siteDbLibrary = resolveDocumentLibrary(
  config.siteDbFolder,
  config.siteRootRel,
  'siteDB',
  'VITE_SP_SITE_DB_FOLDER',
);
const usersDbLibrary = resolveDocumentLibrary(
  config.usersDbFolder,
  config.siteRootRel,
  'siteUsersDb',
  'VITE_SP_USERS_DB_FOLDER',
);

const siteDbRel = siteDbLibrary.expectedRootRel;
const usersDbRel = usersDbLibrary.expectedRootRel;
const distRel = normalizeServerRelative(siteDbRel, 'dist');
const siteAssetsRel = normalizeServerRelative(siteDbRel, config.siteAssetsFolder);
const imagesRel = normalizeServerRelative(siteDbRel, config.imagesFolder);

const fileMap = {
  masterConfig: normalizeServerRelative(siteAssetsRel, 'bihs_master_config_v1.txt'),
  users: normalizeServerRelative(siteAssetsRel, 'users_data.txt'),
  events: normalizeServerRelative(siteAssetsRel, 'events_data.txt'),
  navigation: normalizeServerRelative(siteAssetsRel, 'nav_data.txt'),
  siteContent: normalizeServerRelative(siteAssetsRel, 'site_content_data.txt'),
  theme: normalizeServerRelative(siteAssetsRel, 'theme_data.txt'),
  widgets: normalizeServerRelative(config.widgetsDbTarget === 'site' ? siteAssetsRel : usersDbRel, 'widgets_data.txt'),
  externalLinks: normalizeServerRelative(siteAssetsRel, 'external_links_data.txt'),
};

const shouldWriteEnv = cli['write-env'] === true || String(cli['write-env'] || '').toLowerCase() === 'true';
if (shouldWriteEnv) {
  const outputPath = writeEnvProduction(config, envPath);
  log(`Updated environment file: ${outputPath}`);
}

const foldersToCreate = [
  config.siteRootRel,
  distRel,
  siteAssetsRel,
  imagesRel,
];

const defaultFiles = [
  {
    key: 'masterConfig',
    content: JSON.stringify({ schemaVersion: '1.0.0' }, null, 2),
  },
  {
    key: 'users',
    content: JSON.stringify([
      {
        id: 1,
        name: 'מנהל לדוגמה',
        role: 'admin',
        personalNumber: '8856096',
        email: '',
        loginName: '',
      },
      {
        id: 2,
        name: 'מנהל ראשי',
        role: 'admin',
        personalNumber: '8624034',
        email: '',
        loginName: '',
      },
    ], null, 2),
  },
  {
    key: 'events',
    content: JSON.stringify({ displayCount: 3, displayMode: 'default', events: [] }, null, 2),
  },
  {
    key: 'navigation',
    content: JSON.stringify([], null, 2),
  },
  {
    key: 'siteContent',
    content: JSON.stringify({}, null, 2),
  },
  {
    key: 'theme',
    content: JSON.stringify({}, null, 2),
  },
  {
    key: 'widgets',
    content: JSON.stringify({}, null, 2),
  },
  {
    key: 'externalLinks',
    content: JSON.stringify([], null, 2),
  },
];

const ensureDir = (serverRelativeDir) => {
  const fullPath = config.toWebDav(serverRelativeDir);
  if (dryRun) {
    return fullPath;
  }
  fs.mkdirSync(fullPath, { recursive: true });
  return fullPath;
};

const ensureTextFile = (serverRelativeFilePath, content) => {
  const fullPath = config.toWebDav(serverRelativeFilePath);
  if (dryRun) {
    return { created: null, fullPath };
  }

  const parent = path.win32.dirname(fullPath);
  fs.mkdirSync(parent, { recursive: true });

  if (fs.existsSync(fullPath)) {
    const existing = fs.readFileSync(fullPath, 'utf8');
    if (existing.trim().length > 0) {
      return { created: false, fullPath };
    }
  }

  fs.writeFileSync(fullPath, `${content}\n`, 'utf8');
  return { created: true, fullPath };
};

const toErrorMessage = async (response) => {
  const body = await response.text();
  if (!body) return '(no error body)';
  return body;
};

const sharePointRequest = async ({ method, url, body, digest, allow404 = false, extraHeaders = {} }) => {
  const startedAt = Date.now();
  if (libProvisioningLogs) {
    log(`[sp-rest] start ${method} ${url}`);
  }

  const headers = {
    Accept: 'application/json;odata=verbose',
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json;odata=verbose';
  }
  if (digest) {
    headers['X-RequestDigest'] = digest;
  }
  Object.assign(headers, extraHeaders);

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    const errorBody = await toErrorMessage(response);
    if (allow404 && response.status === 404) {
      if (libProvisioningLogs) {
        log(`[sp-rest] not-found ${method} ${url} status=${response.status} durationMs=${durationMs}`);
      }
      return { status: response.status, durationMs, json: null, errorBody };
    }
    if (libProvisioningLogs) {
      log(`[sp-rest] failure ${method} ${url} status=${response.status} durationMs=${durationMs}`);
      log(`[sp-rest] error body: ${errorBody}`);
    }
    throw new Error(`SharePoint REST ${method} ${url} failed with status ${response.status}.`);
  }

  const raw = await response.text();
  const json = raw ? JSON.parse(raw) : null;
  if (libProvisioningLogs) {
    log(`[sp-rest] success ${method} ${url} status=${response.status} durationMs=${durationMs}`);
  }
  return { status: response.status, durationMs, json };
};

const getRequestDigest = async () => {
  const contextUrl = `${webUrl}/_api/contextinfo`;
  const response = await sharePointRequest({ method: 'POST', url: contextUrl });
  const digest =
    response.json?.d?.GetContextWebInformation?.FormDigestValue ||
    response.json?.GetContextWebInformation?.FormDigestValue;
  if (!digest) {
    throw new Error('Unable to obtain X-RequestDigest from SharePoint contextinfo.');
  }
  return digest;
};

const readLibrary = async (title) => {
  const encodedTitle = encodeODataTitle(title);
  const url = `${webUrl}/_api/web/lists/GetByTitle('${encodedTitle}')?$select=Id,Title,BaseTemplate,DefaultViewUrl,RootFolder/ServerRelativeUrl,RootFolder/WelcomePage,OnQuickLaunch&$expand=RootFolder`;
  const response = await sharePointRequest({ method: 'GET', url, allow404: true });
  if (response.status === 404) {
    return null;
  }
  return response.json?.d || response.json;
};

const updateOnQuickLaunch = async (title, digest) => {
  const encodedTitle = encodeODataTitle(title);
  const url = `${webUrl}/_api/web/lists/GetByTitle('${encodedTitle}')`;
  await sharePointRequest({
    method: 'POST',
    url,
    digest,
    body: {
      __metadata: {
        type: 'SP.List',
      },
      OnQuickLaunch: true,
    },
  });
};

const createLibrary = async (title, digest) => {
  const url = `${webUrl}/_api/web/lists`;
  await sharePointRequest({
    method: 'POST',
    url,
    digest,
    body: {
      __metadata: {
        type: 'SP.List',
      },
      BaseTemplate: 101,
      Title: title,
      Description: 'Application data library',
      OnQuickLaunch: true,
    },
  });
};

const updateFolderWelcomePage = async (serverRelativeUrl, digest) => {
  const encodedServerRelativeUrl = encodeODataTitle(serverRelativeUrl);
  const url = `${webUrl}/_api/web/GetFolderByServerRelativeUrl('${encodedServerRelativeUrl}')`;
  await sharePointRequest({
    method: 'POST',
    url,
    digest,
    extraHeaders: {
      'X-HTTP-Method': 'MERGE',
      'IF-MATCH': '*',
    },
    body: {
      __metadata: {
        type: 'SP.Folder',
      },
      WelcomePage: REQUIRED_WELCOME_PAGE,
    },
  });
};

const validateDocumentLibrary = (library, expectedRootRel, title) => {
  if (!library) {
    throw new Error(`Document library "${title}" was not found after provisioning.`);
  }
  if (Number(library.BaseTemplate) !== 101) {
    throw new Error(
      `SharePoint object "${title}" exists but BaseTemplate=${library.BaseTemplate}. Remove/replace it with a Document Library (BaseTemplate 101).`,
    );
  }
  const actualRoot = library.RootFolder?.ServerRelativeUrl;
  if (actualRoot !== expectedRootRel) {
    throw new Error(
      `Document library "${title}" root mismatch. Expected "${expectedRootRel}" but got "${actualRoot || '(empty)'}".`,
    );
  }
};

const getLibraryFolderViewUrl = (defaultViewUrl, folderServerRelativeUrl) => {
  if (!defaultViewUrl) return null;
  return `${defaultViewUrl}?RootFolder=${encodeURIComponent(folderServerRelativeUrl)}`;
};

const ensureDocumentLibraryBrowserView = async (libraryTitle, expectedRootUrl, digest) => {
  let library = await readLibrary(libraryTitle);
  validateDocumentLibrary(library, expectedRootUrl, libraryTitle);

  if (!library.DefaultViewUrl) {
    throw new Error(`Document library "${libraryTitle}" has no DefaultViewUrl. SharePoint cannot render folder browsing.`);
  }

  log(`Browser view check: library="${libraryTitle}" expectedRoot="${expectedRootUrl}" DefaultViewUrl="${library.DefaultViewUrl}"`);
  log(`Browser view check: library="${libraryTitle}" WelcomePage before="${library.RootFolder?.WelcomePage || '(empty)'}"`);

  if (library.RootFolder?.WelcomePage !== REQUIRED_WELCOME_PAGE) {
    log(`Browser view fix: updating WelcomePage to "${REQUIRED_WELCOME_PAGE}" for "${libraryTitle}"...`);
    await updateFolderWelcomePage(expectedRootUrl, digest);
    library = await readLibrary(libraryTitle);
    validateDocumentLibrary(library, expectedRootUrl, libraryTitle);
    if (!library.DefaultViewUrl) {
      throw new Error(`Document library "${libraryTitle}" still has no DefaultViewUrl after WelcomePage update.`);
    }
  }

  log(`Browser view check: library="${libraryTitle}" BaseTemplate=${library.BaseTemplate}`);
  log(`Browser view check: library="${libraryTitle}" DefaultViewUrl="${library.DefaultViewUrl}"`);
  log(`Browser view check: library="${libraryTitle}" RootFolder.ServerRelativeUrl="${library.RootFolder?.ServerRelativeUrl || '(empty)'}"`);
  log(`Browser view check: library="${libraryTitle}" RootFolder.WelcomePage after="${library.RootFolder?.WelcomePage || '(empty)'}"`);
  log(`Browser view check: library="${libraryTitle}" OnQuickLaunch=${library.OnQuickLaunch}`);

  return {
    title: libraryTitle,
    defaultViewUrl: library.DefaultViewUrl,
    rootServerRelativeUrl: library.RootFolder?.ServerRelativeUrl || expectedRootUrl,
  };
};

const ensureDocumentLibrary = async ({ title, expectedRootRel, digest }) => {
  let library = await readLibrary(title);
  if (!library) {
    log(`Document library "${title}" does not exist. Creating...`);
    await createLibrary(title, digest);
    library = await readLibrary(title);
    validateDocumentLibrary(library, expectedRootRel, title);
    log(`Document library "${title}" created at ${expectedRootRel}.`);
  } else {
    validateDocumentLibrary(library, expectedRootRel, title);
    log(`Document library "${title}" already exists and is a valid Document Library.`);
  }

  if (library.OnQuickLaunch !== true) {
    log(`Document library "${title}" is not on quick launch. Attempting to enable...`);
    await updateOnQuickLaunch(title, digest);
    library = await readLibrary(title);
  }

  validateDocumentLibrary(library, expectedRootRel, title);
  if (library.OnQuickLaunch !== true) {
    log(`Document library "${title}" remains OnQuickLaunch=${library.OnQuickLaunch}.`);
  } else {
    log(`Document library "${title}" is visible in quick launch (OnQuickLaunch=true).`);
  }
};

log(`Site: ${config.siteCode}`);
log(`WebDav root: ${config.webDavRoot}`);
if (libProvisioningLogs) {
  log(`[sp-rest] resolved webUrl: ${webUrl}`);
  log(`[sp-rest] ${siteDbLibrary.envName} raw="${siteDbLibrary.rawValue}" title="${siteDbLibrary.title}" expectedRoot="${siteDbLibrary.expectedRootRel}"`);
  log(`[sp-rest] ${usersDbLibrary.envName} raw="${usersDbLibrary.rawValue}" title="${usersDbLibrary.title}" expectedRoot="${usersDbLibrary.expectedRootRel}"`);
}
if (dryRun) {
  log('Dry-run mode: no libraries/files/folders will be created.');
}

const run = async () => {
  let siteDbView = null;
  let usersDbView = null;
  if (!dryRun) {
    const digest = await getRequestDigest();
    await ensureDocumentLibrary({
      title: siteDbLibrary.title,
      expectedRootRel: siteDbLibrary.expectedRootRel,
      digest,
    });
    await ensureDocumentLibrary({
      title: usersDbLibrary.title,
      expectedRootRel: usersDbLibrary.expectedRootRel,
      digest,
    });
    siteDbView = await ensureDocumentLibraryBrowserView(siteDbLibrary.title, siteDbLibrary.expectedRootRel, digest);
    usersDbView = await ensureDocumentLibraryBrowserView(usersDbLibrary.title, usersDbLibrary.expectedRootRel, digest);
  } else {
    log(`would ensure document library: ${siteDbLibrary.title} (${siteDbLibrary.expectedRootRel})`);
    log(`would ensure document library: ${usersDbLibrary.title} (${usersDbLibrary.expectedRootRel})`);
    log(`would ensure library browser view: ${siteDbLibrary.title} (${siteDbLibrary.expectedRootRel})`);
    log(`would ensure library browser view: ${usersDbLibrary.title} (${usersDbLibrary.expectedRootRel})`);
  }

  for (const folder of foldersToCreate) {
    const fullPath = ensureDir(folder);
    log(`ensured folder: ${fullPath}`);
  }

  for (const fileDef of defaultFiles) {
    const target = fileMap[fileDef.key];
    if (!target) continue;
    const result = ensureTextFile(target, fileDef.content);
    if (result.created === null) {
      log(`would ensure file: ${result.fullPath}`);
    } else if (result.created) {
      log(`created file: ${result.fullPath}`);
    } else {
      log(`kept existing file: ${result.fullPath}`);
    }
  }

  log('SharePoint site structure is ready.');
  log(`siteDB: ${siteDbRel}`);
  log(`siteUsersDb: ${usersDbRel}`);
  log(`widgets_data location: ${fileMap.widgets}`);
  if (siteDbView) {
    log(`Generated folder view URL (siteDB root): ${getLibraryFolderViewUrl(siteDbView.defaultViewUrl, siteDbRel)}`);
    log(`Generated folder view URL (siteDB dist): ${getLibraryFolderViewUrl(siteDbView.defaultViewUrl, distRel)}`);
    log(`Generated folder view URL (siteDB siteAssets): ${getLibraryFolderViewUrl(siteDbView.defaultViewUrl, siteAssetsRel)}`);
    log(`Generated folder view URL (siteDB images): ${getLibraryFolderViewUrl(siteDbView.defaultViewUrl, imagesRel)}`);
  }
  if (usersDbView) {
    log(`Generated folder view URL (siteUsersDb root): ${getLibraryFolderViewUrl(usersDbView.defaultViewUrl, usersDbRel)}`);
  }
  log(`Direct file URL (React app entry): https://${config.host}${distRel}/index.html`);
};

run().catch((error) => {
  console.error(`[init-site] Error: ${error.message}`);
  process.exit(1);
});
