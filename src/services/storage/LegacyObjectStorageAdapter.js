import backendApiClient, { BackendStorageError } from './backendApiClient';
import { getSiteId } from './storageBackend';

export class LegacyObjectStorageAdapter {
    constructor({ key, siteId = getSiteId(), client = backendApiClient } = {}) {
        if (!key) {
            throw new Error('LegacyObjectStorageAdapter requires a legacy key');
        }
        this.key = key;
        this.siteId = siteId;
        this.client = client;
        this.version = null;
        this.lastHash = null;
        this.loaded = false;
    }

    async load() {
        const response = await this.client.readLegacyObject(this.siteId, this.key);
        this.version = Number.isInteger(Number(response.version)) ? Number(response.version) : 0;
        this.lastHash = response.hash || null;
        this.loaded = true;
        return response.data;
    }

    async save(data, { allowEmptyOverwrite = false } = {}) {
        const expectedVersion = this.loaded ? this.version : 0;
        const response = await this.client.writeLegacyObject(this.siteId, {
            key: this.key,
            data,
            expectedVersion,
            allowEmptyOverwrite,
        });
        this.version = Number.isInteger(Number(response.version)) ? Number(response.version) : this.version;
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
