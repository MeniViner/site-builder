import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalHash, redactMongoUri } from '../lib/core.mjs';
import { compareInventories, registryMappings, summarizeInventory } from '../lib/inventory.mjs';
import { normalizeMappingManifest, validateMappingManifest } from '../lib/mapping.mjs';
import { findPrecutoverBlockers } from '../precutover-blockers.mjs';

test('inventory captures physical registry mappings and canonical comparisons', () => {
  const registry = registryMappings([{ siteId: 'alpha', safeCollectionName: 'site_alpha' }], new Set(['sites', 'site_alpha']));
  assert.deepEqual(registry, [{ builderSiteId: 'alpha', safeCollectionName: 'site_alpha', physicalCollection: 'site_alpha', exists: true }]);
  const base = summarizeInventory({ database: 'source', redactedUri: 'mongodb://127.0.0.1/source', collections: [{ name: 'sites', type: 'collection', options: {}, documentCount: 1, idTypeSummary: { objectId: 1 }, indexes: [] }], registry: [] });
  const changed = structuredClone(base);
  changed.collections[0].documentCount = 2;
  assert.deepEqual(compareInventories(base, base), []);
  assert.deepEqual(compareInventories(base, changed), [{ collection: 'sites', issue: 'mismatch-documentCount' }]);
});

test('mapping validation permits duplicate site codes but forbids site-code identity inference', () => {
  const manifest = { rows: [
    { hubSiteId: 'hub-a', siteIdentityKey: 'identity-a', siteCode: 'same', builderSiteId: 'a', runtimeSiteId: 'a', sourceDatabase: 'source', targetDatabase: 'target', safeCollectionName: 'site_a', physicalCollection: 'site_a', sharePointSiteUrl: '', migrationState: 'approved-for-validation', evidenceHash: 'a' },
    { hubSiteId: 'hub-b', siteIdentityKey: 'identity-b', siteCode: 'same', builderSiteId: 'b', runtimeSiteId: 'b', sourceDatabase: 'source', targetDatabase: 'target', safeCollectionName: 'site_b', physicalCollection: 'site_b', sharePointSiteUrl: '', migrationState: 'approved-for-validation', evidenceHash: 'b' },
  ] };
  assert.deepEqual(validateMappingManifest(manifest), []);
  assert.equal(normalizeMappingManifest(manifest).canonicalHash, canonicalHash({ formatVersion: 1, rows: manifest.rows }));
  manifest.rows[0].siteIdentityKey = 'same';
  manifest.rows[0].siteCode = 'same';
  assert.match(validateMappingManifest(manifest).join('\n'), /infers identity/);
});

test('pre-cutover policy fails closed and URI redaction never emits credentials', () => {
  assert.match(redactMongoUri('mongodb://user:pass@127.0.0.1:27017/db'), /<redacted>/);
  const blockers = findPrecutoverBlockers({
    HUB_DANGEROUS_ALLOW_SITE_DATA_WRITES: 'true',
    HUB_DANGEROUS_BYPASS_AUTH: 'false', HUB_DANGEROUS_BYPASS_SITE_SCOPE: 'false',
    MIGRATION_SOURCE_MONGODB_URI: 'mongodb://source', MIGRATION_TARGET_MONGODB_URI: 'mongodb://target',
    MIGRATION_SOURCE_DB_NAME: 'same', MIGRATION_TARGET_DB_NAME: 'same', BUILDER_API_BIND_ADDRESS: '0.0.0.0', VITE_BUILDER_API_KEY: 'bad', BUILDER_API_KEY: 'secret',
  });
  assert.equal(blockers.length, 4);
  assert.match(blockers.join('\n'), /must be explicitly false/);
});
