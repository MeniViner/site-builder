import backendApiClient, { BackendStorageError } from './backendApiClient';
import { getSiteId } from './storageBackend';

function assertLegacyObjectEnvelope(response, operation) {
    const hasData = response && typeof response === 'object'
        && Object.prototype.hasOwnProperty.call(response, 'data');
    const numericVersion = Number(response?.version);
    if (!hasData || !Number.isInteger(numericVersion) || numericVersion < 0) {
        throw new BackendStorageError(`Backend returned an invalid legacy-object ${operation} envelope.`, {
            code: 'invalid_backend_response',
        });
    }
    return numericVersion;
}

export class LegacyObjectStorageAdapter {
    constructor({ key, siteId = null, client = backendApiClient } = {}) {
        if (!key) {
            throw new Error('LegacyObjectStorageAdapter requires a legacy key');
        }
        this.key = key;
        this.siteId = siteId ? String(siteId).trim() : null;
        this.client = client;
        this.version = null;
        this.lastHash = null;
        this.loaded = false;
        this.saveChain = Promise.resolve();
    }

    resolveSiteId() {
        return this.siteId || getSiteId();
    }

    async load() {
        await this.saveChain.catch(() => undefined);
        const response = await this.client.readLegacyObject(this.resolveSiteId(), this.key);
        this.version = assertLegacyObjectEnvelope(response, 'read');
        this.lastHash = response.hash || null;
        this.loaded = true;
        return response.data;
    }

    async save(data, { allowEmptyOverwrite = false } = {}) {
        const operation = this.saveChain.then(() => this._save(data, { allowEmptyOverwrite }));
        this.saveChain = operation.catch(() => undefined);
        return operation;
    }

    async _save(data, { allowEmptyOverwrite = false } = {}) {
        const expectedVersion = this.loaded ? this.version : 0;
        const response = await this.client.writeLegacyObject(this.resolveSiteId(), {
            key: this.key,
            data,
            expectedVersion,
            allowEmptyOverwrite,
        });
        this.version = assertLegacyObjectEnvelope(response, 'write');
        this.lastHash = response.hash || null;
        this.loaded = true;
        return response.data;
    }
}

export function createLegacyObjectStorageAdapter(options) {
    return new LegacyObjectStorageAdapter(options);
}

export function isBackendStorageError(error) {
    return error instanceof BackendStorageError || error?.name === 'BackendStorageError';
}

export function toUserFacingStorageError(error) {
    if (error?.isConflict) {
        return new Error('הנתונים השתנו מאז הטעינה האחרונה. רענן את המסך ונסה שוב.');
    }
    return error;
}

export default LegacyObjectStorageAdapter;
