import fs from 'fs/promises';
import path from 'path';
import { sha256OfCanonicalJson } from '../utils/canonicalJson.js';
import { LEGACY_MAPPINGS } from '../repository/legacyMappings.js';
import { sanitizeSiteCollectionName } from '../utils/collectionNames.js';

const isEmptyPayload = (value) => {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
};

function parseJsonFileText(text, key) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { empty: true, data: null };
  try {
    return { empty: false, data: JSON.parse(trimmed) };
  } catch (error) {
    error.message = `Invalid JSON for ${key}: ${error.message}`;
    throw error;
  }
}

function estimateDocuments(mapping, data) {
  if (mapping.mode === 'singleton') return 1;
  if (mapping.mode === 'list') return Array.isArray(data) ? data.length + 2 : 1;
  if (mapping.mode === 'list-with-settings') {
    const list = Array.isArray(data?.[mapping.listProperty]) ? data[mapping.listProperty] : [];
    return list.length + 2;
  }
  return 1;
}

function plannedCollectionName(siteId, siteSlug = siteId) {
  const normalizedSiteId = String(siteId || '').trim();
  const normalizedSiteSlug = String(siteSlug || normalizedSiteId).trim();
  const safeNameSource = normalizedSiteSlug ? `${normalizedSiteSlug}:${normalizedSiteId}` : normalizedSiteId;
  return sanitizeSiteCollectionName(safeNameSource);
}

function documentCountsByScope(imported = []) {
  const mappingByKey = new Map(LEGACY_MAPPINGS.map((mapping) => [mapping.key, mapping]));
  return imported.reduce((acc, item) => {
    const mapping = mappingByKey.get(item.mappingKey);
    const scope = mapping?.scope || 'legacy';
    acc[scope] = (acc[scope] || 0) + Number(item.estimatedDocuments || item.documents || 0);
    return acc;
  }, {});
}

async function readFromInputDir(inputDir, mapping) {
  const candidates = [
    mapping.fileName,
    mapping.key,
    `${mapping.key}.txt`,
    `${mapping.key}.json`,
  ];

  for (const candidate of candidates) {
    const filePath = path.join(inputDir, candidate);
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  throw new Error(`Legacy file not found in input directory: ${mapping.fileName}`);
}

async function readFromSharePoint({ host, serverRelativeUrl, cookie, fetchImpl = fetch }) {
  if (!host || !serverRelativeUrl) {
    throw new Error('SharePoint host and serverRelativeUrl are required');
  }
  const url = /^https?:\/\//i.test(serverRelativeUrl)
    ? serverRelativeUrl
    : `https://${host}${serverRelativeUrl}`;
  const response = await fetchImpl(url, {
    method: 'GET',
    headers: {
      Accept: 'text/plain, */*',
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`SharePoint read failed (${response.status}) for ${url}`);
  }
  return response.text();
}

async function readFromExportArtifact(fromExport, { allowUnsafeExport = false } = {}) {
  const exportDir = path.resolve(process.cwd(), fromExport);
  const manifestPath = path.join(exportDir, 'manifest.json');
  const objectsPath = path.join(exportDir, 'normalized', 'legacy-objects.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const legacyObjects = JSON.parse(await fs.readFile(objectsPath, 'utf8'));

  if (!allowUnsafeExport && manifest.safeForMongoDryRun !== true) {
    throw new Error(`Export artifact is not marked safe for Mongo dry-run: ${manifestPath}`);
  }

  const byMappingKey = new Map();
  const byFileName = new Map();
  for (const object of legacyObjects.objects || []) {
    if (object.mappingKey) byMappingKey.set(object.mappingKey, object);
    if (object.fileName) byFileName.set(object.fileName, object);
  }

  return {
    exportDir,
    manifest,
    legacyObjects,
    get(mapping) {
      return byMappingKey.get(mapping.key) || byFileName.get(mapping.fileName) || null;
    },
  };
}

async function readExportManifest(fromExport) {
  const exportDir = path.resolve(process.cwd(), fromExport);
  const manifestPath = path.join(exportDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  return { exportDir, manifest, manifestPath };
}

function isBatchExportManifest(manifest) {
  return Boolean(manifest?.batchExportId && Array.isArray(manifest.sites));
}

export async function migrateSharePointToMongo({
  siteId,
  siteSlug = siteId,
  displayName = siteId,
  dryRun = true,
  force = false,
  inputDir = '',
  fromExport = '',
  allowUnsafeExport = false,
  sharePointConfig = null,
  repository = null,
  legacyRepository = null,
  actor = 'migration',
  fetchImpl = fetch,
} = {}) {
  if (!siteId) throw new Error('siteId is required');
  if (!dryRun && (!repository || !legacyRepository)) {
    throw new Error('repository and legacyRepository are required for real migration runs');
  }

  const report = {
    dryRun,
    force,
    siteId,
    siteSlug,
    displayName,
    targetMongoCollectionName: plannedCollectionName(siteId, siteSlug),
    fromExport: fromExport || '',
    startedAt: new Date().toISOString(),
    completedAt: null,
    sitesImported: dryRun ? 0 : 1,
    documentsImportedBySite: { [siteId]: 0 },
    imported: [],
    failedKeys: [],
    skippedEmptyFiles: [],
    skippedExisting: [],
  };

  if (!dryRun) {
    await repository.ensureSite({ siteId, siteSlug, displayName, actor });
  }

  const exportArtifact = fromExport
    ? await readFromExportArtifact(fromExport, { allowUnsafeExport })
    : null;

  for (const mapping of LEGACY_MAPPINGS) {
    const key = sharePointConfig?.fileMap?.[mapping.key] || mapping.fileName;
    try {
      const exportObject = exportArtifact?.get(mapping);
      let data;
      let sourceKey = key;
      let hash;

      if (exportArtifact) {
        if (!exportObject) {
          throw new Error(`Export artifact is missing ${mapping.fileName}`);
        }
        data = exportObject.data;
        sourceKey = exportObject.key || key;
        hash = exportObject.jsonSha256 || sha256OfCanonicalJson(data);
      } else {
        const text = inputDir
          ? await readFromInputDir(inputDir, mapping)
          : await readFromSharePoint({
              host: sharePointConfig?.host,
              serverRelativeUrl: key,
              cookie: process.env.SHAREPOINT_COOKIE || '',
              fetchImpl,
            });
        const parsed = parseJsonFileText(text, key);
        data = parsed.data;
        hash = parsed.empty ? null : sha256OfCanonicalJson(data);
        if (parsed.empty) {
          report.skippedEmptyFiles.push({ key, fileName: mapping.fileName });
          continue;
        }
      }

      if (isEmptyPayload(data)) {
        report.skippedEmptyFiles.push({ key, fileName: mapping.fileName });
        continue;
      }

      const estimatedDocuments = estimateDocuments(mapping, data);

      if (dryRun) {
        report.imported.push({
          key: sourceKey,
          fileName: mapping.fileName,
          mappingKey: mapping.key,
          estimatedDocuments,
          hash,
          dryRun: true,
        });
        report.documentsImportedBySite[siteId] += estimatedDocuments;
        continue;
      }

      let expectedVersion = 0;
      try {
        const existing = await legacyRepository.readLegacyObject(siteId, sourceKey);
        if (!force) {
          report.skippedExisting.push({ key: sourceKey, version: existing.version });
          continue;
        }
        expectedVersion = existing.version;
      } catch (error) {
        if (error.statusCode !== 404 && error.code !== 'not_found') throw error;
      }

      const result = await legacyRepository.writeLegacyObject({
        siteId,
        key: sourceKey,
        data,
        expectedVersion,
        allowEmptyOverwrite: false,
        actor,
        metadata: { migration: 'sharepoint-to-mongo', force },
      });

      report.imported.push({
        key: sourceKey,
        fileName: mapping.fileName,
        mappingKey: mapping.key,
        documents: result.documents.length,
        version: result.version,
        hash,
      });
      report.documentsImportedBySite[siteId] += result.documents.length;
    } catch (error) {
      report.failedKeys.push({
        key,
        fileName: mapping.fileName,
        message: error?.message || String(error),
      });
    }
  }

  report.completedAt = new Date().toISOString();
  return report;
}

export async function migrateSharePointExportBatchToMongo({
  fromExport,
  dryRun = true,
  force = false,
  allowUnsafeExport = false,
  allSites = false,
  actor = 'migration',
  fetchImpl = fetch,
  repository = null,
  legacyRepository = null,
} = {}) {
  if (!fromExport) throw new Error('fromExport is required for batch export migration');
  if (!dryRun) throw new Error('Batch SharePoint export migration currently supports dry-run only.');

  const { exportDir, manifest } = await readExportManifest(fromExport);
  if (!isBatchExportManifest(manifest)) {
    const siteId = String(manifest.siteCode || '').trim();
    if (!siteId) throw new Error(`Single-site export manifest is missing siteCode: ${exportDir}`);
    const singleReport = await migrateSharePointToMongo({
      siteId,
      siteSlug: manifest.siteSlug || siteId,
      displayName: manifest.displayName || siteId,
      dryRun,
      force,
      fromExport: exportDir,
      allowUnsafeExport,
      actor,
      fetchImpl,
      repository,
      legacyRepository,
    });
    return {
      batch: false,
      dryRun,
      force,
      fromExport: exportDir,
      startedAt: singleReport.startedAt,
      completedAt: singleReport.completedAt,
      totalSites: 1,
      documentsImportedBySite: singleReport.documentsImportedBySite,
      failedSites: singleReport.failedKeys.length > 0 ? [siteId] : [],
      sites: [{
        siteCode: siteId,
        safeSiteFolder: manifest.safeSiteFolder || '',
        targetMongoCollectionName: singleReport.targetMongoCollectionName,
        status: singleReport.failedKeys.length > 0 ? 'FAIL' : 'PASS',
        documentCountsByScope: documentCountsByScope(singleReport.imported),
        report: singleReport,
      }],
      imported: singleReport.imported,
      failedKeys: singleReport.failedKeys,
      skippedEmptyFiles: singleReport.skippedEmptyFiles,
      skippedExisting: singleReport.skippedExisting,
      collectionCollisionCheck: { passed: true, collisions: [] },
    };
  }

  if (!allSites) {
    throw new Error('Batch export roots require --all-sites so sites are processed explicitly.');
  }

  const report = {
    batch: true,
    dryRun,
    force,
    fromExport: exportDir,
    batchExportId: manifest.batchExportId,
    sourceMode: manifest.sourceMode,
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalSites: manifest.sites.length,
    collectionCollisionCheck: manifest.collectionCollisionCheck || { passed: true, collisions: [] },
    documentsImportedBySite: {},
    sites: [],
    imported: [],
    failedSites: [],
    failedKeys: [],
    skippedEmptyFiles: [],
    skippedExisting: [],
  };

  for (const site of manifest.sites) {
    const siteCode = String(site.siteCode || '').trim();
    const siteExportDir = path.join(exportDir, 'sites', site.safeSiteFolder);
    try {
      const siteReport = await migrateSharePointToMongo({
        siteId: siteCode,
        siteSlug: site.siteSlug || siteCode,
        displayName: site.displayName || siteCode,
        dryRun: true,
        force,
        fromExport: siteExportDir,
        allowUnsafeExport,
        actor,
        fetchImpl,
        repository,
        legacyRepository,
      });
      const scopeCounts = documentCountsByScope(siteReport.imported);
      const documentsImported = siteReport.documentsImportedBySite[siteCode] || 0;

      report.documentsImportedBySite[siteCode] = documentsImported;
      report.imported.push(...siteReport.imported.map((entry) => ({ siteCode, ...entry })));
      report.failedKeys.push(...siteReport.failedKeys.map((entry) => ({ siteCode, ...entry })));
      report.skippedEmptyFiles.push(...siteReport.skippedEmptyFiles.map((entry) => ({ siteCode, ...entry })));
      report.skippedExisting.push(...siteReport.skippedExisting.map((entry) => ({ siteCode, ...entry })));
      if (siteReport.failedKeys.length > 0) report.failedSites.push(siteCode);

      report.sites.push({
        siteCode,
        siteSlug: site.siteSlug || siteCode,
        displayName: site.displayName || siteCode,
        safeSiteFolder: site.safeSiteFolder,
        fromExport: siteExportDir,
        targetMongoCollectionName: site.targetMongoCollectionName || siteReport.targetMongoCollectionName,
        status: siteReport.failedKeys.length > 0 ? 'FAIL' : 'PASS',
        documentsImported,
        documentCountsByScope: scopeCounts,
        imported: siteReport.imported.length,
        failedKeys: siteReport.failedKeys,
        skippedEmptyFiles: siteReport.skippedEmptyFiles,
        report: siteReport,
      });
    } catch (error) {
      report.documentsImportedBySite[siteCode] = 0;
      report.failedSites.push(siteCode);
      report.failedKeys.push({
        siteCode,
        key: siteExportDir,
        fileName: '',
        message: error?.message || String(error),
      });
      report.sites.push({
        siteCode,
        siteSlug: site.siteSlug || siteCode,
        displayName: site.displayName || siteCode,
        safeSiteFolder: site.safeSiteFolder,
        fromExport: siteExportDir,
        targetMongoCollectionName: site.targetMongoCollectionName || plannedCollectionName(siteCode, site.siteSlug || siteCode),
        status: 'FAIL',
        documentsImported: 0,
        documentCountsByScope: {},
        imported: 0,
        failedKeys: [{
          key: siteExportDir,
          fileName: '',
          message: error?.message || String(error),
        }],
        skippedEmptyFiles: [],
        report: null,
      });
    }
  }

  if (report.collectionCollisionCheck.passed === false) {
    for (const collision of report.collectionCollisionCheck.collisions) {
      report.failedKeys.push({
        key: collision.collectionName,
        fileName: '',
        message: `Collection name collision: ${collision.sites.map((site) => site.siteCode).join(', ')}`,
      });
    }
  }

  report.completedAt = new Date().toISOString();
  return report;
}

export default migrateSharePointToMongo;
