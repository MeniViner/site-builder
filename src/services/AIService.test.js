import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService } from './AIService';

function createService(overrides = {}) {
    return new AIService({
        enabled: true,
        apiBase: 'https://ai.example/api',
        apiToken: 'token-value',
        fileModel: 'gpt-4o',
        fileEndpoint: '/ai/files/analyze',
        fileMaxMb: 20,
        fileTimeoutMs: 5000,
        ...overrides,
    });
}

describe('AIService analyzeFile', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('creates a multipart request with auth and the dedicated model', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { nodes: [] } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        }));
        vi.stubGlobal('fetch', fetchMock);
        const file = new File(['org data'], 'org.txt', { type: 'text/plain' });

        await createService().analyzeFile(file, { instruction: 'חלץ את המחלקות' });

        const [, options] = fetchMock.mock.calls[0];
        expect(fetchMock.mock.calls[0][0]).toBe('https://ai.example/api/ai/files/analyze');
        expect(options.headers).toEqual({ 'x-api-token': 'token-value' });
        expect(options.headers['Content-Type']).toBeUndefined();
        expect(options.body).toBeInstanceOf(FormData);
        expect(options.body.get('file')).toBe(file);
        expect(options.body.get('model')).toBe('gpt-4o');
        expect(options.body.get('instruction')).toBe('חלץ את המחלקות');
    });

    it('requires a dedicated file model without text-model fallback', async () => {
        const file = new File(['org data'], 'org.txt', { type: 'text/plain' });
        await expect(createService({ fileModel: '' }).analyzeFile(file)).rejects.toMatchObject({
            code: 'FILE_MODEL_NOT_CONFIGURED',
        });
    });

    it('preserves structured server errors and request IDs', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: { code: 'MALFORMED_FILE', message: 'bad file', requestId: 'req-123' },
        }), {
            status: 422,
            headers: { 'content-type': 'application/json' },
        })));
        const file = new File(['bad'], 'org.txt', { type: 'text/plain' });
        await expect(createService().analyzeFile(file)).rejects.toMatchObject({
            code: 'MALFORMED_FILE',
            requestId: 'req-123',
            status: 422,
        });
    });

    it('supports caller cancellation', async () => {
        vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })));
        const controller = new AbortController();
        const promise = createService().analyzeFile(
            new File(['org data'], 'org.txt', { type: 'text/plain' }),
            { signal: controller.signal },
        );
        controller.abort();
        await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    });
});
