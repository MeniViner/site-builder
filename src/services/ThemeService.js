import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { getRequestDigest } from '../utils/sharepointUtils';

const DEFAULT_THEME = {
    primaryColor: '#dc2626',
    displayMode: 'dark',
    borderStyle: 'tactical-1',
    linksLayout: 'cards',
    showNavCategories: true,
    heroGrayscale: false,
};

class ThemeService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        console.log(`ThemeService initialized in ${this.useMock ? 'MOCK' : 'PRODUCTION'} mode`);
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
        return {
            primaryColor: data.primaryColor || DEFAULT_THEME.primaryColor,
            displayMode: data.displayMode || DEFAULT_THEME.displayMode,
            borderStyle: data.borderStyle || DEFAULT_THEME.borderStyle,
            linksLayout: data.linksLayout || DEFAULT_THEME.linksLayout,
            showNavCategories: data.showNavCategories !== undefined ? data.showNavCategories : DEFAULT_THEME.showNavCategories,
            heroGrayscale: data.heroGrayscale !== undefined ? data.heroGrayscale : DEFAULT_THEME.heroGrayscale,
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
            const endpoint = `/_api/web/GetFileByServerRelativeUrl('${fileUrl}')/$value`;

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: { 'Accept': 'application/json;odata=verbose' }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('SharePoint theme file not found, returning defaults');
                    return { ...DEFAULT_THEME };
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            return JSON.parse(text);
        } catch (error) {
            console.error('Error reading SharePoint theme:', error);
            throw new Error('שגיאה בקריאת הגדרות עיצוב מ-SharePoint: ' + error.message);
        }
    }

    async _saveSharePointData(payload) {
        try {
            const formDigestValue = await getRequestDigest();
            const fileUrl = this.config.themeFileServerRelativeUrl;
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

            console.log('Theme saved and verified successfully');
            return payload;
        } catch (error) {
            console.error('Error saving SharePoint theme:', error);
            throw new Error('שגיאה בשמירת הגדרות עיצוב ל-SharePoint: ' + error.message);
        }
    }
}

export default new ThemeService();
