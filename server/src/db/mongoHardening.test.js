import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { sanitizeMongoTarget, safeMongoError } from './mongoTarget.js';
import { inspectBuilderIndexes } from './indexInspection.js';
import { applyBuilderIndexMigration, planBuilderIndexMigration } from './indexMigration.js';
import { BUILDER_GLOBAL_INDEXES, BUILDER_PHYSICAL_INDEXES } from './indexDefinitions.js';
import { startServer } from '../../index.js';

const completeIndexes = {
  sites: [
    { name: 'siteId_1', key: { siteId: 1 }, unique: true },
    { name: 'siteSlug_1', key: { siteSlug: 1 } },
    { name: 'safeCollectionName_1', key: { safeCollectionName: 1 }, unique: true },
  ],
  site_data_revisions: [{ name: 'siteId_1_documentKey_1_createdAt_-1', key: { siteId: 1, documentKey: 1, createdAt: -1 } }],
  site_data_audit_logs: [{ name: 'siteId_1_documentKey_1_createdAt_-1', key: { siteId: 1, documentKey: 1, createdAt: -1 } }],
};

const adapter = (indexes = completeIndexes) => ({
  collectionNames: new Set(Object.keys(indexes)),
  registryRows: [],
  listIndexes: vi.fn(async (name) => indexes[name] || []),
  createIndex: vi.fn(async () => undefined),
});

describe('Builder Mongo hardening', () => {
  it('never returns Mongo credentials, hosts or secret query values', () => {
    const uri = 'mongodb://bob:pw@mongo.internal:27017/site_builder?replicaSet=rs0&token=secret';
    const output = JSON.stringify(sanitizeMongoTarget(uri));
    for (const secret of ['bob', 'pw', 'mongo.internal', 'token', 'secret']) expect(output).not.toContain(secret);
    expect(safeMongoError(new Error(uri), 'site_builder').message).toBe('Target Mongo connection failed for database site_builder');
  });

  it('validates all preserved index definitions without mutation', async () => {
    expect(BUILDER_GLOBAL_INDEXES).toHaveLength(5);
    expect(BUILDER_PHYSICAL_INDEXES).toHaveLength(3);
    const target = adapter();
    expect((await inspectBuilderIndexes(target)).status).toBe('healthy');
    expect(target.createIndex).not.toHaveBeenCalled();
  });

  it('dry-runs, requires confirmation, and is idempotent', async () => {
    const empty = adapter({});
    expect((await planBuilderIndexMigration(empty)).plannedActions).toHaveLength(5);
    expect(empty.createIndex).not.toHaveBeenCalled();
    await expect(applyBuilderIndexMigration(empty, 'wrong')).rejects.toThrow('BUILDER_INDEX_MIGRATION');
    expect(empty.createIndex).not.toHaveBeenCalled();
    const current = adapter();
    expect((await applyBuilderIndexMigration(current, 'BUILDER_INDEX_MIGRATION')).status).toBe('already-current');
    expect(current.createIndex).not.toHaveBeenCalled();
  });

  it('normal startup connects and inspects without invoking index mutation', async () => {
    const write = vi.fn();
    const server = { close: vi.fn() };
    const app = { listen: vi.fn((_port, callback) => { callback(); return server; }) };
    const report = { status: 'healthy', blockers: [], warnings: [] };
    await startServer({
      mongodbUri: 'mongodb://localhost/site_builder', mongodbDbName: 'site_builder', serverPort: 4000,
      siteCollectionPrefix: 'site_', nodeEnv: 'test',
    }, {
      createMongoDb: vi.fn(async () => ({ client: { close: vi.fn() }, db: { mutation: write } })),
      createBuilderIndexInspectionAdapter: vi.fn(async () => ({ readOnly: true })),
      inspectBuilderIndexes: vi.fn(async () => report),
      createApp: vi.fn(() => app),
    });
    expect(write).not.toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledOnce();
  });

  it('keeps application startup structurally separated from migration apply', () => {
    const source = fs.readFileSync('server/index.js', 'utf8');
    expect(source).not.toMatch(/indexMigration|initIndexes|createIndex|dropIndex/);
  });

  it('is idempotent after a mocked apply', async () => {
    const indexes = { sites: [], site_data_revisions: [], site_data_audit_logs: [] };
    const target = adapter(indexes);
    target.createIndex = vi.fn(async (collection, key, options) => {
      indexes[collection].push({ name: Object.entries(key).map(([field, direction]) => `${field}_${direction}`).join('_'), key, ...options });
    });
    expect((await applyBuilderIndexMigration(target, 'BUILDER_INDEX_MIGRATION')).status).toBe('applied');
    expect((await applyBuilderIndexMigration(target, 'BUILDER_INDEX_MIGRATION')).status).toBe('already-current');
    expect(target.createIndex).toHaveBeenCalledTimes(5);
  });
});
