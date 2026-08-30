import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { DEFAULT_BOOM_DATA, normalizeBoomData } from '../utils/boomData';
import { isKasharDemoProfile } from '../demo-data/demoProfile';
import kasharDraftStore from './KasharDraftStore';
import { createLegacyObjectStorageAdapter } from './storage/LegacyObjectStorageAdapter';
import { isMongoStorageBackend, isSharePointReadonlyBackend } from './storage/storageBackend';
import {
    spLog,
    spLogFileReadOk,
    spLogFileReadResponse,
    spLogFileReadStart,
    spLogFileSaveResponse,
    spLogFileSaveStart,
} from '../utils/spAppLog';

export class BoomService {
    constructor(config = SHAREPOINT_CONFIG) {
        this.config = { ...SHAREPOINT_CONFIG, ...config };
        this.useKasharDemo = isKasharDemoProfile();
        this.useMongo = !this.useKasharDemo && isMongoStorageBackend();
        this.useMock = !this.useMongo && Boolean(this.config.useMock);
        this.mongoAdapter = this.useKasharDemo
            ? null
            : createLegacyObjectStorageAdapter({ key: this.config.boomFileServerRelativeUrl });
        spLog.system(`BoomService - מצב ${this.useMongo ? 'MONGO' : (this.useMock ? 'MOCK' : 'PRODUCTION')}`);
    }

    async getBoom() {
        if (this.useKasharDemo) return normalizeBoomData(await kasharDraftStore.getBoom());
        if (this.useMongo) return normalizeBoomData(await this.mongoAdapter.load());
        if (this.useMock) return this._getMockData();
        return this._getSharePointData();
    }

    async saveBoom(payload) {
        const normalized = normalizeBoomData(payload);
        if (this.useKasharDemo) return normalizeBoomData(await kasharDraftStore.saveBoom(normalized));
        if (this.useMongo) return normalizeBoomData(await this.mongoAdapter.save(normalized));
        if (this.useMock) return this._saveMockData(normalized);
        if (isSharePointReadonlyBackend()) {
            throw new Error('SharePoint TXT storage is read-only. Save BOOM through the Mongo backend.');
        }
        return this._saveSharePointData(normalized);
    }

    _getMockStorage() {
        if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
            throw new Error('localStorage is not available');
        }
        return globalThis.localStorage;
    }

    _getMockData() {
        const fallback = normalizeBoomData(DEFAULT_BOOM_DATA);
        try {
            const storage = this._getMockStorage();
            const stored = storage.getItem(this.config.boomMockStorageKey);
            if (!stored) {
                storage.setItem(this.config.boomMockStorageKey, JSON.stringify(fallback));
                return Promise.resolve(fallback);
            }
            try {
                return Promise.resolve(normalizeBoomData(JSON.parse(stored)));
            } catch (parseError) {
                spLog.error('Error parsing mock BOOM data, resetting to default:', parseError);
                storage.setItem(this.config.boomMockStorageKey, JSON.stringify(fallback));
                return Promise.resolve(fallback);
            }
        } catch (error) {
            spLog.error('Error reading mock BOOM data:', error);
            return Promise.resolve(fallback);
        }
    }

    _saveMockData(payload) {
        try {
            const normalized = normalizeBoomData(payload);
            this._getMockStorage().setItem(this.config.boomMockStorageKey, JSON.stringify(normalized));
            return Promise.resolve(normalized);
        } catch (error) {
            spLog.error('Error saving mock BOOM data:', error);
            throw new Error('שגיאה בשמירת נתוני BOOM לזיכרון המקומי');
        }
    }

    async _getSharePointData() {
        const fileUrl = this.config.boomFileServerRelativeUrl;
        const endpoint = buildFileValueEndpoint(fileUrl);
        try {
            spLogFileReadStart('BOOM', fileUrl);
            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json;odata=verbose' },
            });
            spLogFileReadResponse(fileUrl, response);
            if (!response.ok) {
                if (response.status === 404) return normalizeBoomData(DEFAULT_BOOM_DATA);
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }
            const text = await response.text();
            if (!text.trim()) return normalizeBoomData(DEFAULT_BOOM_DATA);
            const data = normalizeBoomData(JSON.parse(text));
            spLogFileReadOk(fileUrl, 'BOOM נטען');
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת BOOM מ-SharePoint:', error);
            throw error;
        }
    }

    async _saveSharePointData(payload) {
        const fileUrl = this.config.boomFileServerRelativeUrl;
        const normalized = normalizeBoomData(payload);
        spLogFileSaveStart('BOOM', fileUrl);
        const { response } = await upsertSharePointTextFile({
            serverRelativeUrl: fileUrl,
            text: JSON.stringify(normalized, null, 2),
            contentType: 'text/plain; charset=utf-8',
        });
        spLogFileSaveResponse(fileUrl, response);
        if (!response.ok) {
            throw new Error(`SharePoint save failed: ${response.status} ${response.statusText}`);
        }
        spLog.success('BOOM נשמר בהצלחה');
        return normalized;
    }
}

export default new BoomService();
