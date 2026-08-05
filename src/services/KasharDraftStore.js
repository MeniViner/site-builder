import { validateAndNormalize } from '../config/AppSchema';
import { normalizeGanttData } from '../utils/ganttData';

export const KASHAR_DRAFT_STORAGE_KEY = 'site-builder:demo:kashar:draft:v1';
export const KASHAR_DRAFT_BACKUP_PREFIX = `${KASHAR_DRAFT_STORAGE_KEY}:backup`;
export const KASHAR_DRAFT_FORMAT = 'site-builder-kashar-draft';
export const KASHAR_LEGACY_DRAFT_FORMAT = 'site-builder:kashar-draft';
export const KASHAR_WORKSPACE_EXPORT_FORMAT = 'site-builder-kashar-workspace-export';
export const KASHAR_WORKSPACE_EXPORT_VERSION = 1;
export const KASHAR_DEMO_SEED_VERSION = 1;
export const KASHAR_DEMO_SCHEMA_VERSION = 1;

export class KasharDraftStorageError extends Error {
    constructor(message, { code = 'kashar_draft_storage_error', cause = null, details = null } = {}) {
        super(message);
        this.name = 'KasharDraftStorageError';
        this.code = code;
        this.cause = cause;
        this.details = details;
    }
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function deepClone(value) {
    if (Array.isArray(value)) return value.map(deepClone);
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepClone(child)]));
    }
    return value;
}

function deepCloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function isTimestamp(value) {
    return typeof value === 'string' && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function byteSize(text) {
    if (typeof text !== 'string') return 0;
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    return text.length;
}

function valueType(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

function fingerprint(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function getDefaultStorage() {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
        throw new KasharDraftStorageError('Kashar demo draft storage is unavailable in this browser.', {
            code: 'storage_unavailable',
        });
    }
    return globalThis.localStorage;
}

function parseSerializedValue(rawValue) {
    if (typeof rawValue !== 'string') {
        return { ok: false, reason: 'not_serialized_text', error: new Error('Draft value is not serialized text.') };
    }

    let value = rawValue;
    let layers = 0;
    try {
        while (typeof value === 'string' && layers < 2) {
            value = JSON.parse(value);
            layers += 1;
        }
    } catch (error) {
        return { ok: false, reason: 'invalid_json', error, layers };
    }

    if (typeof value === 'string') {
        return { ok: false, reason: 'nested_json_string', error: new Error('Draft contains more than two JSON string layers.'), layers };
    }
    return { ok: true, value, layers };
}

function collectAssetStrings(config) {
    const values = [
        config?.content?.hero?.logoUrl,
        ...(Array.isArray(config?.content?.hero?.backgroundImageUrls) ? config.content.hero.backgroundImageUrls : []),
    ];
    const galleries = Array.isArray(config?.imageGalleries?.items) ? config.imageGalleries.items : [];
    galleries.forEach((gallery) => {
        values.push(gallery?.coverImageUrl);
        (Array.isArray(gallery?.images) ? gallery.images : []).forEach((image) => values.push(image?.url, image?.src));
    });
    return values.filter((value) => typeof value === 'string');
}

function isRecognizableKasharConfigEnvelope(value) {
    if (!isPlainObject(value) || value.schemaVersion !== '1.0.0') return false;
    if (!isPlainObject(value.content) || !isPlainObject(value.content.hero)) return false;
    const hero = value.content.hero;
    if (typeof hero.siteName !== 'string' && typeof hero.title !== 'string') return false;
    return collectAssetStrings(value).some((asset) => asset.toLowerCase().includes('kashar'));
}

function isPartialWidgetPayload(value) {
    if (!isPlainObject(value)) return false;
    return Array.isArray(value.polls)
        || Array.isArray(value.activeWidgets)
        || Object.prototype.hasOwnProperty.call(value, 'activeWidget')
        || Object.prototype.hasOwnProperty.call(value, 'rotationInterval');
}

function normalizeMigration(value) {
    if (!isPlainObject(value)) return null;
    if (typeof value.from !== 'string' || !isTimestamp(value.migratedAt)) return null;
    return {
        from: value.from,
        migratedAt: value.migratedAt,
        originalBackupKey: typeof value.originalBackupKey === 'string' ? value.originalBackupKey : null,
    };
}

function normalizeLegacyRecord(value) {
    if (!isPlainObject(value)) return value;
    const legacyDemoSeedVersion = Number.isInteger(value.demoSeedVersion)
        ? value.demoSeedVersion
        : value.seedVersion;
    return {
        ...value,
        demoSeedVersion: Number.isInteger(legacyDemoSeedVersion) && legacyDemoSeedVersion > 0
            ? legacyDemoSeedVersion
            : KASHAR_DEMO_SEED_VERSION,
        createdAt: value.createdAt || value.seededAt || value.updatedAt,
    };
}

function normalizeCanonicalRecord(value) {
    if (!isPlainObject(value)
        || value.format !== KASHAR_DRAFT_FORMAT
        || value.demoProfile !== 'kashar'
        || !Number.isInteger(value.demoSeedVersion)
        || value.demoSeedVersion < 1
        || value.demoSchemaVersion !== KASHAR_DEMO_SCHEMA_VERSION
        || !Number.isInteger(value.revision)
        || value.revision < 1
        || !isTimestamp(value.createdAt)
        || !isTimestamp(value.updatedAt)
        || !isPlainObject(value.configEnvelope)
        || !isPlainObject(value.sharedWidgetConfig)
    ) {
        return null;
    }

    try {
        return {
            format: KASHAR_DRAFT_FORMAT,
            demoProfile: 'kashar',
            demoSeedVersion: value.demoSeedVersion,
            demoSchemaVersion: KASHAR_DEMO_SCHEMA_VERSION,
            createdAt: value.createdAt,
            updatedAt: value.updatedAt,
            revision: value.revision,
            configEnvelope: validateAndNormalize(deepClone(value.configEnvelope)),
            gantt: normalizeGanttData(deepClone(value.gantt)),
            sharedWidgetConfig: deepClone(value.sharedWidgetConfig),
            migration: normalizeMigration(value.migration),
        };
    } catch {
        return null;
    }
}

function classifyObject(value, { layers = 1, exportBundle = false } = {}) {
    if (!isPlainObject(value)) {
        return { classification: 'invalid', reason: 'top_level_not_object', layers, value };
    }

    if (value.format === 'site-builder-kashar-export' && isPlainObject(value.draft)) {
        return classifyObject(value.draft, { layers, exportBundle: true });
    }

    const canonical = normalizeCanonicalRecord(value);
    if (canonical) {
        return {
            classification: 'current',
            reason: exportBundle ? 'canonical_export_bundle' : 'canonical_record',
            layers,
            record: canonical,
        };
    }

    const configEnvelope = isPlainObject(value.configEnvelope) ? value.configEnvelope : null;
    const recognizableEnvelope = configEnvelope && isRecognizableKasharConfigEnvelope(configEnvelope);
    const hasLegacyProfile = value.demoProfile === 'kashar' || value.profile === 'kashar';
    const declaresAnotherProfile = (typeof value.demoProfile === 'string' && value.demoProfile !== 'kashar')
        || (typeof value.profile === 'string' && value.profile !== 'kashar');
    if (declaresAnotherProfile) {
        return { classification: 'invalid', reason: 'wrong_demo_profile', layers, value };
    }
    const hasOnlyKnownLegacyDiscriminators = value.format === undefined
        && (value.draftFormat === undefined || value.draftFormat === KASHAR_LEGACY_DRAFT_FORMAT);
    const isLegacyWrapper = hasLegacyProfile
        && recognizableEnvelope
        && hasOnlyKnownLegacyDiscriminators;
    if (isLegacyWrapper) {
        return {
            classification: 'migrated',
            reason: value.draftFormat === KASHAR_LEGACY_DRAFT_FORMAT
                ? 'previous_wrapper_with_legacy_discriminator'
                : (value.profile === 'kashar'
                    ? 'previous_wrapper_with_legacy_metadata'
                    : 'previous_wrapper_without_discriminator'),
            layers,
            legacyRecord: normalizeLegacyRecord(value),
        };
    }

    if (recognizableEnvelope) {
        return {
            classification: 'recoverable',
            reason: 'config_envelope_wrapper',
            layers,
            legacyRecord: value,
        };
    }

    if (isRecognizableKasharConfigEnvelope(value)) {
        return {
            classification: 'recoverable',
            reason: 'raw_kashar_config_envelope',
            layers,
            legacyRecord: { configEnvelope: value },
        };
    }

    if (isPartialWidgetPayload(value)) {
        return { classification: 'invalid', reason: 'partial_widget_or_shared_polls_payload', layers, value };
    }

    return { classification: 'invalid', reason: 'unrecognized_object', layers, value };
}

/**
 * Classifies raw storage/import data without mutating storage. The store uses
 * this decoder for initial load, import validation, diagnostics, and recovery.
 */
export function decodeKasharDraft(rawValue) {
    const parsed = parseSerializedValue(rawValue);
    if (!parsed.ok) {
        return {
            classification: 'invalid',
            reason: parsed.reason,
            layers: parsed.layers || 0,
            error: parsed.error,
        };
    }
    if (isPlainObject(parsed.value)
        && parsed.value.kind === 'site-builder-kashar-draft-diagnostic'
        && typeof parsed.value.raw === 'string') {
        return decodeKasharDraft(parsed.value.raw);
    }
    return classifyObject(parsed.value, { layers: parsed.layers });
}

function describeRawValue(rawValue) {
    const decoded = decodeKasharDraft(rawValue);
    const parsed = parseSerializedValue(rawValue);
    const value = parsed.ok ? parsed.value : null;
    return {
        byteSize: byteSize(rawValue),
        jsonParseResult: parsed.ok ? 'valid' : 'invalid',
        jsonLayers: parsed.layers || 0,
        topLevelType: parsed.ok ? valueType(value) : null,
        topLevelKeys: parsed.ok && isPlainObject(value) ? Object.keys(value).sort() : [],
        classification: decoded.classification,
        reason: decoded.reason,
    };
}

function parseWorkspaceExport(text) {
    const parsed = parseSerializedValue(text);
    if (!parsed.ok || !isPlainObject(parsed.value)) return null;
    const bundle = parsed.value;
    if (bundle.format !== KASHAR_WORKSPACE_EXPORT_FORMAT) return null;
    return bundle;
}

/**
 * Kashar is intentionally local-only. This store is the sole owner of the
 * complete record at the namespaced key; services only submit domain payloads.
 */
export class KasharDraftStore {
    constructor({
        storage = null,
        storageKey = KASHAR_DRAFT_STORAGE_KEY,
        now = () => new Date().toISOString(),
    } = {}) {
        this.storage = storage;
        this.storageKey = storageKey;
        this.now = now;
        this.saveChain = Promise.resolve();
    }

    _getStorage() {
        return this.storage || getDefaultStorage();
    }

    _readRaw(key = this.storageKey) {
        try {
            return this._getStorage().getItem(key);
        } catch (cause) {
            throw new KasharDraftStorageError('Unable to read the Kashar demo draft. Your saved work was not changed.', {
                code: 'read_failed',
                cause,
            });
        }
    }

    _listStorageKeys() {
        try {
            const storage = this._getStorage();
            if (!Number.isInteger(storage.length) || typeof storage.key !== 'function') return [this.storageKey];
            const keys = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                if (typeof key === 'string' && key.startsWith(KASHAR_DRAFT_STORAGE_KEY)) keys.push(key);
            }
            return keys.sort();
        } catch (cause) {
            throw new KasharDraftStorageError('Unable to inspect Kashar demo draft storage.', {
                code: 'inspect_failed',
                cause,
            });
        }
    }

    _backupRaw(raw, reason, { timestamped = false } = {}) {
        if (typeof raw !== 'string') return null;
        const storage = this._getStorage();
        const digest = fingerprint(raw);
        const safeReason = String(reason || 'backup').replace(/[^a-z0-9_-]/gi, '-');
        const base = timestamped
            ? `${KASHAR_DRAFT_BACKUP_PREFIX}:${safeReason}:${Date.now()}:${digest}`
            : `${KASHAR_DRAFT_BACKUP_PREFIX}:${safeReason}:${digest}`;

        try {
            if (!timestamped && storage.getItem(base) === raw) return base;
            let key = base;
            let suffix = 1;
            while (storage.getItem(key) !== null) {
                if (storage.getItem(key) === raw) return key;
                key = `${base}:${suffix}`;
                suffix += 1;
            }
            storage.setItem(key, raw);
            if (storage.getItem(key) !== raw) throw new Error('localStorage backup read-back did not match');
            return key;
        } catch (cause) {
            throw new KasharDraftStorageError('Kashar draft evidence could not be backed up. No data was replaced.', {
                code: 'backup_failed',
                cause,
            });
        }
    }

    _readDecodedActive() {
        const raw = this._readRaw();
        if (raw === null || raw.trim() === '') return { raw: null, decoded: null };
        return { raw, decoded: decodeKasharDraft(raw) };
    }

    _throwInvalid(raw, decoded) {
        const backupKey = this._backupRaw(raw, 'invalid');
        throw new KasharDraftStorageError(
            `Kashar demo draft could not be loaded and was preserved at "${backupKey}". Use the Kashar recovery controls to download it, import a valid backup, or reset the demo. ${decoded.reason}`,
            {
                code: 'invalid_stored_draft',
                details: { backupKey, classification: decoded.classification, reason: decoded.reason },
            },
        );
    }

    async _createFixtureState() {
        const {
            cloneKasharDemoData,
            cloneKasharDemoGanttData,
            createKasharDemoWidgetConfig,
        } = await import('../demo-data/kasharDemoData');
        return {
            configEnvelope: cloneKasharDemoData(),
            gantt: cloneKasharDemoGanttData(),
            sharedWidgetConfig: createKasharDemoWidgetConfig(),
        };
    }

    _createCanonicalRecord({
        configEnvelope,
        gantt,
        sharedWidgetConfig,
        previousRecord = null,
        sourceRecord = null,
        migration = null,
        revision = null,
    }) {
        const timestamp = this.now();
        const sourceRevision = Number.isInteger(sourceRecord?.revision) && sourceRecord.revision > 0
            ? sourceRecord.revision
            : 0;
        const nextRevision = revision ?? (previousRecord
            ? previousRecord.revision + 1
            : Math.max(1, sourceRevision + (migration ? 1 : 0)));
        const record = {
            format: KASHAR_DRAFT_FORMAT,
            demoProfile: 'kashar',
            demoSeedVersion: Number.isInteger(sourceRecord?.demoSeedVersion) && sourceRecord.demoSeedVersion > 0
                ? sourceRecord.demoSeedVersion
                : KASHAR_DEMO_SEED_VERSION,
            demoSchemaVersion: KASHAR_DEMO_SCHEMA_VERSION,
            createdAt: isTimestamp(sourceRecord?.createdAt) ? sourceRecord.createdAt : timestamp,
            updatedAt: timestamp,
            revision: nextRevision,
            configEnvelope: validateAndNormalize(deepClone(configEnvelope)),
            gantt: normalizeGanttData(deepClone(gantt)),
            sharedWidgetConfig: isPlainObject(sharedWidgetConfig) ? deepClone(sharedWidgetConfig) : {},
            migration: migration || normalizeMigration(sourceRecord?.migration),
        };
        const normalized = normalizeCanonicalRecord(record);
        if (!normalized) {
            throw new KasharDraftStorageError('Kashar demo draft does not match the canonical record format.', {
                code: 'invalid_canonical_record',
            });
        }
        return normalized;
    }

    async _materializeDecoded(decoded, { previousRecord = null, migrationBackupKey = null } = {}) {
        if (decoded.classification === 'current') return decoded.record;
        if (decoded.classification !== 'migrated' && decoded.classification !== 'recoverable') {
            throw new KasharDraftStorageError('Only recognized Kashar drafts can be recovered.', {
                code: 'unrecoverable_draft',
                details: decoded,
            });
        }
        const fixture = await this._createFixtureState();
        const source = decoded.legacyRecord || {};
        return this._createCanonicalRecord({
            configEnvelope: source.configEnvelope || fixture.configEnvelope,
            gantt: source.gantt || fixture.gantt,
            sharedWidgetConfig: source.sharedWidgetConfig || fixture.sharedWidgetConfig,
            previousRecord,
            sourceRecord: source,
            migration: {
                from: decoded.reason,
                migratedAt: this.now(),
                originalBackupKey: migrationBackupKey,
            },
        });
    }

    /** The only function that serializes and writes the active Kashar record. */
    _writeCanonicalRecord(record) {
        const normalized = normalizeCanonicalRecord(record);
        if (!normalized) {
            throw new KasharDraftStorageError('Kashar demo changes are not a canonical draft record.', {
                code: 'invalid_canonical_record',
            });
        }

        let text;
        try {
            text = JSON.stringify(normalized);
        } catch (cause) {
            throw new KasharDraftStorageError('Kashar demo changes could not be serialized. Your previous draft is unchanged.', {
                code: 'serialize_failed',
                cause,
            });
        }

        try {
            const storage = this._getStorage();
            storage.setItem(this.storageKey, text);
            if (storage.getItem(this.storageKey) !== text) {
                throw new Error('localStorage read-back did not match the saved draft');
            }
        } catch (cause) {
            throw new KasharDraftStorageError('Kashar demo changes could not be saved. Your previous draft is unchanged.', {
                code: 'write_failed',
                cause,
            });
        }
        return deepCloneJson(normalized);
    }

    _queueWrite(operation) {
        const queued = this.saveChain.then(operation);
        this.saveChain = queued.catch(() => undefined);
        return queued;
    }

    /** Coordinates asset operations with draft writes, reset, and import. */
    async runExclusive(operation) {
        if (typeof operation !== 'function') {
            throw new KasharDraftStorageError('Kashar operation must be a function.', { code: 'invalid_operation' });
        }
        return this._queueWrite(operation);
    }

    async _cleanupRemovedAssets(previousDraft, draft) {
        const { collectKasharAssetReferences, kasharAssetStore } = await import('./KasharAssetStore');
        const previousReferences = [...collectKasharAssetReferences(previousDraft)];
        const references = [...collectKasharAssetReferences(draft)];
        const currentReferences = new Set(references);
        const removedReferences = previousReferences.filter((reference) => !currentReferences.has(reference));
        if (!kasharAssetStore.isSupported()) return 0;
        return kasharAssetStore.deleteUnreferencedCandidates(removedReferences, references);
    }

    async _readOrMaterializeForWrite() {
        const { raw, decoded } = this._readDecodedActive();
        if (!decoded) {
            const fixture = await this._createFixtureState();
            return this._createCanonicalRecord({ ...fixture, revision: 1 });
        }
        if (decoded.classification === 'invalid') this._throwInvalid(raw, decoded);
        if (decoded.classification === 'current') return decoded.record;
        const migrationBackupKey = this._backupRaw(raw, 'migration');
        return this._materializeDecoded(decoded, { migrationBackupKey });
    }

    async loadOrSeed() {
        await this.saveChain.catch(() => undefined);
        const { raw, decoded } = this._readDecodedActive();
        if (decoded?.classification === 'current') {
            return { draft: deepCloneJson(decoded.record), source: 'kashar-draft' };
        }
        if (decoded?.classification === 'invalid') this._throwInvalid(raw, decoded);

        return this._queueWrite(async () => {
            const current = this._readDecodedActive();
            if (current.decoded?.classification === 'current') {
                return { draft: deepCloneJson(current.decoded.record), source: 'kashar-draft' };
            }
            if (current.decoded?.classification === 'invalid') this._throwInvalid(current.raw, current.decoded);

            const record = await this._readOrMaterializeForWrite();
            const saved = this._writeCanonicalRecord(record);
            return {
                draft: saved,
                source: current.decoded ? 'kashar-draft-migrated' : 'kashar-draft-seeded',
                notice: current.decoded ? 'Local Kashar draft upgraded to the current format.' : null,
            };
        });
    }

    async getDraft() {
        return (await this.loadOrSeed()).draft;
    }

    async _update(mutator, { cleanupAssets = false } = {}) {
        return this._queueWrite(async () => {
            const current = await this._readOrMaterializeForWrite();
            const candidate = await mutator(deepCloneJson(current));
            const saved = this._writeCanonicalRecord(this._createCanonicalRecord({
                configEnvelope: candidate.configEnvelope,
                gantt: candidate.gantt,
                sharedWidgetConfig: candidate.sharedWidgetConfig,
                previousRecord: current,
                sourceRecord: current,
            }));
            if (cleanupAssets) {
                try {
                    await this._cleanupRemovedAssets(current, saved);
                } catch {
                    // The committed draft remains valid; failed orphan cleanup
                    // is conservative and never reports a false save failure.
                }
            }
            return saved;
        });
    }

    async getConfig() {
        return deepClone((await this.getDraft()).configEnvelope);
    }

    async saveConfig(configEnvelope) {
        const saved = await this._update((draft) => ({
            ...draft,
            configEnvelope: validateAndNormalize(deepClone(configEnvelope)),
        }), { cleanupAssets: true });
        return deepClone(saved.configEnvelope);
    }

    async getGantt() {
        return deepClone((await this.getDraft()).gantt);
    }

    async saveGantt(gantt) {
        const saved = await this._update((draft) => ({
            ...draft,
            gantt: normalizeGanttData(deepClone(gantt)),
        }));
        return deepClone(saved.gantt);
    }

    async getSharedWidgetConfig() {
        return deepClone((await this.getDraft()).sharedWidgetConfig);
    }

    async saveSharedWidgetConfig(sharedWidgetConfig) {
        if (!isPlainObject(sharedWidgetConfig)) {
            throw new KasharDraftStorageError('Shared Kashar widget data must be an object.', { code: 'invalid_widgets' });
        }
        const saved = await this._update((draft) => ({
            ...draft,
            sharedWidgetConfig: deepClone(sharedWidgetConfig),
        }));
        return deepClone(saved.sharedWidgetConfig);
    }

    async reset() {
        return this._queueWrite(async () => {
            const { raw, decoded } = this._readDecodedActive();
            const { collectKasharAssetReferences, kasharAssetStore } = await import('./KasharAssetStore');
            let draftBackupKey = null;
            if (decoded?.classification === 'invalid') {
                draftBackupKey = this._backupRaw(raw, 'invalid');
            } else if (raw !== null) {
                draftBackupKey = this._backupRaw(raw, 'pre-reset', { timestamped: true });
            }

            const references = decoded?.classification === 'current'
                ? [...collectKasharAssetReferences(decoded.record)]
                : [];
            const hasAssetStorage = kasharAssetStore.isSupported();
            const assetBackupId = `reset:${draftBackupKey || Date.now()}`;
            if (hasAssetStorage) {
                await kasharAssetStore.backupUserAssets(assetBackupId, { references });
            }

            const fixture = await this._createFixtureState();
            const priorRevision = decoded?.classification === 'current' ? decoded.record.revision : 0;
            const resetRecord = this._createCanonicalRecord({
                ...fixture,
                revision: priorRevision + 1 || 1,
            });

            try {
                this._getStorage().removeItem(this.storageKey);
                const saved = this._writeCanonicalRecord(resetRecord);
                try {
                    if (hasAssetStorage) await kasharAssetStore.clearUserAssets();
                } catch (assetError) {
                    if (raw !== null) this._getStorage().setItem(this.storageKey, raw);
                    throw assetError;
                }
                return saved;
            } catch (error) {
                if (raw !== null) {
                    try {
                        this._getStorage().setItem(this.storageKey, raw);
                    } catch {
                        // The immutable backup remains available for recovery.
                    }
                }
                throw error;
            }
        });
    }

    async exportDraft() {
        return deepCloneJson(await this.getDraft());
    }

    async exportWorkspace() {
        const draft = await this.exportDraft();
        const { collectKasharAssetReferences, kasharAssetStore } = await import('./KasharAssetStore');
        const references = [...collectKasharAssetReferences(draft)];
        const assets = references.length > 0
            ? await kasharAssetStore.exportAll(references)
            : [];
        return {
            format: KASHAR_WORKSPACE_EXPORT_FORMAT,
            exportVersion: KASHAR_WORKSPACE_EXPORT_VERSION,
            demoProfile: 'kashar',
            exportedAt: this.now(),
            draft,
            assets,
        };
    }

    async validateImportedText(text) {
        const decoded = decodeKasharDraft(text);
        if (decoded.classification === 'invalid') {
            throw new KasharDraftStorageError('The selected file is not a recognized Kashar demo draft.', {
                code: 'invalid_import',
                details: decoded,
            });
        }
        return this._materializeDecoded(decoded);
    }

    async validateWorkspaceImport(text) {
        const workspace = parseWorkspaceExport(text);
        if (!workspace) {
            return {
                type: 'legacy-draft',
                draft: await this.validateImportedText(text),
                assets: null,
                warning: 'הגיבוי הישן כולל טיוטה בלבד; תמונות Kashar שהועלו מקומית אינן כלולות בו.',
            };
        }
        if (workspace.exportVersion !== KASHAR_WORKSPACE_EXPORT_VERSION
            || workspace.demoProfile !== 'kashar'
            || !isPlainObject(workspace.draft)
            || !Array.isArray(workspace.assets)) {
            throw new KasharDraftStorageError('קובץ היבוא אינו גיבוי סביבת Kashar תקין.', { code: 'invalid_workspace_import' });
        }

        const draft = await this.validateImportedText(JSON.stringify(workspace.draft));
        const { collectKasharAssetReferences, isKasharAssetReference, kasharAssetStore } = await import('./KasharAssetStore');
        const assetRecords = await kasharAssetStore.validateExportRecords(workspace.assets);
        const references = [...collectKasharAssetReferences(draft)];
        const referenceIds = new Set(references
            .filter(isKasharAssetReference)
            .map((reference) => reference.slice('kashar-asset:'.length)));
        const assetIds = new Set(assetRecords.map((record) => record.id));
        if ([...referenceIds].some((id) => !assetIds.has(id)) || [...assetIds].some((id) => !referenceIds.has(id))) {
            throw new KasharDraftStorageError('קובץ היבוא אינו כולל התאמה מלאה בין הפניות התמונות לקבצי Kashar.', {
                code: 'workspace_asset_reference_mismatch',
            });
        }
        return { type: 'workspace', draft, assets: workspace.assets, warning: null };
    }

    _writeImportedDraft(imported, current) {
        return this._writeCanonicalRecord(this._createCanonicalRecord({
            configEnvelope: imported.configEnvelope,
            gantt: imported.gantt,
            sharedWidgetConfig: imported.sharedWidgetConfig,
            previousRecord: current,
            sourceRecord: imported,
            migration: normalizeMigration(imported.migration),
        }));
    }

    async importWorkspaceText(text) {
        const imported = await this.validateWorkspaceImport(text);
        return this._queueWrite(async () => {
            const { raw, decoded } = this._readDecodedActive();
            let draftBackupKey = null;
            if (decoded?.classification === 'invalid') {
                draftBackupKey = this._backupRaw(raw, 'invalid');
            } else if (raw !== null) {
                draftBackupKey = this._backupRaw(raw, 'pre-import', { timestamped: true });
            }

            const current = decoded?.classification === 'current' ? decoded.record : null;
            let previousAssets = null;
            let kasharAssetStore = null;
            try {
                if (imported.type === 'workspace') {
                    const assets = await import('./KasharAssetStore');
                    kasharAssetStore = assets.kasharAssetStore;
                    if (imported.assets.length > 0 || kasharAssetStore.isSupported()) {
                        if (!kasharAssetStore.isSupported()) {
                            throw new KasharDraftStorageError('אחסון התמונות המקומי אינו זמין בדפדפן זה.', { code: 'indexeddb_unavailable' });
                        }
                        previousAssets = await kasharAssetStore.snapshotUserAssets();
                        await kasharAssetStore.backupUserAssets(`import:${draftBackupKey || Date.now()}`, {
                            references: current ? [...assets.collectKasharAssetReferences(current)] : [],
                        });
                        await kasharAssetStore.replaceUserAssets(imported.assets);
                    }
                }
                const saved = this._writeImportedDraft(imported.draft, current);
                if (imported.type === 'legacy-draft') {
                    try {
                        await this._cleanupRemovedAssets(current, saved);
                    } catch {
                        // Legacy draft import remains usable even if an orphan
                        // cleanup attempt cannot access IndexedDB.
                    }
                }
                return { draft: saved, warning: imported.warning };
            } catch (error) {
                if (previousAssets && kasharAssetStore) {
                    try {
                        await kasharAssetStore.restoreUserAssets(previousAssets);
                    } catch {
                        // The draft backup and asset backup remain available for recovery.
                    }
                }
                throw error;
            }
        });
    }

    async importDraftText(text) {
        return (await this.importWorkspaceText(text)).draft;
    }

    async inspect() {
        const keys = this._listStorageKeys();
        return {
            storageKey: this.storageKey,
            records: keys.map((key) => {
                const raw = this._readRaw(key);
                return {
                    key,
                    isActive: key === this.storageKey,
                    ...describeRawValue(raw),
                };
            }),
        };
    }

    getRawForRecovery(key = this.storageKey) {
        if (typeof key !== 'string' || !key.startsWith(KASHAR_DRAFT_STORAGE_KEY)) {
            throw new KasharDraftStorageError('Only Kashar draft keys can be inspected.', { code: 'invalid_recovery_key' });
        }
        return this._readRaw(key);
    }
}

export const kasharDraftStore = new KasharDraftStore();
export default kasharDraftStore;
