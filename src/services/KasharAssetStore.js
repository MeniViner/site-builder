const DATABASE_NAME = 'site-builder-kashar-assets-v1';
const ASSET_STORE_NAME = 'assets';
const BACKUP_STORE_NAME = 'asset-backups';
const DATABASE_VERSION = 1;

export const KASHAR_ASSET_REFERENCE_PREFIX = 'kashar-asset:';
export const KASHAR_ASSET_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const KASHAR_ASSET_MAX_TOTAL_BYTES = 100 * 1024 * 1024;
export const KASHAR_ASSET_ALLOWED_MIME_TYPES = new Set([
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
]);

const MIME_BY_EXTENSION = Object.freeze({
    avif: 'image/avif',
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    webp: 'image/webp',
});

export class KasharAssetStorageError extends Error {
    constructor(message, { code = 'kashar_asset_storage_error', cause = null } = {}) {
        super(message);
        this.name = 'KasharAssetStorageError';
        this.code = code;
        this.cause = cause;
    }
}

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
}

function transactionResult(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
}

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isQuotaError(error) {
    return error?.name === 'QuotaExceededError'
        || error?.code === 22
        || /quota|space|storage/i.test(String(error?.message || ''));
}

function assetIdFromReference(reference) {
    const value = String(reference || '').trim();
    return value.startsWith(KASHAR_ASSET_REFERENCE_PREFIX)
        ? value.slice(KASHAR_ASSET_REFERENCE_PREFIX.length).trim()
        : '';
}

function extensionFromName(name) {
    const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return match?.[1] || '';
}

function asUint8Array(value) {
    if (value instanceof Uint8Array) return value;
    return new Uint8Array(value);
}

async function bytesFromRecord(record) {
    if (record?.blob && typeof record.blob.arrayBuffer === 'function') {
        return new Uint8Array(await record.blob.arrayBuffer());
    }
    if (typeof record?.binaryBase64 === 'string') return decodeBase64(record.binaryBase64);
    if (record?.binary instanceof ArrayBuffer) return new Uint8Array(record.binary);
    if (ArrayBuffer.isView(record?.binary)) {
        return new Uint8Array(record.binary.buffer, record.binary.byteOffset, record.binary.byteLength);
    }
    throw new KasharAssetStorageError('לא ניתן לקרוא את נתוני התמונה המקומית.', {
        code: 'asset_binary_unavailable',
    });
}

async function blobFromRecord(record) {
    if (record?.blob && typeof record.blob.arrayBuffer === 'function') return record.blob;
    return new Blob([await bytesFromRecord(record)], { type: record?.mimeType || 'application/octet-stream' });
}

function startsWith(bytes, sequence) {
    return sequence.every((value, index) => bytes[index] === value);
}

function detectImageMimeType(bytes, fallbackName = '') {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
    if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
    if (String.fromCharCode(...bytes.slice(4, 12)).includes('ftypavif')) return 'image/avif';

    // SVG is executable XML in a browser context. Inspect the complete text so
    // a script or event handler cannot be hidden after an otherwise-valid prefix.
    const text = new TextDecoder().decode(bytes).trim().toLowerCase();
    if (text.startsWith('<?xml') || text.startsWith('<svg')) {
        if (!text.includes('<svg') || /<script|<foreignobject|\son[a-z]+\s*=/i.test(text)) return '';
        return 'image/svg+xml';
    }
    return MIME_BY_EXTENSION[extensionFromName(fallbackName)] || '';
}

function checksum(bytes) {
    let hash = 2166136261;
    for (let index = 0; index < bytes.length; index += 1) {
        hash ^= bytes[index];
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function encodeBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(offset, offset + chunkSize));
    }
    return btoa(binary);
}

function decodeBase64(value) {
    const text = String(value || '');
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
        throw new KasharAssetStorageError('קובץ הגיבוי כולל תוכן תמונה לא תקין.', { code: 'invalid_asset_export' });
    }
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
}

function toMetadata(record) {
    if (!record) return null;
    return {
        id: record.id,
        reference: `${KASHAR_ASSET_REFERENCE_PREFIX}${record.id}`,
        originalFilename: record.originalFilename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        width: record.width || null,
        height: record.height || null,
        checksum: record.checksum || null,
        fixtureProvided: record.fixtureProvided === true,
        userUploaded: record.userUploaded === true,
        category: record.category || '',
    };
}

async function readImageDimensions(blob, urlApi) {
    if (typeof Image === 'undefined' || !urlApi?.createObjectURL) return { width: null, height: null };
    const objectUrl = urlApi.createObjectURL(blob);
    try {
        return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve({
                width: Number(image.naturalWidth || image.width) || null,
                height: Number(image.naturalHeight || image.height) || null,
            });
            image.onerror = () => resolve({ width: null, height: null });
            image.src = objectUrl;
        });
    } finally {
        urlApi.revokeObjectURL?.(objectUrl);
    }
}

/**
 * Browser-local binary storage for the isolated Kashar demo profile. Drafts
 * retain only `kashar-asset:<id>` references; this store owns image bytes.
 */
export class KasharAssetStore {
    constructor({
        indexedDBFactory = () => globalThis.indexedDB,
        urlApi = typeof URL === 'undefined' ? null : URL,
        now = () => new Date().toISOString(),
        readDimensions = readImageDimensions,
    } = {}) {
        this.indexedDBFactory = indexedDBFactory;
        this.urlApi = urlApi;
        this.now = now;
        this.readDimensions = readDimensions;
        this.objectUrls = new Map();
    }

    isSupported() {
        return Boolean(this.indexedDBFactory());
    }

    async _open() {
        const indexedDb = this.indexedDBFactory();
        if (!indexedDb) {
            throw new KasharAssetStorageError('אחסון התמונות המקומי אינו זמין בדפדפן זה.', { code: 'indexeddb_unavailable' });
        }
        return new Promise((resolve, reject) => {
            const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
                    const assets = db.createObjectStore(ASSET_STORE_NAME, { keyPath: 'id' });
                    assets.createIndex('checksum', 'checksum', { unique: false });
                }
                if (!db.objectStoreNames.contains(BACKUP_STORE_NAME)) {
                    db.createObjectStore(BACKUP_STORE_NAME, { keyPath: 'id' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new KasharAssetStorageError('לא ניתן לפתוח את אחסון התמונות המקומי.', {
                code: 'indexeddb_open_failed',
                cause: request.error,
            }));
        });
    }

    async _withStores(storeNames, mode, callback) {
        const db = await this._open();
        try {
            const transaction = db.transaction(storeNames, mode);
            const stores = Object.fromEntries(storeNames.map((name) => [name, transaction.objectStore(name)]));
            const completion = transactionResult(transaction);
            const result = await callback(stores, transaction);
            await completion;
            return result;
        } catch (cause) {
            if (cause instanceof KasharAssetStorageError) throw cause;
            if (isQuotaError(cause)) {
                throw new KasharAssetStorageError('אין מספיק מקום באחסון המקומי לתמונת Kashar. מחק תמונות או בחר קובץ קטן יותר.', {
                    code: 'quota_exceeded',
                    cause,
                });
            }
            throw new KasharAssetStorageError('שמירת התמונה המקומית נכשלה. השינוי לא נשמר.', {
                code: 'indexeddb_operation_failed',
                cause,
            });
        } finally {
            db.close();
        }
    }

    async _records() {
        return this._withStores([ASSET_STORE_NAME], 'readonly', async ({ [ASSET_STORE_NAME]: assets }) => (
            requestResult(assets.getAll())
        ));
    }

    async _validatedFile(file) {
        if (!file || typeof file.arrayBuffer !== 'function') {
            throw new KasharAssetStorageError('יש לבחור קובץ תמונה תקין.', { code: 'invalid_file' });
        }
        const sizeBytes = Number(file.size) || 0;
        if (sizeBytes <= 0 || sizeBytes > KASHAR_ASSET_MAX_FILE_BYTES) {
            throw new KasharAssetStorageError('גודל התמונה חורג מהמגבלה של 20MB.', { code: 'file_too_large' });
        }
        const bytes = asUint8Array(await file.arrayBuffer());
        const detectedMimeType = detectImageMimeType(bytes, file.name);
        const declaredMimeType = String(file.type || '').toLowerCase();
        if (!KASHAR_ASSET_ALLOWED_MIME_TYPES.has(detectedMimeType)
            || (declaredMimeType && declaredMimeType !== detectedMimeType && !(declaredMimeType === 'image/jpg' && detectedMimeType === 'image/jpeg'))) {
            throw new KasharAssetStorageError('יש לבחור קובץ תמונה מסוג PNG, JPEG, GIF, WebP, AVIF או SVG בטוח.', {
                code: 'unsupported_image',
            });
        }
        return {
            blob: file instanceof Blob ? file : new Blob([bytes], { type: detectedMimeType }),
            bytes,
            mimeType: detectedMimeType,
            sizeBytes,
            checksum: checksum(bytes),
        };
    }

    async put(file, metadata = {}) {
        const validated = await this._validatedFile(file);
        const existing = await this._records();
        const duplicate = existing.find((record) => record.checksum === validated.checksum
            && record.mimeType === validated.mimeType
            && record.sizeBytes === validated.sizeBytes);
        if (duplicate) return toMetadata(duplicate);

        const currentTotal = existing.reduce((total, record) => total + (Number(record.sizeBytes) || 0), 0);
        if (currentTotal + validated.sizeBytes > KASHAR_ASSET_MAX_TOTAL_BYTES) {
            throw new KasharAssetStorageError('נפח התמונות הכולל של Kashar חורג ממגבלת 100MB. מחק תמונות או בחר קבצים קטנים יותר.', {
                code: 'total_quota_exceeded',
            });
        }

        const dimensions = await this.readDimensions(validated.blob, this.urlApi);
        const timestamp = this.now();
        const record = {
            id: createId(),
            originalFilename: String(file.name || 'image').slice(0, 255),
            mimeType: validated.mimeType,
            sizeBytes: validated.sizeBytes,
            createdAt: timestamp,
            updatedAt: timestamp,
            width: dimensions.width,
            height: dimensions.height,
            checksum: validated.checksum,
            fixtureProvided: false,
            userUploaded: true,
            category: String(metadata.category || '').slice(0, 120),
            blob: validated.blob,
            binary: validated.bytes.buffer.slice(
                validated.bytes.byteOffset,
                validated.bytes.byteOffset + validated.bytes.byteLength,
            ),
            binaryBase64: encodeBase64(validated.bytes),
        };
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => requestResult(assets.put(record)));
        return toMetadata(record);
    }

    async get(referenceOrId) {
        const id = assetIdFromReference(referenceOrId) || String(referenceOrId || '').trim();
        if (!id) return null;
        return this._withStores([ASSET_STORE_NAME], 'readonly', async ({ [ASSET_STORE_NAME]: assets }) => requestResult(assets.get(id)));
    }

    async exists(referenceOrId) {
        return Boolean(await this.get(referenceOrId));
    }

    async list() {
        return (await this._records()).map(toMetadata);
    }

    async snapshotUserAssets() {
        return (await this._records()).filter((record) => record.userUploaded);
    }

    async delete(referenceOrId) {
        const id = assetIdFromReference(referenceOrId) || String(referenceOrId || '').trim();
        if (!id) return false;
        const record = await this.get(id);
        if (!record || record.fixtureProvided) return false;
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => requestResult(assets.delete(id)));
        this._revokeCachedObjectUrl(id);
        return true;
    }

    async acquireObjectUrl(reference) {
        const id = assetIdFromReference(reference);
        if (!id) return null;
        const cached = this.objectUrls.get(id);
        if (cached) {
            cached.references += 1;
            return { source: cached.source, release: () => this.releaseObjectUrl(reference) };
        }
        const record = await this.get(id);
        if (!record || !this.urlApi?.createObjectURL) return null;
        const source = this.urlApi.createObjectURL(await blobFromRecord(record));
        this.objectUrls.set(id, { source, references: 1 });
        return { source, release: () => this.releaseObjectUrl(reference) };
    }

    releaseObjectUrl(reference) {
        const id = assetIdFromReference(reference);
        const cached = this.objectUrls.get(id);
        if (!cached) return;
        cached.references -= 1;
        if (cached.references <= 0) this._revokeCachedObjectUrl(id);
    }

    _revokeCachedObjectUrl(id) {
        const cached = this.objectUrls.get(id);
        if (!cached) return;
        this.urlApi?.revokeObjectURL?.(cached.source);
        this.objectUrls.delete(id);
    }

    revokeAllObjectUrls() {
        [...this.objectUrls.keys()].forEach((id) => this._revokeCachedObjectUrl(id));
    }

    async exportAll(references = []) {
        const ids = new Set((Array.isArray(references) ? references : [])
            .map(assetIdFromReference)
            .filter(Boolean));
        const records = await this._records();
        return Promise.all(records
            .filter((record) => record.userUploaded && ids.has(record.id))
            .map(async (record) => ({
                ...toMetadata(record),
                binaryBase64: encodeBase64(await bytesFromRecord(record)),
            })));
    }

    async validateExportRecords(records) {
        if (!Array.isArray(records)) {
            throw new KasharAssetStorageError('קובץ היבוא כולל רשימת תמונות לא תקינה.', { code: 'invalid_asset_export' });
        }
        let totalBytes = 0;
        const ids = new Set();
        const normalized = [];
        for (const value of records) {
            if (!isPlainObject(value)
                || !/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/.test(String(value.id || ''))
                || !KASHAR_ASSET_ALLOWED_MIME_TYPES.has(value.mimeType)
                || typeof value.binaryBase64 !== 'string') {
                throw new KasharAssetStorageError('קובץ היבוא כולל תמונת Kashar לא תקינה.', { code: 'invalid_asset_export' });
            }
            if (ids.has(value.id)) {
                throw new KasharAssetStorageError('קובץ היבוא כולל מזהה תמונה כפול.', { code: 'duplicate_asset_id' });
            }
            ids.add(value.id);
            const bytes = decodeBase64(value.binaryBase64);
            const actualMimeType = detectImageMimeType(bytes, value.originalFilename);
            if (actualMimeType !== value.mimeType || bytes.byteLength <= 0 || bytes.byteLength > KASHAR_ASSET_MAX_FILE_BYTES) {
                throw new KasharAssetStorageError('קובץ היבוא כולל נתוני תמונה שאינם תואמים למטא-נתונים.', { code: 'invalid_asset_export' });
            }
            totalBytes += bytes.byteLength;
            if (totalBytes > KASHAR_ASSET_MAX_TOTAL_BYTES) {
                throw new KasharAssetStorageError('קובץ היבוא חורג ממגבלת 100MB של תמונות Kashar.', { code: 'total_quota_exceeded' });
            }
            normalized.push({
                id: value.id,
                originalFilename: String(value.originalFilename || 'image').slice(0, 255),
                mimeType: value.mimeType,
                sizeBytes: bytes.byteLength,
                createdAt: typeof value.createdAt === 'string' ? value.createdAt : this.now(),
                updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : this.now(),
                width: Number.isFinite(value.width) ? value.width : null,
                height: Number.isFinite(value.height) ? value.height : null,
                checksum: checksum(bytes),
                fixtureProvided: false,
                userUploaded: true,
                category: String(value.category || '').slice(0, 120),
                blob: new Blob([bytes], { type: value.mimeType }),
                binary: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
                binaryBase64: value.binaryBase64,
            });
        }
        return normalized;
    }

    async replaceUserAssets(records) {
        const normalized = await this.validateExportRecords(records);
        const previous = (await this._records()).filter((record) => record.userUploaded);
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => {
            previous.forEach((record) => assets.delete(record.id));
            normalized.forEach((record) => assets.put(record));
        });
        this.revokeAllObjectUrls();
        return previous;
    }

    async restoreUserAssets(records) {
        const normalized = await this.validateExportRecords(await Promise.all(records.map(async (record) => ({
            ...toMetadata(record),
            binaryBase64: encodeBase64(await bytesFromRecord(record)),
        }))));
        const current = (await this._records()).filter((record) => record.userUploaded);
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => {
            current.forEach((record) => assets.delete(record.id));
            normalized.forEach((record) => assets.put(record));
        });
        this.revokeAllObjectUrls();
    }

    async backupUserAssets(backupId, { references = [] } = {}) {
        const records = await this.snapshotUserAssets();
        const payload = {
            id: String(backupId || createId()),
            createdAt: this.now(),
            references: [...new Set(references.map(assetIdFromReference).filter(Boolean))],
            records,
        };
        await this._withStores([BACKUP_STORE_NAME], 'readwrite', async ({ [BACKUP_STORE_NAME]: backups }) => requestResult(backups.put(payload)));
        return payload.id;
    }

    async clearUserAssets() {
        const records = (await this._records()).filter((record) => record.userUploaded);
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => {
            records.forEach((record) => assets.delete(record.id));
        });
        this.revokeAllObjectUrls();
        return records.length;
    }

    async cleanupUnreferenced(references = []) {
        const keepIds = new Set(references.map(assetIdFromReference).filter(Boolean));
        const records = (await this._records()).filter((record) => record.userUploaded && !keepIds.has(record.id));
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => {
            records.forEach((record) => assets.delete(record.id));
        });
        records.forEach((record) => this._revokeCachedObjectUrl(record.id));
        return records.length;
    }

    /**
     * Deletes only references that a committed draft explicitly stopped using.
     * This avoids treating a just-uploaded, not-yet-saved reference as an orphan.
     */
    async deleteUnreferencedCandidates(candidates = [], currentReferences = []) {
        const candidateIds = new Set(candidates.map(assetIdFromReference).filter(Boolean));
        const keepIds = new Set(currentReferences.map(assetIdFromReference).filter(Boolean));
        const records = (await this._records()).filter((record) => (
            record.userUploaded && candidateIds.has(record.id) && !keepIds.has(record.id)
        ));
        await this._withStores([ASSET_STORE_NAME], 'readwrite', async ({ [ASSET_STORE_NAME]: assets }) => {
            records.forEach((record) => assets.delete(record.id));
        });
        records.forEach((record) => this._revokeCachedObjectUrl(record.id));
        return records.length;
    }
}

export function isKasharAssetReference(value) {
    return Boolean(assetIdFromReference(value));
}

export function collectKasharAssetReferences(value, references = new Set()) {
    if (typeof value === 'string' && isKasharAssetReference(value)) {
        references.add(value);
        return references;
    }
    if (Array.isArray(value)) {
        value.forEach((child) => collectKasharAssetReferences(child, references));
    } else if (isPlainObject(value)) {
        Object.values(value).forEach((child) => collectKasharAssetReferences(child, references));
    }
    return references;
}

export const kasharAssetStore = new KasharAssetStore();
export default kasharAssetStore;
