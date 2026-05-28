import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { DEFAULT_OVERLAY_IMAGE, normalizeOverlayImageConfig } from '../utils/overlayImageConfig';
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

const DEFAULT_SITE_CONTENT = {
    hero: {
        siteName: 'שם האתר',
        title: 'מתנ"ה \n בונה האתרים',
        subtitle: 'ברוכים הבאים',
        logo: '/images/gift.svg',
        description: 'מערכת תבניות לניהול הידע',
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
        roleLabel: 'שם מפקד היחידה',
        decorativeElement: 'line-diamond-line',
        messages: [
            {
                id: '1',
                text: '"מפקדים ולוחמים, אנו ניצבים בחזית העשייה המבצעית. מצופה מכם לחתור למצוינות, להפגין מקצועיות חסרת פשרות, ולהוביל את העשייה בכל משימה אליה נדרש. יחד ננצח."',
                signature: 'סא"ל א\', מפקד בית הספר'
            }
        ]
    },
    overlayImage: { ...DEFAULT_OVERLAY_IMAGE },
};

class SiteContentService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMongo = isMongoStorageBackend();
        this.useMock = !this.useMongo && this.config.useMock;
        this.mongoAdapter = createLegacyObjectStorageAdapter({ key: this.config.siteContentFileServerRelativeUrl });
        spLog.system(`SiteContentService — מצב ${this.useMongo ? 'MONGO' : (this.useMock ? 'MOCK' : 'PRODUCTION')}`);
    }

    async getSiteContent() {
        try {
            let data;
            if (this.useMongo) {
                data = await this.mongoAdapter.load();
            } else if (this.useMock) {
                data = await this._getMockData();
            } else {
                data = await this._getSharePointData();
            }
            return this._normalizeData(data);
        } catch (e) {
            spLog.error('SiteContentService: failed to load site content.', e);
            if (this.useMongo) throw e;
            return { ...DEFAULT_SITE_CONTENT };
        }
    }

    _normalizeData(data) {
        if (!data) return { ...DEFAULT_SITE_CONTENT };

        const hero = data.hero || DEFAULT_SITE_CONTENT.hero;
        const commander = data.commander || DEFAULT_SITE_CONTENT.commander;

        if (hero && !hero.siteName) hero.siteName = DEFAULT_SITE_CONTENT.hero.siteName;
        if (hero && !hero.logo) hero.logo = DEFAULT_SITE_CONTENT.hero.logo;
        if (!hero.backgroundImages || !hero.backgroundImages.length) {
            hero.backgroundImages = DEFAULT_SITE_CONTENT.hero.backgroundImages;
        }
        if (!commander.messages || !commander.messages.length) {
            commander.messages = DEFAULT_SITE_CONTENT.commander.messages;
        }
        if (!commander.decorativeElement) {
            commander.decorativeElement = DEFAULT_SITE_CONTENT.commander.decorativeElement || 'line-diamond-line';
        }

        const overlayImage = normalizeOverlayImageConfig(data.overlayImage);

        return { hero, commander, overlayImage };
    }

    async saveSiteContent(payload) {
        const isDev = import.meta.env.DEV;
        if (this.useMongo) {
            return this.mongoAdapter.save(payload);
        }
        if (this.useMock) {
            const result = await this._saveMockData(payload);
            return result;
        }
        if (isSharePointReadonlyBackend()) {
            throw new Error('SharePoint TXT storage is read-only. Save site content through the Mongo backend.');
        }
        const result = await this._saveSharePointData(payload);
        if (isDev) {
            try {
                await this._saveMockData(payload);
            } catch (e) {
                spLog.warn('Dev: could not persist site content to localStorage', e);
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
            spLog.error('Error reading mock site content:', error);
            throw new Error('שגיאה בקריאת תוכן האתר מהזיכרון המקומי');
        }
    }

    _saveMockData(payload) {
        try {
            localStorage.setItem(this.config.siteContentMockStorageKey, JSON.stringify(payload));
            return Promise.resolve(payload);
        } catch (error) {
            spLog.error('Error saving mock site content:', error);
            throw new Error('שגיאה בשמירת תוכן האתר לזיכרון המקומי');
        }
    }

    async _getSharePointData() {
        try {
            const fileUrl = this.config.siteContentFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען תוכן אתר (SiteContent) מ-SharePoint...');
            spLogFileReadStart('תוכן אתר', fileUrl);

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLogFileReadResponse(fileUrl, response);

            if (!response.ok) {
                if (response.status === 404) {
                    spLog.warn('קובץ תוכן אתר לא נמצא — ברירות מחדל');
                    return { ...DEFAULT_SITE_CONTENT };
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const data = JSON.parse(text);
            spLogFileReadOk(fileUrl, 'תוכן אתר נטען');
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת תוכן אתר מ-SharePoint:', error);
            throw new Error('שגיאה בקריאת תוכן האתר מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const fileUrl = this.config.siteContentFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLogFileSaveStart('תוכן אתר', fileUrl);

            const { response: saveResponse } = await upsertSharePointTextFile({
                serverRelativeUrl: fileUrl,
                text: JSON.stringify(payload, null, 2),
                contentType: 'text/plain; charset=utf-8',
            });

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            spLog.scan('מאמת שמירת תוכן אתר...');
            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLog.file(`אימות תוכן אתר | status: ${verifyResponse.status}`);

            if (!verifyResponse.ok) {
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            spLog.success('תוכן אתר נשמר ואומת בהצלחה');
            return payload;
        } catch (error) {
            spLog.error('שגיאה בשמירת תוכן אתר ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת תוכן האתר ל-SharePoint: ' + error.message);
        }
    }
}

export default new SiteContentService();
