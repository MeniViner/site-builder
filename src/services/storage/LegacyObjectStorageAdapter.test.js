import { afterEach, describe, expect, it, vi } from 'vitest';
import backendApiClient, { BackendStorageError } from './backendApiClient';
import { LegacyObjectStorageAdapter, toUserFacingStorageError } from './LegacyObjectStorageAdapter';
import { clearStorageDescriptorForTests } from './storageBackend';
import { clearRuntimeConfigForTests, setRuntimeConfigForTests } from './runtimeConfig';

describe('LegacyObjectStorageAdapter', () => {
    afterEach(() => {
        clearStorageDescriptorForTests();
        clearRuntimeConfigForTests();
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

    it('does not let a read race ahead of an in-flight write', async () => {
        let releaseWrite;
        const writeGate = new Promise((resolve) => { releaseWrite = resolve; });
        const client = {
            readLegacyObject: vi.fn().mockResolvedValue({ data: { title: 'Saved' }, version: 1 }),
            writeLegacyObject: vi.fn(async (_siteId, payload) => {
                await writeGate;
                return { data: payload.data, version: 1 };
            }),
        };
        const adapter = new LegacyObjectStorageAdapter({ key: 'site_content_data.txt', siteId: 'alpha', client });

        const save = adapter.save({ title: 'Saved' });
        const load = adapter.load();
        await Promise.resolve();
        expect(client.readLegacyObject).not.toHaveBeenCalled();

        releaseWrite();
        await Promise.all([save, load]);
        expect(client.readLegacyObject).toHaveBeenCalledTimes(1);
    });

    it('shows conflict responses clearly', () => {
        const error = new BackendStorageError('Version conflict', { status: 409, code: 'conflict' });
        expect(toUserFacingStorageError(error).message).toContain('הנתונים השתנו');
    });

    it('rejects a JSON response that is missing the legacy-object envelope', async () => {
        const adapter = new LegacyObjectStorageAdapter({
            key: 'site_content_data.txt',
            siteId: 'alpha',
            client: { readLegacyObject: vi.fn().mockResolvedValue({ ok: true }) },
        });
        await expect(adapter.load()).rejects.toMatchObject({ code: 'invalid_backend_response' });
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

    it('allows the explicit development-only API key for local Mongo tools', async () => {
        vi.stubEnv('VITE_STORAGE_BACKEND', 'mongo');
        vi.stubEnv('VITE_BACKEND_API_URL', 'http://127.0.0.1:3001');
        vi.stubEnv('VITE_SITE_ID', 'alpha');
        vi.stubEnv('VITE_SITE_BUILDER_DEV_API_KEY', 'secret');
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

    it('rejects an HTML API fallback even when it returns HTTP 200', async () => {
        setRuntimeConfigForTests({
            storageBackend: 'mongo',
            backendApiUrl: 'http://127.0.0.1:3001',
            siteId: 'alpha',
        });
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<!DOCTYPE html><html>fallback</html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
        }))));

        await expect(backendApiClient.listBackups('alpha')).rejects.toMatchObject({
            code: 'invalid_backend_response',
        });
    });
});
