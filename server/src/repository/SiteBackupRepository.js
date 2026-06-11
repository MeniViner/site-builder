import { LEGACY_MAPPINGS } from './legacyMappings.js';
import { badRequest } from '../utils/errors.js';

export const BACKUP_SCOPE = 'backups';
export const BACKUP_SOURCE = 'admin-backup-management';
export const MAX_BACKUP_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const BACKUP_PACKAGE_KIND = 'bihs-backup-package';

const textEncoder = new TextEncoder();
const LEGACY_FILE_NAMES = new Set(LEGACY_MAPPINGS.map((mapping) => mapping.fileName));

const nowIso = () => new Date().toISOString();
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const cloneJson = (value) => JSON.parse(JSON.stringify(value));

function byteLength(value) {
  return textEncoder.encode(JSON.stringify(value)).length;
}

function sanitizeBackupId(value = '') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized.slice(0, 160);
}

function createBackupId(createdAt = nowIso()) {
  return `backup-${createdAt.replace(/[:.]/g, '-')}`;
}

function normalizeFile(file, index) {
  if (!isObject(file)) throw badRequest(`Backup file at index ${index} must be an object.`);
  const name = String(file.name || '').trim();
  if (!name) throw badRequest(`Backup file at index ${index} is missing name.`);
  if (typeof file.text !== 'string') throw badRequest(`Backup file "${name}" is missing text.`);
  return {
    ...file,
    name,
    text: file.text,
    sizeBytes: Number.isFinite(Number(file.sizeBytes))
      ? Number(file.sizeBytes)
      : textEncoder.encode(file.text).length,
  };
}

export function normalizeBackupPackage(candidate, { fallbackId = '', createdAt = nowIso() } = {}) {
  if (!isObject(candidate)) throw badRequest('Backup package must be a JSON object.');
  const sourceFiles = Array.isArray(candidate.files) ? candidate.files : [];
  if (sourceFiles.length === 0) throw badRequest('Backup package must include at least one file.');

  const files = sourceFiles.map(normalizeFile);
  const id = sanitizeBackupId(candidate.id || candidate.backup?.id || fallbackId || createBackupId(createdAt));
  if (!id) throw badRequest('Backup package id is invalid.');

  return {
    ...cloneJson(candidate),
    kind: candidate.kind || BACKUP_PACKAGE_KIND,
    version: candidate.version || '1.0.0',
    id,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : createdAt,
    source: typeof candidate.source === 'string' ? candidate.source : BACKUP_SOURCE,
    backup: {
      ...(isObject(candidate.backup) ? cloneJson(candidate.backup) : {}),
      id,
      name: typeof candidate.backup?.name === 'string' ? candidate.backup.name : '',
      timeCreated: typeof candidate.backup?.timeCreated === 'string' ? candidate.backup.timeCreated : createdAt,
      timeLastModified: typeof candidate.backup?.timeLastModified === 'string' ? candidate.backup.timeLastModified : createdAt,
    },
    files,
    meta: isObject(candidate.meta) ? cloneJson(candidate.meta) : {},
  };
}

function parseFileJson(file) {
  try {
    return JSON.parse(file.text);
  } catch (error) {
    throw badRequest(`Backup file "${file.name}" is not valid JSON: ${error.message}`);
  }
}

function summarizePackage(backupPackage) {
  const files = Array.isArray(backupPackage.files) ? backupPackage.files : [];
  const fileNames = files.map((file) => file.name);
  return {
    fileCount: files.length,
    fileNames,
    totalSizeBytes: files.reduce((sum, file) => sum + (Number(file.sizeBytes) || 0), 0),
    hasMasterConfig: fileNames.includes('bihs_master_config_v1.txt'),
    restorableFiles: fileNames.filter((fileName) => LEGACY_FILE_NAMES.has(fileName)),
  };
}

function ensureSizeWithinLimit(data, maxDocumentBytes) {
  const sizeBytes = byteLength(data);
  if (sizeBytes > maxDocumentBytes) {
    throw badRequest(
      `Backup package is too large for single-document Mongo storage (${sizeBytes} bytes, limit ${maxDocumentBytes} bytes). Future chunked backup support is required for this backup.`,
      { sizeBytes, maxDocumentBytes },
    );
  }
  return sizeBytes;
}

function toBackupListItem(document) {
  const data = document.data || {};
  const summary = data.summary || {};
  const backupId = data.backupId || document.entityId;
  const createdAt = data.createdAt || document.createdAt?.toISOString?.() || '';
  const updatedAt = document.updatedAt?.toISOString?.() || createdAt;
  return {
    id: backupId,
    name: data.name || '',
    description: data.description || '',
    source: data.source || BACKUP_SOURCE,
    storageBackend: data.storageBackend || 'mongo',
    serverRelativeUrl: `mongo-backup:${backupId}`,
    url: '',
    timeCreated: createdAt,
    timeLastModified: updatedAt,
    createdAt,
    createdBy: data.createdBy || document.createdBy || '',
    fileCount: Number(summary.fileCount || 0),
    totalSizeBytes: Number(data.sizeBytes || summary.totalSizeBytes || 0),
    summary,
    version: document.version,
    entityId: document.entityId,
  };
}

function toFullBackup(document) {
  const item = toBackupListItem(document);
  return {
    ...item,
    data: document.data,
    snapshot: document.data?.snapshot || null,
    backupPackage: document.data?.snapshot || null,
    document: {
      _id: document._id,
      siteId: document.siteId,
      scope: document.scope,
      entityId: document.entityId,
      version: document.version,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      deletedAt: document.deletedAt,
    },
  };
}

export class SiteBackupRepository {
  constructor(siteDataRepository, legacyRepository, options = {}) {
    this.repository = siteDataRepository;
    this.legacyRepository = legacyRepository;
    this.maxDocumentBytes = Number(options.maxDocumentBytes || MAX_BACKUP_DOCUMENT_BYTES);
  }

  async listBackups(siteId) {
    const documents = await this.repository.listDocuments(siteId, BACKUP_SCOPE);
    return documents
      .map(toBackupListItem)
      .sort((a, b) => Date.parse(b.timeLastModified || b.timeCreated || '') - Date.parse(a.timeLastModified || a.timeCreated || ''));
  }

  async getBackup(siteId, backupId) {
    const document = await this.repository.getDocument(siteId, BACKUP_SCOPE, backupId);
    return toFullBackup(document);
  }

  async createBackup({
    siteId,
    backupPackage,
    name = '',
    description = '',
    actor = 'api',
    metadata = {},
  }) {
    const createdAt = nowIso();
    const normalizedPackage = normalizeBackupPackage(backupPackage, { createdAt });
    const backupId = normalizedPackage.id;
    const summary = summarizePackage(normalizedPackage);
    const data = {
      backupId,
      name: String(name || normalizedPackage.backup?.name || `backup-${createdAt}`).trim(),
      description: String(description || '').trim(),
      createdAt,
      createdBy: actor,
      source: BACKUP_SOURCE,
      summary,
      snapshot: normalizedPackage,
      sizeBytes: 0,
      storageBackend: 'mongo',
      siteId,
    };
    data.sizeBytes = ensureSizeWithinLimit(data, this.maxDocumentBytes);

    const document = await this.repository.replaceDocument({
      siteId,
      scope: BACKUP_SCOPE,
      entityId: backupId,
      data,
      expectedVersion: 0,
      allowEmptyOverwrite: false,
      actor,
      metadata: { ...metadata, backupId },
      operation: 'admin-backup-create',
    });

    await this.repository.writeAuditLog({
      siteId,
      documentKey: document._id,
      scope: BACKUP_SCOPE,
      entityId: backupId,
      operation: 'admin-backup-create',
      result: 'ok',
      actor,
      metadata: { ...metadata, backupId, sizeBytes: data.sizeBytes },
    });

    return toFullBackup(document);
  }

  async deleteBackup({ siteId, backupId, expectedVersion = undefined, actor = 'api', metadata = {} }) {
    const current = await this.repository.getDocument(siteId, BACKUP_SCOPE, backupId);
    const document = await this.repository.softDeleteDocument({
      siteId,
      scope: BACKUP_SCOPE,
      entityId: backupId,
      expectedVersion: expectedVersion ?? current.version,
      actor,
      metadata: { ...metadata, backupId },
    });

    await this.repository.writeAuditLog({
      siteId,
      documentKey: document._id,
      scope: BACKUP_SCOPE,
      entityId: backupId,
      operation: 'admin-backup-delete',
      result: 'ok',
      actor,
      metadata: { ...metadata, backupId },
    });

    return toFullBackup(document);
  }

  async restoreBackup({
    siteId,
    backupId,
    allowSiteIdMismatch = false,
    actor = 'api',
    metadata = {},
  }) {
    if (!this.legacyRepository) {
      throw new Error('legacyRepository is required for backup restore.');
    }

    const backup = await this.getBackup(siteId, backupId);
    const backupPackage = normalizeBackupPackage(backup.backupPackage, { fallbackId: backupId });
    const packageSiteId = String(backupPackage.meta?.siteId || backup.data?.siteId || '').trim();
    if (packageSiteId && packageSiteId !== siteId && !allowSiteIdMismatch) {
      throw badRequest('Backup siteId does not match restore target siteId.', {
        backupSiteId: packageSiteId,
        targetSiteId: siteId,
      });
    }

    const restorableFiles = backupPackage.files.filter((file) => LEGACY_FILE_NAMES.has(file.name));
    if (restorableFiles.length === 0) {
      throw badRequest('Backup package does not contain restorable Site Builder files.');
    }

    const restored = [];
    for (const file of restorableFiles) {
      const data = parseFileJson(file);
      let expectedVersion = 0;
      try {
        const current = await this.legacyRepository.readLegacyObject(siteId, file.name);
        expectedVersion = current.version;
      } catch (error) {
        if (error.statusCode !== 404 && error.code !== 'not_found') throw error;
      }
      const result = await this.legacyRepository.writeLegacyObject({
        siteId,
        key: file.name,
        data,
        expectedVersion,
        allowEmptyOverwrite: true,
        actor,
        metadata: { ...metadata, backupId, restore: true },
      });
      restored.push({
        fileName: file.name,
        key: result.key,
        version: result.version,
        documents: result.documents.length,
      });
    }

    await this.repository.writeAuditLog({
      siteId,
      documentKey: `backup:${backupId}`,
      scope: BACKUP_SCOPE,
      entityId: backupId,
      operation: 'admin-backup-restore',
      result: 'ok',
      actor,
      metadata: { ...metadata, backupId, restoredFiles: restored.map((item) => item.fileName) },
    });

    return {
      backup,
      restored,
      restoredFiles: restored.length,
    };
  }
}

export default SiteBackupRepository;
