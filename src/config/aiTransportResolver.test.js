import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    AI_CONFIG,
    DEFAULT_IS_DEV_AI_RUNTIME,
    DEV_AI_TRANSPORT,
    PRODUCTION_AI_CONFIG,
    formatAiEngineLabel,
    isDevAiTransportActive,
    resolveAiTransportConfig,
} from './ai.config';
import { AIService } from '../services/AIService';

const PRODUCTION_LIKE = Object.freeze({
    ...PRODUCTION_AI_CONFIG,
    enabled: false,
    apiBase: 'https://alphaai.idf/api',
    apiToken: 'production-token',
    defaultModel: 'gpt-4o',
    streamEndpoint: '/ai/stream',
    devAi: false,
});

function resolve({ isDevRuntime, env }) {
    return resolveAiTransportConfig({ isDevRuntime, env, productionConfig: PRODUCTION_LIKE });
}

describe('AI transport resolver — DEV AI is off by default', () => {
    it('uses the existing production configuration when VITE_DEV_AI_ENABLED is missing', () => {
        const config = resolve({ isDevRuntime: true, env: {} });
        expect(config).toBe(PRODUCTION_LIKE);
        expect(isDevAiTransportActive(config)).toBe(false);
    });

    it('uses the existing production configuration when VITE_DEV_AI_ENABLED is false', () => {
        expect(resolve({ isDevRuntime: true, env: { VITE_DEV_AI_ENABLED: 'false' } })).toBe(PRODUCTION_LIKE);
        expect(resolve({ isDevRuntime: true, env: { VITE_DEV_AI_ENABLED: '' } })).toBe(PRODUCTION_LIKE);
        expect(resolve({ isDevRuntime: true, env: { VITE_DEV_AI_ENABLED: '0' } })).toBe(PRODUCTION_LIKE);
    });

    it('leaves the production configuration completely untouched', () => {
        const config = resolve({ isDevRuntime: false, env: {} });
        expect(config.apiBase).toBe('https://alphaai.idf/api');
        expect(config.streamEndpoint).toBe('/ai/stream');
        expect(config.apiToken).toBe('production-token');
        expect(config.defaultModel).toBe('gpt-4o');
    });
});

describe('AI transport resolver — production can never select DEV AI', () => {
    it('ignores VITE_DEV_AI_ENABLED outside a Vite development runtime', () => {
        const config = resolve({ isDevRuntime: false, env: { VITE_DEV_AI_ENABLED: 'true' } });
        expect(config).toBe(PRODUCTION_LIKE);
        expect(config.devAi).toBe(false);
        expect(config.apiBase).not.toContain('dev-ai');
    });

    it('requires the dev flag to be exactly true, not merely truthy', () => {
        for (const isDevRuntime of [false, null, 0, 1, 'true']) {
            expect(resolve({ isDevRuntime, env: { VITE_DEV_AI_ENABLED: 'true' } })).toBe(PRODUCTION_LIKE);
        }
    });
});

describe('AI transport resolver — DEV AI transport shape', () => {
    const devConfig = resolve({ isDevRuntime: true, env: { VITE_DEV_AI_ENABLED: 'true' } });

    it('points the existing AIService at the same-origin DEV gateway', () => {
        expect(devConfig.devAi).toBe(true);
        expect(devConfig.apiBase).toBe('/api/dev-ai');
        expect(devConfig.streamEndpoint).toBe('/stream');
        expect(`${devConfig.apiBase}${devConfig.streamEndpoint}`).toBe('/api/dev-ai/stream');
        expect(DEV_AI_TRANSPORT.apiBase).toBe('/api/dev-ai');
    });

    it('enables AI features without requiring the production flag', () => {
        expect(PRODUCTION_LIKE.enabled).toBe(false);
        expect(devConfig.enabled).toBe(true);
    });

    it('sends no token and no production model name to the local server', () => {
        expect(devConfig.apiToken).toBe('');
        expect(devConfig.defaultModel).toBe('');
        expect(devConfig.streamModel).toBe('');
        expect(devConfig.fileModel).toBe('');
    });

    it('exposes no provider identity, base url or credential to the browser', () => {
        const serialized = JSON.stringify(devConfig).toLowerCase();
        expect(serialized).not.toContain('groq');
        expect(serialized).not.toContain('ollama');
        expect(serialized).not.toContain('api.groq.com');
        expect(serialized).not.toContain('11434');
        expect(serialized).not.toContain('bearer');
    });
});

describe('AIService driven by the DEV AI transport', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('requests the same-origin DEV endpoint with no auth header', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'שלום' } }] })}\n\ndata: [DONE]\n\n`,
            {
                status: 200,
                headers: {
                    'content-type': 'text/event-stream',
                    'x-proxy-model': 'local-model',
                    'x-dev-ai-provider': 'ollama',
                    'x-request-id': 'devai_test_0001',
                },
            },
        ));
        vi.stubGlobal('fetch', fetchMock);

        const devConfig = resolve({ isDevRuntime: true, env: { VITE_DEV_AI_ENABLED: 'true' } });
        const result = await new AIService(devConfig).ask('בקשה בעברית');

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('/api/dev-ai/stream');
        expect(options.headers).toEqual({ 'Content-Type': 'application/json' });
        expect(options.headers['x-api-token']).toBeUndefined();
        expect(JSON.parse(options.body)).toEqual({
            messages: [{ role: 'user', content: 'בקשה בעברית' }],
            stream: true,
            model: 'any',
        });
        expect(result).toMatchObject({
            content: 'שלום',
            modelUsed: 'local-model',
            providerUsed: 'ollama',
            requestId: 'devai_test_0001',
        });
    });

    it('leaves provider metadata empty on the production path', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok' } }] })}\n\ndata: [DONE]\n\n`,
            { status: 200, headers: { 'content-type': 'text/event-stream', 'x-proxy-model': 'gpt-4o' } },
        )));

        const result = await new AIService(PRODUCTION_LIKE).ask('hello');
        expect(result.providerUsed).toBe('');
        expect(result.requestId).toBe('');
        expect(result.modelUsed).toBe('gpt-4o');
    });
});

describe('development engine badge', () => {
    const devConfig = resolve({ isDevRuntime: true, env: { VITE_DEV_AI_ENABLED: 'true' } });

    it('shows the engine only in development', () => {
        const result = { modelUsed: 'qwen-local', providerUsed: 'ollama' };
        expect(formatAiEngineLabel(result, devConfig)).toBe('DEV AI · Ollama · qwen-local');
        expect(formatAiEngineLabel({ modelUsed: 'm', providerUsed: 'groq' }, devConfig)).toBe('DEV AI · Groq · m');
    });

    it('keeps the production UI unchanged', () => {
        expect(formatAiEngineLabel({ modelUsed: 'gpt-4o' }, PRODUCTION_LIKE)).toBe('gpt-4o');
        expect(formatAiEngineLabel({ modelUsed: 'gpt-4o', providerUsed: 'groq' }, PRODUCTION_LIKE)).toBe('gpt-4o');
        expect(formatAiEngineLabel({}, PRODUCTION_LIKE)).toBe('');
    });
});

describe('automated test runs never inherit a machine-local DEV AI flag', () => {
    it('resolves the production transport under vitest, whatever .env.local says', () => {
        expect(DEFAULT_IS_DEV_AI_RUNTIME).toBe(false);
        expect(AI_CONFIG.devAi).toBe(false);
        expect(AI_CONFIG.apiBase).not.toContain('dev-ai');
        expect(AI_CONFIG.streamEndpoint).not.toBe('/stream');
    });
});
