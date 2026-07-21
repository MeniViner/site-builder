import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { MemoryDb } from './testUtils/memoryDb.js';
import { SiteDataRepository } from './repository/SiteDataRepository.js';
import { LegacyCompatibilityRepository } from './repository/LegacyCompatibilityRepository.js';

describe('site-builder API', () => {
  let app;

  beforeEach(async () => {
    const repository = new SiteDataRepository(new MemoryDb());
    await repository.initIndexes();
    app = createApp({
      repository,
      legacyRepository: new LegacyCompatibilityRepository(repository),
      config: {
        corsOrigins: ['http://allowed.test'],
        nodeEnv: 'test',
        adminApiKey: 'secret',
        storageBackend: 'mongo',
      },
    });
  });

  it('serves health without auth', async () => {
    const response = await request(app).get('/healthz').expect(200);
    expect(response.body.ok).toBe(true);
  });

  it('requires auth for API routes', async () => {
    await request(app).get('/api/sites').expect(401);
  });

  it('keeps liveness public and requires an API key for data-plane readiness', async () => {
    await request(app).get('/healthz').expect(200);
    await request(app).get('/api/readyz').expect(401);
    await request(app).get('/api/readyz').set('x-api-key', 'secret').expect(200);
  });

  it('returns a version-zero legacy envelope for a new site and accepts its first save', async () => {
    const missing = await request(app)
      .get('/api/sites/new-site/legacy-object?key=bihs_master_config_v1.txt')
      .set('x-api-key', 'secret')
      .expect(200);

    expect(missing.body).toMatchObject({
      ok: true,
      key: 'bihs_master_config_v1.txt',
      data: null,
      version: 0,
      missing: true,
    });

    const firstSave = await request(app)
      .put('/api/sites/new-site/legacy-object')
      .set('x-api-key', 'secret')
      .send({
        key: 'bihs_master_config_v1.txt',
        data: { schemaVersion: '1.0.0', navigation: { items: [] } },
        expectedVersion: 0,
      })
      .expect(200);

    expect(firstSave.body).toMatchObject({ ok: true, version: 1, missing: false });
  });

  it('creates a site and reads/writes data', async () => {
    await request(app)
      .post('/api/sites')
      .set('x-api-key', 'secret')
      .send({ siteId: 'alpha', siteSlug: 'Alpha Site', displayName: 'Alpha' })
      .expect(201);

    const put = await request(app)
      .put('/api/sites/alpha/data/settings/main')
      .set('x-api-key', 'secret')
      .send({ expectedVersion: 0, data: { title: 'Alpha' } })
      .expect(200);

    expect(put.body.document.version).toBe(1);

    const read = await request(app)
      .get('/api/sites/alpha/data/settings/main')
      .set('x-api-key', 'secret')
      .expect(200);

    expect(read.body.document.data).toEqual({ title: 'Alpha' });
  });

  it('supports batch read/write and conflicts', async () => {
    const batch = await request(app)
      .post('/api/sites/alpha/data/batch-write')
      .set('x-api-key', 'secret')
      .send({
        operations: [
          { op: 'put', scope: 'widgets', entityId: 'one', expectedVersion: 0, data: { title: 'One' } },
          { op: 'put', scope: 'widgets', entityId: 'two', expectedVersion: 0, data: { title: 'Two' } },
        ],
      })
      .expect(200);
    expect(batch.body.results.every((result) => result.ok)).toBe(true);

    const read = await request(app)
      .post('/api/sites/alpha/data/batch-read')
      .set('x-api-key', 'secret')
      .send({ items: [{ scope: 'widgets', entityId: 'one' }, { scope: 'widgets', entityId: 'two' }] })
      .expect(200);
    expect(read.body.results).toHaveLength(2);

    await request(app)
      .put('/api/sites/alpha/data/widgets/one')
      .set('x-api-key', 'secret')
      .send({ expectedVersion: 0, data: { title: 'Stale' } })
      .expect(409);
  });

  it('enforces CORS origins', async () => {
    await request(app)
      .options('/api/sites')
      .set('origin', 'http://allowed.test')
      .expect(204)
      .expect('access-control-allow-origin', 'http://allowed.test');

    await request(app)
      .get('/api/sites')
      .set('origin', 'http://blocked.test')
      .set('x-api-key', 'secret')
      .expect(403);
  });
});
