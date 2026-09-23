import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ConfigAdapter,
    mergeConfigTexts,
    resolveConfigConflictTexts,
} from './ConfigAdapter';
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

function createMemoryAdapter(initialText = null) {
    let text = initialText;
    return {
        load: vi.fn(async () => ({ text })),
        save: vi.fn(async (nextText) => {
            text = nextText;
            return { ok: true };
        }),
        getText: () => text,
        isStrictPersistence: () => true,
        isLoadFailureFatal: () => true,
    };
}

describe('ConfigAdapter three-way conflict resolution', () => {
    it('merges non-overlapping edits automatically', () => {
        const result = mergeConfigTexts(
            JSON.stringify({ title: 'base', description: 'base' }),
            JSON.stringify({ title: 'local', description: 'base' }),
            JSON.stringify({ title: 'base', description: 'remote' }),
        );
        expect(result.ok).toBe(true);
        expect(JSON.parse(result.text)).toEqual({ title: 'local', description: 'remote' });
    });

    it('requires and applies an explicit choice for overlapping and deletion conflicts', () => {
        const baseline = JSON.stringify({ title: 'base', item: { id: '1', name: 'base' } });
        const draft = JSON.stringify({ title: 'local' });
        const remote = JSON.stringify({ title: 'remote', item: { id: '1', name: 'changed remotely' } });
        const conflict = mergeConfigTexts(baseline, draft, remote);
        expect(conflict).toMatchObject({
            ok: false,
            conflicts: expect.arrayContaining(['$.title', '$.item']),
        });

        const resolved = resolveConfigConflictTexts(baseline, draft, remote, {
            '$.title': 'local',
            '$.item': 'remote',
        });
        expect(resolved.ok).toBe(true);
        expect(JSON.parse(resolved.text)).toEqual({
            title: 'local',
            item: { id: '1', name: 'changed remotely' },
        });
    });

    it('treats duplicate array IDs conservatively instead of dropping entities through a map', () => {
        const baseline = JSON.stringify({ items: [{ id: '1', value: 'base' }] });
        const draft = JSON.stringify({ items: [{ id: '1', value: 'local-a' }, { id: '1', value: 'local-b' }] });
        const remote = JSON.stringify({ items: [{ id: '1', value: 'remote' }] });

        expect(mergeConfigTexts(baseline, draft, remote)).toMatchObject({
            ok: false,
            conflicts: ['$.items'],
        });
    });
});

describe('ConfigAdapter TXT persistence', () => {
    beforeEach(() => {
        clearRuntimeConfigForTests();
        clearStorageDescriptorForTests();
        setRuntimeConfigForTests({
            storageBackend: 'txt',
            siteId: 'alpha',
            host: 'test.local',
            siteCode: 'alpha',
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
            .mockResolvedValueOnce(response('conflict', { status: 412 }))
            .mockResolvedValueOnce(response(JSON.stringify({ schemaVersion: '1.0.0', title: 'Other' }), { etag: '"v2"' }));
        vi.stubGlobal('fetch', fetchMock);
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(JSON.stringify({ schemaVersion: '1.0.0', title: 'Next' }))).rejects.toMatchObject({
            code: 'version_conflict',
            isConflict: true,
        });
        expect(fetchMock).toHaveBeenCalledTimes(3);
        expect(getStorageDiagnostics().lastStorageError).toMatchObject({
            code: 'version_conflict',
            operation: 'save-master-config',
            repository: 'txt',
        });
    });

    it('classifies a SharePoint 409 separately from an ETag version conflict', async () => {
        const initial = JSON.stringify({ schemaVersion: '1.0.0', title: 'Initial' });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(response(initial, { etag: '"v1"' }))
            .mockResolvedValueOnce(response('locked', { status: 409 })));
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(JSON.stringify({ schemaVersion: '1.0.0', title: 'Next' }))).rejects.toMatchObject({
            code: 'path_conflict',
            isConflict: false,
            category: 'collision',
        });
    });

    it('never adopts a mismatched verification body or ETag as the accepted baseline', async () => {
        const initial = JSON.stringify({ schemaVersion: '1.0.0', title: 'Initial' });
        const submitted = JSON.stringify({ schemaVersion: '1.0.0', title: 'Submitted' });
        const mismatched = JSON.stringify({ schemaVersion: '1.0.0', title: 'Other tab' });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(initial, { etag: '"v1"' }))
            .mockResolvedValueOnce(response('', { etag: '"v2"' }))
            .mockResolvedValueOnce(response(mismatched, { etag: '"v3"' }))
            .mockResolvedValueOnce(response('locked', { status: 409 }));
        vi.stubGlobal('fetch', fetchMock);
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(submitted)).rejects.toMatchObject({ code: 'txt_readback_mismatch' });
        await expect(adapter.save(submitted)).rejects.toMatchObject({ code: 'path_conflict' });

        expect(fetchMock.mock.calls[3][1].headers['If-Match']).toBe('"v1"');
        expect(adapter.getConcurrencyState()).toMatchObject({
            accepted: { text: initial, etag: '"v1"' },
            draft: { text: submitted },
            observedRemote: { text: mismatched, etag: '"v3"' },
        });
    });

    it('merges a proven non-overlapping simultaneous edit by array ID and retries with the refreshed ETag', async () => {
        const baseline = JSON.stringify({
            schemaVersion: '1.0.0',
            items: [{ id: 'a', title: 'A', color: 'red' }, { id: 'b', title: 'B' }],
        });
        const draft = JSON.stringify({
            schemaVersion: '1.0.0',
            items: [{ id: 'a', title: 'A local', color: 'red' }, { id: 'b', title: 'B' }],
        });
        const remote = JSON.stringify({
            schemaVersion: '1.0.0',
            items: [{ id: 'a', title: 'A', color: 'blue' }, { id: 'b', title: 'B' }],
        });
        const expectedMerged = JSON.stringify({
            schemaVersion: '1.0.0',
            items: [{ id: 'a', title: 'A local', color: 'blue' }, { id: 'b', title: 'B' }],
        }, null, 2);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(response(baseline, { etag: '"v1"' }))
            .mockResolvedValueOnce(response('precondition', { status: 412 }))
            .mockResolvedValueOnce(response(remote, { etag: '"v2"' }))
            .mockResolvedValueOnce(response('', { etag: '"v3"' }))
            .mockResolvedValueOnce(response(expectedMerged, { etag: '"v3"' }));
        vi.stubGlobal('fetch', fetchMock);
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(draft)).resolves.toMatchObject({ ok: true, merged: true });
        const merged = JSON.parse(fetchMock.mock.calls[3][1].body);
        expect(merged.items[0]).toMatchObject({ id: 'a', title: 'A local', color: 'blue' });
        expect(fetchMock.mock.calls[3][1].headers['If-Match']).toBe('"v2"');
    });

    it('preserves the draft and exposes Hebrew resolution guidance for overlapping edits', async () => {
        const baseline = JSON.stringify({ schemaVersion: '1.0.0', title: 'Initial' });
        const draft = JSON.stringify({ schemaVersion: '1.0.0', title: 'Local' });
        const remote = JSON.stringify({ schemaVersion: '1.0.0', title: 'Remote' });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(response(baseline, { etag: '"v1"' }))
            .mockResolvedValueOnce(response('precondition', { status: 412 }))
            .mockResolvedValueOnce(response(remote, { etag: '"v2"' })));
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(draft)).rejects.toMatchObject({
            code: 'version_conflict',
            category: 'version',
            resolutionMessage: expect.stringMatching(/[א-ת]/),
        });
        expect(adapter.getConcurrencyState()).toMatchObject({
            draft: { text: draft },
            observedRemote: { text: remote, etag: '"v2"' },
        });
    });

    it('accepts an uncertain network outcome only when a bounded read-back proves the draft was stored', async () => {
        const baseline = JSON.stringify({ schemaVersion: '1.0.0', title: 'Initial' });
        const draft = JSON.stringify({ schemaVersion: '1.0.0', title: 'Saved despite disconnect' });
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(response(baseline, { etag: '"v1"' }))
            .mockRejectedValueOnce(new TypeError('connection reset'))
            .mockResolvedValueOnce(response(draft, { etag: '"v2"' })));
        const adapter = new ConfigAdapter({ useMock: false });

        await adapter.load();
        await expect(adapter.save(draft)).resolves.toMatchObject({ ok: true, uncertainOutcomeVerified: true });
        expect(adapter.getConcurrencyState().accepted).toEqual({ text: draft, etag: '"v2"' });
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

    it('selects the Kashar draft store without reading or writing the configured adapter', async () => {
        const adapter = createMemoryAdapter(JSON.stringify({ schemaVersion: '1.0.0', title: 'normal source' }));
        const draftStore = {
            loadOrSeed: vi.fn().mockResolvedValue({
                source: 'kashar-draft',
                draft: { configEnvelope: { schemaVersion: '1.0.0', content: { hero: { siteName: 'טיוטה מקומית' } } } },
            }),
            saveConfig: vi.fn().mockImplementation(async (config) => config),
        };
        const service = new ConfigService(adapter, {
            resolveProfile: () => 'kashar',
            draftStore,
        });

        await expect(service.loadConfigEnvelope()).resolves.toMatchObject({
            source: 'kashar-draft',
            config: { content: { hero: { siteName: 'טיוטה מקומית' } } },
        });
        await service.saveConfig({ content: { hero: { siteName: 'עריכה מקומית' } } });

        expect(adapter.load).not.toHaveBeenCalled();
        expect(adapter.save).not.toHaveBeenCalled();
        expect(draftStore.saveConfig).toHaveBeenCalledTimes(1);
    });

    it('passes a local-draft migration notice through the Kashar config envelope', async () => {
        const draftStore = {
            loadOrSeed: vi.fn().mockResolvedValue({
                source: 'kashar-draft-migrated',
                notice: 'Local Kashar draft upgraded to the current format.',
                draft: { configEnvelope: { schemaVersion: '1.0.0', content: { hero: { siteName: 'טיוטה משודרגת' } } } },
            }),
        };
        const service = new ConfigService(createMemoryAdapter(), {
            resolveProfile: () => 'kashar',
            draftStore,
        });

        await expect(service.loadConfigEnvelope()).resolves.toMatchObject({
            source: 'kashar-draft-migrated',
            notice: 'Local Kashar draft upgraded to the current format.',
        });
    });

    it('does not disguise a Kashar draft-storage failure as a default configuration', async () => {
        const adapter = createMemoryAdapter(JSON.stringify({ schemaVersion: '1.0.0' }));
        const draftStore = {
            loadOrSeed: vi.fn().mockRejectedValue(new Error('Kashar draft storage is unavailable')),
        };
        const service = new ConfigService(adapter, {
            resolveProfile: () => 'kashar',
            draftStore,
        });

        await expect(service.loadConfigEnvelope()).rejects.toThrow('Kashar draft storage is unavailable');
        expect(adapter.load).not.toHaveBeenCalled();
    });

    it('keeps the normal adapter path when the Kashar profile is not selected', async () => {
        const adapter = {
            load: vi.fn().mockResolvedValue({ text: JSON.stringify({ schemaVersion: '1.0.0' }) }),
            save: vi.fn().mockResolvedValue({ ok: true }),
            isStrictPersistence: () => true,
            isLoadFailureFatal: () => true,
        };
        const loadKasharDemoConfig = vi.fn();
        const service = new ConfigService(adapter, {
            resolveProfile: () => null,
            loadKasharDemoConfig,
        });

        await service.loadConfigEnvelope();
        await service.saveConfig({ content: { hero: { siteName: 'normal source' } } });

        expect(adapter.load).toHaveBeenCalledTimes(1);
        expect(adapter.save).toHaveBeenCalledTimes(1);
        expect(loadKasharDemoConfig).not.toHaveBeenCalled();
    });

    it('does not initialize or access a Kashar draft store in normal mode', async () => {
        const adapter = createMemoryAdapter(JSON.stringify({ schemaVersion: '1.0.0' }));
        const draftStore = {
            loadOrSeed: vi.fn(),
            saveConfig: vi.fn(),
        };
        const service = new ConfigService(adapter, {
            resolveProfile: () => null,
            draftStore,
        });

        await service.loadConfigEnvelope();
        await service.saveConfig({ content: { hero: { siteName: 'normal source' } } });

        expect(draftStore.loadOrSeed).not.toHaveBeenCalled();
        expect(draftStore.saveConfig).not.toHaveBeenCalled();
        expect(adapter.load).toHaveBeenCalledTimes(1);
        expect(adapter.save).toHaveBeenCalledTimes(1);
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
