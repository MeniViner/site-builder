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

class EventsService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        spLog.system(`EventsService — מצב ${this.useMock ? 'MOCK' : 'PRODUCTION'}`);
    }

    /**
     * Get the current events data from storage (localStorage or SharePoint)
     * @returns {Promise<Object>} Object containing events array and display settings
     */
    async getEvents() {
        try {
            let data;
            if (this.useMock) {
                data = await this._getMockData();
            } else {
                data = await this._getSharePointData();
            }
            return this._normalizeData(data);
        } catch (e) {
            spLog.error('EventsService: failed to load events.', e);
            return { displayCount: 3, events: [] };
        }
    }

    _normalizeData(data) {
        if (Array.isArray(data)) {
            data = { displayCount: 3, displayMode: 'default', events: data };
        }
        if (!data) data = { displayCount: 3, displayMode: 'default', events: [] };
        if (!data.events) data.events = [];
        if (!data.displayCount) data.displayCount = 3;
        if (!data.displayMode) data.displayMode = 'default';

        // Migration for old events
        data.events = data.events.map(ev => {
            if (!ev.date && ev.day && ev.month) {
                const currentYear = new Date().getFullYear();
                const monthMap = { 'ינו': 0, 'פבר': 1, 'מרץ': 2, 'אפר': 3, 'מאי': 4, 'יונ': 5, 'יול': 6, 'אוג': 7, 'ספט': 8, 'אוק': 9, 'נוב': 10, 'דצמ': 11 };
                const parsedMonth = monthMap[ev.month.substring(0, 3)] !== undefined ? monthMap[ev.month.substring(0, 3)] : 0;
                const d = new Date(Date.UTC(currentYear, parsedMonth, parseInt(ev.day) || 1));
                return { ...ev, date: d.toISOString().split('T')[0] };
            }
            return ev;
        });

        return data;
    }

    /**
     * Save the events payload to storage
     * @param {Object} payload { displayCount: Number, events: Array }
     */
    async saveEvents(payload) {
        if (this.useMock) {
            return this._saveMockData(payload);
        } else {
            return this._saveSharePointData(payload);
        }
    }

    // ==========================================
    // MOCK MODE (localStorage) Implementation
    // ==========================================

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.mockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }
            // Default mock events if empty
            return Promise.resolve({
                displayCount: 3,
                displayMode: 'default',
                events: [
                    { id: '1', date: '2024-10-06', title: 'ביקורת כשירות רבעונית', subtitle: 'כולל תרגול חרום', color: 'red' },
                    { id: '2', date: '2024-12-27', title: 'כנס מפקדים חילי', subtitle: 'מרכז ההדרכה הראשי', color: 'gray' },
                    { id: '3', date: '2025-03-18', title: 'השתלמות בטיחות וכשירות', subtitle: 'חובה לכלל הסגל', color: 'gray' },
                ]
            });
        } catch (error) {
            spLog.error('Error reading mock events:', error);
            throw new Error('שגיאה בקריאת נתונים מהזיכרון המקומי');
        }
    }

    _saveMockData(payload) {
        try {
            localStorage.setItem(this.config.mockStorageKey, JSON.stringify(payload));
            return Promise.resolve(payload);
        } catch (error) {
            spLog.error('Error saving mock events:', error);
            throw new Error('שגיאה בשמירת נתונים לזיכרון המקומי');
        }
    }

    // ==========================================
    // PRODUCTION MODE (SharePoint) Implementation
    // ==========================================

    async _getSharePointData() {
        try {
            const fileUrl = this.config.fileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען מופעים / אירועים (Events) מ-SharePoint...');
            spLogFileReadStart('מופעים', fileUrl);

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json;odata=verbose',
                }
            });

            spLogFileReadResponse(fileUrl, response);

            if (!response.ok) {
                if (response.status === 404) {
                    spLog.warn('קובץ מופעים לא נמצא — מערך ריק');
                    return [];
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const data = JSON.parse(text);
            const evCount = Array.isArray(data?.events) ? data.events.length : (Array.isArray(data) ? data.length : 0);
            spLogFileReadOk(fileUrl, `אירועים: ${evCount}`);
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת מופעים מ-SharePoint:', error);
            throw new Error('שגיאה בקריאת מופעים מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const fileUrl = this.config.fileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLogFileSaveStart('מופעים', fileUrl);

            const { response: saveResponse } = await upsertSharePointTextFile({
                serverRelativeUrl: fileUrl,
                text: JSON.stringify(payload, null, 2),
                contentType: 'text/plain; charset=utf-8',
            });

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            spLog.scan('מאמת שמירת מופעים...');

            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json;odata=verbose',
                }
            });

            spLog.file(`אימות מופעים | status: ${verifyResponse.status}`);

            if (!verifyResponse.ok) {
                spLog.error(`אימות מופעים נכשל: ${verifyResponse.status}`);
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            spLog.success('מופעים נשמרו ואומתו בהצלחה');
            return payload;
        } catch (error) {
            spLog.error('שגיאה בשמירת מופעים ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת מופעים ל-SharePoint: ' + error.message);
        }
    }
}

export default new EventsService();
