import { requireBackendApiBaseUrl } from './storageBackend';

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

const developmentApiKey = () => {
    if (import.meta.env.DEV !== true) return '';
    return String(import.meta.env.VITE_SITE_BUILDER_DEV_API_KEY || '').trim();
};

class BackendApiClient {
    async request(path, options = {}) {
        let baseUrl;
        try {
            baseUrl = requireBackendApiBaseUrl();
        } catch (error) {
            throw new BackendStorageError(error.message, {
                status: 0,
                code: 'missing_backend_url',
            });
        }
        const url = `${baseUrl}${path}`;
        const headers = {
            Accept: 'application/json',
            ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(developmentApiKey() ? { 'X-API-Key': developmentApiKey() } : {}),
            ...(options.headers || {}),
        };

        let response;
        try {
            response = await fetch(url, {
                method: options.method || 'GET',
                credentials: 'include',
                cache: 'no-store',
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
                throw new BackendStorageError(
                    response.ok
                        ? 'Backend returned a non-JSON response.'
                        : `Backend request failed (${response.status}) with a non-JSON response.`,
                    {
                        status: response.status,
                        code: response.ok ? 'invalid_backend_response' : 'backend_error',
                        details: {
                            contentType: response.headers?.get?.('content-type') || '',
                        },
                    },
                );
            }
        }

        if (response.ok && (payload === null || typeof payload !== 'object' || Array.isArray(payload))) {
            throw new BackendStorageError('Backend returned an invalid JSON response envelope.', {
                status: response.status,
                code: 'invalid_backend_response',
            });
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

    listBackups(siteId) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/backups`);
    }

    createBackup(siteId, payload = {}) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/backups`, {
            method: 'POST',
            body: payload,
        });
    }

    getBackup(siteId, backupId) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/backups/${encodeURIComponent(backupId)}`);
    }

    deleteBackup(siteId, backupId, { expectedVersion } = {}) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/backups/${encodeURIComponent(backupId)}`, {
            method: 'DELETE',
            body: expectedVersion === undefined ? {} : { expectedVersion },
        });
    }

    restoreBackup(siteId, backupId, { allowSiteIdMismatch = false } = {}) {
        return this.request(`/api/sites/${encodeURIComponent(siteId)}/backups/${encodeURIComponent(backupId)}/restore`, {
            method: 'POST',
            body: { allowSiteIdMismatch },
        });
    }
}

export const backendApiClient = new BackendApiClient();
export default backendApiClient;
