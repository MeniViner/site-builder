import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { SiteDataRepository } from '../repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from '../repository/LegacyCompatibilityRepository.js';
import { inspectSiteProvisioning, provisionSiteDefaults } from './siteProvisioning.js';

describe('site provisioning', () => {
  let repository;
  let legacyRepository;

  beforeEach(async () => {
    repository = new SiteDataRepository(new MemoryDb());
    await repository.initIndexes();
    legacyRepository = new LegacyCompatibilityRepository(repository);
  });

  it('reports missing canonical defaults before a site has been provisioned', async () => {
    const status = await inspectSiteProvisioning({
      siteId: 'alpha',
      repository,
      legacyRepository,
      today: new Date('2026-09-14T00:00:00.000Z'),
    });

    expect(status).toMatchObject({
      site: null,
      siteExists: false,
      provisioned: false,
      totalDefaults: 10,
      existingDefaults: 0,
      missingDefaults: 10,
    });
    expect(status.items.every((item) => item.missing)).toBe(true);
  });

  it('creates only missing defaults and never overwrites an existing legacy object', async () => {
    const first = await provisionSiteDefaults({
      siteId: 'alpha',
      repository,
      legacyRepository,
      actor: 'seed-test',
      today: new Date('2026-09-14T00:00:00.000Z'),
    });

    expect(first.siteCreated).toBe(true);
    expect(first.createdCount).toBe(10);
    expect(first.provisionStatus.provisioned).toBe(true);

    const theme = await legacyRepository.readLegacyObject('alpha', 'theme_data.txt');
    await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#123456' },
      expectedVersion: theme.version,
      actor: 'custom-editor',
    });

    const second = await provisionSiteDefaults({
      siteId: 'alpha',
      repository,
      legacyRepository,
      actor: 'seed-test',
      today: new Date('2026-09-15T00:00:00.000Z'),
    });

    expect(second.siteCreated).toBe(false);
    expect(second.createdCount).toBe(0);
    expect(second.skippedCount).toBe(10);
    expect(second.provisionStatus.provisioned).toBe(true);

    const preservedTheme = await legacyRepository.readLegacyObject('alpha', 'theme_data.txt');
    expect(preservedTheme.data).toEqual({ primaryColor: '#123456' });
    expect(preservedTheme.version).toBe(theme.version + 1);
  });
});
