import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigAdapter } from './ConfigAdapter';
import { ConfigService } from './ConfigService';
import { clearRuntimeConfigForTests, setRuntimeConfigForTests } from './storage/runtimeConfig';
import { clearStorageDescriptorForTests, getStorageDiagnostics } from './storage/storageBackend';

const response = (body, {
    status = 200,
    contentType = 'text/plain; charset=utf-8',
    etag = '',
} = {}) => new Response(body, {
    status,
    headers: {
        'content-type': contentType,
        ...(etag ? { etag } : {}),
    },
});

describe('ConfigAdapter TXT persistence', () => {
    beforeEach(() => {
        clearRuntimeConfigForTests();
        clearStorageDescriptorForTests();
        setRuntimeConfigForTests({
            storageBackend: 'txt',
            siteId: 'alpha',
            siteRoot: '/sites/alpha',
        });
    });

    afterEach(() => {
        clearStorageDescriptorForTests();
        clearRuntimeConfigForTests();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('uses the runtime TXT path, no-store reads, ETag preconditions, and read-back verification', async () => {
        const initial = JSON.stringify({ schemaVersion: '1.0.0', title: 'Initial' }, null, 2);
        const saved = JSON.stringify({ schemaVersion: '1.0.0', title: 'Saved' }, null, 2);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(initial, { etag: '"v1"' }))
            .mockResolvedValueOnce(response('', { etag: '"v2"' }))
            .mockResolvedValueOnce(response(saved, { etag: '"v2"' }));
        vi.stubGlobal('fetch', fetchMock);
        const adapter = new ConfigAdapter({ useMock: false });

        await expect(adapter.load()).resolves.toMatchObject({ text: initial, etag: '"v1"' });
        await expect(adapter.save(saved)).resolves.toMatchObject({ ok: true, etag: '"v2"' });

        expect(fetchMock.mock.calls[0][0]).toMatch(/^\/sites\/alpha\/siteDB\/siteAssets\/bihs_master_config_v1\.txt\?sitebuilder_cb=/);
        expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-store', method: 'GET' });
        expect(fetchMock.mock.calls[1]).toEqual([
            '/sites/alpha/siteDB/siteAssets/bihs_master_config_v1.txt',
            expect.objectContaining({
                method: 'PUT',
                cache: 'no-store',
                body: saved,
                headers: expect.objectContaining({ 'If-Match': '"v1"' }),
            }),
        ]);
        expect(fetchMock.mock.calls[2][0]).toMatch(/sitebuilder_cb=/);
    });

    it('surfaces ETag conflicts without reporting success', async () => {
        const initial = JSON.stringify({ schemaVersion: '1.0.0', title: 'Initial' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(initial, { etag: '"v1"' }))
            .mockResolvedValueOnce(response('conflict', { status: 412 }));
        vi.stubGlobal('fetch', fetchMock);
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(JSON.stringify({ schemaVersion: '1.0.0', title: 'Next' }))).rejects.toMatchObject({
            code: 'conflict',
            isConflict: true,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(getStorageDiagnostics().lastStorageError).toMatchObject({
            code: 'conflict',
            operation: 'save-master-config',
            repository: 'txt',
        });
    });

    it('rejects an HTML read-back even when SharePoint returns 200', async () => {
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
            response('<!DOCTYPE html><html>fallback</html>', { contentType: 'text/html' }),
        )));
        const adapter = new ConfigAdapter({ useMock: false });

        await expect(adapter.load()).rejects.toMatchObject({ code: 'txt_html_response' });
    });

    it('treats malformed master JSON as fatal instead of falling back to defaults', async () => {
        const adapter = {
            load: vi.fn().mockResolvedValue({ text: '{invalid' }),
            isStrictPersistence: () => true,
            isLoadFailureFatal: () => true,
        };
        const service = new ConfigService(adapter);

        await expect(service.loadConfigEnvelope()).rejects.toThrow(/Unexpected token|JSON/);
    });

    it('serializes writes so a later save cannot finish before an earlier save', async () => {
        const writes = [];
        let releaseFirst;
        const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
        const fetchMock = vi.fn(async (_url, options) => {
            if (options?.method === 'GET') {
                const body = writes.length > 0 ? writes[writes.length - 1] : JSON.stringify({ schemaVersion: '1.0.0' });
                return response(body, { etag: `"v${writes.length}"` });
            }
            writes.push(options.body);
            if (writes.length === 1) await firstGate;
            return response('', { etag: `"v${writes.length}"` });
        });
        vi.stubGlobal('fetch', fetchMock);
        const adapter = new ConfigAdapter({ useMock: false });
        await adapter.load();

        const first = adapter.save(JSON.stringify({ schemaVersion: '1.0.0', revision: 1 }));
        const second = adapter.save(JSON.stringify({ schemaVersion: '1.0.0', revision: 2 }));
        await Promise.resolve();
        expect(writes).toHaveLength(1);
        releaseFirst();
        await Promise.all([first, second]);

        expect(writes.map((item) => JSON.parse(item).revision)).toEqual([1, 2]);
    });

    it('rejects a Mongo write response that does not match the submitted config', async () => {
        clearStorageDescriptorForTests();
        clearRuntimeConfigForTests();
        setRuntimeConfigForTests({
            storageBackend: 'mongo',
            backendApiUrl: 'https://api.example.test',
            siteId: 'alpha',
        });
        const mongoAdapter = {
            save: vi.fn().mockResolvedValue({ schemaVersion: '1.0.0', title: 'stale' }),
        };
        const adapter = new ConfigAdapter({ mongoAdapter });

        await expect(adapter.save(JSON.stringify({ schemaVersion: '1.0.0', title: 'latest' }))).rejects.toMatchObject({
            code: 'mongo_write_mismatch',
        });
    });
});
