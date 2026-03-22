import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, getRequestDigest } from '../utils/sharepointUtils';

const DEFAULT_EXTERNAL_LINKS = [];

class ExternalLinksService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        console.log(`ExternalLinksService initialized in ${this.useMock ? 'MOCK' : 'PRODUCTION'} mode`);
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

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('SharePoint external links file not found, returning empty array');
                    return [];
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            return JSON.parse(text);
        } catch (error) {
            console.error('Error reading SharePoint external links:', error);
            throw new Error('שגיאה בקריאת קישורים חיצוניים מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const formDigestValue = await getRequestDigest();
            const fileUrl = this.config.externalLinksFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            const saveResponse = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-RequestDigest': formDigestValue,
                    'X-HTTP-Method': 'PUT',
                    'IF-MATCH': '*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            if (!verifyResponse.ok) {
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            console.log('External links saved and verified successfully');
            return payload;
        } catch (error) {
            console.error('Error saving SharePoint external links:', error);
            throw new Error('שגיאה בשמירת קישורים חיצוניים ל-SharePoint: ' + error.message);
        }
    }
}

export default new ExternalLinksService();
