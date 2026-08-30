import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIService } from './AIService';

function createService(overrides = {}) {
    return new AIService({
        enabled: true,
        apiBase: 'https://ai.example/api',
        apiToken: 'token-value',
        defaultModel: 'gpt-4o',
        streamModel: 'any',
        streamEndpoint: '/ai/stream',
        streamTimeoutMs: 5000,
        ...overrides,
    });
}

function createSseResponse(content = '{"nodes":[]}') {
    const token = JSON.stringify({ choices: [{ delta: { content } }] });
    return new Response(`data: ${token}\n\ndata: [DONE]\n\n`, {
        status: 200,
        headers: {
            'content-type': 'text/event-stream',
            'x-proxy-model': 'gpt-4o',
        },
    });
}

describe('AIService working stream transport', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('sends the established JSON/SSE request with model and auth token', async () => {
        const fetchMock = vi.fn().mockResolvedValue(createSseResponse());
        vi.stubGlobal('fetch', fetchMock);

        const result = await createService().ask('extract locally prepared text', { model: 'gpt-4o' });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('https://ai.example/api/ai/stream');
        expect(options.headers).toEqual({
            'Content-Type': 'application/json',
            'x-api-token': 'token-value',
        });
        expect(JSON.parse(options.body)).toEqual({
            messages: [{ role: 'user', content: 'extract locally prepared text' }],
            stream: true,
            model: 'gpt-4o',
        });
        expect(result).toMatchObject({ modelUsed: 'gpt-4o', content: '{"nodes":[]}' });
    });

    it('supports caller cancellation on the existing stream request', async () => {
        vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })));
        const controller = new AbortController();
        const promise = createService().ask('extract text', { signal: controller.signal });
        controller.abort();
        await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    });

    it('surfaces object-shaped errors from the working AI boundary clearly', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
            error: { message: 'model unavailable', code: 'UPSTREAM_ERROR' },
        }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
        })));
        await expect(createService().ask('extract text')).rejects.toThrow(
            'AI API error 503: model unavailable',
        );
    });
});
