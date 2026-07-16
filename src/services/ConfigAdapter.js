import { spLog, spLogFileReadStart, spLogFileReadResponse, spLogFileSaveStart, spLogFileSaveResponse } from '../utils/spAppLog';
import { BackendStorageError } from './storage/backendApiClient';
import { createLegacyObjectStorageAdapter, isBackendStorageError } from './storage/LegacyObjectStorageAdapter';
import {
    buildTxtStoragePath,
    clearStorageError,
    getStorageBackend,
    getStorageDescriptor,
    isLocalDevStorageBackend,
    isMongoStorageBackend,
    recordStorageError,
} from './storage/storageBackend';

const DEFAULT_MASTER_CONFIG_KEY = 'bihs_master_config_v1';
const DEFAULT_MASTER_CONFIG_FILE_NAME = 'bihs_master_config_v1.txt';

function asText(value) {
    return String(value ?? '').trim();
}

function looksLikeHtml(value, contentType = '') {
    const prefix = asText(value).slice(0, 256).toLowerCase();
    return String(contentType || '').toLowerCase().includes('text/html')
        || prefix.startsWith('<!doctype html')
        || prefix.startsWith('<html');
}

function requestUrlWithCacheBuster(value) {
    const raw = asText(value);
    const joiner = raw.includes('?') ? '&' : '?';
    return `${raw}${joiner}sitebuilder_cb=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function equivalentJsonText(expected, actual) {
    try {
        const canonicalize = (value) => {
            if (Array.isArray(value)) return value.map(canonicalize);
            if (value && typeof value === 'object') {
                return Object.fromEntries(
                    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
                );
            }
            return value;
        };
        return JSON.stringify(canonicalize(JSON.parse(expected))) === JSON.stringify(canonicalize(JSON.parse(actual)));
    } catch {
        return expected === actual;
    }
}

function responseBodyPrefix(value) {
    return asText(value).replace(/\s+/g, ' ').slice(0, 180);
}

export class TxtStorageError extends Error {
    constructor(message, { status = 0, code = 'txt_storage_error', details = null } = {}) {
        super(message);
        this.name = 'TxtStorageError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.isConflict = status === 409 || status === 412 || code === 'conflict';
    }
}

export const resolveDefaultMasterConfigFileUrl = () => buildTxtStoragePath(DEFAULT_MASTER_CONFIG_FILE_NAME);

export class ConfigAdapter {
    constructor(options = {}) {
        this.options = { ...options };
        this.mockStorageKey = options.mockStorageKey || import.meta.env.VITE_SP_MASTER_CONFIG_MOCK_KEY || DEFAULT_MASTER_CONFIG_KEY;
        this.explicitFileServerRelativeUrl = asText(options.fileServerRelativeUrl);
        this.explicitUseMock = typeof options.useMock === 'boolean' ? options.useMock : null;
        this.explicitMongoAdapter = options.mongoAdapter || null;
        this.mongoAdapters = new Map();
        this.txtLoaded = false;
        this.txtEtag = null;
        this.txtLastText = null;
        this.saveChain = Promise.resolve();
    }

    get storageBackend() {
        return getStorageBackend();
    }

    get useMock() {
        if (this.explicitUseMock !== null) return this.explicitUseMock;
        return isLocalDevStorageBackend();
    }

    get fileServerRelativeUrl() {
        return this.explicitFileServerRelativeUrl || resolveDefaultMasterConfigFileUrl();
    }

    getMongoAdapter() {
        if (this.explicitMongoAdapter) return this.explicitMongoAdapter;
        const descriptor = getStorageDescriptor();
        const cacheKey = `${descriptor.siteId}:${DEFAULT_MASTER_CONFIG_FILE_NAME}`;
        if (!this.mongoAdapters.has(cacheKey)) {
            this.mongoAdapters.set(cacheKey, createLegacyObjectStorageAdapter({
                key: DEFAULT_MASTER_CONFIG_FILE_NAME,
                siteId: descriptor.siteId,
            }));
        }
        return this.mongoAdapters.get(cacheKey);
    }

    async load() {
        await this.saveChain.catch(() => undefined);
        try {
            const result = isMongoStorageBackend()
                ? await this._loadMongo()
                : (this.useMock ? await this._loadMock() : await this._loadSharePoint());
            clearStorageError();
            return result;
        } catch (error) {
            recordStorageError(error, { operation: 'load-master-config', repository: this.storageBackend });
            throw error;
        }
    }

    async save(text) {
        if (typeof text !== 'string') {
            throw new Error('ConfigAdapter.save(text) expects a string payload');
        }
        const operation = this.saveChain.then(() => this._saveSelected(text));
        this.saveChain = operation.catch(() => undefined);
        return operation;
    }

    async _saveSelected(text) {
        try {
            const result = isMongoStorageBackend()
                ? await this._saveMongo(text)
                : (this.useMock ? await this._saveMock(text) : await this._saveSharePoint(text));
            clearStorageError();
            return result;
        } catch (error) {
            recordStorageError(error, { operation: 'save-master-config', repository: this.storageBackend });
            throw error;
        }
    }

    isStrictPersistence() {
        return true;
    }

    isLoadFailureFatal(error) {
        return error instanceof TxtStorageError || isBackendStorageError(error) || this.isStrictPersistence();
    }

    async _loadMongo() {
        const data = await this.getMongoAdapter().load();
        return { text: data === null || data === undefined ? null : JSON.stringify(data, null, 2) };
    }

    async _saveMongo(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (error) {
            throw new Error(`ConfigAdapter.save expected valid JSON text for Mongo storage: ${error.message}`);
        }

        const stored = await this.getMongoAdapter().save(parsed);
        if (!equivalentJsonText(text, JSON.stringify(stored))) {
            throw new BackendStorageError('Mongo save verification failed: persisted response does not match the saved config.', {
                code: 'mongo_write_mismatch',
            });
        }
        return { ok: true };
    }

    async _loadMock() {
        try {
            const value = localStorage.getItem(this.mockStorageKey);
            this.txtLoaded = true;
            this.txtLastText = value;
            return { text: value ?? null };
        } catch (error) {
            throw new TxtStorageError(`Failed to load config from localStorage: ${error.message}`, {
                code: 'mock_load_failed',
            });
        }
    }

    async _saveMock(text) {
        try {
            localStorage.setItem(this.mockStorageKey, text);
            const verified = localStorage.getItem(this.mockStorageKey);
            if (!equivalentJsonText(text, verified ?? '')) {
                throw new Error('localStorage read-back did not match the saved config');
            }
            this.txtLoaded = true;
            this.txtLastText = verified;
            return { ok: true };
        } catch (error) {
            throw new TxtStorageError(`Failed to save config to localStorage: ${error.message}`, {
                code: 'mock_save_failed',
            });
        }
    }

    async _loadSharePoint({ verification = false } = {}) {
        const fileUrl = this.fileServerRelativeUrl;
        const endpoint = requestUrlWithCacheBuster(fileUrl);

        spLogFileReadStart('קונפיגורציית מאסטר', fileUrl);
        let response;
        try {
            response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                    Accept: 'text/plain, application/json',
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
            });
        } catch (error) {
            throw new TxtStorageError(`SharePoint TXT load failed before a response was received: ${error.message}`, {
                code: 'txt_network_error',
            });
        }

        spLogFileReadResponse(fileUrl, response);
        if (response.status === 404) {
            this.txtLoaded = true;
            this.txtEtag = null;
            this.txtLastText = null;
            return { text: null, etag: null };
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new TxtStorageError(`SharePoint TXT load failed (${response.status}): ${responseBodyPrefix(body)}`, {
                status: response.status,
                code: 'txt_load_failed',
            });
        }

        const body = await response.text();
        const contentType = response.headers?.get?.('content-type') || '';
        if (looksLikeHtml(body, contentType)) {
            throw new TxtStorageError(
                `SharePoint returned HTML instead of master config JSON${verification ? ' during save verification' : ''}.`,
                { status: response.status, code: 'txt_html_response' },
            );
        }

        this.txtLoaded = true;
        this.txtEtag = response.headers?.get?.('etag') || null;
        this.txtLastText = body || null;
        return { text: body || null, etag: this.txtEtag };
    }

    async _saveSharePoint(text) {
        const fileUrl = this.fileServerRelativeUrl;
        if (!this.txtLoaded) await this._loadSharePoint();

        const headers = {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-cache',
        };
        if (this.txtEtag) headers['If-Match'] = this.txtEtag;
        else if (this.txtLastText === null) headers['If-None-Match'] = '*';

        spLogFileSaveStart('קונפיגורציית מאסטר', fileUrl);
        let response;
        try {
            response = await fetch(fileUrl, {
                method: 'PUT',
                credentials: 'include',
                cache: 'no-store',
                headers,
                body: text,
            });
        } catch (error) {
            throw new TxtStorageError(`SharePoint TXT save failed before a response was received: ${error.message}`, {
                code: 'txt_network_error',
            });
        }
        spLogFileSaveResponse(fileUrl, response);

        if (response.status === 409 || response.status === 412) {
            throw new TxtStorageError('SharePoint TXT changed since it was loaded. Reload before saving again.', {
                status: response.status,
                code: 'conflict',
            });
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new TxtStorageError(`SharePoint TXT save failed (${response.status}): ${responseBodyPrefix(body)}`, {
                status: response.status,
                code: 'txt_save_failed',
            });
        }

        this.txtEtag = response.headers?.get?.('etag') || this.txtEtag;
        const verified = await this._loadSharePoint({ verification: true });
        if (!equivalentJsonText(text, verified.text ?? '')) {
            throw new TxtStorageError('SharePoint TXT save verification failed: read-back does not match the saved config.', {
                code: 'txt_readback_mismatch',
            });
        }

        spLog.success('שמירת קונפיגורציית מאסטר ל-SharePoint אומתה בהצלחה');
        return { ok: true, etag: this.txtEtag };
    }
}

const configAdapter = new ConfigAdapter();

export { configAdapter };
export default configAdapter;
