import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbConnectionRegistry } from './IndexedDbConnectionRegistry';

describe('IndexedDbConnectionRegistry', () => {
  it('persists, replaces, loads, and removes connection records including handles', async () => {
    const registry = new IndexedDbConnectionRegistry({
      databaseName: 'connections-test',
      indexedDB: new IDBFactory(),
    });
    const handle = { kind: 'directory', name: 'Team Share' };
    const record = {
      canonicalPrefix: 'unc://server/team share',
      connectionMode: 'share-root',
      createdAt: '2026-07-27T08:00:00.000Z',
      directoryHandle: handle,
      displayPrefix: '\\\\Server\\Team Share',
      id: 'connection-1',
      label: 'Team Share',
      lastUsedAt: '2026-07-27T08:00:00.000Z',
      prefixSegments: [],
      shareKey: 'unc://server/team share',
    };

    await registry.save(record);
    expect(await registry.loadAll()).toEqual([record]);

    await registry.save({ ...record, label: 'Updated label' });
    expect(await registry.loadAll()).toMatchObject([{ id: 'connection-1', label: 'Updated label' }]);

    await registry.remove(record.id);
    expect(await registry.loadAll()).toEqual([]);
  });
});
