import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import { normalizeLegacyKey } from '../../server/src/repository/legacyMappings.js';
import { migrateSharePointToMongo } from '../../server/src/migration/sharepointToMongo.js';
import {
  buildLegacyFilePlan,
  createClosedSharePointBatchExportArtifact,
  createClosedSharePointExportArtifact,
  normalizeSharePointServerRelativePath,
  pathToMountedFile,
  sanitizeLocalFolderName,
  sha256Text,
  targetMongoCollectionNameForSite,
} from './exportKitCore.mjs';

const sampleFiles = {
  'bihs_master_config_v1.txt': { schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } },
  'users_data.txt': [{ id: 'admin-1', name: 'Admin' }],
  'events_data.txt': { displayCount: 3, displayMode: 'default', events: [{ id: 'event-1', title: 'Event' }] },
  'nav_data.txt': [{ id: 'home', label: 'Home' }],
  'site_content_data.txt': { hero: { title: 'Site' } },
  'theme_data.txt': { primaryColor: '#0891b2' },
  'widgets_data.txt': { activeWidgets: ['events'], polls: [{ id: 'poll-1' }] },
  'external_links_data.txt': [{ id: 'link-1', title: 'Link' }],
  'gantt_data.txt': { enabled: true, items: [{ id: 'task-1' }] },
};

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'closed-sp-export-'));
}

async function writeInput(files) {
  const inputDir = await makeDir();
  await Promise.all(Object.entries(files).map(([fileName, value]) =>
    fs.writeFile(
      path.join(inputDir, fileName),
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      'utf8',
    ),
  ));
  return inputDir;
}

async function writeSiteInput(rootDir, folderName, files, metadata = null) {
  const siteDir = path.join(rootDir, folderName);
  await fs.mkdir(siteDir, { recursive: true });
  await Promise.all(Object.entries(files).map(([fileName, value]) =>
    fs.writeFile(
      path.join(siteDir, fileName),
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      'utf8',
    ),
  ));
  if (metadata) {
    await fs.writeFile(path.join(siteDir, 'site.export.json'), JSON.stringify(metadata, null, 2), 'utf8');
  }
  return siteDir;
}

describe('Closed SharePoint export kit', () => {
  it('generates manifest, raw files, normalized artifact, and deterministic output', async () => {
    const inputDir = await writeInput(sampleFiles);
    const outputRoot = await makeDir();

    const result = await createClosedSharePointExportArtifact({
      inputDir,
      outputRoot,
      config: { siteCode: 'alpha' },
      createdAt: '2026-05-27T12:00:00.000Z',
      exportId: 'fixed-export',
    });

    const manifestText = await fs.readFile(path.join(result.exportDir, 'manifest.json'), 'utf8');
    const repeat = await createClosedSharePointExportArtifact({
      inputDir,
      outputRoot,
      config: { siteCode: 'alpha' },
      createdAt: '2026-05-27T12:00:00.000Z',
      exportId: 'fixed-export',
    });
    const repeatManifestText = await fs.readFile(path.join(repeat.exportDir, 'manifest.json'), 'utf8');

    expect(result.manifest.safeForMongoDryRun).toBe(true);
    expect(result.manifest.files).toHaveLength(9);
    expect(await fs.readFile(path.join(result.exportDir, 'raw', 'users_data.txt'), 'utf8')).toContain('Admin');
    expect(await fs.readFile(path.join(result.exportDir, 'normalized', 'legacy-objects.json'), 'utf8')).toContain('admin-1');
    expect(manifestText).toBe(repeatManifestText);
  });

  it('calculates SHA-256 hashes', () => {
    expect(sha256Text('abc')).toBe(crypto.createHash('sha256').update('abc').digest('hex'));
  });

  it('sanitizes unsafe local site folder names and target Mongo collection names', () => {
    expect(sanitizeLocalFolderName('Sites/my site/sub.site')).toMatch(/^sites_my_site_sub_site_[a-f0-9]{8}$/);
    expect(sanitizeLocalFolderName('אתר בדיקה')).toMatch(/^site_[a-f0-9]{8}$/);
    expect(targetMongoCollectionNameForSite({ siteCode: 'Sites/my site/sub.site' }))
      .toBe(targetMongoCollectionNameForSite({ siteCode: 'Sites/my site/sub.site' }));
  });

  it('detects invalid JSON, empty files, and missing files', async () => {
    const inputDir = await writeInput({
      'bihs_master_config_v1.txt': '',
      'users_data.txt': '[invalid',
    });
    const outputRoot = await makeDir();

    const result = await createClosedSharePointExportArtifact({
      inputDir,
      outputRoot,
      config: { siteCode: 'alpha' },
      exportId: 'bad-export',
    });

    expect(result.manifest.safeForMongoDryRun).toBe(false);
    expect(result.manifest.files.find((file) => file.fileName === 'bihs_master_config_v1.txt').parseStatus).toBe('empty');
    expect(result.manifest.files.find((file) => file.fileName === 'users_data.txt').parseStatus).toBe('invalid-json');
    expect(result.manifest.files.find((file) => file.fileName === 'events_data.txt').status).toBe('missing');
    expect(result.reportMd).toContain('Status: **FAIL**');
  });

  it('creates a batch artifact from multi-site folders', async () => {
    const inputRoot = await makeDir();
    const outputRoot = await makeDir();
    await writeSiteInput(inputRoot, 'site-a', sampleFiles);
    await writeSiteInput(inputRoot, 'site-b', sampleFiles);

    const result = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      createdAt: '2026-05-27T12:00:00.000Z',
      batchExportId: 'batch-fixed',
    });

    expect(result.manifest.safeForMongoDryRun).toBe(true);
    expect(result.manifest.totalSites).toBe(2);
    expect(result.manifest.sites.map((site) => site.siteCode)).toEqual(['site-a', 'site-b']);
    expect(result.manifest.collectionCollisionCheck.passed).toBe(true);
    expect(await fs.readFile(path.join(result.exportDir, 'sites', result.manifest.sites[0].safeSiteFolder, 'manifest.json'), 'utf8'))
      .toContain('"siteCode": "site-a"');
  });

  it('uses site.export.json siteCode instead of relying on the folder name', async () => {
    const inputRoot = await makeDir();
    const outputRoot = await makeDir();
    await writeSiteInput(inputRoot, 'safe-folder', sampleFiles, {
      siteCode: 'Sites/real site/subsite',
      displayName: 'Real Site',
      siteRelativePath: '/Sites/real site/subsite',
    });

    const result = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      batchExportId: 'metadata-batch',
    });
    const site = result.manifest.sites[0];

    expect(site.siteCode).toBe('Sites/real site/subsite');
    expect(site.displayName).toBe('Real Site');
    expect(site.safeSiteFolder).toBe(sanitizeLocalFolderName('safe-folder'));
    expect(site.targetMongoCollectionName).toBe(targetMongoCollectionNameForSite({
      siteCode: 'Sites/real site/subsite',
      siteSlug: 'Sites/real site/subsite',
    }));
  });

  it('detects collection collisions before migration', async () => {
    const inputRoot = await makeDir();
    const outputRoot = await makeDir();
    await writeSiteInput(inputRoot, 'first-folder', sampleFiles, { siteCode: 'same/site' });
    await writeSiteInput(inputRoot, 'second-folder', sampleFiles, { siteCode: 'same/site' });

    const result = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      batchExportId: 'collision-batch',
    });

    expect(result.manifest.safeForMongoDryRun).toBe(false);
    expect(result.manifest.status).toBe('FAIL');
    expect(result.manifest.collectionCollisionCheck.passed).toBe(false);
    expect(result.manifest.collectionCollisionCheck.collisions[0].sites).toHaveLength(2);
  });

  it('keeps valid sites visible when another site is invalid', async () => {
    const inputRoot = await makeDir();
    const outputRoot = await makeDir();
    await writeSiteInput(inputRoot, 'good-site', sampleFiles);
    await writeSiteInput(inputRoot, 'bad-site', {
      ...sampleFiles,
      'users_data.txt': '[invalid',
    });

    const result = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      batchExportId: 'mixed-batch',
    });

    const goodSite = result.manifest.sites.find((site) => site.siteCode === 'good-site');
    const badSite = result.manifest.sites.find((site) => site.siteCode === 'bad-site');
    expect(result.manifest.status).toBe('FAIL');
    expect(goodSite.status).toBe('PASS');
    expect(badSite.status).toBe('FAIL');
    expect(badSite.invalidJsonFiles).toContain('users_data.txt');
  });

  it('creates deterministic batch manifests', async () => {
    const inputRoot = await makeDir();
    const outputRoot = await makeDir();
    await writeSiteInput(inputRoot, 'site-a', sampleFiles);

    const first = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      createdAt: '2026-05-27T12:00:00.000Z',
      batchExportId: 'stable-batch',
    });
    const firstManifest = await fs.readFile(path.join(first.exportDir, 'manifest.json'), 'utf8');
    const second = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      createdAt: '2026-05-27T12:00:00.000Z',
      batchExportId: 'stable-batch',
    });
    const secondManifest = await fs.readFile(path.join(second.exportDir, 'manifest.json'), 'utf8');

    expect(firstManifest).toBe(secondManifest);
  });

  it('normalizes legacy keys and handles subsite paths', () => {
    expect(normalizeLegacyKey('https://portal.example/Sites/siteName/subsite/siteDB/siteAssets/widgets_data.txt'))
      .toBe('Sites/siteName/subsite/siteDB/siteAssets/widgets_data.txt');
    expect(normalizeSharePointServerRelativePath('Sites/siteName/subsite')).toBe('/Sites/siteName/subsite');

    const plan = buildLegacyFilePlan({
      siteCode: 'ignored',
      siteRelativePath: 'Sites/siteName/subsite',
      widgetsDbTarget: 'site',
    });
    expect(plan.find((file) => file.fileName === 'widgets_data.txt').serverRelativePath)
      .toBe('/Sites/siteName/subsite/siteDB/siteAssets/widgets_data.txt');
  });

  it('maps server-relative paths into mounted terminal export paths', () => {
    expect(pathToMountedFile('/mnt/sharepoint', '/Sites/siteName/subsite/siteDB/siteAssets/theme_data.txt'))
      .toBe(path.join('/mnt/sharepoint', 'Sites', 'siteName', 'subsite', 'siteDB', 'siteAssets', 'theme_data.txt'));
    expect(pathToMountedFile('\\\\portal@SSL\\DavWWWRoot', '/sites/demo/siteDB/siteAssets/theme_data.txt'))
      .toContain('portal@SSL');
  });

  it('lets Mongo dry-run consume an export artifact without SharePoint network or writes', async () => {
    const inputDir = await writeInput(sampleFiles);
    const outputRoot = await makeDir();
    const exportResult = await createClosedSharePointExportArtifact({
      inputDir,
      outputRoot,
      config: { siteCode: 'alpha' },
      exportId: 'mongo-dry-run-export',
    });
    const fetchImpl = vi.fn(() => {
      throw new Error('SharePoint fetch should not be called');
    });
    const repository = { ensureSite: vi.fn() };
    const legacyRepository = { writeLegacyObject: vi.fn() };

    const report = await migrateSharePointToMongo({
      siteId: 'alpha',
      dryRun: true,
      fromExport: exportResult.exportDir,
      fetchImpl,
      repository,
      legacyRepository,
    });

    expect(report.failedKeys).toEqual([]);
    expect(report.imported).toHaveLength(9);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(repository.ensureSite).not.toHaveBeenCalled();
    expect(legacyRepository.writeLegacyObject).not.toHaveBeenCalled();
  });

  it('lets Mongo batch dry-run consume all site exports without SharePoint network or writes', async () => {
    const inputRoot = await makeDir();
    const outputRoot = await makeDir();
    await writeSiteInput(inputRoot, 'site-a', sampleFiles);
    await writeSiteInput(inputRoot, 'site-b', sampleFiles);
    const exportResult = await createClosedSharePointBatchExportArtifact({
      inputDir: inputRoot,
      outputRoot,
      batchExportId: 'mongo-batch-dry-run-export',
    });
    const fetchImpl = vi.fn(() => {
      throw new Error('SharePoint fetch should not be called');
    });
    const repository = { ensureSite: vi.fn() };
    const legacyRepository = { writeLegacyObject: vi.fn() };
    const { migrateSharePointExportBatchToMongo } = await import('../../server/src/migration/sharepointToMongo.js');

    const report = await migrateSharePointExportBatchToMongo({
      fromExport: exportResult.exportDir,
      dryRun: true,
      allSites: true,
      fetchImpl,
      repository,
      legacyRepository,
    });

    expect(report.batch).toBe(true);
    expect(report.sites).toHaveLength(2);
    expect(report.sites.map((site) => site.siteCode)).toEqual(['site-a', 'site-b']);
    expect(report.sites.every((site) => site.targetMongoCollectionName)).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(repository.ensureSite).not.toHaveBeenCalled();
    expect(legacyRepository.writeLegacyObject).not.toHaveBeenCalled();
  });
});
