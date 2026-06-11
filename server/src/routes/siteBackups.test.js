import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { SiteDataRepository } from '../repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from '../repository/LegacyCompatibilityRepository.js';
import { SiteBackupRepository } from '../repository/SiteBackupRepository.js';

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
      fileCount: 1,
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
    expect(stored.data.snapshot.files[0].name).toBe('bihs_master_config_v1.txt');
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
    expect(full.body.backup.backupPackage.files).toHaveLength(1);
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
    await request(app)
      .post('/api/sites/alpha/backups')
      .set('x-api-key', 'secret')
      .send({ backupPackage: backupPackage('restore-me') })
      .expect(201);

    const restored = await request(app)
      .post('/api/sites/alpha/backups/restore-me/restore')
      .set('x-api-key', 'secret')
      .expect(200);

    expect(restored.body.restoredFiles).toBe(1);
    const masterConfig = await legacyRepository.readLegacyObject('alpha', 'bihs_master_config_v1.txt');
    expect(masterConfig.data).toMatchObject({ schemaVersion: '1.0.0' });
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
