import { describe, expect, it, vi } from 'vitest';
import { DEV_AI_ERROR_CODES } from '../errors.js';
import { openOllamaStream, probeOllama } from './ollama.js';
import {
  collect,
  jsonResponse,
  makeConfig,
  ollamaNdjsonLine,
  streamingResponse,
} from '../testUtils/devAiTestUtils.js';

const HEBREW_CHUNKS = ['{"status":"', 'תקין', '","message":"', 'עברית עוברת', '"}'];

async function expectCode(promise, code) {
  try {
    await promise;
  } catch (error) {
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected ${code}`);
}

describe('Ollama adapter — healthy stream', () => {
  it('streams NDJSON deltas as plain tokens with roles preserved', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamingResponse([
      ...HEBREW_CHUNKS.map((chunk) => ollamaNdjsonLine(chunk)),
      ollamaNdjsonLine('', true),
    ]));

    const config = makeConfig();
    const opened = await openOllamaStream({
      config,
      messages: [
        { role: 'system', content: 'הוראות מערכת' },
        { role: 'user', content: 'בקשה' },
      ],
      fetchImpl,
    });

    expect(opened.provider).toBe('ollama');
    expect(opened.model).toBe('test-local-model');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('test-local-model');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([
      { role: 'system', content: 'הוראות מערכת' },
      { role: 'user', content: 'בקשה' },
    ]);

    const tokens = await collect(opened.tokens);
    expect(tokens.join('')).toBe('{"status":"תקין","message":"עברית עוברת"}');
  });

  it('survives a malformed upstream chunk without dropping the stream', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamingResponse([
      ollamaNdjsonLine('שלום'),
      '{ this is not json }\n',
      ollamaNdjsonLine(' עולם'),
      ollamaNdjsonLine('', true),
    ]));

    const opened = await openOllamaStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl });
    expect((await collect(opened.tokens)).join('')).toBe('שלום עולם');
  });

  it('stops at the done marker', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamingResponse([
      ollamaNdjsonLine('A'),
      ollamaNdjsonLine('', true),
      ollamaNdjsonLine('never'),
    ]));
    const opened = await openOllamaStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl });
    expect(await collect(opened.tokens)).toEqual(['A']);
  });
});

describe('Ollama adapter — failure modes', () => {
  it('reports the service as unavailable when the connection is refused', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    }));
    const error = await expectCode(
      openOllamaStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    );
    expect(error.fallbackWorthy).toBe(true);
    expect(error.hint).toBe('ECONNREFUSED');
  });

  it('explains a missing model with the exact pull command and never runs it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('model "test-local-model" not found, try pulling it first', { status: 404 }));
    const error = await expectCode(
      openOllamaStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.MODEL_NOT_FOUND,
    );
    expect(error.hint).toContain('ollama pull test-local-model');
    expect(error.message).toContain('test-local-model');
  });

  it('refuses to start when no model is configured', async () => {
    await expectCode(
      openOllamaStream({
        config: makeConfig({ DEV_AI_OLLAMA_MODEL: '' }),
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl: vi.fn(),
      }),
      DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED,
    );
  });

  it('times out instead of hanging', async () => {
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const error = await expectCode(
      openOllamaStream({
        config: makeConfig({ DEV_AI_CONNECT_TIMEOUT_MS: '20' }),
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl,
      }),
      DEV_AI_ERROR_CODES.TIMEOUT,
    );
    expect(error.fallbackWorthy).toBe(true);
  });

  it('maps a 5xx to a fallback-worthy upstream error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('boom', { status: 502 }));
    const error = await expectCode(
      openOllamaStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
    );
    expect(error.fallbackWorthy).toBe(true);
  });
});

describe('Ollama probe', () => {
  it('reports reachable and model installed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      models: [{ name: 'other:latest' }, { name: 'test-local-model:latest' }],
    }));
    const probe = await probeOllama(makeConfig(), { fetchImpl });
    expect(probe).toMatchObject({ reachable: true, modelAvailable: true, configured: true, errorCode: '' });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/tags');
  });

  it('reports the configured model as missing when it is not installed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ models: [{ name: 'something-else' }] }));
    const probe = await probeOllama(makeConfig(), { fetchImpl });
    expect(probe.reachable).toBe(true);
    expect(probe.modelAvailable).toBe(false);
    expect(probe.errorCode).toBe(DEV_AI_ERROR_CODES.MODEL_NOT_FOUND);
  });

  it('reports unreachable when Ollama is not running', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }));
    const probe = await probeOllama(makeConfig(), { fetchImpl });
    expect(probe.reachable).toBe(false);
    expect(probe.errorCode).toBe(DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE);
  });
});
