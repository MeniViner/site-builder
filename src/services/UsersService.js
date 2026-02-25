import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { getRequestDigest } from '../utils/sharepointUtils';

class UsersService {
    constructor() {
        this.config = SHAREPOINT_CONFIG;
        this.useMock = this.config.useMock;
        console.log(`UsersService initialized in ${this.useMock ? 'MOCK' : 'PRODUCTION'} mode`);
    }

    async getUsers() {
        if (this.useMock) {
            return this._getMockData();
        } else {
            return this._getSharePointData();
        }
    }

    async saveUsers(usersData) {
        if (this.useMock) {
            return this._saveMockData(usersData);
        } else {
            return this._saveSharePointData(usersData);
        }
    }

    // ==========================================
    // MOCK MODE (localStorage) Implementation
    // ==========================================

    _getMockData() {
        try {
            const stored = localStorage.getItem(this.config.usersMockStorageKey);
            if (stored) {
                return Promise.resolve(JSON.parse(stored));
            }

            // Default mock users if empty
            const defaultUsers = [
                { id: 1, name: 'מני', role: 'admin' },
                { id: 2, name: 'Admin', role: 'admin' },
                { id: 3, name: 'מנהל', role: 'admin' }
            ];

            this._saveMockData(defaultUsers);
            return Promise.resolve(defaultUsers);
        } catch (error) {
            console.error('Error reading mock users:', error);
            throw new Error('שגיאה בקריאת נתוני משתמשים מהזיכרון המקומי');
        }
    }

    _saveMockData(usersData) {
        try {
            localStorage.setItem(this.config.usersMockStorageKey, JSON.stringify(usersData));
            return Promise.resolve(usersData);
        } catch (error) {
            console.error('Error saving mock users:', error);
            throw new Error('שגיאה בשמירת נתוני משתמשים לזיכרון המקומי');
        }
    }

    // ==========================================
    // PRODUCTION MODE (SharePoint) Implementation
    // ==========================================

    async _getSharePointData() {
        try {
            const fileUrl = this.config.usersFileServerRelativeUrl;
            const endpoint = `/_api/web/GetFileByServerRelativeUrl('${fileUrl}')/$value`;

            const response = await fetch(endpoint, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json;odata=verbose',
                }
            });

            if (!response.ok) {
                if (response.status === 404) {
                    console.log('SharePoint users file not found, creating default admins');
                    const defaultUsers = [
                        { id: 1, name: 'מני', role: 'admin' },
                        { id: 2, name: 'Admin', role: 'admin' },
                        { id: 3, name: 'מנהל', role: 'admin' }
                    ];
                    // We don't await the save here to not block the read, but we initiate it
                    this._saveSharePointData(defaultUsers).catch(console.error);
                    return defaultUsers;
                }
                throw new Error(`SharePoint request failed: ${response.status} ${response.statusText}`);
            }

            const text = await response.text();
            if (!text.trim()) return [];
            return JSON.parse(text);
        } catch (error) {
            console.error('Error reading SharePoint users:', error);
            // Fallback gracefully so app doesn't break
            return [
                { id: 1, name: 'מני', role: 'admin' },
                { id: 2, name: 'Admin', role: 'admin' },
                { id: 3, name: 'מנהל', role: 'admin' }
            ];
        }
    }

    async _saveSharePointData(usersData) {
        try {
            const formDigestValue = await getRequestDigest();

            const fileUrl = this.config.usersFileServerRelativeUrl;
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
                body: JSON.stringify(usersData)
            });

            if (!saveResponse.ok) {
                throw new Error(`SharePoint save failed: ${saveResponse.status} ${saveResponse.statusText}`);
            }

            console.log('Users saved to SharePoint successfully');
            return usersData;
        } catch (error) {
            console.error('Error saving SharePoint users:', error);
            throw new Error('שגיאה בשמירת משתמשים ל-SharePoint: ' + error.message);
        }
    }
}

export default new UsersService();
