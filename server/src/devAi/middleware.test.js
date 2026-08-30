import http from 'node:http';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { DEV_AI_ERROR_CODES } from './errors.js';
import { createDevAiLogger } from './logging.js';
import { createDevAiMiddleware } from './middleware.js';
import { createSinkSpy, fakeAdapter, makeConfig } from './testUtils/devAiTestUtils.js';

const SECRET = 'test-key-never-logged';
const HEBREW = '{"status":"תקין","message":"מנוע ה-AI המקומי עובד בעברית"}';

function hebrewAdapter(name, chunks = [HEBREW]) {
  return fakeAdapter(name, {
    openStream: async () => ({
      provider: name,
      model: `${name}-model`,
      tokens: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
      cancel: () => {},
    }),
  });
}

/** Express host, mirroring server/src/app.js (JSON body parser already applied). */
function expressHost(config, options = {}) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/dev-ai', createDevAiMiddleware({ config, ...options }));
  app.use((_req, res) => res.status(404).json({ ok: false }));
  return app;
}

/** Bare connect-style host, mirroring the Vite dev server (no body parser). */
function connectHost(config, options = {}) {
  const middleware = createDevAiMiddleware({ config, ...options });
  return http.createServer((req, res) => {
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
}

function collectSse(text) {
  return text
    .split(/\r?\n\r?\n/)
    .map((event) => event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join(''))
    .filter(Boolean);
}

describe('DEV AI HTTP surface', () => {
  const adapters = { ollama: hebrewAdapter('ollama'), groq: hebrewAdapter('groq') };

  it('serves a safe health report', async () => {
    const response = await request(expressHost(makeConfig(), { adapters }))
      .get('/api/dev-ai/health')
      .expect(200);

    expect(response.body).toMatchObject({ enabled: true, mode: 'auto', order: ['ollama', 'groq'] });
    expect(response.body.providers.groq.apiKeyPresent).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(JSON.stringify(response.body)).not.toContain('Bearer');
  });

  it('serves /init for AIService compatibility', async () => {
    const response = await request(expressHost(makeConfig(), { adapters })).get('/api/dev-ai/init').expect(200);
    expect(response.body.enabled).toBe(true);
  });

  it('streams a normalized SSE response with safe metadata headers', async () => {
    const response = await request(expressHost(makeConfig(), { adapters }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'שלום' }], stream: true })
      .expect(200);

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['x-dev-ai-provider']).toBe('ollama');
    expect(response.headers['x-proxy-model']).toBe('ollama-model');
    expect(response.headers['x-request-id']).toMatch(/^devai_/);
    expect(response.headers['access-control-expose-headers']).toContain('x-dev-ai-provider');

    const events = collectSse(response.text);
    expect(events.at(-1)).toBe('[DONE]');
    const content = events.slice(0, -1)
      .map((event) => JSON.parse(event).choices[0].delta.content)
      .join('');
    expect(content).toBe(HEBREW);
  });

  it('works identically when mounted on a bare connect stack (Vite dev server shape)', async () => {
    const response = await request(connectHost(makeConfig(), { adapters }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'שלום' }] })
      .expect(200);

    expect(response.headers['x-dev-ai-provider']).toBe('ollama');
    const events = collectSse(response.text);
    expect(events.at(-1)).toBe('[DONE]');
    expect(JSON.parse(events[0]).choices[0].delta.content).toBe(HEBREW);
  });

  it('returns 404 for an unknown DEV AI sub-path', async () => {
    await request(expressHost(makeConfig(), { adapters })).get('/api/dev-ai/nope').expect(404);
  });
});

describe('DEV AI HTTP gates and errors', () => {
  const adapters = { ollama: hebrewAdapter('ollama'), groq: hebrewAdapter('groq') };

  it('reports DEV_AI_DISABLED when DEV_AI_ENABLED is false', async () => {
    const config = makeConfig({ DEV_AI_ENABLED: 'false' });
    const host = expressHost(config, { adapters });

    const health = await request(host).get('/api/dev-ai/health').expect(200);
    expect(health.body).toMatchObject({ enabled: false, error: { code: DEV_AI_ERROR_CODES.DISABLED } });

    const stream = await request(host)
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'x' }] })
      .expect(503);
    expect(stream.body.error.code).toBe(DEV_AI_ERROR_CODES.DISABLED);
  });

  it('rejects an invalid request before contacting any provider', async () => {
    const ollama = fakeAdapter('ollama', { openStream: vi.fn() });
    const response = await request(expressHost(makeConfig(), { adapters: { ollama, groq: hebrewAdapter('groq') } }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'wizard', content: 'x' }] })
      .expect(400);

    expect(response.body.error.code).toBe(DEV_AI_ERROR_CODES.INVALID_REQUEST);
    expect(ollama.openStream).not.toHaveBeenCalled();
  });

  it('rejects oversized input before contacting any provider', async () => {
    const ollama = fakeAdapter('ollama', { openStream: vi.fn() });
    const response = await request(expressHost(makeConfig({ DEV_AI_MAX_INPUT_CHARS: '50' }), {
      adapters: { ollama, groq: hebrewAdapter('groq') },
    }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'א'.repeat(200) }] })
      .expect(413);

    expect(response.body.error.code).toBe(DEV_AI_ERROR_CODES.INPUT_TOO_LARGE);
    expect(ollama.openStream).not.toHaveBeenCalled();
  });

  it('rejects a malformed JSON body', async () => {
    const response = await request(connectHost(makeConfig()))
      .post('/api/dev-ai/stream')
      .set('content-type', 'application/json')
      .send('{ not json')
      .expect(400);
    expect(response.body.error.code).toBe(DEV_AI_ERROR_CODES.INVALID_REQUEST);
  });

  it('returns a structured error, with no secret, when every provider fails', async () => {
    const failing = (name) => fakeAdapter(name, {
      openStream: async () => {
        const error = new Error(`upstream said Bearer ${SECRET}`);
        error.name = 'TypeError';
        throw error;
      },
    });

    const response = await request(expressHost(makeConfig(), {
      adapters: { ollama: failing('ollama'), groq: failing('groq') },
    }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'x' }] })
      .expect(503);

    expect(response.body.error.code).toBe(DEV_AI_ERROR_CODES.ALL_PROVIDERS_FAILED);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
  });

  it('emits an SSE error event when the stream dies after it has begun', async () => {
    const dying = fakeAdapter('ollama', {
      openStream: async () => ({
        provider: 'ollama',
        model: 'ollama-model',
        tokens: (async function* () {
          yield 'התחלה';
          const error = new Error('mid-stream failure');
          error.code = DEV_AI_ERROR_CODES.UPSTREAM_ERROR;
          throw error;
        })(),
        cancel: () => {},
      }),
    });

    const response = await request(expressHost(makeConfig({ DEV_AI_PROVIDER: 'ollama' }), {
      adapters: { ollama: dying, groq: hebrewAdapter('groq') },
    }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: 'x' }] })
      .expect(200);

    const events = collectSse(response.text);
    expect(JSON.parse(events[0]).choices[0].delta.content).toBe('התחלה');
    expect(JSON.parse(events[1]).error.code).toBe(DEV_AI_ERROR_CODES.UPSTREAM_ERROR);
    expect(events.at(-1)).toBe('[DONE]');
  });
});

describe('DEV AI safe logging', () => {
  it('logs metadata only — never prompts, content or credentials', async () => {
    const sink = createSinkSpy();
    const logger = createDevAiLogger({ enabled: true, sink });
    const prompt = 'סוד עסקי של הלקוח שאסור שיופיע בלוג';

    await request(expressHost(makeConfig(), {
      adapters: { ollama: hebrewAdapter('ollama'), groq: hebrewAdapter('groq') },
      logger,
    }))
      .post('/api/dev-ai/stream')
      .send({ messages: [{ role: 'user', content: prompt }] })
      .expect(200);

    const text = sink.text();
    expect(text).toContain('"event":"stream-completed"');
    expect(text).toContain('"resolvedProvider":"ollama"');
    expect(text).toContain('"inputChars":');
    expect(text).not.toContain(prompt);
    expect(text).not.toContain(HEBREW);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain('Authorization');
  });

  it('drops any field outside the whitelist', () => {
    const sink = createSinkSpy();
    createDevAiLogger({ enabled: true, sink }).info({
      event: 'test',
      requestId: 'r1',
      prompt: 'must not appear',
      apiKey: SECRET,
      responseText: 'must not appear',
    });
    expect(sink.text()).toBe('[dev-ai] {"event":"test","requestId":"r1"}');
  });
});
