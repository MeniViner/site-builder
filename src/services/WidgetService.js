import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { getRequestDigest } from '../utils/sharepointUtils';

const DEFAULT_WIDGETS_CONFIG = {
    activeWidget: 'events',
    widgetSettings: {},
    outstanding: [],
    countdown: {
        title: '',
        targetDate: '',
    },
    news: [],
    phonebook: [],
};

class WidgetService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        console.log(`WidgetService initialized in ${this.useMock ? 'MOCK' : 'PRODUCTION'} mode`);
    }

    async getWidgetConfig() {
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
            return { ...DEFAULT_WIDGETS_CONFIG };
        }
    }

    _normalizeData(data) {
        if (!data) return { ...DEFAULT_WIDGETS_CONFIG };
        return {
            activeWidget: data.activeWidget || DEFAULT_WIDGETS_CONFIG.activeWidget,
            widgetSettings: data.widgetSettings || {},
            outstanding: Array.isArray(data.outstanding) ? data.outstanding : [],
            countdown: data.countdown && typeof data.countdown === 'object'
                ? { title: data.countdown.title || '', targetDate: data.countdown.targetDate || '' }
                : { title: '', targetDate: '' },
            news: Array.isArray(data.news) ? data.news : [],
            phonebook: Array.isArray(data.phonebook) ? data.phonebook : [],
        };
    }

    async saveWidgetConfig(payload) {
        if (this.useMock) {
            return this._saveMockData(payload);
        } else {
            return this._saveSharePointData(payload);
        }
    }

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.widgetsMockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }
            this._saveMockData(DEFAULT_WIDGETS_CONFIG);
            return Promise.resolve({ ...DEFAULT_WIDGETS_CONFIG });
        } catch (error) {
            console.error('Error reading mock widget config:', error);
            throw new Error('שגיאה בקריאת הגדרות ווידגטים מהזיכרון המקומי');
        }
    }

    _saveMockData(payload) {
        try {
            localStorage.setItem(this.config.widgetsMockStorageKey, JSON.stringify(payload));
            return Promise.resolve(payload);
        } catch (error) {
            console.error('Error saving mock widget config:', error);
            throw new Error('שגיאה בשמירת הגדרות ווידגטים לזיכרון המקומי');
        }
    }

    async _getSharePointData() {
        try {
            const fileUrl = this.config.widgetsFileServerRelativeUrl;
            const endpoint = `/_api/web/GetFileByServerRelativeUrl('${fileUrl}')/$value`;

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('SharePoint widgets config file not found, returning defaults');
                    return { ...DEFAULT_WIDGETS_CONFIG };
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            return JSON.parse(text);
        } catch (error) {
            console.error('Error reading SharePoint widget config:', error);
            throw new Error('שגיאה בקריאת הגדרות ווידגטים מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const formDigestValue = await getRequestDigest();
            const fileUrl = this.config.widgetsFileServerRelativeUrl;
            const endpoint = `/_api/web/GetFileByServerRelativeUrl('${fileUrl}')/$value`;

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

            console.log('Widget config saved and verified successfully');
            return payload;
        } catch (error) {
            console.error('Error saving SharePoint widget config:', error);
            throw new Error('שגיאה בשמירת הגדרות ווידגטים ל-SharePoint: ' + error.message);
        }
    }
}

export default new WidgetService();
