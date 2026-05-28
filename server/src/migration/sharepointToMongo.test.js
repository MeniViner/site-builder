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

describe('migrateSharePointToMongo', () => {
  let repository;
  let legacyRepository;

  beforeEach(async () => {
    repository = new SiteDataRepository(new MemoryDb());
    await repository.initIndexes();
    legacyRepository = new LegacyCompatibilityRepository(repository);
  });

  it('imports sample legacy TXT objects and produces a report', async () => {
    const inputDir = await makeInputDir({
      'bihs_master_config_v1.txt': { schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } },
      'users_data.txt': [{ id: 'admin-1', name: 'Admin' }],
      'events_data.txt': { displayCount: 3, events: [{ id: 'event-1', title: 'Event' }] },
      'nav_data.txt': [{ id: 'home', label: 'Home' }],
      'site_content_data.txt': { hero: { title: 'Site' } },
      'theme_data.txt': { primaryColor: '#000000' },
      'widgets_data.txt': { polls: [{ id: 'poll-1' }] },
      'external_links_data.txt': [{ id: 'link-1', title: 'Link' }],
      'gantt_data.txt': { enabled: true, items: [] },
    });

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
