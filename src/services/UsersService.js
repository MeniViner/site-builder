import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { cloneDefaultSampleAdminUsers } from '../config/defaultUsers';
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
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

class UsersService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMongo = isMongoStorageBackend();
        this.useMock = !this.useMongo && this.config.useMock;
        this.mongoAdapter = createLegacyObjectStorageAdapter({ key: this.config.usersFileServerRelativeUrl });
        spLog.system(`UsersService — מצב ${this.useMongo ? 'MONGO' : (this.useMock ? 'MOCK' : 'PRODUCTION')}`);
    }

    async getUsers() {
        if (this.useMongo) {
            return this._getMongoData();
        }
        if (this.useMock) {
            return this._getMockData();
        } else {
            return this._getSharePointData();
        }
    }

    async saveUsers(usersData) {
        if (this.useMongo) {
            return this._saveMongoData(usersData);
        }
        if (this.useMock) {
            return this._saveMockData(usersData);
        }
        if (isSharePointReadonlyBackend()) {
            throw new Error('SharePoint TXT storage is read-only. Save users through the Mongo backend.');
        }
        return this._saveSharePointData(usersData);
    }

    async _getMongoData() {
        try {
            return await this.mongoAdapter.load();
        } catch (error) {
            spLog.error('שגיאה בקריאת משתמשים מה-Backend Mongo:', error);
            throw error;
        }
    }

    async _saveMongoData(usersData) {
        try {
            return await this.mongoAdapter.save(usersData);
        } catch (error) {
            spLog.error('שגיאה בשמירת משתמשים ל-Backend Mongo:', error);
            throw error;
        }
    }

    // ==========================================
    // MOCK MODE (localStorage) Implementation
    // ==========================================

    _getMockData() {
        try {
            spLog.file('טוען רשימת מנהלים מ-localStorage (מצב mock)...');
            const stored = localStorage.getItem(this.config.usersMockStorageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                spLog.success(`נטענו ${Array.isArray(parsed) ? parsed.length : 0} משתמשי מנהלים (mock)`);
                return Promise.resolve(parsed);
            }

            // Default mock users if empty
            const defaultUsers = cloneDefaultSampleAdminUsers();

            this._saveMockData(defaultUsers);
            return Promise.resolve(defaultUsers);
        } catch (error) {
            spLog.error('Error reading mock users:', error);
            throw new Error('שגיאה בקריאת נתוני משתמשים מהזיכרון המקומי');
        }
    }

    _saveMockData(usersData) {
        try {
            localStorage.setItem(this.config.usersMockStorageKey, JSON.stringify(usersData));
            return Promise.resolve(usersData);
        } catch (error) {
            spLog.error('Error saving mock users:', error);
            throw new Error('שגיאה בשמירת נתוני משתמשים לזיכרון המקומי');
        }
    }

    // ==========================================
    // PRODUCTION MODE (SharePoint) Implementation
    // ==========================================

    async _getSharePointData() {
        try {
            const fileUrl = this.config.usersFileServerRelativeUrl;
            const endpoint = buildFileValueEndpoint(fileUrl);

            spLog.scan('טוען משתמשי מערכת (מנהלים) מ-SharePoint...');
            spLogFileReadStart('משתמשי מערכת', fileUrl);

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
                    spLog.warn('קובץ משתמשים לא נמצא ב-SharePoint — יוצר ברירת מחדל למנהלים');
                    const defaultUsers = cloneDefaultSampleAdminUsers();
                    // We don't await the save here to not block the read, but we initiate it
                    this._saveSharePointData(defaultUsers).catch((e) => spLog.error('שמירת מנהלים ברירת מחדל נכשלה', e));
                    return defaultUsers;
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            if (!text.trim()) {
                spLogFileReadOk(fileUrl, 'קובץ ריק');
                return [];
            }
            const parsed = JSON.parse(text);
            const n = Array.isArray(parsed) ? parsed.length : 0;
            spLogFileReadOk(fileUrl, `פריטים: ${n}`);
            return parsed;
        } catch (error) {
            spLog.error('שגיאה בקריאת משתמשים מ-SharePoint:', error);
            // Fallback gracefully so app doesn't break
            return cloneDefaultSampleAdminUsers();
        }
    }

    async _saveSharePointData(usersData) {
        try {
            const fileUrl = this.config.usersFileServerRelativeUrl;
            spLogFileSaveStart('משתמשי מערכת', fileUrl);

            const { response: saveResponse } = await upsertSharePointTextFile({
                serverRelativeUrl: fileUrl,
                text: JSON.stringify(usersData, null, 2),
                contentType: 'text/plain; charset=utf-8',
            });

            spLogFileSaveResponse(fileUrl, saveResponse);

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            const count = Array.isArray(usersData) ? usersData.length : 0;
            spLog.success(`משתמשים נשמרו ב-SharePoint | פריטים: ${count}`);
            return usersData;
        } catch (error) {
            spLog.error('שגיאה בשמירת משתמשים ל-SharePoint:', error);
            throw new Error('שגיאה בשמירת משתמשים ל-SharePoint: ' + error.message);
        }
    }
}

export default new UsersService();
