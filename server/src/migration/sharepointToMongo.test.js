import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { SiteDataRepository } from '../repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from '../repository/LegacyCompatibilityRepository.js';
import { migrateSharePointToMongo } from './sharepointToMongo.js';

async function makeInputDir(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'site-builder-migrate-'));
  await Promise.all(Object.entries(files).map(([name, value]) =>
    fs.writeFile(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), 'utf8')
  ));
  return dir;
}

const sampleLegacyFiles = {
  'bihs_master_config_v1.txt': { schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } },
  'users_data.txt': [{ id: 'admin-1', name: 'Admin' }],
  'events_data.txt': { displayCount: 3, events: [{ id: 'event-1', title: 'Event' }] },
  'nav_data.txt': [{ id: 'home', label: 'Home' }],
  'site_content_data.txt': { hero: { title: 'Site' } },
  'theme_data.txt': { primaryColor: '#000000' },
  'widgets_data.txt': { polls: [{ id: 'poll-1' }] },
  'external_links_data.txt': [{ id: 'link-1', title: 'Link' }],
  'gantt_data.txt': { enabled: true, items: [] },
};

async function makeExportArtifact({ safeSiteFolder, siteCode, siteSlug = siteCode, files = sampleLegacyFiles }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${safeSiteFolder}-`));
  await fs.mkdir(path.join(dir, 'normalized'), { recursive: true });
  await fs.writeFile(path.join(dir, 'manifest.json'), `${JSON.stringify({
    exportId: safeSiteFolder,
    exportDir: dir,
    siteCode,
    siteSlug,
    displayName: siteCode,
    safeSiteFolder,
    targetMongoCollectionName: `site_${safeSiteFolder}`,
    safeForMongoDryRun: true,
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(dir, 'normalized', 'legacy-objects.json'), `${JSON.stringify({
    exportId: safeSiteFolder,
    siteCode,
    objects: Object.entries(files).map(([fileName, data]) => ({
      key: `/sites/${siteCode}/siteDB/siteAssets/${fileName}`,
      fileName,
      mappingKey: {
        'bihs_master_config_v1.txt': 'masterConfig',
        'users_data.txt': 'users',
        'events_data.txt': 'events',
        'nav_data.txt': 'navigation',
        'site_content_data.txt': 'siteContent',
        'theme_data.txt': 'theme',
        'widgets_data.txt': 'widgets',
        'external_links_data.txt': 'externalLinks',
        'gantt_data.txt': 'gantt',
      }[fileName],
      data,
    })),
  }, null, 2)}\n`, 'utf8');
  return dir;
}

describe('migrateSharePointToMongo', () => {
  let repository;
  let legacyRepository;

  beforeEach(async () => {
    repository = new SiteDataRepository(new MemoryDb());
    await repository.initIndexes();
    legacyRepository = new LegacyCompatibilityRepository(repository);
  });

  it('imports sample legacy TXT objects and produces a report', async () => {
    const inputDir = await makeInputDir(sampleLegacyFiles);

    const report = await migrateSharePointToMongo({
      siteId: 'alpha',
      inputDir,
      dryRun: false,
      repository,
      legacyRepository,
    });

    expect(report.failedKeys).toEqual([]);
    expect(report.imported).toHaveLength(9);
    expect(report.documentsImportedBySite.alpha).toBeGreaterThan(9);

    const users = await legacyRepository.readLegacyObject('alpha', 'users_data.txt');
    expect(users.data).toEqual([{ id: 'admin-1', name: 'Admin' }]);
  });

  it('keeps a safe export folder from becoming the real migrated site id', async () => {
    const exportDir = await makeExportArtifact({
      safeSiteFolder: 'alphateam_8ab83dba',
      siteCode: 'alphateam_8ab83dba',
    });

    const report = await migrateSharePointToMongo({
      siteId: 'alphateam',
      siteSlug: 'alphateam',
      displayName: 'Alpha Team',
      fromExport: exportDir,
      dryRun: false,
      repository,
      legacyRepository,
    });

    expect(report.failedKeys).toEqual([]);
    expect(report.siteId).toBe('alphateam');
    expect(report.safeSiteFolder).toBe('alphateam_8ab83dba');
    expect(report.exportManifestSiteCode).toBe('alphateam_8ab83dba');
    expect(report.exportManifestMatchesSite).toBe(false);
    expect(report.targetMongoCollectionName).toBe(report.siteRecord.safeCollectionName);
    expect(report.targetMongoCollectionName).not.toContain('8ab83dba');
    await expect(repository.getSite('alphateam_8ab83dba')).rejects.toMatchObject({ statusCode: 404 });

    const users = await legacyRepository.readLegacyObject('alphateam', 'users_data.txt');
    expect(users.data).toEqual([{ id: 'admin-1', name: 'Admin' }]);
  });

  it('skips invalid and empty objects safely', async () => {
    const inputDir = await makeInputDir({
      'bihs_master_config_v1.txt': '',
      'users_data.txt': '[invalid',
    });

    const report = await migrateSharePointToMongo({
      siteId: 'alpha',
      inputDir,
      dryRun: true,
    });

    expect(report.skippedEmptyFiles.some((entry) => entry.fileName === 'bihs_master_config_v1.txt')).toBe(true);
    expect(report.failedKeys.some((entry) => entry.fileName === 'users_data.txt')).toBe(true);
  });

  it('does not overwrite without force', async () => {
    const inputDir = await makeInputDir({
      'bihs_master_config_v1.txt': { schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } },
    });

    await migrateSharePointToMongo({
      siteId: 'alpha',
      inputDir,
      dryRun: false,
      repository,
      legacyRepository,
    });

    const second = await migrateSharePointToMongo({
      siteId: 'alpha',
      inputDir,
      dryRun: false,
      force: false,
      repository,
      legacyRepository,
    });

    expect(second.skippedExisting.some((entry) => entry.key.endsWith('bihs_master_config_v1.txt'))).toBe(true);
  });
});
