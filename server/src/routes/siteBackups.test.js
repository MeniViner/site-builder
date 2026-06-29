import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { SiteDataRepository } from '../repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from '../repository/LegacyCompatibilityRepository.js';
import { SiteBackupRepository } from '../repository/SiteBackupRepository.js';
import { LEGACY_MAPPINGS } from '../repository/legacyMappings.js';

const EXPECTED_LEGACY_FILES = LEGACY_MAPPINGS.map((mapping) => mapping.fileName);

function backupPackage(id, overrides = {}) {
  return {
    kind: 'bihs-backup-package',
    version: '1.0.0',
    id,
    exportedAt: '2026-06-10T10:00:00.000Z',
    source: 'admin-backup-management',
    backup: {
      id,
      name: `Backup ${id}`,
      timeCreated: '2026-06-10T10:00:00.000Z',
      timeLastModified: '2026-06-10T10:00:00.000Z',
    },
    files: [
      {
        name: 'bihs_master_config_v1.txt',
        text: JSON.stringify({ schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } }),
      },
    ],
    meta: {
      siteId: 'alpha',
    },
    ...overrides,
  };
}

describe('site backup routes', () => {
  let db;
  let repository;
  let legacyRepository;
  let app;

  beforeEach(async () => {
    db = new MemoryDb();
    repository = new SiteDataRepository(db);
    await repository.initIndexes();
    legacyRepository = new LegacyCompatibilityRepository(repository);
    app = createApp({
      repository,
      legacyRepository,
      config: {
        corsOrigins: ['http://allowed.test'],
        nodeEnv: 'test',
        adminApiKey: 'secret',
        storageBackend: 'mongo',
      },
    });
  });

  async function writeLegacy(siteId, key, data) {
    let expectedVersion = 0;
    try {
      expectedVersion = (await legacyRepository.readLegacyObject(siteId, key)).version;
    } catch (error) {
      if (error.statusCode !== 404 && error.code !== 'not_found') throw error;
    }
    return legacyRepository.writeLegacyObject({
      siteId,
      key,
      data,
      expectedVersion,
      allowEmptyOverwrite: true,
      actor: 'test',
    });
  }

  async function seedAllLegacyScopes(siteId = 'alpha') {
    await writeLegacy(siteId, 'bihs_master_config_v1.txt', {
      schemaVersion: '1.0.0',
      meta: { appId: 'siteBuilder', seeded: true },
    });
    await writeLegacy(siteId, 'users_data.txt', [{ id: 'admin-1', name: 'Admin One' }]);
    await writeLegacy(siteId, 'events_data.txt', {
      displayCount: 5,
      displayMode: 'default',
      events: [{ id: 'event-1', title: 'Event One' }],
    });
    await writeLegacy(siteId, 'nav_data.txt', []);
    await writeLegacy(siteId, 'site_content_data.txt', { hero: { title: 'Seeded site' } });
    await writeLegacy(siteId, 'theme_data.txt', {});
    await writeLegacy(siteId, 'widgets_data.txt', { activeWidget: ['events'], data: { news: [{ id: 'news-1', title: 'News One' }] } });
    await writeLegacy(siteId, 'external_links_data.txt', []);
    await writeLegacy(siteId, 'gantt_data.txt', { items: [{ id: 'task-1', title: 'Task One' }], categories: [] });
  }

  it('requires auth for backup routes', async () => {
    await request(app)
      .get('/api/sites/alpha/backups')
      .expect(401);
  });

  it('creates a backup in the current site collection and returns metadata', async () => {
    const response = await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .set('x-actor', 'admin-1')
      .send({
        backupPackage: backupPackage('backup-one'),
        name: 'Manual backup',
        description: 'Before edits',
      })
      .expect(201);

    expect(response.body.backup).toMatchObject({
      id: 'backup-one',
      name: 'Manual backup',
      description: 'Before edits',
      source: 'admin-backup-management',
      storageBackend: 'mongo',
      fileCount: EXPECTED_LEGACY_FILES.length,
    });

    const site = await repository.getSite('alpha');
    const stored = await db.collection(site.safeCollectionName).findOne({
      _id: 'backup:backup-one',
      siteId: 'alpha',
      scope: 'backups',
      entityId: 'backup-one',
      deletedAt: null,
    });
    expect(stored.data).toMatchObject({
      backupId: 'backup-one',
      createdBy: 'admin-1',
      storageBackend: 'mongo',
      source: 'admin-backup-management',
    });
    expect(stored.data.snapshot.files.map((file) => file.name)).toEqual(EXPECTED_LEGACY_FILES);
    expect(stored.data.snapshot.meta.restoreEntries).toHaveLength(EXPECTED_LEGACY_FILES.length);
    expect(stored.data.snapshot.meta.restoreEntries.find((entry) => entry.fileName === 'users_data.txt')).toMatchObject({
      status: 'missing',
      willRestore: false,
      restoreAction: 'skipped',
    });
  });

  it('captures all expected legacy scopes, including explicit empty scopes, in Mongo backups', async () => {
    await seedAllLegacyScopes('alpha');

    const response = await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('full-snapshot') })
      .expect(201);

    const files = response.body.backup.backupPackage.files;
    const entries = response.body.backup.backupPackage.meta.restoreEntries;
    expect(files.map((file) => file.name)).toEqual(EXPECTED_LEGACY_FILES);
    expect(entries).toHaveLength(EXPECTED_LEGACY_FILES.length);
    expect(entries.find((entry) => entry.fileName === 'users_data.txt')).toMatchObject({
      status: 'hasData',
      willRestore: true,
      recordCount: 1,
    });
    expect(entries.find((entry) => entry.fileName === 'nav_data.txt')).toMatchObject({
      status: 'empty',
      willRestore: true,
      recordCount: 0,
    });
    expect(entries.find((entry) => entry.fileName === 'theme_data.txt')).toMatchObject({
      status: 'empty',
      willRestore: true,
      recordCount: 0,
    });
    expect(response.body.backup.summary.restorableFiles).toEqual(EXPECTED_LEGACY_FILES);

    const downloaded = await request(app)
      .get('/api/sites/alpha/backups/full-snapshot')
      .set('x-api-key', 'secret')
      .expect(200);
    expect(downloaded.body.backup.backupPackage.files.map((file) => file.name)).toEqual(EXPECTED_LEGACY_FILES);
  });

  it('lists active backups only for the requested site and gets the full snapshot', async () => {
    await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('alpha-backup') })
      .expect(201);
    await request(app)
      .post('/api/sites/beta/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('beta-backup', { meta: { siteId: 'beta' } }) })
      .expect(201);

    const alphaList = await request(app)
      .get('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .expect(200);
    expect(alphaList.body.backups.map((backup) => backup.id)).toEqual(['alpha-backup']);

    const full = await request(app)
      .get('/api/sites/alpha/backups/alpha-backup')
      .set('x-api-key', 'secret')
      .expect(200);
    expect(full.body.backup.backupPackage.id).toBe('alpha-backup');
    expect(full.body.backup.backupPackage.files).toHaveLength(EXPECTED_LEGACY_FILES.length);
  });

  it('soft-deletes backups', async () => {
    const created = await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('delete-me') })
      .expect(201);

    await request(app)
      .delete('/api/sites/alpha/backups/delete-me')
      .set('x-api-key', 'secret')
      .send({ expectedVersion: created.body.backup.version })
      .expect(200);

    const list = await request(app)
      .get('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .expect(200);
    expect(list.body.backups).toEqual([]);

    const site = await repository.getSite('alpha');
    const stored = await db.collection(site.safeCollectionName).findOne({ _id: 'backup:delete-me' });
    expect(stored.deletedAt).toBeTruthy();
  });

  it('restores a valid backup through legacy repository writes', async () => {
    await seedAllLegacyScopes('alpha');
    await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('restore-me') })
      .expect(201);

    await writeLegacy('alpha', 'users_data.txt', [{ id: 'admin-2', name: 'Admin Two' }]);
    await writeLegacy('alpha', 'events_data.txt', { displayCount: 1, events: [] });

    const restored = await request(app)
      .post('/api/sites/alpha/backups/restore-me/restore')
      .set('x-api-key', 'secret')
      .expect(200);

    expect(restored.body.restoredFiles).toBe(EXPECTED_LEGACY_FILES.length);
    const masterConfig = await legacyRepository.readLegacyObject('alpha', 'bihs_master_config_v1.txt');
    expect(masterConfig.data).toMatchObject({ schemaVersion: '1.0.0' });
    const users = await legacyRepository.readLegacyObject('alpha', 'users_data.txt');
    expect(users.data).toEqual([{ id: 'admin-1', name: 'Admin One' }]);
    const events = await legacyRepository.readLegacyObject('alpha', 'events_data.txt');
    expect(events.data.events).toEqual([{ id: 'event-1', title: 'Event One' }]);
  });

  it('rejects invalid backup restore packages', async () => {
    await repository.replaceDocument({
      siteId: 'alpha',
      scope: 'backups',
      entityId: 'invalid-restore',
      data: {
        backupId: 'invalid-restore',
        name: 'Invalid',
        source: 'admin-backup-management',
        summary: { fileCount: 1 },
        snapshot: {
          id: 'invalid-restore',
          files: [{ name: 'theme_data.txt', text: '{broken' }],
        },
        sizeBytes: 100,
      },
      expectedVersion: 0,
      actor: 'test',
    });

    await request(app)
      .post('/api/sites/alpha/backups/invalid-restore/restore')
      .set('x-api-key', 'secret')
      .expect(400);
  });

  it('rejects backups above the configured single-document size guard', async () => {
    const smallLimitApp = createApp({
      repository,
      legacyRepository,
      backupRepository: new SiteBackupRepository(repository, legacyRepository, { maxDocumentBytes: 320 }),
      config: {
        corsOrigins: ['http://allowed.test'],
        nodeEnv: 'test',
        adminApiKey: 'secret',
        storageBackend: 'mongo',
      },
    });

    const response = await request(smallLimitApp)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({
        backupPackage: backupPackage('too-large', {
          files: [{ name: 'theme_data.txt', text: JSON.stringify({ value: 'x'.repeat(400) }) }],
        }),
      })
      .expect(400);
    expect(response.body.error.message).toContain('too large');
  });

  it('writes audit log entries for create, delete, and restore', async () => {
    const created = await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('audit-me') })
      .expect(201);
    await request(app)
      .post('/api/sites/alpha/backups/audit-me/restore')
      .set('x-api-key', 'secret')
      .expect(200);
    await request(app)
      .delete('/api/sites/alpha/backups/audit-me')
      .set('x-api-key', 'secret')
      .send({ expectedVersion: created.body.backup.version })
      .expect(200);

    const auditLogs = await db.collection('site_data_audit_logs').find({ siteId: 'alpha' }).toArray();
    expect(auditLogs.map((entry) => entry.operation)).toEqual(expect.arrayContaining([
      'admin-backup-create',
      'admin-backup-restore',
      'admin-backup-delete',
    ]));
  });
});
