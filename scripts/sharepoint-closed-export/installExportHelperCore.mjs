import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LEGACY_MAPPINGS } from '../../server/src/repository/legacyMappings.js';
import { buildLegacyFilePlan, normalizeSharePointServerRelativePath } from './exportKitCore.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const HOSTED_HELPER_JS_PATH = path.join(__dirname, 'hosted-helper', 'export-helper.js');

export const HELPER_FOLDER_NAME = 'export-helper';
export const HELPER_FILES = Object.freeze({
  index: 'index.html',
  script: 'export-helper.js',
});

export function normalizeServerRelative(...parts) {
  return `/${parts.flatMap((part) => String(part || '').split('/').filter(Boolean)).join('/')}`;
}

function siteRootFromValue(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withoutOrigin = /^https?:\/\//i.test(raw) ? new URL(raw).pathname : raw;
  const normalized = withoutOrigin.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/g, '');
  if (/^\/?(sites|teams)\//i.test(normalized)) {
    return normalizeSharePointServerRelativePath(normalized);
  }
  return normalizeSharePointServerRelativePath(`/sites/${normalized}`);
}

export function resolveHelperInstallPlan({ config, cli = {} } = {}) {
  const rawSite = cli.site || cli['site-code'] || config?.siteCode || '';
  const siteRootRel = siteRootFromValue(cli['site-relative-path'] || cli.siteRelativePath || rawSite || config?.siteRootRel);
  const siteCode = String(rawSite || siteRootRel.replace(/^\/?(sites|teams)\//i, '')).replace(/^\/+/, '');
  const siteDbFolder = String(cli['site-db'] || config?.siteDbFolder || 'siteDB').replace(/^\/+|\/+$/g, '');
  const usersDbFolder = String(cli['users-db'] || config?.usersDbFolder || 'siteUsersDb').replace(/^\/+|\/+$/g, '');
  const siteAssetsFolder = String(cli['site-assets'] || config?.siteAssetsFolder || 'siteAssets').replace(/^\/+|\/+$/g, '');
  const widgetsDbTarget = String(cli['widgets-db-target'] || config?.widgetsDbTarget || 'users').toLowerCase() === 'site' ? 'site' : 'users';
  const helperFolderName = String(cli['helper-folder'] || HELPER_FOLDER_NAME).replace(/^\/+|\/+$/g, '');

  if (helperFolderName !== HELPER_FOLDER_NAME) {
    throw new Error(`Helper folder must be "${HELPER_FOLDER_NAME}" to keep tooling isolated.`);
  }

  const siteDbRel = normalizeServerRelative(siteRootRel, siteDbFolder);
  const usersDbRel = normalizeServerRelative(siteRootRel, usersDbFolder);
  const siteAssetsRel = normalizeServerRelative(siteDbRel, siteAssetsFolder);
  const helperFolderRel = normalizeServerRelative(siteAssetsRel, helperFolderName);
  const indexRel = normalizeServerRelative(helperFolderRel, HELPER_FILES.index);
  const scriptRel = normalizeServerRelative(helperFolderRel, HELPER_FILES.script);
  const filePlan = buildLegacyFilePlan({
    siteCode,
    siteRelativePath: siteRootRel,
    documentLibraryName: siteDbFolder,
    usersDocumentLibraryName: usersDbFolder,
    siteAssetsFolder,
    widgetsDbTarget,
  }).map((file) => {
    const mapping = LEGACY_MAPPINGS.find((item) => item.fileName === file.fileName) || {};
    return {
      key: file.key,
      fileName: file.fileName,
      scope: file.scope,
      entityId: file.entityId || '',
      mode: file.mode,
      listProperty: file.listProperty || '',
      rootType: mapping.rootType || '',
      serverRelativePath: file.serverRelativePath,
    };
  });

  const host = String(config?.host || cli.host || '').replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  const helperUrl = host ? `https://${host}${indexRel}` : indexRel;

  return {
    siteCode,
    displayName: String(cli.displayName || cli['display-name'] || siteCode),
    siteRootRel,
    siteDbRel,
    usersDbRel,
    siteAssetsRel,
    helperFolderRel,
    indexRel,
    scriptRel,
    helperUrl,
    widgetsDbTarget,
    filePlan,
  };
}

export function assertSafeHelperInstallPlan(plan) {
  const expectedFolder = normalizeServerRelative(plan.siteAssetsRel, HELPER_FOLDER_NAME);
  const expectedIndex = normalizeServerRelative(expectedFolder, HELPER_FILES.index);
  const expectedScript = normalizeServerRelative(expectedFolder, HELPER_FILES.script);

  if (plan.helperFolderRel !== expectedFolder || plan.indexRel !== expectedIndex || plan.scriptRel !== expectedScript) {
    throw new Error('Unsafe helper install path. Helper files must stay under siteDB/siteAssets/export-helper/.');
  }

  const forbiddenNames = new Set(LEGACY_MAPPINGS.map((mapping) => mapping.fileName));
  for (const target of [plan.indexRel, plan.scriptRel]) {
    const fileName = target.split('/').pop();
    if (forbiddenNames.has(fileName)) {
      throw new Error(`Unsafe helper target overlaps a legacy TXT file: ${fileName}`);
    }
  }

  return true;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function createHelperIndexHtml(plan) {
  const payload = {
    siteCode: plan.siteCode,
    displayName: plan.displayName,
    siteRelativePath: plan.siteRootRel,
    helperUrl: plan.helperUrl,
    files: plan.filePlan,
  };
  const scriptPayload = JSON.stringify(payload, null, 2).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Site Builder Export Helper</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f7fb; color: #172033; }
    main { width: min(1040px, calc(100% - 32px)); margin: 0 auto; padding: 32px 0 48px; }
    header { border-bottom: 1px solid #d9deea; padding-bottom: 20px; margin-bottom: 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    h2 { margin: 0 0 12px; font-size: 20px; }
    h3 { margin: 0 0 8px; font-size: 15px; }
    p { line-height: 1.6; }
    code { direction: ltr; unicode-bidi: plaintext; background: #e9edf6; padding: 2px 6px; border-radius: 4px; }
    .meta, .panel { background: #fff; border: 1px solid #d9deea; border-radius: 8px; padding: 18px; margin-bottom: 16px; }
    .meta dl { display: grid; grid-template-columns: 140px 1fr; gap: 8px 16px; margin: 0; }
    .meta dt { font-weight: 700; }
    .actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 16px 0; }
    button { border: 0; border-radius: 8px; padding: 12px 18px; font-weight: 700; cursor: pointer; background: #2563eb; color: #fff; }
    button.secondary { background: #334155; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    #status { border-radius: 8px; padding: 12px 14px; background: #e8eefc; color: #1e3a8a; }
    #status[data-tone="good"] { background: #dcfce7; color: #166534; }
    #status[data-tone="warn"] { background: #fef3c7; color: #92400e; }
    .file-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .file-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #d9deea; border-radius: 8px; padding: 12px; background: #fff; }
    .file-row small { display: block; direction: ltr; unicode-bidi: plaintext; color: #64748b; margin-top: 3px; }
    .file-row span { white-space: nowrap; font-weight: 700; }
    .file-row[data-tone="good"] { border-color: #86efac; }
    .file-row[data-tone="warn"] { border-color: #fbbf24; }
    .file-row[data-tone="bad"] { border-color: #fca5a5; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .warning { background: #fff7ed; border: 1px solid #fed7aa; color: #7c2d12; border-radius: 8px; padding: 12px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>כלי ייצוא נתוני Site Builder</h1>
      <p>הדף הזה קורא בלבד. הוא מוריד עותק מקומי של קבצי TXT קיימים ולא כותב ל-SharePoint או ל-MongoDB.</p>
    </header>

    <section class="meta">
      <dl>
        <dt>שם אתר</dt><dd id="displayName">${escapeHtml(plan.displayName)}</dd>
        <dt>siteCode</dt><dd><code id="siteCode">${escapeHtml(plan.siteCode)}</code></dd>
        <dt>נתיב אתר</dt><dd><code id="sitePath">${escapeHtml(plan.siteRootRel)}</code></dd>
      </dl>
    </section>

    <section class="panel">
      <h2>פעולות</h2>
      <p class="warning">אין להשתמש בדף הזה כדי לאתחל, לאפס, להעלות או למחוק קבצים. הוא מיועד רק להורדה מקומית של artifact למיגרציה יבשה.</p>
      <div class="actions">
        <button id="checkBtn" type="button" class="secondary">בדוק סטטוס קבצים</button>
        <button id="downloadBtn" type="button" disabled>Download all site data</button>
      </div>
      <div id="status" role="status"></div>
    </section>

    <section class="panel">
      <h2>קבצי TXT צפויים</h2>
      <ul id="files" class="file-list"></ul>
    </section>

    <section id="summary" class="panel" aria-live="polite">
      <h2>סיכום</h2>
      <p>טרם בוצעה בדיקה.</p>
    </section>
  </main>

  <script>
    window.SITE_BUILDER_EXPORT_HELPER_CONFIG = ${scriptPayload};
  </script>
  <script src="./export-helper.js"></script>
</body>
</html>
`;
}

export function readHostedHelperScript() {
  return fs.readFileSync(HOSTED_HELPER_JS_PATH, 'utf8');
}

export function createHelperFiles(plan) {
  assertSafeHelperInstallPlan(plan);
  return [
    {
      serverRelativePath: plan.indexRel,
      content: createHelperIndexHtml(plan),
      contentType: 'text/html; charset=utf-8',
    },
    {
      serverRelativePath: plan.scriptRel,
      content: readHostedHelperScript(),
      contentType: 'application/javascript; charset=utf-8',
    },
  ];
}

export function installHelperFiles({ plan, config, dryRun = false, fsAdapter = fs } = {}) {
  const files = createHelperFiles(plan);
  const writes = files.map((file) => ({
    ...file,
    webDavPath: config.toWebDav(file.serverRelativePath),
  }));

  if (dryRun) return { installed: false, writes };

  const siteAssetsWebDavPath = config.toWebDav(plan.siteAssetsRel);
  if (!fsAdapter.existsSync(siteAssetsWebDavPath)) {
    throw new Error(`siteAssets folder does not exist. Refusing to create library structure: ${siteAssetsWebDavPath}`);
  }

  const helperWebDavPath = config.toWebDav(plan.helperFolderRel);
  fsAdapter.mkdirSync(helperWebDavPath, { recursive: true });
  for (const write of writes) {
    fsAdapter.writeFileSync(write.webDavPath, write.content, 'utf8');
  }

  return { installed: true, writes };
}
