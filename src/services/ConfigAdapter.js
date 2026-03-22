import { buildFileValueEndpoint } from '../utils/sharepointUtils';

const DEFAULT_MASTER_CONFIG_KEY = 'bihs_master_config_v1';
const DEFAULT_MASTER_CONFIG_FILE_URL = '/sites/bihs7134/SiteAssets/bihs_master_config_v1.txt';

class ConfigAdapter {
    constructor(options = {}) {
        this.useMock = import.meta.env.DEV || import.meta.env.MODE === 'development';
        this.mockStorageKey = options.mockStorageKey || import.meta.env.VITE_SP_MASTER_CONFIG_MOCK_KEY || DEFAULT_MASTER_CONFIG_KEY;
        this.fileServerRelativeUrl = options.fileServerRelativeUrl || import.meta.env.VITE_SP_MASTER_CONFIG_FILE_URL || DEFAULT_MASTER_CONFIG_FILE_URL;
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

        const response = await fetch(endpoint, {
            method: 'GET',
            credentials: 'include',
            headers: {
                Accept: 'application/json;odata=verbose',
            },
        });

        if (!response.ok) {
            if (response.status === 404) {
                return { text: null };
            }
            throw new Error(`SharePoint load failed: ${response.status} ${response.statusText}`);
        }

        const text = await response.text();
        return { text: text || null };
    }

    async _getRequestDigest() {
        const response = await fetch('/_api/contextinfo', {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json;odata=verbose',
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to get SharePoint request digest: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const digest = data?.d?.GetContextWebInformation?.FormDigestValue;
        if (!digest) {
            throw new Error('SharePoint request digest missing in contextinfo response');
        }

        return digest;
    }

    async _saveSharePoint(text) {
        const digest = await this._getRequestDigest();
        const endpoint = this._buildFileEndpoint();

        const response = await fetch(endpoint, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'X-RequestDigest': digest,
                'X-HTTP-Method': 'PUT',
                'IF-MATCH': '*',
                'Content-Type': 'text/plain; charset=utf-8',
            },
            body: text,
        });

        if (!response.ok) {
            throw new Error(`SharePoint save failed: ${response.status} ${response.statusText}`);
        }

        return { ok: true };
    }
}

const configAdapter = new ConfigAdapter();

export { ConfigAdapter, configAdapter };
export default configAdapter;
