// src/services/ConfigAdapter.js
import { buildFileValueEndpoint, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import { spLog, spLogFileReadStart, spLogFileReadResponse, spLogFileSaveStart, spLogFileSaveResponse } from '../utils/spAppLog';

const DEFAULT_MASTER_CONFIG_KEY = 'bihs_master_config_v1';
const DEFAULT_MASTER_CONFIG_FILE_URL = SHAREPOINT_PATHS.masterConfigFileServerRelativeUrl;

const resolveDefaultMasterConfigFileUrl = () => {
    const explicit = import.meta.env.VITE_SP_MASTER_CONFIG_FILE_URL;
    if (explicit && String(explicit).trim()) {
        return explicit;
    }

    const candidates = [
        import.meta.env.VITE_SP_EVENTS_FILE_URL,
        import.meta.env.VITE_SP_NAV_FILE_URL,
        import.meta.env.VITE_SP_USERS_FILE_URL,
        import.meta.env.VITE_SP_SITE_CONTENT_FILE_URL,
        import.meta.env.VITE_SP_THEME_FILE_URL,
        import.meta.env.VITE_SP_WIDGETS_FILE_URL,
        import.meta.env.VITE_SP_EXTERNAL_LINKS_FILE_URL,
        SHAREPOINT_PATHS.eventsFileServerRelativeUrl,
    ].filter((value) => typeof value === 'string' && value.trim().length > 0);

    const seedUrl = candidates[0];
    if (!seedUrl) {
        return DEFAULT_MASTER_CONFIG_FILE_URL;
    }

    const trimmed = seedUrl.trim();
    const slashIndex = trimmed.lastIndexOf('/');
    if (slashIndex <= 0) {
        return DEFAULT_MASTER_CONFIG_FILE_URL;
    }

    return `${trimmed.slice(0, slashIndex)}/bihs_master_config_v1.txt`;
};

class ConfigAdapter {
    constructor(options = {}) {
        this.useMock = import.meta.env.DEV || import.meta.env.MODE === 'development';
        this.mockStorageKey = options.mockStorageKey || import.meta.env.VITE_SP_MASTER_CONFIG_MOCK_KEY || DEFAULT_MASTER_CONFIG_KEY;
        this.fileServerRelativeUrl = options.fileServerRelativeUrl || resolveDefaultMasterConfigFileUrl();
    }

    async load() {
        if (this.useMock) {
            return await this._loadMock();
        }
        return await this._loadSharePoint();
    }

    async save(text) {
        if (typeof text !== 'string') {
            throw new Error('ConfigAdapter.save(text) expects a string payload');
        }

        if (this.useMock) {
            return await this._saveMock(text);
        }
        return await this._saveSharePoint(text);
    }

    async _loadMock() {
        try {
            const value = localStorage.getItem(this.mockStorageKey);
            return { text: value ?? null };
        } catch (error) {
            throw new Error('Failed to load config from localStorage: ' + error.message);
        }
    }

    async _saveMock(text) {
        try {
            localStorage.setItem(this.mockStorageKey, text);
            return { ok: true };
        } catch (error) {
            throw new Error('Failed to save config to localStorage: ' + error.message);
        }
    }

    _buildFileEndpoint() {
        return buildFileValueEndpoint(this.fileServerRelativeUrl);
    }

    async _loadSharePoint() {
        const endpoint = this._buildFileEndpoint();

        spLog.scan('טוען קונפיגורציית מאסטר (AppSchema) מ-SharePoint...');
        spLogFileReadStart('קונפיגורציית מאסטר', this.fileServerRelativeUrl);

        const response = await fetch(endpoint, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'application/json;odata=verbose',
            },
        });

        spLogFileReadResponse(this.fileServerRelativeUrl, response);

        if (!response.ok) {
            if (response.status === 404) {
                spLog.warn('קובץ קונפיגורציית מאסטר לא נמצא — מתחילים מריק');
                return { text: null };
            }
            throw new Error(`SharePoint load failed: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        const len = text ? text.length : 0;
        spLog.success(`קריאת קונפיגורציית מאסטר הצליחה | תווים: ${len}`);
        return { text: text || null };
    }

    async _saveSharePoint(text) {
        spLogFileSaveStart('קונפיגורציית מאסטר', this.fileServerRelativeUrl);

        const { response } = await upsertSharePointTextFile({
            serverRelativeUrl: this.fileServerRelativeUrl,
            text,
            contentType: 'text/plain; charset=utf-8',
        });

        spLogFileSaveResponse(this.fileServerRelativeUrl, response);

        spLog.success('שמירת קונפיגורציית מאסטר ל-SharePoint הושלמה');
        return { ok: true };
    }
}

const configAdapter = new ConfigAdapter();

export { ConfigAdapter, configAdapter, resolveDefaultMasterConfigFileUrl };
export default configAdapter;
