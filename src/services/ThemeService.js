import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { normalizeBorderStyle } from '../utils/borderStyles';
import {
    spLog,
    spLogFileReadStart,
    spLogFileReadResponse,
    spLogFileReadOk,
    spLogFileSaveStart,
    spLogFileSaveResponse,
} from '../utils/spAppLog';

const DEFAULT_THEME = {
    primaryColor: '#0891b2',
    useTintedBackground: true,
    tintedBackgroundStrength: 72,
    displayMode: 'user-toggle',
    borderStyle: 'cyber',
    linksLayout: 'cards',
    showNavCategories: false,
    heroGrayscale: false,
    regularLinksLayout: 'sidebar-right',
    externalLinksLayout: 'cards',
    externalLinksFixed: false,
    externalLinksBordered: true,
    externalLinksShowBackground: true,
    widgetHeight: 'full',
};

const WIDGET_HEIGHT_OPTIONS = ['full', 'high', 'medium', 'low'];

class ThemeService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        spLog.system(`ThemeService — מצב ${this.useMock ? 'MOCK' : 'PRODUCTION'}`);
    }

    async getTheme() {
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
            return { ...DEFAULT_THEME };
        }
    }

    _normalizeData(data) {
        if (!data) return { ...DEFAULT_THEME };
        const widgetHeight = WIDGET_HEIGHT_OPTIONS.includes(data.widgetHeight)
            ? data.widgetHeight
            : DEFAULT_THEME.widgetHeight;
        const useTintedBackground = data.useTintedBackground !== undefined
            ? data.useTintedBackground
            : (data.colorPackage !== undefined
                ? data.colorPackage !== 'classic'
                : DEFAULT_THEME.useTintedBackground);
        const tintStrengthNumber = Number(data.tintedBackgroundStrength);
        const tintedBackgroundStrength = Number.isFinite(tintStrengthNumber)
            ? Math.min(100, Math.max(0, Math.round(tintStrengthNumber)))
            : DEFAULT_THEME.tintedBackgroundStrength;
        const externalLinksBordered = data.externalLinksBordered !== undefined
            ? data.externalLinksBordered
            : (data.externalLinksBordeprimary !== undefined
                ? data.externalLinksBordeprimary
                : DEFAULT_THEME.externalLinksBordered);

        return {
            primaryColor: data.primaryColor || DEFAULT_THEME.primaryColor,
            useTintedBackground,
            tintedBackgroundStrength,
            displayMode: data.displayMode || DEFAULT_THEME.displayMode,
            borderStyle: normalizeBorderStyle(data.borderStyle || DEFAULT_THEME.borderStyle),
            linksLayout: data.linksLayout || DEFAULT_THEME.linksLayout,
            showNavCategories: data.showNavCategories !== undefined ? data.showNavCategories : DEFAULT_THEME.showNavCategories,
            heroGrayscale: data.heroGrayscale !== undefined ? data.heroGrayscale : DEFAULT_THEME.heroGrayscale,
            regularLinksLayout: data.regularLinksLayout || DEFAULT_THEME.regularLinksLayout,
            externalLinksLayout: data.externalLinksLayout || DEFAULT_THEME.externalLinksLayout,
            externalLinksFixed: data.externalLinksFixed !== undefined ? data.externalLinksFixed : DEFAULT_THEME.externalLinksFixed,
            externalLinksBordered,
            externalLinksShowBackground: data.externalLinksShowBackground !== undefined ? data.externalLinksShowBackground : DEFAULT_THEME.externalLinksShowBackground,
            widgetHeight,
        };
    }

    async saveTheme(payload) {
        if (this.useMock) {
            return this._saveMockData(payload);
        } else {
            return this._saveSharePointData(payload);
        }
    }

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.themeMockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }
            this._saveMockData(DEFAULT_THEME);
            return Promise.resolve({ ...DEFAULT_THEME });
        } catch (error) {
            console.error('Error reading mock theme:', error);
            throw new Error('שגיאה בקריאת הגדרות עיצוב מהזיכרון המקומי');
        }
    }

    _saveMockData(payload) {
        try {
            localStorage.setItem(this.config.themeMockStorageKey, JSON.stringify(payload));
            return Promise.resolve(payload);
        } catch (error) {
            console.error('Error saving mock theme:', error);
            throw new Error('שגיאה בשמירת הגדרות עיצוב לזיכרון המקומי');
        }
    }

    async _getSharePointData() {
        try {
            const fileUrl = this.config.themeFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען הגדרות עיצוב (Theme) מ-SharePoint...');
            spLogFileReadStart('עיצוב', fileUrl);

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLogFileReadResponse(fileUrl, response);

            if (!response.ok) {
                if (response.status === 404) {
                    spLog.warn('קובץ עיצוב לא נמצא — ברירות מחדל');
                    return { ...DEFAULT_THEME };
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            const data = JSON.parse(text);
            spLogFileReadOk(fileUrl, 'נתוני עיצוב נטענו');
            return data;
        } catch (error) {
            spLog.error('שגיאה בקריאת עיצוב מ-SharePoint:', error);
            throw new Error('שגיאה בקריאת הגדרות עיצוב מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const fileUrl = this.config.themeFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLogFileSaveStart('עיצוב', fileUrl);

            const { response: saveResponse } = await upsertSharePointTextFile({
                serverRelativeUrl: fileUrl,
                text: JSON.stringify(payload, null, 2),
                contentType: 'text/plain; charset=utf-8',
            });

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            spLog.scan('מאמת שמירת עיצוב בקריאה חוזרת...');
            const verifyResponse = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            spLog.file(`אימות עיצוב אחרי שמירה | status: ${verifyResponse.status}`);

            if (!verifyResponse.ok) {
                throw new Error('השמירה בוצעה אך האימות נכשל. ייתכן שהנתונים לא נשמרו כראוי.');
            }

            spLog.success('עיצוב נשמר ואומת בהצלחה');
            return payload;
        } catch (error) {
            spLog.error('שגיאה בשמירת עיצוב ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת הגדרות עיצוב ל-SharePoint: ' + error.message);
        }
    }
}

export default new ThemeService();
