import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, getRequestDigest } from '../utils/sharepointUtils';
import { DEFAULT_ACTIVE_WIDGETS, mergeWidgetSettings } from '../utils/widgetDisplay';
import {
    spLog,
    spLogFileReadStart,
    spLogFileReadResponse,
    spLogFileReadOk,
    spLogFileSaveStart,
    spLogFileSaveResponse,
} from '../utils/spAppLog';

export const DEFAULT_WIDGETS_CONFIG = {
    activeWidgets: [...DEFAULT_ACTIVE_WIDGETS],
    rotationInterval: 8,
    widgetSettings: mergeWidgetSettings(),
    outstanding: [],
    countdown: {
        title: '',
        targetDate: '',
    },
    news: [],
    phonebook: [],
    shuttles: [
        { id: '1', destination: 'תחנת רכבת באר שבע', departureTime: '17:30', type: 'bus' },
        { id: '2', destination: 'עיר הבה"דים (שאטל פנימי)', departureTime: '08:00', type: 'minibus' },
    ],
    polls: [
        {
            id: '3',
            question: 'מה הכי מחזק תחושת אחריות אישית ביחידה?',
            options: [
                { id: 'o5', text: 'הובלת משימות עצמאית', votes: 55 },
                { id: 'o6', text: 'משוב אישי מהמפקדים', votes: 33 },
            ],
            active: false,
        },
        {
            id: '4',
            question: 'איזה כלי הכי חסר לנו היום לשיפור ביצועים?',
            options: [
                { id: 'o7', text: 'תחקירים מסודרים אחרי פעילות', votes: 28 },
                { id: 'o8', text: 'הגדרת יעדים ברורה לכל חייל', votes: 61 },
            ],
            active: false,
        },
        {
            id: '5',
            question: 'מהו הגורם המרכזי לשחיקה בתקופה האחרונה?',
            options: [
                { id: 'o9', text: 'עומס משימות', votes: 70 },
                { id: 'o10', text: 'חוסר בהירות בדרישות', votes: 26 },
            ],
            active: false,
        },
    ],
    celebrations: [
        { id: '1', name: 'סמל ישראל מנחם', type: 'שחרור', date: '2026-08-01', description: 'משתחרר אחרי שירות משמעותי, בהצלחה באזרחות!' },
        { id: '2', name: 'רב"ט דוד כהן', type: 'דרגה', date: '2026-03-20', description: 'מזל טוב על קבלת סמל!' },
    ],
    heritage: [
        { id: '1', quote: 'מפקדים ולוחמים, אנו ניצבים בחזית העשייה המבצעית...', author: 'שם מפקד היחידה', role: "סא\"ל א'" },
        { id: '2', quote: 'אין לנו ארץ אחרת, גם אם אדמתי בוערת.', author: 'אהוד מנור', role: 'משורר' },
    ],
    tips: [
        { id: '1', title: 'קיצור מקלדת שימושי', text: 'לחיצה על Windows + V תפתח לכם את היסטוריית ההעתקות שלכם. שימושי מאוד למפתחים ופקידים!' },
        { id: '2', title: 'פקודת מטכ"ל - דיגום', text: 'תזכורת: נעלי הרים מאושרות לנוע אך ורק עם אישור רפואי או תעודת לוחם בתוקף.' },
    ],
};

export const createDefaultWidgetConfig = () => JSON.parse(JSON.stringify(DEFAULT_WIDGETS_CONFIG));

class WidgetService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        spLog.system(`WidgetService — מצב ${this.useMock ? 'MOCK' : 'PRODUCTION'}`);
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
            return createDefaultWidgetConfig();
        }
    }

    _normalizeData(data) {
        if (!data) return createDefaultWidgetConfig();
        const activeWidgets = Array.isArray(data.activeWidgets) && data.activeWidgets.length > 0
            ? data.activeWidgets
            : (data.activeWidget ? [data.activeWidget] : [...DEFAULT_WIDGETS_CONFIG.activeWidgets]);
        const normalizedActiveWidgets = Array.from(new Set(activeWidgets.filter(Boolean))).slice(0, 3);
        const resolvedActiveWidgets = normalizedActiveWidgets.length > 0
            ? normalizedActiveWidgets
            : [...DEFAULT_WIDGETS_CONFIG.activeWidgets];
        const rotationInterval = Number.isFinite(Number(data.rotationInterval))
            ? Math.max(3, Math.min(30, Number(data.rotationInterval)))
            : DEFAULT_WIDGETS_CONFIG.rotationInterval;

        return {
            activeWidgets: resolvedActiveWidgets,
            activeWidget: resolvedActiveWidgets[0],
            rotationInterval,
            widgetSettings: mergeWidgetSettings(data.widgetSettings || {}),
            outstanding: Array.isArray(data.outstanding) ? data.outstanding : [],
            countdown: data.countdown && typeof data.countdown === 'object'
                ? { title: data.countdown.title || '', targetDate: data.countdown.targetDate || '' }
                : { title: '', targetDate: '' },
            news: Array.isArray(data.news) ? data.news : [],
            phonebook: Array.isArray(data.phonebook) ? data.phonebook : [],
            shuttles: Array.isArray(data.shuttles) ? data.shuttles : createDefaultWidgetConfig().shuttles,
            polls: Array.isArray(data.polls) ? data.polls : createDefaultWidgetConfig().polls,
            celebrations: Array.isArray(data.celebrations) ? data.celebrations : createDefaultWidgetConfig().celebrations,
            heritage: Array.isArray(data.heritage) ? data.heritage : createDefaultWidgetConfig().heritage,
            tips: Array.isArray(data.tips) ? data.tips : createDefaultWidgetConfig().tips,
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
            this._saveMockData(createDefaultWidgetConfig());
            return Promise.resolve(createDefaultWidgetConfig());
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
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען הגדרות ווידגטים מ-SharePoint...');
            spLogFileReadStart('ווידגטים', fileUrl);

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLogFileReadResponse(fileUrl, response);

            if (!response.ok) {
                if (response.status === 404) {
                    spLog.warn('קובץ ווידגטים לא נמצא — ברירות מחדל');
                    return createDefaultWidgetConfig();
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const data = JSON.parse(text);
            spLogFileReadOk(fileUrl, 'הגדרות ווידגטים נטענו');
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת הגדרות ווידגטים מ-SharePoint:', error);
            throw new Error('שגיאה בקריאת הגדרות ווידגטים מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const formDigestValue = await getRequestDigest();
            const fileUrl = this.config.widgetsFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLogFileSaveStart('ווידגטים', fileUrl);

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

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            spLog.scan('מאמת שמירת ווידגטים...');
            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLog.file(`אימות ווידגטים | status: ${verifyResponse.status}`);

            if (!verifyResponse.ok) {
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            spLog.success('הגדרות ווידגטים נשמרו ואומתו בהצלחה');
            return payload;
        } catch (error) {
            spLog.error('שגיאה בשמירת הגדרות ווידגטים ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת הגדרות ווידגטים ל-SharePoint: ' + error.message);
        }
    }
}

export default new WidgetService();
