import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseCliArgs, resolveConfig, writeEnvProduction } from './sp-env.js';
import { DEFAULT_GANTT_DATA } from '../src/utils/ganttData.js';
import { classifySharePointLibraryResponse } from '../src/utils/sharePointLibraryClassifier.js';

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });
const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
const mode = cli['check-only'] ? 'check-only' : (cli['finalize-existing'] ? 'finalize-existing' : (cli['bootstrap-mode'] ? 'bootstrap-mode' : 'finalize-existing'));

const log = (message) => console.log(`[init-site] ${message}`);
const resultLog = (result) => console.log(`[init-site][result] ${JSON.stringify(result)}`);
const normalizeServerRelative = (...parts) => `/${parts.flatMap((part) => String(part || '').split('/').filter(Boolean)).join('/')}`;

const siteDbRel = normalizeServerRelative(config.siteRootRel, config.siteDbFolder);
const usersDbRel = normalizeServerRelative(config.siteRootRel, config.usersDbFolder);
const distRel = normalizeServerRelative(siteDbRel, 'dist');
const siteAssetsRel = normalizeServerRelative(siteDbRel, config.siteAssetsFolder);
const imagesRel = normalizeServerRelative(siteDbRel, config.imagesFolder);
const widgetsFileRel = normalizeServerRelative(config.widgetsDbTarget === 'site' ? siteAssetsRel : usersDbRel, 'widgets_data.txt');

const fileMap = {
  masterConfig: normalizeServerRelative(siteAssetsRel, 'bihs_master_config_v1.txt'),
  users: normalizeServerRelative(siteAssetsRel, 'users_data.txt'),
  events: normalizeServerRelative(siteAssetsRel, 'events_data.txt'),
  navigation: normalizeServerRelative(siteAssetsRel, 'nav_data.txt'),
  siteContent: normalizeServerRelative(siteAssetsRel, 'site_content_data.txt'),
  theme: normalizeServerRelative(siteAssetsRel, 'theme_data.txt'),
  widgets: widgetsFileRel,
  externalLinks: normalizeServerRelative(siteAssetsRel, 'external_links_data.txt'),
  gantt: normalizeServerRelative(siteAssetsRel, 'gantt_data.txt'),
};

const defaultFiles = [
  { key: 'masterConfig', content: JSON.stringify({ schemaVersion: '1.0.0' }, null, 2) },
  { key: 'users', content: JSON.stringify([{ id: 1, name: 'מנהל לדוגמה', role: 'admin', personalNumber: '8856096', email: '', loginName: '' }, { id: 2, name: 'מנהל ראשי', role: 'admin', personalNumber: '8624034', email: '', loginName: '' }], null, 2) },
  { key: 'events', content: JSON.stringify({ displayCount: 3, displayMode: 'default', events: [] }, null, 2) },
  { key: 'navigation', content: JSON.stringify([], null, 2) },
  { key: 'siteContent', content: JSON.stringify({}, null, 2) },
  { key: 'theme', content: JSON.stringify({}, null, 2) },
  { key: 'widgets', content: JSON.stringify({}, null, 2) },
  { key: 'externalLinks', content: JSON.stringify([], null, 2) },
  { key: 'gantt', content: JSON.stringify(DEFAULT_GANTT_DATA, null, 2) },
];

const escapeOData = (value) => String(value ?? '').replace(/'/g, "''");
const libraryCheckEndpoint = (title, { host = config.host, siteApiRootRel = config.siteApiRootRel } = {}) => `https://${host}${siteApiRootRel}/_api/web/lists/GetByTitle('${escapeOData(title)}')?$select=Id,Title,BaseTemplate,BaseType,RootFolder/ServerRelativeUrl&$expand=RootFolder`;

const parseJson = (value) => {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
};

export const checkLibraryReadiness = async ({ title, rel, fetchImpl = fetch, host, siteApiRootRel } = {}) => {
  const endpoint = libraryCheckEndpoint(title, { host, siteApiRootRel });
  let response;
  let body = '';
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json;odata=verbose, application/json;odata=minimalmetadata, application/json;odata=nometadata' },
    });
    body = await response.text();
  } catch (error) {
    return {
      title,
      rel,
      endpoint,
      status: 0,
      parsedAs: 'transport-error',
      exists: false,
      isDocumentLibrary: false,
      ready: false,
      reason: 'LIBRARY_RESPONSE_UNRECOGNIZED',
      error: error?.message || String(error),
    };
  }
  const contentType = String(response.headers?.get?.('content-type') || '');
  const payload = parseJson(body);
  const parsedAs = payload ? 'json' : (body ? 'unrecognized' : 'empty');
  const classification = classifySharePointLibraryResponse({
    status: response.status,
    payload,
    title,
    expectedRootUrl: rel,
    parsedAs,
  });
  return {
    title,
    rel,
    endpoint,
    contentType,
    bodyPreview: body.slice(0, 700),
    ...classification,
  };
};

const logLibraryCheck = (library) => {
  log(`LIBRARY_CHECK | title=${library.title} | rel=${library.rel} | status=${library.status} | parsed=${library.parsedAs}/${library.responseType} | exists=${library.exists} | BaseTemplate=${library.baseTemplate ?? 'unknown'} | RootFolder=${library.rootFolder || 'unknown'} | isDocumentLibrary=${library.isDocumentLibrary} | readinessReason=${library.reason}`);
  log(`LIBRARY_READY: ${library.ready} | title=${library.title}`);
};

const ensureDir = (serverRelativeDir) => {
  const fullPath = config.toWebDav(serverRelativeDir);
  if (!dryRun) fs.mkdirSync(fullPath, { recursive: true });
  log(`${dryRun ? 'would ensure' : 'ensured'} folder: ${fullPath}`);
};

const ensureTextFile = (serverRelativeFilePath, content) => {
  const fullPath = config.toWebDav(serverRelativeFilePath);
  if (dryRun) {
    log(`would ensure file: ${fullPath}`);
    return;
  }
  fs.mkdirSync(path.win32.dirname(fullPath), { recursive: true });
  if (fs.existsSync(fullPath)) {
    const existing = fs.readFileSync(fullPath, 'utf8');
    if (existing.trim().length > 0) {
      log(`kept existing non-empty file: ${fullPath}`);
      return;
    }
  }
  fs.writeFileSync(fullPath, `${content}\n`, 'utf8');
  log(`created file: ${fullPath}`);
};

export const runInitSharePointSite = async () => {
  log(`mode=${mode}`);
  log(`site=${config.siteCode}`);
  log(`webDavRoot=${config.webDavRoot}`);
  if (dryRun) log('dry-run enabled');

  const shouldWriteEnv = cli['write-env'] === true || String(cli['write-env'] || '').toLowerCase() === 'true';
  if (shouldWriteEnv) {
    const outputPath = writeEnvProduction(config, envPath);
    log(`updated env file: ${outputPath}`);
  }

  const siteDb = await checkLibraryReadiness({ title: config.siteDbFolder, rel: siteDbRel });
  const usersDb = await checkLibraryReadiness({ title: config.usersDbFolder, rel: usersDbRel });
  logLibraryCheck(siteDb);
  logLibraryCheck(usersDb);
  const librariesReady = siteDb.ready && usersDb.ready;

  const baseResult = { mode, librariesReady, siteDb, usersDb };

  if (mode === 'check-only') {
    resultLog(baseResult);
    process.exit(0);
  }

  if (!librariesReady) {
    if (mode === 'bootstrap-mode') {
      log('bootstrap mode: libraries missing is allowed, skipping final structure init.');
      resultLog(baseResult);
      process.exit(0);
    }
    throw new Error('Required Document Libraries are missing or not valid SharePoint libraries.');
  }

  ensureDir(distRel);
  ensureDir(siteAssetsRel);
  ensureDir(imagesRel);
  for (const fileDef of defaultFiles) {
    const target = fileMap[fileDef.key];
    if (!target) continue;
    ensureTextFile(target, fileDef.content);
  }

  log(`final init complete | siteDB=${siteDbRel} | siteUsersDb=${usersDbRel}`);
  resultLog({ ...baseResult, finalized: true, distRel, siteAssetsRel, imagesRel, widgetsFileRel });
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runInitSharePointSite().catch((error) => {
    console.error(`[init-site] Error: ${error.message}`);
    process.exit(1);
  });
}
