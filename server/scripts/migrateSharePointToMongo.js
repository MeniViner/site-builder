import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCliArgs, resolveConfig } from '../../scripts/sp-env.js';
import { getServerConfig } from '../src/config/env.js';
import { createMongoDb } from '../src/db/mongo.js';
import { SiteDataRepository } from '../src/repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from '../src/repository/LegacyCompatibilityRepository.js';
import { migrateSharePointExportBatchToMongo, migrateSharePointToMongo } from '../src/migration/sharepointToMongo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');

async function writeReport(report) {
  const reportDir = path.join(projectRoot, 'migration-reports');
  await fs.mkdir(reportDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportName = report.batch
    ? `batch-${report.batchExportId || 'export'}`
    : report.siteId;
  const safeReportName = String(reportName || 'sharepoint-export')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  const filePath = path.join(reportDir, `sharepoint-to-mongo-${safeReportName}-${timestamp}.json`);
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return filePath;
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const dryRun = cli['dry-run'] === true || cli.dryRun === true;
  const force = cli.force === true;
  const allSites = cli['all-sites'] === true || cli.allSites === true;
  const spConfig = resolveConfig({ cli });
  const fromExport = cli['from-export'] ? path.resolve(projectRoot, String(cli['from-export'])) : '';
  let exportManifest = null;
  if (fromExport) {
    try {
      exportManifest = JSON.parse(await fs.readFile(path.join(fromExport, 'manifest.json'), 'utf8'));
    } catch {
      exportManifest = null;
    }
  }
  const exportIsBatch = Boolean(exportManifest?.batchExportId && Array.isArray(exportManifest.sites));
  if (exportIsBatch && !allSites) {
    throw new Error('Batch export roots require --all-sites. For one site, point --from-export at exports/sharepoint-closed/<batch>/sites/<safeSiteFolder>.');
  }
  if (exportIsBatch && !dryRun) {
    throw new Error('Batch export migration currently supports dry-run only.');
  }

  const cliSiteId = String(cli.site || cli.siteId || '').trim();
  const exportSiteCode = !exportIsBatch
    ? String(exportManifest?.siteCode || '').trim()
    : '';
  const siteId = String(cliSiteId || exportSiteCode || spConfig.siteCode || '').trim();
  const exportManifestMatchesSite = !exportSiteCode || exportSiteCode === siteId;
  const siteSlug = exportManifestMatchesSite
    ? (exportManifest?.siteSlug || siteId)
    : siteId;
  const displayName = exportManifestMatchesSite
    ? (exportManifest?.displayName || siteId)
    : siteId;
  const inputDir = cli['input-dir'] ? path.resolve(projectRoot, String(cli['input-dir'])) : '';

  let client = null;
  let repository = null;
  let legacyRepository = null;

  try {
    if (!dryRun) {
      const serverConfig = getServerConfig();
      const mongo = await createMongoDb(serverConfig);
      client = mongo.client;
      repository = new SiteDataRepository(mongo.db, {
        collectionPrefix: serverConfig.siteCollectionPrefix,
      });
      await repository.initIndexes();
      legacyRepository = new LegacyCompatibilityRepository(repository);
    }

    const report = allSites && fromExport
      ? await migrateSharePointExportBatchToMongo({
          fromExport,
          dryRun,
          force,
          allowUnsafeExport: cli['allow-unsafe-export'] === true,
          allSites,
          repository,
          legacyRepository,
        })
      : await migrateSharePointToMongo({
          siteId,
          siteSlug,
          displayName,
          dryRun,
          force,
          inputDir,
          fromExport,
          allowUnsafeExport: cli['allow-unsafe-export'] === true,
          sharePointConfig: spConfig,
          repository,
          legacyRepository,
        });

    const reportPath = await writeReport(report);
    const ok = report.failedKeys.length === 0 && (!report.failedSites || report.failedSites.length === 0);
    console.log(JSON.stringify({
      ok,
      dryRun,
      force,
      fromExport,
      batch: Boolean(report.batch),
      siteId: report.siteId || undefined,
      safeSiteFolder: report.safeSiteFolder || undefined,
      realSiteCode: report.realSiteCode || undefined,
      exportManifestSiteCode: report.exportManifestSiteCode || undefined,
      targetMongoCollectionName: report.targetMongoCollectionName || undefined,
      totalSites: report.totalSites || undefined,
      imported: report.imported.length,
      skippedExisting: report.skippedExisting.length,
      skippedEmptyFiles: report.skippedEmptyFiles.length,
      failedKeys: report.failedKeys.length,
      failedSites: report.failedSites || [],
      sites: report.sites?.map((site) => ({
        siteCode: site.siteCode,
        safeSiteFolder: site.safeSiteFolder,
        status: site.status,
        targetMongoCollectionName: site.targetMongoCollectionName,
        documentsImported: site.documentsImported,
        documentCountsByScope: site.documentCountsByScope,
      })),
      reportPath,
    }, null, 2));

    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    if (client) await client.close();
  }
}

main().catch((error) => {
  console.error('[migrate-sharepoint-to-mongo] failed', error);
  process.exit(1);
});
