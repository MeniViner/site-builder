import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AIService } from '../../../src/services/AIService.js';
import { parseJsonFromModel } from '../../../src/utils/aiJson.js';
import { normalizeAiEventsPayload } from '../../../src/utils/eventsAi.js';
import { DEV_AI_TRANSPORT } from '../../../src/config/ai.config.js';
import { createDevAiMiddleware } from './middleware.js';
import { groqSseChunk, makeConfig, ollamaNdjsonLine, streamingResponse } from './testUtils/devAiTestUtils.js';
import { openGroqStream } from './providers/groq.js';
import { openOllamaStream, probeOllama } from './providers/ollama.js';
import { probeGroq } from './providers/groq.js';

/**
 * End-to-end at the local code level, with mocked providers only:
 *
 *   mock provider bytes -> real adapter -> DEV AI route -> normalized SSE
 *     -> the REAL frontend AIService -> the REAL parseJsonFromModel
 *       -> the REAL Events domain normalizer
 *
 * Every payload is Hebrew, so this is also the Unicode round-trip proof.
 */

const HEBREW_EVENTS_JSON = JSON.stringify({
  eventCount: 2,
  events: [
    { id: 'ev_1', date: '2026-09-02', title: 'סדנת בטיחות', subtitle: 'מרכז ההדרכה, 09:00', color: 'gray' },
    { id: 'ev_2', date: '2026-09-09', title: 'יום עיון טכנולוגי', subtitle: 'אודיטוריום ראשי', color: 'red' },
  ],
  displayCount: 2,
  displayMode: 'monthly',
  intervalSeconds: 8,
});

// Split mid-Hebrew-word and mid-JSON-token, so a naive transport would corrupt it.
function chunkText(text, size = 7) {
  const chunks = [];
  for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
  return chunks;
}

function hostFor({ config, adapters }) {
  const middleware = createDevAiMiddleware({ config, adapters });
  const server = http.createServer((req, res) => {
    if (!req.url.startsWith('/api/dev-ai')) {
      res.statusCode = 404;
      res.end('{}');
      return;
    }
    req.url = req.url.slice('/api/dev-ai'.length) || '/';
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end('{}');
    });
  });
  return server;
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

/** Builds the AIService exactly as the DEV transport resolver configures it. */
function devAiService(origin) {
  return new AIService({
    enabled: true,
    devAi: true,
    apiBase: `${origin}${DEV_AI_TRANSPORT.apiBase}`,
    streamEndpoint: DEV_AI_TRANSPORT.streamEndpoint,
    apiToken: '',
    defaultModel: '',
    streamModel: '',
    streamTimeoutMs: 10000,
    requestTimeoutMs: 10000,
  });
}

describe('DEV AI SSE compatibility with the existing AIService', () => {
  let server;
  let origin;
  const groqFetch = async () => streamingResponse([
    ...chunkText(HEBREW_EVENTS_JSON).map((chunk) => groqSseChunk(chunk)),
    'data: [DONE]\n\n',
  ]);
  const ollamaFetch = async () => streamingResponse([
    ...chunkText(HEBREW_EVENTS_JSON).map((chunk) => ollamaNdjsonLine(chunk)),
    ollamaNdjsonLine('', true),
  ]);

  beforeAll(async () => {
    const config = makeConfig({ DEV_AI_PROVIDER: 'auto' });
    server = hostFor({
      config,
      adapters: {
        ollama: {
          name: 'ollama',
          probe: (cfg) => probeOllama(cfg, { fetchImpl: async () => new Response(JSON.stringify({ models: [{ name: 'test-local-model' }] }), { headers: { 'content-type': 'application/json' } }) }),
          openStream: (args) => openOllamaStream({ ...args, fetchImpl: ollamaFetch }),
        },
        groq: {
          name: 'groq',
          probe: (cfg) => probeGroq(cfg, { fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: 'test-cloud-model' }] }), { headers: { 'content-type': 'application/json' } }) }),
          openStream: (args) => openGroqStream({ ...args, fetchImpl: groqFetch }),
        },
      },
    });
    origin = await listen(server);
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('reconstructs Hebrew JSON through the whole DEV transport and into the Events domain', async () => {
    const tokens = [];
    const service = devAiService(origin);
    const result = await service.ask('צור אירועים בעברית', {
      onToken: (token) => tokens.push(token),
    });

    expect(result.providerUsed).toBe('ollama');
    expect(result.modelUsed).toBe('test-local-model');
    expect(result.requestId).toMatch(/^devai_/);
    expect(tokens.length).toBeGreaterThan(1);
    expect(result.content).toBe(HEBREW_EVENTS_JSON);

    const parsed = parseJsonFromModel(result.content);
    expect(parsed.events[0].title).toBe('סדנת בטיחות');

    const normalized = normalizeAiEventsPayload(parsed);
    expect(normalized.events).toHaveLength(2);
    expect(normalized.events[1].title).toBe('יום עיון טכנולוגי');
    expect(normalized.events[0].subtitle).toBe('מרכז ההדרכה, 09:00');
    expect(normalized.displayMode).toBe('monthly');
    expect(normalized.intervalMs).toBe(8000);
  });

  it('preserves markdown-fenced JSON verbatim so parseJsonFromModel stays authoritative', async () => {
    const fenced = `כאן התשובה:\n\`\`\`json\n{"סטטוס":"תקין","ערך":{"מקונן":[1,2,3]}}\n\`\`\``;
    const fencedServer = hostFor({
      config: makeConfig({ DEV_AI_PROVIDER: 'groq' }),
      adapters: {
        ollama: { name: 'ollama', probe: async () => ({}), openStream: async () => { throw new Error('unused'); } },
        groq: {
          name: 'groq',
          probe: async () => ({}),
          openStream: (args) => openGroqStream({
            ...args,
            fetchImpl: async () => streamingResponse([
              ...chunkText(fenced, 5).map((chunk) => groqSseChunk(chunk)),
              'data: [DONE]\n\n',
            ]),
          }),
        },
      },
    });
    const fencedOrigin = await listen(fencedServer);

    try {
      const result = await devAiService(fencedOrigin).ask('החזר JSON');
      expect(result.content).toBe(fenced);
      expect(result.providerUsed).toBe('groq');
      expect(parseJsonFromModel(result.content)).toEqual({ 'סטטוס': 'תקין', 'ערך': { 'מקונן': [1, 2, 3] } });
    } finally {
      await new Promise((resolve) => fencedServer.close(resolve));
    }
  });

  it('lands health on /api/dev-ai/health through the untouched AIService helper', async () => {
    const health = await devAiService(origin).health();
    expect(health.enabled).toBe(true);
    expect(health.mode).toBe('auto');
  });

  it('surfaces a DEV AI error code through the existing AIService error path', async () => {
    const disabledServer = hostFor({ config: makeConfig({ DEV_AI_ENABLED: 'false' }), adapters: {} });
    const disabledOrigin = await listen(disabledServer);
    try {
      await expect(devAiService(disabledOrigin).ask('שלום')).rejects.toThrow(/AI API error 503/);
    } finally {
      await new Promise((resolve) => disabledServer.close(resolve));
    }
  });
});
