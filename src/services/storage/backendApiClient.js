import { getBackendApiBaseUrl } from './storageBackend';

export class BackendStorageError extends Error {
    constructor(message, { status = 0, code = 'backend_error', details = null } = {}) {
        super(message);
        this.name = 'BackendStorageError';
        this.status = status;
        this.code = code;
        this.details = details;
        this.isConflict = status === 409 || code === 'conflict';
    }
}

const apiKey = () => String(
    import.meta.env.VITE_SITE_BUILDER_API_KEY
    || import.meta.env.VITE_ADMIN_API_KEY
    || ''
).trim();

class BackendApiClient {
    async request(path, options = {}) {
        const baseUrl = getBackendApiBaseUrl();
        const url = `${baseUrl}${path}`;
        const headers = {
            Accept: 'application/json',
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(apiKey() ? { 'X-API-Key': apiKey() } : {}),
            ...(options.headers || {}),
        };

        let response;
        try {
            response = await fetch(url, {
                method: options.method || 'GET',
                credentials: 'include',
                headers,
                body: options.body === undefined ? undefined : JSON.stringify(options.body),
            });
        } catch (error) {
            throw new BackendStorageError(`Backend request failed before a response was received: ${error.message}`, {
                status: 0,
                code: 'network_error',
            });
        }

        let payload = null;
        const text = await response.text();
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch {
                payload = { ok: response.ok, raw: text };
            }
        }

        if (!response.ok) {
            const apiError = payload?.error || {};
            throw new BackendStorageError(apiError.message || `Backend request failed (${response.status})`, {
                status: response.status,
                code: apiError.code || 'backend_error',
                details: apiError.details || payload,
            });
        }

        return payload;
    }

    readLegacyObject(siteId, key) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/legacy-object?key=${encodeURIComponent(key)}`);
    }

    writeLegacyObject(siteId, { key, data, expectedVersion, allowEmptyOverwrite = false }) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/legacy-object`, {
            method: 'PUT',
            body: {
                key,
                data,
                expectedVersion,
                allowEmptyOverwrite,
            },
        });
    }
}

export const backendApiClient = new BackendApiClient();
export default backendApiClient;
