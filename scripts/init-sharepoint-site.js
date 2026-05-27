import fs from 'fs';
import path from 'path';
import { parseCliArgs, resolveConfig, writeEnvProduction } from './sp-env.js';

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
  { key: 'gantt', content: JSON.stringify({ enabled: false, buttonLabel: 'גאנט עבודה', pageTitle: 'גאנט עבודה', description: '', groupBy: 'category', defaultView: 'month', showLegend: true, showToday: true, categories: [], items: [] }, null, 2) },
];

const checkLibrary = (title, rel) => {
  const rootPath = config.toWebDav(rel);
  const exists = fs.existsSync(rootPath);
  const formsAllItemsPath = path.win32.join(rootPath, 'Forms', 'AllItems.aspx');
  const hasFormsView = fs.existsSync(formsAllItemsPath);
  const isDocumentLibrary = exists && hasFormsView;
  log(`library check: ${title} | rel=${rel} | exists=${exists} | formsAllItems=${hasFormsView} | isDocumentLibrary=${isDocumentLibrary}`);
  return { title, rel, exists, hasFormsView, isDocumentLibrary, rootPath };
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

const run = async () => {
  log(`mode=${mode}`);
  log(`site=${config.siteCode}`);
  log(`webDavRoot=${config.webDavRoot}`);
  if (dryRun) log('dry-run enabled');

  const shouldWriteEnv = cli['write-env'] === true || String(cli['write-env'] || '').toLowerCase() === 'true';
  if (shouldWriteEnv) {
    const outputPath = writeEnvProduction(config, envPath);
    log(`updated env file: ${outputPath}`);
  }

  const siteDb = checkLibrary('VITE_SP_SITE_DB_FOLDER', siteDbRel);
  const usersDb = checkLibrary('VITE_SP_USERS_DB_FOLDER', usersDbRel);
  const librariesReady = siteDb.isDocumentLibrary && usersDb.isDocumentLibrary;

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

run().catch((error) => {
  console.error(`[init-site] Error: ${error.message}`);
  process.exit(1);
});
