import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { SiteDataRepository } from './SiteDataRepository.js';
import { LegacyCompatibilityRepository } from './LegacyCompatibilityRepository.js';

describe('LegacyCompatibilityRepository', () => {
  let repository;
  let legacyRepository;

  beforeEach(async () => {
    repository = new SiteDataRepository(new MemoryDb());
    await repository.initIndexes();
    legacyRepository = new LegacyCompatibilityRepository(repository);
  });

  it('returns an explicit version-zero envelope when an API read allows a missing object', async () => {
    const read = await legacyRepository.readLegacyObject('new-site', 'bihs_master_config_v1.txt', {
      allowMissing: true,
    });

    expect(read).toMatchObject({
      key: 'bihs_master_config_v1.txt',
      data: null,
      version: 0,
      hash: null,
      documents: [],
      missing: true,
    });
    await expect(legacyRepository.readLegacyObject('new-site', 'bihs_master_config_v1.txt'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('saves a migrated singleton after reading the returned version', async () => {
    await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#000000' },
      expectedVersion: 0,
      actor: 'migration',
    });

    const read = await legacyRepository.readLegacyObject('alpha', 'theme_data.txt');
    const saved = await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#ffffff' },
      expectedVersion: read.version,
      actor: 'admin',
    });

    expect(saved.version).toBe(read.version + 1);
    expect(saved.data).toEqual({ primaryColor: '#ffffff' });
  });

  it('allows the first safe save for a previously empty legacy object', async () => {
    const saved = await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#0891b2' },
      expectedVersion: 0,
      actor: 'admin',
    });

    const read = await legacyRepository.readLegacyObject('alpha', 'theme_data.txt');
    expect(saved.version).toBe(1);
    expect(read.version).toBe(1);
    expect(read.data).toEqual({ primaryColor: '#0891b2' });
  });

  it('returns 409 for stale legacy object versions', async () => {
    const first = await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#000000' },
      expectedVersion: 0,
      actor: 'admin',
    });
    await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#ffffff' },
      expectedVersion: first.version,
      actor: 'admin',
    });

    await expect(legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#ff0000' },
      expectedVersion: first.version,
      actor: 'admin',
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('adopts a pre-manifest legacy document and invalidates stale reads', async () => {
    await repository.replaceDocument({
      siteId: 'alpha',
      scope: 'design',
      entityId: 'theme',
      data: { primaryColor: '#000000' },
      expectedVersion: 0,
      actor: 'migration',
    });

    const readBeforeManifest = await legacyRepository.readLegacyObject('alpha', 'theme_data.txt');
    expect(readBeforeManifest.version).toBe(1);

    const saved = await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#ffffff' },
      expectedVersion: readBeforeManifest.version,
      actor: 'admin',
    });
    expect(saved.version).toBe(2);

    await expect(legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#ff0000' },
      expectedVersion: readBeforeManifest.version,
      actor: 'admin',
    })).rejects.toMatchObject({ statusCode: 409 });

    const current = await legacyRepository.readLegacyObject('alpha', 'theme_data.txt');
    const secondSave = await legacyRepository.writeLegacyObject({
      siteId: 'alpha',
      key: 'theme_data.txt',
      data: { primaryColor: '#00ff00' },
      expectedVersion: current.version,
      actor: 'admin',
    });
    expect(secondSave.version).toBe(current.version + 1);
  });
});
