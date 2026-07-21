import { MongoClient } from 'mongodb';
import { canonicalHash, redactMongoUri } from './core.mjs';

const SYSTEM_COLLECTIONS = new Set(['sites', 'site_data_revisions', 'site_data_audit_logs']);

function normalizeIndex(index) {
  const { ns, v, background, ...rest } = index;
  return rest;
}

export function registryMappings(sites, collectionNames) {
  return sites.map((site) => ({
    builderSiteId: site.siteId ?? null,
    safeCollectionName: site.safeCollectionName ?? null,
    physicalCollection: site.safeCollectionName ?? null,
    exists: Boolean(site.safeCollectionName && collectionNames.has(site.safeCollectionName)),
  })).sort((a, b) => String(a.builderSiteId).localeCompare(String(b.builderSiteId)));
}

export function summarizeInventory({ database, redactedUri, collections, registry }) {
  const sortedCollections = [...collections].sort((a, b) => a.name.localeCompare(b.name));
  const inventory = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    database,
    endpoint: redactedUri,
    collections: sortedCollections,
    registry,
    totals: {
      collections: sortedCollections.length,
      documents: sortedCollections.reduce((sum, collection) => sum + collection.documentCount, 0),
      physicalSiteCollections: sortedCollections.filter((collection) => !SYSTEM_COLLECTIONS.has(collection.name)).length,
      revisionDocuments: sortedCollections.find((collection) => collection.name === 'site_data_revisions')?.documentCount ?? 0,
      auditDocuments: sortedCollections.find((collection) => collection.name === 'site_data_audit_logs')?.documentCount ?? 0,
    },
  };
  return { ...inventory, canonicalHash: canonicalHash({ ...inventory, generatedAt: undefined, canonicalHash: undefined }) };
}

export async function collectInventory({ uri, database, redactedUri = redactMongoUri(uri) }) {
  const client = new MongoClient(uri, {
    appName: 'sitebuilder-colocation-inventory-readonly',
    retryWrites: false,
    readPreference: 'secondaryPreferred',
    serverSelectionTimeoutMS: 10_000,
  });
  try {
    await client.connect();
    const db = client.db(database);
    const details = await db.listCollections({}, { nameOnly: false }).toArray();
    const collectionNames = new Set(details.map((collection) => collection.name));
    const collections = [];
    for (const detail of details) {
      const collection = db.collection(detail.name);
      const [documentCount, indexes, idTypes] = await Promise.all([
        collection.countDocuments({}),
        collection.indexes(),
        collection.aggregate([{ $project: { type: { $type: '$_id' } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]).toArray(),
      ]);
      collections.push({
        name: detail.name,
        type: detail.type,
        options: detail.options ?? {},
        documentCount,
        idTypeSummary: Object.fromEntries(idTypes.map((entry) => [entry._id, entry.count])),
        indexes: indexes.map(normalizeIndex).sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    const sites = collectionNames.has('sites') ? await db.collection('sites').find({}, {
      projection: { siteId: 1, safeCollectionName: 1 },
    }).toArray() : [];
    return summarizeInventory({
      database,
      redactedUri,
      collections,
      registry: registryMappings(sites, collectionNames),
    });
  } finally {
    await client.close();
  }
}

export function compareInventories(source, target) {
  const differences = [];
  const sourceCollections = new Map(source.collections.map((item) => [item.name, item]));
  const targetCollections = new Map(target.collections.map((item) => [item.name, item]));
  for (const name of new Set([...sourceCollections.keys(), ...targetCollections.keys()])) {
    const left = sourceCollections.get(name);
    const right = targetCollections.get(name);
    if (!left || !right) { differences.push({ collection: name, issue: !left ? 'missing-source' : 'missing-target' }); continue; }
    for (const field of ['documentCount', 'options', 'indexes', 'idTypeSummary']) {
      if (canonicalHash(left[field]) !== canonicalHash(right[field])) differences.push({ collection: name, issue: `mismatch-${field}` });
    }
  }
  if (canonicalHash(source.registry) !== canonicalHash(target.registry)) differences.push({ collection: 'sites', issue: 'mismatch-registry-mapping' });
  return differences;
}
