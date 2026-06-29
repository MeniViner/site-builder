import { describe, expect, it, beforeEach } from 'vitest';
import { MemoryDb } from '../testUtils/memoryDb.js';
import { SiteDataRepository } from './SiteDataRepository.js';

describe('SiteDataRepository', () => {
  let db;
  let repository;

  beforeEach(async () => {
    db = new MemoryDb();
    repository = new SiteDataRepository(db);
    await repository.initIndexes();
  });

  it('creates and reads a document', async () => {
    const created = await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: { title: 'Alpha' },
      expectedVersion: 0,
    });

    expect(created.version).toBe(1);
    expect(created.hash).toMatch(/^[a-f0-9]{64}$/);

    const read = await repository.getDocument('my-site', 'settings', 'main');
    expect(read.data).toEqual({ title: 'Alpha' });
  });

  it('patches a document', async () => {
    await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: { title: 'Alpha', nested: { a: 1 } },
      expectedVersion: 0,
    });

    const patched = await repository.patchDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      patch: { nested: { b: 2 } },
      expectedVersion: 1,
    });

    expect(patched.version).toBe(2);
    expect(patched.data).toEqual({ title: 'Alpha', nested: { a: 1, b: 2 } });
  });

  it('returns a conflict on optimistic concurrency mismatch', async () => {
    await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: { title: 'Alpha' },
      expectedVersion: 0,
    });

    await expect(repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: { title: 'Beta' },
      expectedVersion: 0,
    })).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects empty overwrite unless explicitly allowed', async () => {
    await expect(repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: {},
      expectedVersion: 0,
    })).rejects.toMatchObject({ statusCode: 400 });

    const reset = await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: {},
      expectedVersion: 0,
      allowEmptyOverwrite: true,
      actor: 'admin',
    });

    expect(reset.data).toEqual({});
  });

  it('soft deletes and creates revisions', async () => {
    await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      data: { title: 'Alpha' },
      expectedVersion: 0,
    });

    const deleted = await repository.softDeleteDocument({
      siteId: 'my-site',
      scope: 'settings',
      entityId: 'main',
      expectedVersion: 1,
    });

    expect(deleted.deletedAt).toBeTruthy();
    await expect(repository.getDocument('my-site', 'settings', 'main')).rejects.toMatchObject({ statusCode: 404 });

    const revisions = await db.collection('site_data_revisions').find({ siteId: 'my-site' }).toArray();
    expect(revisions.map((entry) => entry.operation)).toEqual(['create', 'delete']);
  });

  it('resurrects a soft-deleted document when replacing a logically missing item', async () => {
    await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'events',
      entityId: 'event-1',
      data: { title: 'Original' },
      expectedVersion: 0,
      actor: 'admin',
    });
    await repository.softDeleteDocument({
      siteId: 'my-site',
      scope: 'events',
      entityId: 'event-1',
      expectedVersion: 1,
      actor: 'admin',
    });

    const restored = await repository.replaceDocument({
      siteId: 'my-site',
      scope: 'events',
      entityId: 'event-1',
      data: { title: 'Restored' },
      expectedVersion: 0,
      actor: 'restore',
    });

    expect(restored.data).toEqual({ title: 'Restored' });
    expect(restored.version).toBe(3);
    expect(restored.deletedAt).toBe(null);
    const read = await repository.getDocument('my-site', 'events', 'event-1');
    expect(read.data).toEqual({ title: 'Restored' });
  });
});
