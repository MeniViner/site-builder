import { afterEach, describe, expect, it, vi } from 'vitest';
import backendApiClient, { BackendStorageError } from './backendApiClient';
import { LegacyObjectStorageAdapter, toUserFacingStorageError } from './LegacyObjectStorageAdapter';

describe('LegacyObjectStorageAdapter', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it('loads through the backend and saves with optimistic version', async () => {
        const client = {
            readLegacyObject: vi.fn().mockResolvedValue({ data: { title: 'Site' }, version: 4, hash: 'abc' }),
            writeLegacyObject: vi.fn().mockResolvedValue({ data: { title: 'Next' }, version: 5, hash: 'def' }),
        };
        const adapter = new LegacyObjectStorageAdapter({ key: 'site_content_data.txt', siteId: 'alpha', client });

        await expect(adapter.load()).resolves.toEqual({ title: 'Site' });
        await expect(adapter.save({ title: 'Next' })).resolves.toEqual({ title: 'Next' });

        expect(client.writeLegacyObject).toHaveBeenCalledWith('alpha', {
            key: 'site_content_data.txt',
            data: { title: 'Next' },
            expectedVersion: 4,
            allowEmptyOverwrite: false,
        });
    });

    it('does not save when initial load fails', async () => {
        const client = {
            readLegacyObject: vi.fn().mockRejectedValue(new BackendStorageError('load failed', { status: 503 })),
            writeLegacyObject: vi.fn(),
        };
        const adapter = new LegacyObjectStorageAdapter({ key: 'widgets_data.txt', siteId: 'alpha', client });

        await expect(adapter.load()).rejects.toThrow('load failed');
        expect(client.writeLegacyObject).not.toHaveBeenCalled();
    });

    it('shows conflict responses clearly', () => {
        const error = new BackendStorageError('Version conflict', { status: 409, code: 'conflict' });
        expect(toUserFacingStorageError(error).message).toContain('הנתונים השתנו');
    });

    it('fails closed when Mongo frontend mode is missing VITE_BACKEND_API_URL', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('VITE_STORAGE_BACKEND', 'mongo');
        vi.stubEnv('VITE_BACKEND_API_URL', '');

        await expect(backendApiClient.request('/api/healthz')).rejects.toMatchObject({
            code: 'missing_backend_url',
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
