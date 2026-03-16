import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { getRequestDigest } from '../utils/sharepointUtils';
import { mergeWidgetSettings } from '../utils/widgetDisplay';

export const DEFAULT_WIDGETS_CONFIG = {
    activeWidget: 'events',
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
            id: '1',
            question: 'איזה שיר תרצו שיושמע במסדר הבוקר?',
            options: [
                { id: 'o1', text: 'טונה - גם זה יעבור', votes: 45 },
                { id: 'o2', text: 'רביד פלוטניק - כפרה שלי', votes: 82 },
            ],
            active: true,
        },
        {
            id: '2',
            question: 'היכן כדאי לקיים את יום הגיבוש המחלקתי?',
            options: [
                { id: 'o3', text: 'פארק הירקון', votes: 12 },
                { id: 'o4', text: 'חוף הים - פלמחים', votes: 30 },
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
            return createDefaultWidgetConfig();
        }
    }

    _normalizeData(data) {
        if (!data) return createDefaultWidgetConfig();
        return {
            activeWidget: data.activeWidget || DEFAULT_WIDGETS_CONFIG.activeWidget,
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
            const endpoint = `/_api/web/GetFileByServerRelativeUrl('${fileUrl}')/$value`;

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('SharePoint widgets config file not found, returning defaults');
                    return createDefaultWidgetConfig();
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
