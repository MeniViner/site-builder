import {
  BUILDER_GLOBAL_COLLECTIONS,
  BUILDER_GLOBAL_INDEXES,
  BUILDER_PHYSICAL_INDEXES,
  mongoIndexName,
} from './indexDefinitions.js';

const same = (left, right) => JSON.stringify(left || {}) === JSON.stringify(right || {});

export async function createBuilderIndexInspectionAdapter(db) {
  const collectionNames = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name));
  const registryRows = collectionNames.has(BUILDER_GLOBAL_COLLECTIONS.sites)
    ? await db.collection(BUILDER_GLOBAL_COLLECTIONS.sites)
      .find({}, { projection: { _id: 0, siteId: 1, safeCollectionName: 1 } }).toArray()
    : [];
  return {
    collectionNames,
    registryRows,
    async listIndexes(collectionName) {
      if (!collectionNames.has(collectionName)) return [];
      return db.collection(collectionName).listIndexes().toArray();
    },
  };
}

export async function inspectBuilderIndexes(adapter) {
  const missing = [];
  const mismatched = [];
  const unexpected = [];
  const expectedByCollection = new Map();
  for (const definition of BUILDER_GLOBAL_INDEXES) {
    const list = expectedByCollection.get(definition.collection) || [];
    list.push(definition);
    expectedByCollection.set(definition.collection, list);
  }

  const existingIndexes = {};
  for (const [collectionName, definitions] of expectedByCollection) {
    const indexes = await adapter.listIndexes(collectionName);
    existingIndexes[collectionName] = indexes;
    for (const definition of definitions) {
      const name = mongoIndexName(definition.key);
      const existing = indexes.find((index) => index.name === name);
      if (!existing) missing.push(`${collectionName}.${name}`);
      else if (!same(existing.key, definition.key) || Boolean(existing.unique) !== Boolean(definition.options.unique)) {
        mismatched.push(`${collectionName}.${name}`);
      }
    }
    const expectedNames = new Set(definitions.map((definition) => mongoIndexName(definition.key)));
    for (const index of indexes) {
      if (index.name !== '_id_' && !expectedNames.has(index.name)) unexpected.push(`${collectionName}.${index.name}`);
    }
  }

  const physical = [];
  for (const row of adapter.registryRows) {
    if (!row.safeCollectionName || !adapter.collectionNames.has(row.safeCollectionName)) {
      physical.push({ siteId: row.siteId || '', collection: row.safeCollectionName || '', exists: false, missingIndexes: [] });
      continue;
    }
    const indexes = await adapter.listIndexes(row.safeCollectionName);
    const missingIndexes = BUILDER_PHYSICAL_INDEXES
      .map((definition) => mongoIndexName(definition.key))
      .filter((name) => !indexes.some((index) => index.name === name));
    physical.push({ siteId: row.siteId || '', collection: row.safeCollectionName, exists: true, missingIndexes });
  }

  const blockers = [
    ...missing.filter((name) => name.endsWith('siteId_1') || name.endsWith('safeCollectionName_1'))
      .map((name) => `Required unique index missing: ${name}`),
    ...mismatched.map((name) => `Index definition mismatch: ${name}`),
  ];
  const warnings = [
    ...missing.filter((name) => !blockers.some((blocker) => blocker.endsWith(name))).map((name) => `Required index missing: ${name}`),
    ...unexpected.map((name) => `Unexpected index: ${name}`),
    ...physical.filter((item) => !item.exists).map((item) => `Physical collection missing for site ${item.siteId}`),
    ...physical.flatMap((item) => item.missingIndexes.map((name) => `Physical index missing: ${item.collection}.${name}`)),
  ];
  return {
    status: blockers.length ? 'blockers' : warnings.length ? 'warnings' : 'healthy',
    existingIndexes, missing, mismatched, unexpected, physical, blockers, warnings,
  };
}

export function assertBuilderIndexStartupPolicy(report, nodeEnv) {
  if (nodeEnv === 'production' && report.blockers.length) {
    throw new Error(`Mongo startup validation blocked: ${report.blockers.join('; ')}`);
  }
}
