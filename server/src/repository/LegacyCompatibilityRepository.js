import { cloneJson, sha256OfCanonicalJson } from '../utils/canonicalJson.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import {
  describeLegacyMapping,
  getLegacyListMetaEntityId,
  getLegacyMapping,
  getLegacyMetaEntityId,
  normalizeLegacyKey,
} from './legacyMappings.js';
import { isSuspiciousEmptyOverwrite } from './SiteDataRepository.js';

const LEGACY_META_SCOPE = 'legacyMeta';
const UNKNOWN_LEGACY_SCOPE = 'legacy';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function readItemId(item, itemIdField, index) {
  const candidate = isObject(item) ? item[itemIdField] : null;
  const value = String(candidate ?? '').trim();
  return value || `legacy_item_${index + 1}`;
}

function sortDocsByOrder(docs, order = []) {
  const orderIndex = new Map(order.map((id, index) => [String(id), index]));
  return [...docs].sort((a, b) => {
    const aIndex = orderIndex.has(String(a.entityId)) ? orderIndex.get(String(a.entityId)) : Number.MAX_SAFE_INTEGER;
    const bIndex = orderIndex.has(String(b.entityId)) ? orderIndex.get(String(b.entityId)) : Number.MAX_SAFE_INTEGER;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return String(a.entityId).localeCompare(String(b.entityId));
  });
}

export class LegacyCompatibilityRepository {
  constructor(siteDataRepository) {
    this.repository = siteDataRepository;
  }

  async readLegacyObject(siteId, key) {
    const normalizedKey = normalizeLegacyKey(key);
    const mapping = getLegacyMapping(normalizedKey);

    if (mapping.unknown) {
      const doc = await this.repository.getDocument(siteId, UNKNOWN_LEGACY_SCOPE, mapping.entityId);
      return {
        key: normalizedKey,
        mapping,
        data: doc.data,
        version: doc.version,
        hash: doc.hash,
        documents: [doc],
      };
    }

    const manifest = await this.readManifestIfExists(siteId, normalizedKey);

    if (mapping.mode === 'singleton') {
      const doc = await this.repository.getDocument(siteId, mapping.scope, mapping.entityId);
      return {
        key: normalizedKey,
        mapping,
        data: doc.data,
        version: manifest?.version ?? doc.version,
        hash: sha256OfCanonicalJson(doc.data),
        documents: [doc, manifest].filter(Boolean),
      };
    }

    const docs = (await this.repository.listDocuments(siteId, mapping.scope))
      .filter((doc) => !String(doc.entityId).startsWith('__legacy_meta_'));
    const meta = await this.readListMetaIfExists(siteId, normalizedKey);
    if (!manifest && !meta && docs.length === 0) {
      throw notFound(`Legacy object "${normalizedKey}" was not found`);
    }
    const orderedData = sortDocsByOrder(docs, meta?.data?.order || []).map((doc) => doc.data);

    const data = mapping.mode === 'list-with-settings'
      ? {
          ...(isObject(meta?.data?.settings) ? meta.data.settings : {}),
          [mapping.listProperty]: orderedData,
        }
      : orderedData;

    return {
      key: normalizedKey,
      mapping,
      data,
      version: manifest?.version ?? meta?.version ?? Math.max(0, ...docs.map((doc) => doc.version || 0)),
      hash: sha256OfCanonicalJson(data),
      documents: [...docs, meta, manifest].filter(Boolean),
    };
  }

  async writeLegacyObject({
    siteId,
    key,
    data,
    expectedVersion,
    allowEmptyOverwrite = false,
    actor = 'system',
    metadata = {},
  }) {
    const normalizedKey = normalizeLegacyKey(key);
    if (!normalizedKey) throw badRequest('Legacy key is required');
    if (isSuspiciousEmptyOverwrite(data) && !allowEmptyOverwrite) {
      throw badRequest('Suspicious empty overwrite rejected. Pass allowEmptyOverwrite=true for intentional resets.');
    }

    const mapping = getLegacyMapping(normalizedKey);
    const manifest = await this.readManifestIfExists(siteId, normalizedKey);
    const expected = expectedVersion === undefined || expectedVersion === null ? 0 : Number(expectedVersion);

    if (manifest && manifest.version !== expected) {
      throw conflict('Legacy object version conflict', {
        key: normalizedKey,
        expectedVersion: expected,
        actualVersion: manifest.version,
      });
    }
    if (!manifest && expected !== 0) {
      throw conflict('Legacy object version conflict', {
        key: normalizedKey,
        expectedVersion: expected,
        actualVersion: 0,
      });
    }

    let documents;
    if (mapping.unknown || mapping.mode === 'singleton') {
      documents = [await this.writeSingleton(siteId, mapping, data, allowEmptyOverwrite, actor, metadata)];
    } else {
      documents = await this.writeList(siteId, normalizedKey, mapping, data, allowEmptyOverwrite, actor, metadata);
    }

    const nextManifest = await this.repository.replaceDocument({
      siteId,
      scope: LEGACY_META_SCOPE,
      entityId: getLegacyMetaEntityId(normalizedKey),
      data: {
        key: normalizedKey,
        mappingKey: mapping.key,
        fileName: mapping.fileName,
        mode: mapping.mode,
        normalizedAs: describeLegacyMapping(mapping),
        hash: sha256OfCanonicalJson(data),
        documentKeys: documents.map((doc) => doc._id),
      },
      expectedVersion: manifest?.version ?? 0,
      allowEmptyOverwrite: true,
      actor,
      metadata: { legacyKey: normalizedKey, ...metadata },
      operation: 'legacy-write',
    });

    return {
      key: normalizedKey,
      mapping,
      data,
      version: nextManifest.version,
      hash: sha256OfCanonicalJson(data),
      documents: [...documents, nextManifest],
    };
  }

  async writeSingleton(siteId, mapping, data, allowEmptyOverwrite, actor, metadata) {
    const scope = mapping.unknown ? UNKNOWN_LEGACY_SCOPE : mapping.scope;
    const entityId = mapping.unknown ? mapping.entityId : mapping.entityId;
    const existing = await this.readDocIfExists(siteId, scope, entityId);
    return this.repository.replaceDocument({
      siteId,
      scope,
      entityId,
      data,
      expectedVersion: existing?.version ?? 0,
      allowEmptyOverwrite,
      actor,
      metadata: { legacyFileName: mapping.fileName, ...metadata },
      operation: 'legacy-write',
    });
  }

  async writeList(siteId, normalizedKey, mapping, data, allowEmptyOverwrite, actor, metadata) {
    const list = mapping.mode === 'list-with-settings'
      ? (Array.isArray(data?.[mapping.listProperty]) ? data[mapping.listProperty] : [])
      : (Array.isArray(data) ? data : []);

    if (!Array.isArray(list)) {
      throw badRequest(`Legacy mapping ${mapping.fileName} expects an array`);
    }

    const currentDocs = await this.repository.listDocuments(siteId, mapping.scope);
    const currentByEntityId = new Map(
      currentDocs
        .filter((doc) => !String(doc.entityId).startsWith('__legacy_meta_'))
        .map((doc) => [String(doc.entityId), doc]),
    );

    const nextIds = list.map((item, index) => readItemId(item, mapping.itemIdField, index));
    const nextIdSet = new Set(nextIds);
    const written = [];

    for (let index = 0; index < list.length; index += 1) {
      const entityId = nextIds[index];
      const existing = currentByEntityId.get(entityId);
      const doc = await this.repository.replaceDocument({
        siteId,
        scope: mapping.scope,
        entityId,
        data: cloneJson(list[index]),
        expectedVersion: existing?.version ?? 0,
        allowEmptyOverwrite,
        actor,
        metadata: { legacyKey: normalizedKey, legacyFileName: mapping.fileName, ...metadata },
        operation: 'legacy-write',
      });
      written.push(doc);
    }

    for (const doc of currentDocs) {
      if (String(doc.entityId).startsWith('__legacy_meta_')) continue;
      if (!nextIdSet.has(String(doc.entityId))) {
        const deleted = await this.repository.softDeleteDocument({
          siteId,
          scope: mapping.scope,
          entityId: doc.entityId,
          expectedVersion: doc.version,
          actor,
          metadata: { legacyKey: normalizedKey, legacyFileName: mapping.fileName, ...metadata },
        });
        written.push(deleted);
      }
    }

    const metaEntityId = getLegacyListMetaEntityId(normalizedKey);
    const existingMeta = await this.readDocIfExists(siteId, mapping.scope, metaEntityId);
    const settings = mapping.mode === 'list-with-settings'
      ? Object.entries(data || {}).reduce((acc, [key, value]) => {
          if (key !== mapping.listProperty) acc[key] = value;
          return acc;
        }, {})
      : {};

    const metaDoc = await this.repository.replaceDocument({
      siteId,
      scope: mapping.scope,
      entityId: metaEntityId,
      data: {
        key: normalizedKey,
        order: nextIds,
        settings,
      },
      expectedVersion: existingMeta?.version ?? 0,
      allowEmptyOverwrite: true,
      actor,
      metadata: { legacyKey: normalizedKey, legacyFileName: mapping.fileName, ...metadata },
      operation: 'legacy-meta-write',
    });

    return [...written, metaDoc];
  }

  async readManifestIfExists(siteId, key) {
    return this.readDocIfExists(siteId, LEGACY_META_SCOPE, getLegacyMetaEntityId(key));
  }

  async readListMetaIfExists(siteId, key) {
    const mapping = getLegacyMapping(key);
    if (mapping.mode !== 'list' && mapping.mode !== 'list-with-settings') return null;
    return this.readDocIfExists(siteId, mapping.scope, getLegacyListMetaEntityId(key));
  }

  async readDocIfExists(siteId, scope, entityId) {
    try {
      return await this.repository.getDocument(siteId, scope, entityId);
    } catch (error) {
      if (error.statusCode === 404 || error.code === 'not_found') return null;
      throw error;
    }
  }
}

export default LegacyCompatibilityRepository;
