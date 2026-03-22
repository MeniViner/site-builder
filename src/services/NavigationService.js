import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, getRequestDigest } from '../utils/sharepointUtils';
import {
    spLog,
    spLogFileReadStart,
    spLogFileReadResponse,
    spLogFileReadOk,
    spLogFileSaveStart,
    spLogFileSaveResponse,
} from '../utils/spAppLog';

class NavigationService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        spLog.system(`NavigationService — מצב ${this.useMock ? 'MOCK' : 'PRODUCTION'}`);
    }

    async getNavigation() {
        if (this.useMock) {
            return this._getMockData();
        } else {
            return this._getSharePointData();
        }
    }

    async saveNavigation(navData) {
        if (this.useMock) {
            return this._saveMockData(navData);
        } else {
            return this._saveSharePointData(navData);
        }
    }

    // ==========================================
    // MOCK MODE (localStorage) Implementation
    // ==========================================

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.navMockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }

            // Seed the initial data if localStorage is empty
            const seedData = [
                {
                    id: 'training',
                    label: 'הכשרות',
                    icon: 'Rocket',
                    url: '',
                    children: [
                        {
                            id: 'kakatz',
                            title: 'קק"צ',
                            icon: 'GraduationCap',
                            url: '',
                            subLinks: [
                                { label: 'חניכי הקורס', icon: 'Users', url: '' },
                                { label: 'גאנט הקורס', icon: 'Calendar', url: '' },
                                { label: 'אימונים', icon: 'Target', url: '' },
                                { label: 'תיקי סדרה', icon: 'FileText', url: '' },
                                { label: 'סגל', icon: 'User', url: '' }
                            ]
                        },
                        {
                            id: 'mekadadim',
                            title: 'קורס מפקדים',
                            icon: 'Users',
                            url: '',
                            subLinks: [
                                { label: 'חניכי הקורס', icon: 'Users', url: '' },
                                { label: 'גאנט הקורס', icon: 'Calendar', url: '' },
                                { label: 'אימונים', icon: 'Target', url: '' },
                                { label: 'תיקי סדרה', icon: 'FileText', url: '' },
                                { label: 'סגל', icon: 'User', url: '' }
                            ]
                        },
                        {
                            id: 'kamas',
                            title: 'קמ"ס',
                            icon: 'Target',
                            url: '',
                            subLinks: [
                                { label: 'חניכי הקורס', icon: 'Users', url: '' },
                                { label: 'גאנט הקורס', icon: 'Calendar', url: '' },
                                { label: 'אימונים', icon: 'Target', url: '' },
                                { label: 'תיקי סדרה', icon: 'FileText', url: '' },
                                { label: 'סגל', icon: 'User', url: '' }
                            ]
                        },
                        {
                            id: 'shalit',
                            title: 'שליט/בקרים',
                            icon: 'Map',
                            url: '',
                            subLinks: [
                                { label: 'חניכי הקורס', icon: 'Users', url: '' },
                                { label: 'גאנט הקורס', icon: 'Calendar', url: '' },
                                { label: 'אימונים', icon: 'Target', url: '' },
                                { label: 'תיקי סדרה', icon: 'FileText', url: '' },
                                { label: 'סגל', icon: 'User', url: '' }
                            ]
                        },
                        {
                            id: 'lohamim',
                            title: 'מסלול לוחם',
                            icon: 'Crosshair',
                            url: '',
                            subLinks: [
                                { label: 'חניכי הקורס', icon: 'Users', url: '' },
                                { label: 'גאנט הקורס', icon: 'Calendar', url: '' },
                                { label: 'אימונים', icon: 'Target', url: '' },
                                { label: 'תיקי סדרה', icon: 'FileText', url: '' },
                                { label: 'סגל', icon: 'User', url: '' }
                            ]
                        }
                    ]
                },
                {
                    id: 'operations',
                    label: 'אג"ם',
                    icon: 'Crosshair',
                    url: '',
                    children: [
                        {
                            id: 'reports',
                            title: 'דו"חות מבצעיים',
                            icon: 'FileText',
                            url: '',
                            subLinks: [
                                { label: 'דו"חות', icon: 'FileText', url: '' },
                                { label: 'תרגילים', icon: 'Target', url: '' },
                                { label: 'נהלים', icon: 'Briefcase', url: '' }
                            ]
                        },
                        {
                            id: 'drills',
                            title: 'תרגילים',
                            icon: 'Target',
                            url: '',
                            subLinks: [
                                { label: 'דו"חות', icon: 'FileText', url: '' },
                                { label: 'תרגילים', icon: 'Target', url: '' },
                                { label: 'נהלים', icon: 'Briefcase', url: '' }
                            ]
                        },
                        {
                            id: 'procedures',
                            title: 'נהלים ופקודות',
                            icon: 'Briefcase',
                            url: '',
                            subLinks: [
                                { label: 'דו"חות', icon: 'FileText', url: '' },
                                { label: 'תרגילים', icon: 'Target', url: '' },
                                { label: 'נהלים', icon: 'Briefcase', url: '' }
                            ]
                        }
                    ]
                },
                {
                    id: 'hq',
                    label: 'מפקדה',
                    icon: 'Users',
                    url: '',
                    children: [
                        {
                            id: 'hr',
                            title: 'שלישות ומשאבי אנוש',
                            icon: 'Users',
                            url: '',
                            subLinks: [
                                { label: 'שלישות', icon: 'Users', url: '' },
                                { label: 'לוגיסטיקה', icon: 'Briefcase', url: '' },
                            ]
                        },
                        {
                            id: 'logistics',
                            title: 'לוגיסטיקה',
                            icon: 'Briefcase',
                            url: '',
                            subLinks: [
                                { label: 'שלישות', icon: 'Users', url: '' },
                                { label: 'לוגיסטיקה', icon: 'Briefcase', url: '' },
                            ]
                        }
                    ]
                },
                { id: 'unit_graph', label: 'גרף יחידה', icon: 'BarChart', url: '', children: [] },
                { id: 'basic_files', label: 'תיקי יסוד', icon: 'Briefcase', url: '', children: [] },
                { id: 'gallery', label: 'גלריית יחידה', icon: 'Camera', url: '', children: [] },
                { id: 'safety', label: 'בטיחות', icon: 'AlertTriangle', url: '', children: [] }
            ];

            // Save the seed to populate localStorage for next time
            this._saveMockData(seedData);
            return Promise.resolve(seedData);

        } catch (error) {
            console.error('Error reading mock navigation:', error);
            throw new Error('שגיאה בקריאת נתוני הניווט מהזיכרון המקומי');
        }
    }

    _saveMockData(navData) {
        try {
            localStorage.setItem(this.config.navMockStorageKey, JSON.stringify(navData));
            return Promise.resolve(navData);
        } catch (error) {
            console.error('Error saving mock navigation:', error);
            throw new Error('שגיאה בשמירת נתוני הניווט לזיכרון המקומי');
        }
    }

    // ==========================================
    // PRODUCTION MODE (SharePoint) Implementation
    // ==========================================

    async _getSharePointData() {
        try {
            const fileUrl = this.config.navFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען ניווט (Navigation) מ-SharePoint...');
            spLogFileReadStart('ניווט', fileUrl);

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
                    spLog.warn('קובץ ניווט לא נמצא — מערך ריק');
                    return [];
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const data = JSON.parse(text);
            const n = Array.isArray(data) ? data.length : 0;
            spLogFileReadOk(fileUrl, `פריטי שורש: ${n}`);
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת ניווט מ-SharePoint:', error);
            throw new Error('שגיאה בקריאת הניווט מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(navData) {
        try {
            // Step 1: Get security token (Form Digest) with caching
            const formDigestValue = await getRequestDigest();

            // Step 2: Save the file
            const fileUrl = this.config.navFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLogFileSaveStart('ניווט', fileUrl);

            const saveResponse = await fetch(endpoint, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'X-RequestDigest': formDigestValue,
                    'X-HTTP-Method': 'PUT', // Override POST to PUT
                    'IF-MATCH': '*', // Overwrite existing file
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(navData)
            });

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            spLog.scan('מאמת שמירת ניווט...');

            // Step 3: Verify the save by reading it back
            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json;odata=verbose',
                }
            });

            spLog.file(`אימות ניווט | status: ${verifyResponse.status}`);

            if (!verifyResponse.ok) {
                spLog.error(`אימות ניווט נכשל: ${verifyResponse.status}`);
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            spLog.success('ניווט נשמר ואומת בהצלחה');
            return navData;
        } catch (error) {
            spLog.error('שגיאה בשמירת ניווט ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת ניווט ל-SharePoint: ' + error.message);
        }
    }
}

export default new NavigationService();
