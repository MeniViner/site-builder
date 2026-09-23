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

function jsonEqual(left, right) {
    return equivalentJsonText(JSON.stringify(left), JSON.stringify(right));
}

const MISSING = Symbol('missing');

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isIdArray(value) {
    if (!Array.isArray(value)) return false;
    const ids = value.map((item) => (
        isObject(item) && ['string', 'number'].includes(typeof item.id)
            ? String(item.id)
            : null
    ));
    return ids.every(Boolean) && new Set(ids).size === ids.length;
}

function resolveConflict(path, draft, remote, resolutions) {
    const choice = resolutions?.[path];
    if (choice === 'local') return { ok: true, value: draft, conflicts: [] };
    if (choice === 'remote') return { ok: true, value: remote, conflicts: [] };
    return { ok: false, conflicts: [path] };
}

function mergeIdArray(base, draft, remote, path, resolutions) {
    const baseMap = new Map(base.map((item) => [String(item.id), item]));
    const draftMap = new Map(draft.map((item) => [String(item.id), item]));
    const remoteMap = new Map(remote.map((item) => [String(item.id), item]));
    const baseOrder = base.map((item) => String(item.id));
    const draftOrder = draft.map((item) => String(item.id));
    const remoteOrder = remote.map((item) => String(item.id));
    const projectBaseIds = (order) => order.filter((id) => baseMap.has(id));
    const survivingBaseOrder = (map) => baseOrder.filter((id) => map.has(id));
    const draftReordered = !jsonEqual(projectBaseIds(draftOrder), survivingBaseOrder(draftMap));
    const remoteReordered = !jsonEqual(projectBaseIds(remoteOrder), survivingBaseOrder(remoteMap));
    let preferredOrder = null;

    if (draftReordered && remoteReordered && !jsonEqual(draftOrder, remoteOrder)) {
        const orderResolution = resolveConflict(`${path}#order`, draftOrder, remoteOrder, resolutions);
        if (!orderResolution.ok) return orderResolution;
        preferredOrder = orderResolution.value;
    }

    const values = new Map();
    const conflicts = [];
    const ids = new Set([...baseOrder, ...draftOrder, ...remoteOrder]);
    ids.forEach((id) => {
        const result = mergeNode(
            baseMap.has(id) ? baseMap.get(id) : MISSING,
            draftMap.has(id) ? draftMap.get(id) : MISSING,
            remoteMap.has(id) ? remoteMap.get(id) : MISSING,
            `${path}[id=${id}]`,
            resolutions,
        );
        if (result.ok && result.value !== MISSING) values.set(id, result.value);
        if (!result.ok) conflicts.push(...result.conflicts);
    });
    if (conflicts.length > 0) return { ok: false, conflicts };

    if (!preferredOrder) {
        if (draftReordered) preferredOrder = draftOrder;
        else if (remoteReordered) preferredOrder = remoteOrder;
        else preferredOrder = [...baseOrder, ...draftOrder, ...remoteOrder];
    }
    const order = [...new Set(preferredOrder)].filter((id) => values.has(id));
    values.forEach((_value, id) => {
        if (!order.includes(id)) order.push(id);
    });
    return { ok: true, value: order.map((id) => values.get(id)), conflicts: [] };
}

function mergeNode(base, draft, remote, path = '$', resolutions = null) {
    if (draft !== MISSING && remote !== MISSING && jsonEqual(draft, remote)) {
        return { ok: true, value: draft, conflicts: [] };
    }
    if (base !== MISSING && draft !== MISSING && jsonEqual(base, draft)) {
        return { ok: true, value: remote, conflicts: [] };
    }
    if (base !== MISSING && remote !== MISSING && jsonEqual(base, remote)) {
        return { ok: true, value: draft, conflicts: [] };
    }
    if (draft === MISSING && remote === MISSING) {
        return { ok: true, value: MISSING, conflicts: [] };
    }
    if (base !== MISSING && draft === MISSING && remote !== MISSING) {
        return jsonEqual(base, remote)
            ? { ok: true, value: MISSING, conflicts: [] }
            : resolveConflict(path, MISSING, remote, resolutions);
    }
    if (base !== MISSING && remote === MISSING && draft !== MISSING) {
        return jsonEqual(base, draft)
            ? { ok: true, value: MISSING, conflicts: [] }
            : resolveConflict(path, draft, MISSING, resolutions);
    }
    if (base === MISSING) {
        if (draft === MISSING) return { ok: true, value: remote, conflicts: [] };
        if (remote === MISSING) return { ok: true, value: draft, conflicts: [] };
        return resolveConflict(path, draft, remote, resolutions);
    }

    if (Array.isArray(base) && Array.isArray(draft) && Array.isArray(remote)) {
        if (isIdArray(base) && isIdArray(draft) && isIdArray(remote)) {
            return mergeIdArray(base, draft, remote, path, resolutions);
        }
        return resolveConflict(path, draft, remote, resolutions);
    }

    if (isObject(base) && isObject(draft) && isObject(remote)) {
        const value = {};
        const conflicts = [];
        const keys = new Set([...Object.keys(base), ...Object.keys(draft), ...Object.keys(remote)]);
        keys.forEach((key) => {
            const result = mergeNode(
                Object.prototype.hasOwnProperty.call(base, key) ? base[key] : MISSING,
                Object.prototype.hasOwnProperty.call(draft, key) ? draft[key] : MISSING,
                Object.prototype.hasOwnProperty.call(remote, key) ? remote[key] : MISSING,
                `${path}.${key}`,
                resolutions,
            );
            if (result.ok && result.value !== MISSING) value[key] = result.value;
            if (!result.ok) conflicts.push(...result.conflicts);
        });
        return conflicts.length > 0
            ? { ok: false, conflicts }
            : { ok: true, value, conflicts: [] };
    }

    return resolveConflict(path, draft, remote, resolutions);
}

export function mergeConfigTexts(baselineText, draftText, remoteText) {
    try {
        const result = mergeNode(
            JSON.parse(baselineText),
            JSON.parse(draftText),
            JSON.parse(remoteText),
        );
        return result.ok
            ? { ...result, text: JSON.stringify(result.value, null, 2) }
            : result;
    } catch (error) {
        return { ok: false, conflicts: ['$'], error };
    }
}

export function resolveConfigConflictTexts(baselineText, draftText, remoteText, resolutions) {
    try {
        const result = mergeNode(
            JSON.parse(baselineText),
            JSON.parse(draftText),
            JSON.parse(remoteText),
            '$',
            resolutions,
        );
        return result.ok
            ? { ...result, text: JSON.stringify(result.value, null, 2) }
            : result;
    } catch (error) {
        return { ok: false, conflicts: ['$'], error };
    }
}

function errorMetadata(status, fallbackCode) {
    if (status === 412) return { code: 'version_conflict', category: 'version' };
    if (status === 409) return { code: 'path_conflict', category: 'collision' };
    if (status === 401 || status === 403) return { code: 'txt_auth_failed', category: 'auth' };
    if (status >= 500 || status === 0) return { code: fallbackCode, category: 'transport' };
    return { code: fallbackCode, category: 'verification' };
}

export class TxtStorageError extends Error {
    constructor(message, {
        status = 0,
        code = 'txt_storage_error',
        category = 'verification',
        details = null,
        resolutionMessage = '',
    } = {}) {
        super(message);
        this.name = 'TxtStorageError';
        this.status = status;
        this.code = code;
        this.category = category;
        this.details = details;
        this.resolutionMessage = resolutionMessage;
        this.isConflict = status === 412 || code === 'version_conflict';
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
        this.accepted = { text: null, etag: null };
        this.draft = null;
        this.observedRemote = null;
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
        const operation = this.saveChain.then(() => {
            this.draft = { text };
            return this._saveSelected(text);
        });
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

    getConcurrencyState() {
        return {
            accepted: { ...this.accepted },
            draft: this.draft ? { ...this.draft } : null,
            observedRemote: this.observedRemote ? { ...this.observedRemote } : null,
        };
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
            this.accepted = { text: value, etag: null };
            this.observedRemote = null;
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
            this.accepted = { text: verified, etag: null };
            this.draft = null;
            this.observedRemote = null;
            return { ok: true };
        } catch (error) {
            throw new TxtStorageError(`Failed to save config to localStorage: ${error.message}`, {
                code: 'mock_save_failed',
            });
        }
    }

    async _loadSharePoint({ verification = false, adopt = !verification } = {}) {
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
            if (adopt) {
                this.txtLoaded = true;
                this.txtEtag = null;
                this.txtLastText = null;
                this.accepted = { text: null, etag: null };
                this.observedRemote = null;
            }
            return { text: null, etag: null };
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const metadata = errorMetadata(response.status, 'txt_load_failed');
            throw new TxtStorageError(`SharePoint TXT load failed (${response.status}): ${responseBodyPrefix(body)}`, {
                status: response.status,
                ...metadata,
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

        const result = {
            text: body || null,
            etag: response.headers?.get?.('etag') || null,
        };
        if (adopt) {
            this.txtLoaded = true;
            this.txtEtag = result.etag;
            this.txtLastText = result.text;
            this.accepted = { ...result };
            this.observedRemote = null;
        } else {
            this.observedRemote = { ...result };
        }
        return result;
    }

    async _saveSharePoint(text) {
        const fileUrl = this.fileServerRelativeUrl;
        if (!this.txtLoaded) await this._loadSharePoint();
        const originalBaseline = { ...this.accepted };
        let candidateText = text;
        let candidateEtag = originalBaseline.etag;
        let merged = false;

        for (let attempt = 0; attempt < 3; attempt += 1) {
            const headers = {
                Accept: 'application/json, text/plain, */*',
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
            };
            if (candidateEtag) headers['If-Match'] = candidateEtag;
            else if (originalBaseline.text === null) headers['If-None-Match'] = '*';

            spLogFileSaveStart('קונפיגורציית מאסטר', fileUrl);
            let response;
            try {
                response = await fetch(fileUrl, {
                    method: 'PUT',
                    credentials: 'include',
                    cache: 'no-store',
                    headers,
                    body: candidateText,
                });
            } catch (error) {
                const observed = await this._loadSharePoint({ verification: true, adopt: false }).catch(() => null);
                if (observed && equivalentJsonText(candidateText, observed.text ?? '')) {
                    this._adoptVerifiedSharePoint(candidateText, observed.etag);
                    return {
                        ok: true,
                        text: candidateText,
                        etag: observed.etag,
                        merged,
                        uncertainOutcomeVerified: true,
                    };
                }
                throw new TxtStorageError(`SharePoint TXT save failed before a response was received: ${error.message}`, {
                    code: 'txt_network_error',
                    category: 'transport',
                    details: { outcome: 'uncertain' },
                });
            }
            spLogFileSaveResponse(fileUrl, response);

            if (response.status === 412) {
                const remote = await this._loadSharePoint({ verification: true, adopt: false });
                const merge = originalBaseline.text === null
                    ? { ok: false, conflicts: ['$'] }
                    : mergeConfigTexts(originalBaseline.text, text, remote.text ?? '');
                if (!merge.ok) {
                    throw new TxtStorageError('הקובץ השתנה במקביל והעריכות חופפות.', {
                        status: 412,
                        code: 'version_conflict',
                        category: 'version',
                        details: { conflicts: merge.conflicts, accepted: originalBaseline, remote },
                        resolutionMessage: 'הטיוטה נשמרה. יש לטעון את הגרסה העדכנית ולבחור אילו שינויים להשאיר.',
                    });
                }
                candidateText = merge.text;
                if (!remote.etag) {
                    throw new TxtStorageError('לא התקבל ETag לגרסה העדכנית ולכן המיזוג לא נשמר.', {
                        status: 412,
                        code: 'version_conflict',
                        category: 'version',
                        resolutionMessage: 'הטיוטה נשמרה. יש לטעון מחדש לפני ניסיון שמירה נוסף.',
                    });
                }
                candidateEtag = remote.etag;
                merged = true;
                continue;
            }
            if (response.status === 409) {
                throw new TxtStorageError('SharePoint חסם את הנתיב, הקובץ או הנעילה.', {
                    status: 409,
                    code: 'path_conflict',
                    category: 'collision',
                });
            }
            if (!response.ok) {
                const body = await response.text().catch(() => '');
                const metadata = errorMetadata(response.status, 'txt_save_failed');
                throw new TxtStorageError(`SharePoint TXT save failed (${response.status}): ${responseBodyPrefix(body)}`, {
                    status: response.status,
                    ...metadata,
                });
            }

            const verified = await this._loadSharePoint({ verification: true, adopt: false });
            if (!equivalentJsonText(candidateText, verified.text ?? '')) {
                throw new TxtStorageError('SharePoint TXT save verification failed: read-back does not match the saved config.', {
                    code: 'txt_readback_mismatch',
                    category: 'verification',
                    details: { accepted: originalBaseline, observedRemote: verified },
                });
            }

            this._adoptVerifiedSharePoint(candidateText, verified.etag);
            spLog.success('שמירת קונפיגורציית מאסטר ל-SharePoint אומתה בהצלחה');
            return { ok: true, text: candidateText, etag: verified.etag, merged };
        }

        throw new TxtStorageError('הקובץ השתנה שוב בזמן ניסיון המיזוג.', {
            status: 412,
            code: 'version_conflict',
            category: 'version',
            resolutionMessage: 'הטיוטה נשמרה. יש לטעון את הגרסה העדכנית ולנסות שוב.',
        });
    }

    async saveResolved(text, reviewedEtag) {
        if (!reviewedEtag) {
            throw new TxtStorageError('Cannot save a conflict resolution without the reviewed ETag.', {
                code: 'missing_resolution_etag',
                category: 'version',
                resolutionMessage: 'לא ניתן לשמור את ההכרעה ללא גרסת שרת מאומתת. טענו מחדש ונסו שוב.',
            });
        }
        const fileUrl = this.fileServerRelativeUrl;
        const response = await fetch(fileUrl, {
            method: 'PUT',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                Accept: 'application/json, text/plain, */*',
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache',
                'If-Match': reviewedEtag,
            },
            body: text,
        });
        if (response.status === 412) {
            const remote = await this._loadSharePoint({ verification: true, adopt: false });
            throw new TxtStorageError('גרסת השרת השתנתה בזמן פתרון ההתנגשות.', {
                status: 412,
                code: 'version_conflict',
                category: 'version',
                details: { accepted: this.accepted, remote },
                resolutionMessage: 'השרת השתנה שוב. יש לבדוק מחדש את ההבדלים לפני שמירה.',
            });
        }
        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const metadata = errorMetadata(response.status, 'txt_resolution_save_failed');
            throw new TxtStorageError(`SharePoint conflict resolution save failed (${response.status}): ${responseBodyPrefix(body)}`, {
                status: response.status,
                ...metadata,
            });
        }
        const verified = await this._loadSharePoint({ verification: true, adopt: false });
        if (!equivalentJsonText(text, verified.text ?? '')) {
            throw new TxtStorageError('SharePoint conflict resolution verification did not match.', {
                code: 'txt_readback_mismatch',
                category: 'verification',
                details: { accepted: this.accepted, observedRemote: verified },
            });
        }
        this._adoptVerifiedSharePoint(text, verified.etag);
        return { ok: true, text, etag: verified.etag };
    }

    getVersionState() {
        return {
            accepted: this.accepted ? { ...this.accepted } : null,
            observedRemote: this.observedRemote ? { ...this.observedRemote } : null,
        };
    }

    _adoptVerifiedSharePoint(text, etag) {
        this.txtLoaded = true;
        this.txtLastText = text;
        this.txtEtag = etag || null;
        this.accepted = { text, etag: this.txtEtag };
        this.draft = null;
        this.observedRemote = null;
    }
}

const configAdapter = new ConfigAdapter();

export { configAdapter };
export default configAdapter;
