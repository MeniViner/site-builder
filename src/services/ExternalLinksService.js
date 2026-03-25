import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
import {
    spLog,
    spLogFileReadStart,
    spLogFileReadResponse,
    spLogFileReadOk,
    spLogFileSaveStart,
    spLogFileSaveResponse,
} from '../utils/spAppLog';

const DEFAULT_EXTERNAL_LINKS = [];

class ExternalLinksService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        spLog.system(`ExternalLinksService — מצב ${this.useMock ? 'MOCK' : 'PRODUCTION'}`);
    }

    async getExternalLinks() {
        try {
            let data;
            if (this.useMock) {
                data = await this._getMockData();
            } else {
                data = await this._getSharePointData();
            }
            return this._normalizeData(data);
        } catch (e) {
            console.error(e);
            return [];
        }
    }

    _normalizeData(data) {
        if (!Array.isArray(data)) return [];
        return data.map((item, idx) => ({
            id: item.id || String(idx + 1),
            title: item.title || '',
            url: item.url || '',
            image: item.image || item.iconUrl || '',
            iconUrl: item.iconUrl || item.image || '',
            icon: item.icon || '',
            order: item.order !== undefined ? item.order : idx,
        }));
    }

    async saveExternalLinks(payload) {
        if (this.useMock) {
            return this._saveMockData(payload);
        } else {
            return this._saveSharePointData(payload);
        }
    }

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.externalLinksMockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }
            this._saveMockData(DEFAULT_EXTERNAL_LINKS);
            return Promise.resolve([...DEFAULT_EXTERNAL_LINKS]);
        } catch (error) {
            console.error('Error reading mock external links:', error);
            throw new Error('שגיאה בקריאת קישורים חיצוניים מהזיכרון המקומי');
        }
    }

    _saveMockData(payload) {
        try {
            localStorage.setItem(this.config.externalLinksMockStorageKey, JSON.stringify(payload));
            return Promise.resolve(payload);
        } catch (error) {
            console.error('Error saving mock external links:', error);
            if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
                throw new Error('חריגה ממגבלת הזיכרון המקומי! התמונות גדולות מדי לגירסת הפיתוח. אנא השתמש באייקונים במקום תמונות כבדות.');
            }
            throw new Error('שגיאה בשמירת קישורים חיצוניים לזיכרון המקומי');
        }
    }

    async _getSharePointData() {
        try {
            const fileUrl = this.config.externalLinksFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען קישורים חיצוניים מ-SharePoint...');
            spLogFileReadStart('קישורים חיצוניים', fileUrl);

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLogFileReadResponse(fileUrl, response);

            if (!response.ok) {
                if (response.status === 404) {
                    spLog.warn('קובץ קישורים חיצוניים לא נמצא — מערך ריק');
                    return [];
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const data = JSON.parse(text);
            const n = Array.isArray(data) ? data.length : 0;
            spLogFileReadOk(fileUrl, `פריטים: ${n}`);
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת קישורים חיצוניים מ-SharePoint:', error);
            throw new Error('שגיאה בקריאת קישורים חיצוניים מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const fileUrl = this.config.externalLinksFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLogFileSaveStart('קישורים חיצוניים', fileUrl);

            const { response: saveResponse } = await upsertSharePointTextFile({
                serverRelativeUrl: fileUrl,
                text: JSON.stringify(payload, null, 2),
                contentType: 'text/plain; charset=utf-8',
            });

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            spLog.scan('מאמת שמירת קישורים חיצוניים...');
            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLog.file(`אימות קישורים חיצוניים | status: ${verifyResponse.status}`);

            if (!verifyResponse.ok) {
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            spLog.success('קישורים חיצוניים נשמרו ואומתו בהצלחה');
            return payload;
        } catch (error) {
            spLog.error('שגיאה בשמירת קישורים חיצוניים ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת קישורים חיצוניים ל-SharePoint: ' + error.message);
        }
    }
}

export default new ExternalLinksService();
