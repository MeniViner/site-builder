import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { parseCliArgs, resolveConfig, writeEnvProduction } from './sp-env.js';
import { DEFAULT_GANTT_DATA } from '../src/utils/ganttData.js';
import { createInitialBoomData } from '../src/utils/boomData.js';
import {
  decideLegacyLibraryDeployment,
  probeLegacyWebDavLibrary,
} from './legacyWebDavLibraryProbe.mjs';

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
  boom: normalizeServerRelative(siteAssetsRel, 'boom_data.txt'),
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
  { key: 'boom', content: JSON.stringify(createInitialBoomData(), null, 2) },
];

const logLibraryCheck = (library) => {
  const probe = library.parentProbe || library.libraryProbe;
  console.log(`[legacy][LIBRARY_CHECK][WEBDAV] title=${library.title} | rel=${library.rel} | status=${library.status} | source=${library.source} | robocopyExitCode=${probe?.exitCode ?? 'n/a'}`);
  if (library.status === 'TRANSPORT_ERROR') {
    console.error(`[legacy][LIBRARY_CHECK][WEBDAV] transportError=${library.error || 'unknown WebDAV transport error'}`);
  }
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

  const probeDestination = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-webdav-probe-'));
  let siteDb;
  let usersDb;
  try {
    siteDb = probeLegacyWebDavLibrary({
      title: config.siteDbFolder,
      libraryRel: siteDbRel,
      siteRootRel: config.siteRootRel,
      toWebDav: config.toWebDav,
      probeDestination,
    });
    usersDb = probeLegacyWebDavLibrary({
      title: config.usersDbFolder,
      libraryRel: usersDbRel,
      siteRootRel: config.siteRootRel,
      toWebDav: config.toWebDav,
      probeDestination,
    });
  } finally {
    fs.rmSync(probeDestination, { recursive: true, force: true });
  }
  logLibraryCheck(siteDb);
  logLibraryCheck(usersDb);
  const decision = decideLegacyLibraryDeployment(siteDb, usersDb);
  const librariesReady = decision.librariesReady;

  const baseResult = { mode, librariesReady, deployMode: decision.deployMode, siteDb, usersDb };

  if (decision.transportError) {
    resultLog(baseResult);
    throw new Error(`Legacy WebDAV library probe failed for ${decision.transportError.rel}: ${decision.transportError.error}`);
  }

  if (mode === 'check-only') {
    resultLog(baseResult);
    return baseResult;
  }

  if (!librariesReady) {
    if (mode === 'bootstrap-mode') {
      log('bootstrap mode: libraries missing is allowed, skipping final structure init.');
      resultLog(baseResult);
      return baseResult;
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
  const result = { ...baseResult, finalized: true, distRel, siteAssetsRel, imagesRel, widgetsFileRel };
  resultLog(result);
  return result;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runInitSharePointSite().catch((error) => {
    console.error(`[init-site] Error: ${error.message}`);
    process.exit(1);
  });
}
