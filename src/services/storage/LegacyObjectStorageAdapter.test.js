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

    it('calls Mongo backup endpoints with API key auth', async () => {
        vi.stubEnv('VITE_STORAGE_BACKEND', 'mongo');
        vi.stubEnv('VITE_BACKEND_API_URL', 'http://127.0.0.1:3001');
        vi.stubEnv('VITE_SITE_BUILDER_API_KEY', 'secret');
        const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, backups: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })));
        vi.stubGlobal('fetch', fetchMock);

        await backendApiClient.listBackups('alpha');
        await backendApiClient.createBackup('alpha', { backupPackage: { id: 'one', files: [] } });
        await backendApiClient.getBackup('alpha', 'one');
        await backendApiClient.deleteBackup('alpha', 'one', { expectedVersion: 1 });
        await backendApiClient.restoreBackup('alpha', 'one');

        expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://127.0.0.1:3001/api/sites/alpha/backups', expect.objectContaining({
            method: 'GET',
            headers: expect.objectContaining({ 'X-API-Key': 'secret' }),
        }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://127.0.0.1:3001/api/sites/alpha/backups', expect.objectContaining({
            method: 'POST',
        }));
        expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://127.0.0.1:3001/api/sites/alpha/backups/one', expect.objectContaining({
            method: 'GET',
        }));
        expect(fetchMock).toHaveBeenNthCalledWith(4, 'http://127.0.0.1:3001/api/sites/alpha/backups/one', expect.objectContaining({
            method: 'DELETE',
            body: JSON.stringify({ expectedVersion: 1 }),
        }));
        expect(fetchMock).toHaveBeenNthCalledWith(5, 'http://127.0.0.1:3001/api/sites/alpha/backups/one/restore', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ allowSiteIdMismatch: false }),
        }));
    });
});
