import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { DEFAULT_GANTT_DATA, normalizeGanttData } from '../utils/ganttData';
import { createLegacyObjectStorageAdapter } from './storage/LegacyObjectStorageAdapter';
import { isMongoStorageBackend, isSharePointReadonlyBackend } from './storage/storageBackend';
import {
    spLog,
    spLogFileReadStart,
    spLogFileReadResponse,
    spLogFileReadOk,
    spLogFileSaveStart,
    spLogFileSaveResponse,
} from '../utils/spAppLog';

export class GanttService {
    constructor(config = SHAREPOINT_CONFIG) {
        this.config = { ...SHAREPOINT_CONFIG, ...config };
        this.useMongo = isMongoStorageBackend();
        this.useMock = !this.useMongo && Boolean(this.config.useMock);
        this.mongoAdapter = createLegacyObjectStorageAdapter({ key: this.config.ganttFileServerRelativeUrl });
        spLog.system(`GanttService — מצב ${this.useMongo ? 'MONGO' : (this.useMock ? 'MOCK' : 'PRODUCTION')}`);
    }

    async getGantt() {
        if (this.useMongo) {
            return normalizeGanttData(await this.mongoAdapter.load());
        }
        if (this.useMock) {
            return this._getMockData();
        }
        return this._getSharePointData();
    }

    async saveGantt(payload) {
        const normalized = normalizeGanttData(payload);
        if (this.useMongo) {
            return normalizeGanttData(await this.mongoAdapter.save(normalized));
        }
        if (this.useMock) {
            return this._saveMockData(normalized);
        }
        if (isSharePointReadonlyBackend()) {
            throw new Error('SharePoint TXT storage is read-only. Save gantt through the Mongo backend.');
        }
        return this._saveSharePointData(normalized);
    }

    _getMockData() {
        const fallback = normalizeGanttData(DEFAULT_GANTT_DATA);
        try {
            const storage = this._getMockStorage();
            const stored = storage.getItem(this.config.ganttMockStorageKey);
            if (!stored) {
                storage.setItem(this.config.ganttMockStorageKey, JSON.stringify(fallback));
                return Promise.resolve(fallback);
            }

            try {
                return Promise.resolve(normalizeGanttData(JSON.parse(stored)));
            } catch (parseError) {
                spLog.error('Error parsing mock gantt data, resetting to default:', parseError);
                storage.setItem(this.config.ganttMockStorageKey, JSON.stringify(fallback));
                return Promise.resolve(fallback);
            }
        } catch (error) {
            spLog.error('Error reading mock gantt data:', error);
            return Promise.resolve(fallback);
        }
    }

    _saveMockData(payload) {
        try {
            const normalized = normalizeGanttData(payload);
            this._getMockStorage().setItem(this.config.ganttMockStorageKey, JSON.stringify(normalized));
            return Promise.resolve(normalized);
        } catch (error) {
            spLog.error('Error saving mock gantt data:', error);
            throw new Error('שגיאה בשמירת נתוני הגאנט לזיכרון המקומי');
        }
    }

    _getMockStorage() {
        if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
            throw new Error('localStorage is not available');
        }
        return globalThis.localStorage;
    }

    async _getSharePointData() {
        const fileUrl = this.config.ganttFileServerRelativeUrl;
        const endpoint = buildFileValueEndpoint(fileUrl);

        try {
            spLog.scan('טוען גאנט מ-SharePoint...');
            spLogFileReadStart('גאנט', fileUrl);

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { Accept: 'application/json;odata=verbose' },
            });

            spLogFileReadResponse(fileUrl, response);

            if (!response.ok) {
                if (response.status === 404) {
                    spLog.warn('קובץ גאנט לא נמצא — ברירת מחדל כבויה');
                    return normalizeGanttData(DEFAULT_GANTT_DATA);
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            if (!text.trim()) return normalizeGanttData(DEFAULT_GANTT_DATA);
            const data = JSON.parse(text);
            spLogFileReadOk(fileUrl, 'גאנט נטען');
            return normalizeGanttData(data);
        } catch (error) {
            spLog.error('שגיאה בקריאת גאנט מ-SharePoint:', error);
            if (this.useMongo) throw error;
            return normalizeGanttData(DEFAULT_GANTT_DATA);
        }
    }

    async _saveSharePointData(payload) {
        const fileUrl = this.config.ganttFileServerRelativeUrl;
        const normalized = normalizeGanttData(payload);

        spLogFileSaveStart('גאנט', fileUrl);
        const { response } = await upsertSharePointTextFile({
            serverRelativeUrl: fileUrl,
            text: JSON.stringify(normalized, null, 2),
            contentType: 'text/plain; charset=utf-8',
        });
        spLogFileSaveResponse(fileUrl, response);

        if (!response.ok) {
            throw new Error(`SharePoint save failed: ${response.status} ${response.statusText}`);
        }

        spLog.success('גאנט נשמר בהצלחה');
        return normalized;
    }
}

export default new GanttService();
