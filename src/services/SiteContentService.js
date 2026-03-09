import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { getRequestDigest } from '../utils/sharepointUtils';

const DEFAULT_SITE_CONTENT = {
    hero: {
        siteName: 'שם האתר',
        title: 'בית הספר לחמ"ם \n 7134',
        subtitle: 'ברוכים הבאים',
        description: 'מרכז ההכשרות המוביל בצה"ל למקצועות החמ"ם.\nאנו אמונים על רצף ההכשרה, פיתוח מקצועי מתמיד ושמירה על כשירות עליונה בתחום המערכות המתקדמות.',
        backgroundImages: [
            '/images/לח1.jpeg',
            '/images/לח2.jpeg',
            '/images/לח3.jpg',
            '/images/לח4.webp',
            '/images/לח5.jpeg',
            '/images/לח7.jpg'
        ]
    },
    commander: {
        image: '/images/אייל זמיר.png',
        sectionTitle: 'דבר המפקד',
        roleLabel: 'מפקד היחידה',
        decorativeElement: 'line-diamond-line',
        messages: [
            {
                id: '1',
                text: '"מפקדים ולוחמים, אנו ניצבים בחזית העשייה המבצעית. מצופה מכם לחתור למצוינות, להפגין מקצועיות חסרת פשרות, ולהוביל את העשייה בכל משימה אליה נדרש. יחד ננצח."',
                signature: 'סא"ל א\', מפקד בית הספר'
            }
        ]
    }
};

class SiteContentService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        console.log(`SiteContentService initialized in ${this.useMock ? 'MOCK' : 'PRODUCTION'} mode`);
    }

    async getSiteContent() {
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
            return { ...DEFAULT_SITE_CONTENT };
        }
    }

    _normalizeData(data) {
        if (!data) return { ...DEFAULT_SITE_CONTENT };

        const hero = data.hero || DEFAULT_SITE_CONTENT.hero;
        const commander = data.commander || DEFAULT_SITE_CONTENT.commander;

        if (hero && !hero.siteName) hero.siteName = DEFAULT_SITE_CONTENT.hero.siteName;
        if (!hero.backgroundImages || !hero.backgroundImages.length) {
            hero.backgroundImages = DEFAULT_SITE_CONTENT.hero.backgroundImages;
        }
        if (!commander.messages || !commander.messages.length) {
            commander.messages = DEFAULT_SITE_CONTENT.commander.messages;
        }
        if (!commander.decorativeElement) {
            commander.decorativeElement = DEFAULT_SITE_CONTENT.commander.decorativeElement || 'line-diamond-line';
        }

        return { hero, commander };
    }

    async saveSiteContent(payload) {
        const isDev = import.meta.env.DEV;
        if (this.useMock) {
            const result = await this._saveMockData(payload);
            return result;
        }
        const result = await this._saveSharePointData(payload);
        if (isDev) {
            try {
                await this._saveMockData(payload);
            } catch (e) {
                console.warn('Dev: could not persist site content to localStorage', e);
            }
        }
        return result;
    }

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.siteContentMockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }
            this._saveMockData(DEFAULT_SITE_CONTENT);
            return Promise.resolve({ ...DEFAULT_SITE_CONTENT });
        } catch (error) {
            console.error('Error reading mock site content:', error);
            throw new Error('שגיאה בקריאת תוכן האתר מהזיכרון המקומי');
        }
    }

    _saveMockData(payload) {
        try {
            localStorage.setItem(this.config.siteContentMockStorageKey, JSON.stringify(payload));
            return Promise.resolve(payload);
        } catch (error) {
            console.error('Error saving mock site content:', error);
            throw new Error('שגיאה בשמירת תוכן האתר לזיכרון המקומי');
        }
    }

    async _getSharePointData() {
        try {
            const fileUrl = this.config.siteContentFileServerRelativeUrl;
            const endpoint = `/_api/web/GetFileByServerRelativeUrl('${fileUrl}')/$value`;

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('SharePoint site content file not found, returning defaults');
                    return { ...DEFAULT_SITE_CONTENT };
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            return JSON.parse(text);
        } catch (error) {
            console.error('Error reading SharePoint site content:', error);
            throw new Error('שגיאה בקריאת תוכן האתר מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const formDigestValue = await getRequestDigest();
            const fileUrl = this.config.siteContentFileServerRelativeUrl;
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

            console.log('Site content saved and verified successfully');
            return payload;
        } catch (error) {
            console.error('Error saving SharePoint site content:', error);
            throw new Error('שגיאה בשמירת תוכן האתר ל-SharePoint: ' + error.message);
        }
    }
}

export default new SiteContentService();
