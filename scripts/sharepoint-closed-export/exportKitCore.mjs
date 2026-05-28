import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { LEGACY_MAPPINGS, describeLegacyMapping, normalizeLegacyKey } from '../../server/src/repository/legacyMappings.js';
import { sanitizeSiteCollectionName } from '../../server/src/utils/collectionNames.js';

export const DEFAULT_OUTPUT_ROOT = 'exports/sharepoint-closed';
export const DEFAULT_MANUAL_INPUT_DIR = 'sharepoint-export-input';
export const SITE_EXPORT_METADATA_FILE = 'site.export.json';

export function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

export function sha256Json(value) {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

export function sanitizeLocalFolderName(value, fallback = 'site') {
  const raw = String(value || '').trim() || fallback;
  const hashSuffix = sha256Text(raw).slice(0, 8);
  const base = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[/\\\s.]+/g, '_')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/-+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
  const maxBaseLength = 72;
  return `${base.slice(0, maxBaseLength).replace(/^_+|_+$/g, '') || fallback}_${hashSuffix}`;
}

export function targetMongoCollectionNameForSite({ siteCode, siteSlug = '', collectionPrefix = '' } = {}) {
  const normalizedSiteCode = String(siteCode || '').trim();
  const normalizedSiteSlug = String(siteSlug || normalizedSiteCode).trim();
  const safeNameSource = normalizedSiteSlug ? `${normalizedSiteSlug}:${normalizedSiteCode}` : normalizedSiteCode;
  return sanitizeSiteCollectionName(safeNameSource, {
    ...(collectionPrefix ? { prefix: collectionPrefix } : {}),
  });
}

export function normalizeSharePointServerRelativePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const withoutOrigin = /^https?:\/\//i.test(raw)
    ? (() => {
        try {
          return new URL(raw).pathname;
        } catch {
          return raw.replace(/^https?:\/\/[^/]+/i, '');
        }
      })()
    : raw;

  const normalized = withoutOrigin
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/\/+$/g, '');

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function buildLegacyFilePlan(config = {}) {
  const siteCode = String(config.siteCode || 'siteBuilder').trim();
  const siteRelativePath = normalizeSharePointServerRelativePath(
    config.siteRelativePath || (siteCode ? `/sites/${siteCode}` : ''),
  );
  const siteDbFolder = String(config.documentLibraryName || config.siteDbFolder || 'siteDB').trim().replace(/^\/+|\/+$/g, '');
  const usersDbFolder = String(config.usersDocumentLibraryName || config.usersDbFolder || 'siteUsersDb').trim().replace(/^\/+|\/+$/g, '');
  const siteAssetsFolder = String(config.siteAssetsFolder || 'siteAssets').trim().replace(/^\/+|\/+$/g, '');
  const widgetsDbTarget = String(config.widgetsDbTarget || 'users').trim().toLowerCase() === 'site' ? 'site' : 'users';

  const defaultLegacyFolder = normalizeSharePointServerRelativePath(
    config.legacyFolderPath || `${siteRelativePath}/${siteDbFolder}/${siteAssetsFolder}`,
  );
  const usersLegacyFolder = normalizeSharePointServerRelativePath(
    config.usersLegacyFolderPath || `${siteRelativePath}/${usersDbFolder}`,
  );

  const configuredExpected = Array.isArray(config.expectedLegacyTxtKeys) && config.expectedLegacyTxtKeys.length > 0
    ? config.expectedLegacyTxtKeys
    : LEGACY_MAPPINGS.map((mapping) => mapping.fileName);
  const expectedSet = new Set(configuredExpected.map((item) => String(item).split('/').pop()).filter(Boolean));

  return LEGACY_MAPPINGS
    .filter((mapping) => expectedSet.has(mapping.fileName))
    .map((mapping) => {
      const folder = mapping.key === 'widgets' && widgetsDbTarget !== 'site'
        ? usersLegacyFolder
        : defaultLegacyFolder;
      return {
        ...mapping,
        normalizedAs: describeLegacyMapping(mapping),
        serverRelativePath: normalizeSharePointServerRelativePath(`${folder}/${mapping.fileName}`),
      };
    });
}

export function pathToMountedFile(mountedRootPath, serverRelativePath) {
  const root = String(mountedRootPath || '').trim();
  if (!root) return '';
  const segments = normalizeSharePointServerRelativePath(serverRelativePath).split('/').filter(Boolean);
  const looksWindows = root.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(root);
  return looksWindows ? path.win32.join(root, ...segments) : path.join(root, ...segments);
}

function parseJson(text, fileName) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return {
      parseStatus: 'empty',
      data: null,
      error: 'File is empty',
    };
  }

  try {
    return {
      parseStatus: 'valid',
      data: JSON.parse(trimmed),
      error: '',
    };
  } catch (error) {
    return {
      parseStatus: 'invalid-json',
      data: null,
      error: `Invalid JSON in ${fileName}: ${error.message}`,
    };
  }
}

function recordCountFor(mapping, data) {
  if (mapping.mode === 'list') return Array.isArray(data) ? data.length : null;
  if (mapping.mode === 'list-with-settings') {
    return Array.isArray(data?.[mapping.listProperty]) ? data[mapping.listProperty].length : null;
  }
  if (Array.isArray(data)) return data.length;
  if (data && typeof data === 'object') {
    const nestedArrayCount = Object.values(data)
      .filter((value) => Array.isArray(value))
      .reduce((sum, value) => sum + value.length, 0);
    return nestedArrayCount || 1;
  }
  return null;
}

function validateShape(mapping, data) {
  if (data === null || data === undefined) return [];
  const warnings = [];
  if (mapping.rootType === 'array' && !Array.isArray(data)) {
    warnings.push(`${mapping.fileName} expected an array root.`);
  }
  if (mapping.rootType === 'object' && (data === null || typeof data !== 'object' || Array.isArray(data))) {
    warnings.push(`${mapping.fileName} expected an object root.`);
  }
  if (mapping.mode === 'list-with-settings' && !Array.isArray(data?.[mapping.listProperty])) {
    warnings.push(`${mapping.fileName} expected "${mapping.listProperty}" to be an array.`);
  }
  if (mapping.key === 'masterConfig' && !data?.schemaVersion) {
    warnings.push('bihs_master_config_v1.txt does not include schemaVersion.');
  }
  return warnings;
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function ensureCleanOutputDirectories(exportDir) {
  await fs.mkdir(path.join(exportDir, 'raw'), { recursive: true });
  await fs.mkdir(path.join(exportDir, 'normalized'), { recursive: true });
}

function buildReportMarkdown(manifest) {
  const status = manifest.status || (manifest.safeForMongoDryRun
    ? (manifest.warnings.length > 0 ? 'WARNING' : 'PASS')
    : 'FAIL');
  const line = (items, fallback = 'None') => items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : fallback;

  const missing = manifest.files.filter((file) => file.status === 'missing').map((file) => file.fileName);
  const empty = manifest.files.filter((file) => file.parseStatus === 'empty').map((file) => file.fileName);
  const invalid = manifest.files.filter((file) => file.parseStatus === 'invalid-json').map((file) => file.fileName);
  const small = manifest.files.filter((file) => file.suspiciouslySmall).map((file) => `${file.fileName} (${file.sizeBytes} bytes)`);
  const counts = manifest.files
    .filter((file) => file.parseStatus === 'valid')
    .map((file) => `${file.fileName}: ${file.recordCount ?? 'n/a'} record(s), ${file.sizeBytes} bytes, ${file.sha256}`);

  return `# Closed SharePoint Export Report

Status: **${status}**

Export ID: \`${manifest.exportId}\`
Created at: \`${manifest.createdAt}\`
Site code: \`${manifest.siteCode}\`
Display name: \`${manifest.displayName || manifest.siteCode}\`
Source mode: \`${manifest.sourceMode}\`
Target Mongo collection: \`${manifest.targetMongoCollectionName}\`
Safe for Mongo dry-run: **${manifest.safeForMongoDryRun ? 'yes' : 'no'}**

## Missing Files

${line(missing)}

## Empty Files

${line(empty)}

## Invalid JSON Files

${line(invalid)}

## Suspiciously Small Files

${line(small)}

## Counts And Hashes

${line(counts)}

## Warnings

${line(manifest.warnings)}

## Errors

${line(manifest.errors)}

## Next Mongo Dry-Run Command

\`\`\`bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export ${manifest.exportDir} --site ${manifest.siteCode}
\`\`\`
`;
}

function toExportId(createdAt, siteCode) {
  const stamp = createdAt.replace(/[:.]/g, '-');
  const safeSite = sanitizeLocalFolderName(siteCode || 'site');
  const suffix = sha256Text(`${siteCode}:${createdAt}`).slice(0, 8);
  return `${safeSite}-${stamp}-${suffix}`;
}

function toBatchExportId(createdAt) {
  return `batch-${createdAt.replace(/[:.]/g, '-')}-${sha256Text(`batch:${createdAt}`).slice(0, 8)}`;
}

async function readOptionalJson(filePath) {
  const text = await readOptionalFile(filePath);
  if (text === null) return { data: null, error: '' };
  try {
    return { data: JSON.parse(text), error: '' };
  } catch (error) {
    return { data: null, error: `Invalid JSON in ${filePath}: ${error.message}` };
  }
}

async function listSiteInputFolders(inputRoot) {
  const entries = await fs.readdir(inputRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => ({
      folderName: entry.name,
      inputDir: path.join(inputRoot, entry.name),
    }))
    .sort((a, b) => a.folderName.localeCompare(b.folderName));
}

function summarizeHashes(files) {
  const validFiles = files
    .filter((file) => file.sha256)
    .map((file) => ({
      fileName: file.fileName,
      sha256: file.sha256,
      jsonSha256: file.jsonSha256,
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
  return {
    fileCount: validFiles.length,
    sha256: sha256Json(validFiles),
  };
}

function buildSiteBatchSummary(manifest) {
  const missingFiles = manifest.files.filter((file) => file.status === 'missing').map((file) => file.fileName);
  const emptyFiles = manifest.files.filter((file) => file.parseStatus === 'empty').map((file) => file.fileName);
  const invalidJsonFiles = manifest.files.filter((file) => file.parseStatus === 'invalid-json').map((file) => file.fileName);
  const filesDiscovered = manifest.files.filter((file) => file.status !== 'missing').length;

  return {
    siteCode: manifest.siteCode,
    siteSlug: manifest.siteSlug || manifest.siteCode,
    displayName: manifest.displayName || manifest.siteCode,
    siteRelativePath: manifest.siteRelativePath || '',
    safeSiteFolder: manifest.safeSiteFolder,
    exportDir: manifest.exportDir,
    targetMongoCollectionName: manifest.targetMongoCollectionName,
    status: manifest.status,
    expectedFiles: manifest.files.length,
    filesDiscovered,
    missingFiles,
    emptyFiles,
    invalidJsonFiles,
    recordCounts: Object.fromEntries(
      manifest.files.map((file) => [file.fileName, file.recordCount]),
    ),
    hashSummary: summarizeHashes(manifest.files),
    warnings: manifest.warnings,
    errors: manifest.errors,
    safeForMongoDryRun: manifest.safeForMongoDryRun,
  };
}

function collectionCollisionCheck(sites) {
  const byCollection = new Map();
  for (const site of sites) {
    const key = site.targetMongoCollectionName;
    if (!byCollection.has(key)) byCollection.set(key, []);
    byCollection.get(key).push({
      siteCode: site.siteCode,
      safeSiteFolder: site.safeSiteFolder,
    });
  }

  const collisions = [...byCollection.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([collectionName, entries]) => ({
      collectionName,
      sites: entries,
    }));

  return {
    passed: collisions.length === 0,
    collisions,
  };
}

function buildBatchReportMarkdown(manifest) {
  const line = (items, fallback = 'None') => items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : fallback;
  const siteRows = manifest.sites.map((site) =>
    `${site.status}: \`${site.siteCode}\` -> \`${site.safeSiteFolder}\` -> \`${site.targetMongoCollectionName}\``
  );
  const missing = manifest.sites
    .filter((site) => site.missingFiles.length > 0)
    .map((site) => `${site.siteCode}: ${site.missingFiles.join(', ')}`);
  const empty = manifest.sites
    .filter((site) => site.emptyFiles.length > 0)
    .map((site) => `${site.siteCode}: ${site.emptyFiles.join(', ')}`);
  const invalid = manifest.sites
    .filter((site) => site.invalidJsonFiles.length > 0)
    .map((site) => `${site.siteCode}: ${site.invalidJsonFiles.join(', ')}`);
  const counts = manifest.sites.map((site) => {
    const fileCounts = Object.entries(site.recordCounts)
      .map(([fileName, count]) => `${fileName}: ${count ?? 'n/a'}`)
      .join(', ');
    return `${site.siteCode}: ${fileCounts}`;
  });
  const collisions = manifest.collectionCollisionCheck.collisions.map((collision) =>
    `${collision.collectionName}: ${collision.sites.map((site) => site.siteCode).join(', ')}`
  );

  return `# Closed SharePoint Batch Export Report

Status: **${manifest.status}**

Batch export ID: \`${manifest.batchExportId}\`
Created at: \`${manifest.createdAt}\`
Source mode: \`${manifest.sourceMode}\`
Total sites: **${manifest.totalSites}**
Total files discovered: **${manifest.totalFiles}**
Safe for Mongo dry-run: **${manifest.safeForMongoDryRun ? 'yes' : 'no'}**

## Sites Discovered

${line(siteRows)}

## Missing Files Per Site

${line(missing)}

## Empty Files Per Site

${line(empty)}

## Invalid JSON Per Site

${line(invalid)}

## Record Counts Per Site

${line(counts)}

## Target Mongo Collections

${line(siteRows)}

## Collection Collision Check

${manifest.collectionCollisionCheck.passed ? 'PASS' : 'FAIL'}

${line(collisions)}

## Warnings

${line(manifest.warnings)}

## Errors

${line(manifest.errors)}

## Next Mongo Dry-Run Command

\`\`\`bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export ${manifest.exportDir} --all-sites
\`\`\`
`;
}

export async function createClosedSharePointExportArtifact({
  inputDir = DEFAULT_MANUAL_INPUT_DIR,
  browserExportPath = '',
  outputRoot = DEFAULT_OUTPUT_ROOT,
  config = {},
  sourceMode = 'manual-folder',
  createdAt = new Date().toISOString(),
  exportId = '',
} = {}) {
  const siteCode = String(config.siteCode || 'siteBuilder').trim() || 'siteBuilder';
  const siteSlug = String(config.siteSlug || siteCode).trim() || siteCode;
  const displayName = String(config.displayName || siteCode).trim() || siteCode;
  const safeSiteFolder = String(config.safeSiteFolder || sanitizeLocalFolderName(siteCode)).trim();
  const targetMongoCollectionName = targetMongoCollectionNameForSite({
    siteCode,
    siteSlug,
    collectionPrefix: config.siteCollectionPrefix || config.collectionPrefix || '',
  });
  const resolvedExportId = exportId || toExportId(createdAt, siteCode);
  const exportDir = path.join(outputRoot, resolvedExportId);
  const filePlan = buildLegacyFilePlan(config);
  await ensureCleanOutputDirectories(exportDir);

  let browserFilesByName = new Map();
  if (browserExportPath) {
    const rawBrowserExport = await fs.readFile(browserExportPath, 'utf8');
    const parsedBrowserExport = JSON.parse(rawBrowserExport);
    browserFilesByName = new Map((parsedBrowserExport.files || []).map((file) => [file.fileName, file]));
    sourceMode = 'browser-helper';
  }

  const files = [];
  const objects = [];
  const warnings = Array.isArray(config.preflightWarnings) ? [...config.preflightWarnings] : [];
  const errors = Array.isArray(config.preflightErrors) ? [...config.preflightErrors] : [];

  for (const mapping of filePlan) {
    const browserFile = browserFilesByName.get(mapping.fileName);
    const sourcePath = browserFile
      ? browserExportPath
      : path.join(inputDir, mapping.fileName);
    const text = browserFile
      ? String(browserFile.text ?? '')
      : await readOptionalFile(sourcePath);

    if (text === null) {
      const message = `Missing expected file: ${mapping.fileName}`;
      errors.push(message);
      files.push({
        key: mapping.key,
        fileName: mapping.fileName,
        serverRelativePath: mapping.serverRelativePath,
        sourcePath,
        status: 'missing',
        parseStatus: 'missing',
        sizeBytes: 0,
        sha256: null,
        jsonSha256: null,
        recordCount: null,
        warnings: [],
        errors: [message],
      });
      continue;
    }

    const rawTargetPath = path.join(exportDir, 'raw', mapping.fileName);
    await fs.writeFile(rawTargetPath, text, 'utf8');

    const sizeBytes = Buffer.byteLength(text, 'utf8');
    const suspiciouslySmall = String(text).trim().length > 0 && sizeBytes < 5;
    const parsed = parseJson(text, mapping.fileName);
    const fileWarnings = [];
    const fileErrors = [];

    if (suspiciouslySmall) fileWarnings.push(`${mapping.fileName} is suspiciously small (${sizeBytes} bytes).`);
    if (parsed.parseStatus === 'empty') fileErrors.push(`${mapping.fileName} is empty.`);
    if (parsed.parseStatus === 'invalid-json') fileErrors.push(parsed.error);
    if (parsed.parseStatus === 'valid') fileWarnings.push(...validateShape(mapping, parsed.data));

    warnings.push(...fileWarnings);
    errors.push(...fileErrors);

    const fileEntry = {
      key: mapping.key,
      fileName: mapping.fileName,
      normalizedKey: normalizeLegacyKey(mapping.serverRelativePath),
      serverRelativePath: mapping.serverRelativePath,
      sourcePath,
      status: parsed.parseStatus === 'valid' ? 'ok' : 'error',
      parseStatus: parsed.parseStatus,
      sizeBytes,
      sha256: sha256Text(text),
      jsonSha256: parsed.parseStatus === 'valid' ? sha256Json(parsed.data) : null,
      recordCount: parsed.parseStatus === 'valid' ? recordCountFor(mapping, parsed.data) : null,
      suspiciouslySmall,
      mapping: {
        scope: mapping.scope,
        entityId: mapping.entityId || null,
        mode: mapping.mode,
        normalizedAs: mapping.normalizedAs,
      },
      warnings: fileWarnings,
      errors: fileErrors,
    };

    files.push(fileEntry);
    if (parsed.parseStatus === 'valid') {
      objects.push({
        key: mapping.serverRelativePath,
        fileName: mapping.fileName,
        mappingKey: mapping.key,
        data: parsed.data,
        sha256: fileEntry.sha256,
        jsonSha256: fileEntry.jsonSha256,
        sizeBytes,
        recordCount: fileEntry.recordCount,
      });
    }
  }

  const safeForMongoDryRun = errors.length === 0;
  const status = safeForMongoDryRun ? (warnings.length > 0 ? 'WARNING' : 'PASS') : 'FAIL';

  const manifest = {
    exportId: resolvedExportId,
    exportDir,
    createdAt,
    siteCode,
    siteSlug,
    displayName,
    siteRelativePath: normalizeSharePointServerRelativePath(config.siteRelativePath || (siteCode ? `/sites/${siteCode}` : '')),
    safeSiteFolder,
    targetMongoCollectionName,
    status,
    sourceMode,
    files,
    warnings,
    errors,
    safeForMongoDryRun,
  };

  const legacyObjects = {
    exportId: resolvedExportId,
    createdAt,
    siteCode,
    sourceMode,
    objects,
  };

  const reportMd = buildReportMarkdown(manifest);

  await fs.writeFile(path.join(exportDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(exportDir, 'report.md'), reportMd, 'utf8');
  await fs.writeFile(path.join(exportDir, 'normalized', 'legacy-objects.json'), `${JSON.stringify(legacyObjects, null, 2)}\n`, 'utf8');

  return {
    exportDir,
    manifest,
    reportMd,
    legacyObjects,
  };
}

export async function createClosedSharePointBatchExportArtifact({
  inputDir = DEFAULT_MANUAL_INPUT_DIR,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  config = {},
  sourceMode = 'manual-folder',
  createdAt = new Date().toISOString(),
  batchExportId = '',
} = {}) {
  const resolvedBatchExportId = batchExportId || toBatchExportId(createdAt);
  const exportDir = path.join(outputRoot, resolvedBatchExportId);
  const sitesRoot = path.join(exportDir, 'sites');
  await fs.mkdir(sitesRoot, { recursive: true });

  const siteFolders = await listSiteInputFolders(inputDir);
  const siteSummaries = [];
  const warnings = [];
  const errors = [];

  if (siteFolders.length === 0) {
    errors.push(`No site folders found under ${inputDir}`);
  }

  for (const siteFolder of siteFolders) {
    const metadataPath = path.join(siteFolder.inputDir, SITE_EXPORT_METADATA_FILE);
    const metadataResult = await readOptionalJson(metadataPath);
    const metadataErrors = metadataResult.error ? [metadataResult.error] : [];
    let metadata = {};
    if (metadataResult.data) {
      if (typeof metadataResult.data === 'object' && !Array.isArray(metadataResult.data)) {
        metadata = metadataResult.data;
      } else {
        metadataErrors.push(`${SITE_EXPORT_METADATA_FILE} must contain a JSON object.`);
      }
    }
    const siteCode = String(metadata.siteCode || siteFolder.folderName).trim();
    const safeSiteFolder = sanitizeLocalFolderName(siteFolder.folderName);

    const siteResult = await createClosedSharePointExportArtifact({
      inputDir: siteFolder.inputDir,
      outputRoot: sitesRoot,
      config: {
        ...config,
        ...metadata,
        siteCode,
        displayName: metadata.displayName || metadata.siteCode || siteFolder.folderName,
        safeSiteFolder,
        preflightErrors: [
          ...(Array.isArray(config.preflightErrors) ? config.preflightErrors : []),
          ...metadataErrors,
        ],
      },
      sourceMode,
      createdAt,
      exportId: safeSiteFolder,
    });

    siteSummaries.push(buildSiteBatchSummary(siteResult.manifest));
  }

  const collisionCheck = collectionCollisionCheck(siteSummaries);
  if (!collisionCheck.passed) {
    for (const collision of collisionCheck.collisions) {
      errors.push(`Collection name collision for ${collision.collectionName}: ${collision.sites.map((site) => site.siteCode).join(', ')}`);
    }
  }

  for (const site of siteSummaries) {
    warnings.push(...site.warnings.map((warning) => `${site.siteCode}: ${warning}`));
    errors.push(...site.errors.map((error) => `${site.siteCode}: ${error}`));
  }

  const hasFail = errors.length > 0 || siteSummaries.some((site) => site.status === 'FAIL');
  const hasWarning = warnings.length > 0 || siteSummaries.some((site) => site.status === 'WARNING');
  const status = hasFail ? 'FAIL' : (hasWarning ? 'WARNING' : 'PASS');
  const safeForMongoDryRun = !hasFail && collisionCheck.passed;

  const manifest = {
    batchExportId: resolvedBatchExportId,
    exportDir,
    createdAt,
    sourceMode,
    totalSites: siteSummaries.length,
    totalFiles: siteSummaries.reduce((sum, site) => sum + site.filesDiscovered, 0),
    status,
    sites: siteSummaries,
    collectionCollisionCheck: collisionCheck,
    warnings,
    errors,
    safeForMongoDryRun,
  };

  const reportMd = buildBatchReportMarkdown(manifest);
  await fs.writeFile(path.join(exportDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(exportDir, 'report.md'), reportMd, 'utf8');

  return {
    exportDir,
    manifest,
    reportMd,
  };
}

export async function readClosedExportArtifact(exportDir) {
  const manifestPath = path.join(exportDir, 'manifest.json');
  const objectsPath = path.join(exportDir, 'normalized', 'legacy-objects.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const legacyObjects = JSON.parse(await fs.readFile(objectsPath, 'utf8'));
  return { manifest, legacyObjects };
}
