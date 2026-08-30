import { describe, expect, it, vi } from 'vitest';
import { DEV_AI_ERROR_CODES } from '../errors.js';
import { findUnsupportedParam, listGroqModels, openGroqStream, optionalGroqParams, probeGroq } from './groq.js';
import {
  collect,
  groqSseChunk,
  jsonResponse,
  makeConfig,
  streamingResponse,
} from '../testUtils/devAiTestUtils.js';

const SECRET = 'test-key-never-logged';

async function expectCode(promise, code) {
  try {
    await promise;
  } catch (error) {
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected ${code}`);
}

describe('Groq adapter — successful SSE stream', () => {
  it('normalizes Groq SSE deltas and preserves Hebrew and JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamingResponse([
      groqSseChunk('{"status":"'),
      groqSseChunk('תקין'),
      groqSseChunk('","message":"מנוע ה-AI המקומי עובד בעברית"}'),
      'data: [DONE]\n\n',
    ]));

    const opened = await openGroqStream({
      config: makeConfig(),
      messages: [{ role: 'system', content: 'מערכת' }, { role: 'user', content: 'בקשה' }],
      fetchImpl,
    });

    expect(opened.provider).toBe('groq');
    expect(opened.model).toBe('test-cloud-model');

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://groq.test/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(init.body);
    expect(body.model).toBe('test-cloud-model');
    expect(body.stream).toBe(true);
    expect(body.messages).toEqual([
      { role: 'system', content: 'מערכת' },
      { role: 'user', content: 'בקשה' },
    ]);

    const content = (await collect(opened.tokens)).join('');
    expect(content).toBe('{"status":"תקין","message":"מנוע ה-AI המקומי עובד בעברית"}');
    expect(JSON.parse(content).status).toBe('תקין');
  });

  it('sends the configured completion budget and reasoning suppression parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamingResponse(['data: [DONE]\n\n']));
    await openGroqStream({
      config: makeConfig({
        DEV_AI_GROQ_MAX_TOKENS: '3000',
        DEV_AI_GROQ_REASONING_FORMAT: 'hidden',
        DEV_AI_GROQ_REASONING_EFFORT: 'none',
      }),
      messages: [{ role: 'user', content: 'x' }],
      fetchImpl,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.max_completion_tokens).toBe(3000);
    expect(body.reasoning_format).toBe('hidden');
    expect(body.reasoning_effort).toBe('none');
  });

  it('omits optional parameters that are switched off', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(streamingResponse(['data: [DONE]\n\n']));
    await openGroqStream({
      config: makeConfig({ DEV_AI_GROQ_REASONING_FORMAT: 'off', DEV_AI_GROQ_REASONING_EFFORT: 'off' }),
      messages: [{ role: 'user', content: 'x' }],
      fetchImpl,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).not.toHaveProperty('reasoning_format');
    expect(body).not.toHaveProperty('reasoning_effort');
    expect(optionalGroqParams(makeConfig({
      DEV_AI_GROQ_REASONING_FORMAT: 'off',
      DEV_AI_GROQ_REASONING_EFFORT: 'off',
    }).providers.groq)).toEqual({});
  });

  it('drops exactly the parameter the model rejects, then succeeds', async () => {
    const onDowngrade = vi.fn();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ error: { message: '`reasoning_format` is not supported with this model', param: 'reasoning_format' } }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ))
      .mockResolvedValueOnce(streamingResponse([groqSseChunk('שלום'), 'data: [DONE]\n\n']));

    const opened = await openGroqStream({
      config: makeConfig({ DEV_AI_GROQ_REASONING_FORMAT: 'hidden', DEV_AI_GROQ_REASONING_EFFORT: 'none' }),
      messages: [{ role: 'user', content: 'x' }],
      fetchImpl,
      onDowngrade,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(onDowngrade).toHaveBeenCalledWith({ reason: 'unsupported_parameter:reasoning_format' });
    const retryBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(retryBody).not.toHaveProperty('reasoning_format');
    // The parameter the model did NOT reject is kept.
    expect(retryBody.reasoning_effort).toBe('none');
    expect((await collect(opened.tokens)).join('')).toBe('שלום');
  });

  it('bounds the downgrade to one retry per optional parameter', async () => {
    const rejection = (param) => new Response(
      JSON.stringify({ error: { message: `\`${param}\` is not supported with this model`, param } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(rejection('reasoning_format'))
      .mockResolvedValueOnce(rejection('reasoning_effort'))
      .mockResolvedValueOnce(rejection('reasoning_effort'));

    await expectCode(
      openGroqStream({
        config: makeConfig({ DEV_AI_GROQ_REASONING_FORMAT: 'hidden', DEV_AI_GROQ_REASONING_EFFORT: 'none' }),
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl,
      }),
      DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
    );
    // Initial attempt + at most two downgrades. Never a loop.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not downgrade for an unrelated 400', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('some other bad request', { status: 400 }));
    await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('identifies the rejected parameter from the body or the JSON param field', () => {
    const candidates = ['reasoning_format', 'reasoning_effort'];
    expect(findUnsupportedParam(400, '{"error":{"param":"reasoning_effort"}}', candidates)).toBe('reasoning_effort');
    expect(findUnsupportedParam(400, '`reasoning_format` is not supported with this model', candidates)).toBe('reasoning_format');
    expect(findUnsupportedParam(400, 'some other bad request', candidates)).toBe('');
    expect(findUnsupportedParam(500, '`reasoning_format` is not supported', candidates)).toBe('');
    expect(findUnsupportedParam(400, '`reasoning_format` is not supported', [])).toBe('');
  });
});

describe('Groq adapter — failure modes', () => {
  it('maps 429 to a fallback-worthy rate-limit error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.RATE_LIMITED,
    );
    expect(error.fallbackWorthy).toBe(true);
    expect(error.status).toBe(429);
  });

  it('maps a 413 tokens-per-minute overage to a fallback-worthy rate limit', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Request too large ... on tokens per minute (TPM): Limit 8000', code: 'rate_limit_exceeded' } }),
      { status: 413, headers: { 'content-type': 'application/json' } },
    ));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.RATE_LIMITED,
    );
    expect(error.fallbackWorthy).toBe(true);
    expect(error.message).toContain('DEV_AI_GROQ_MAX_TOKENS');
  });

  it('maps a plain 413 to a fallback-worthy oversized-input error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('payload too large', { status: 413 }));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.INPUT_TOO_LARGE,
    );
    expect(error.fallbackWorthy).toBe(true);
  });

  it('maps 500 to a fallback-worthy upstream error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('server error', { status: 500 }));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
    );
    expect(error.fallbackWorthy).toBe(true);
  });

  it('treats invalid authentication as a permanent, NON fallback-worthy configuration fault', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Invalid API Key', { status: 401 }));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
    );
    expect(error.fallbackWorthy).toBe(false);
    expect(error.message).not.toContain(SECRET);
  });

  it('reports a missing model without inventing a replacement', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { code: 'model_not_found' } }),
      { status: 404, headers: { 'content-type': 'application/json' } },
    ));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.MODEL_NOT_FOUND,
    );
    expect(error.message).toContain('test-cloud-model');
    expect(error.hint).toContain('DEV_AI_GROQ_MODEL');
  });

  it('times out instead of hanging', async () => {
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    await expectCode(
      openGroqStream({
        config: makeConfig({ DEV_AI_CONNECT_TIMEOUT_MS: '20' }),
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl,
      }),
      DEV_AI_ERROR_CODES.TIMEOUT,
    );
  });

  it('refuses to call the network without an API key', async () => {
    const fetchImpl = vi.fn();
    const error = await expectCode(
      openGroqStream({
        config: makeConfig({ GROQ_API_KEY: '' }),
        messages: [{ role: 'user', content: 'x' }],
        fetchImpl,
      }),
      DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(error.message).toContain('GROQ_API_KEY');
    expect(error.message).toContain('VITE_');
  });

  it('never echoes the key into an error message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(
      `upstream echoed the header Authorization: Bearer ${SECRET}`,
      { status: 400 },
    ));
    const error = await expectCode(
      openGroqStream({ config: makeConfig(), messages: [{ role: 'user', content: 'x' }], fetchImpl }),
      DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
    );
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });
});

describe('Groq model listing and probe', () => {
  it('returns sorted model ids only', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({
      data: [{ id: 'zzz', owned_by: 'x' }, { id: 'aaa' }],
    }));
    const ids = await listGroqModels(makeConfig(), { fetchImpl });
    expect(ids).toEqual(['aaa', 'zzz']);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://groq.test/openai/v1/models');
  });

  it('probes authentication and model availability without generating tokens', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: 'test-cloud-model' }] }));
    const probe = await probeGroq(makeConfig(), { fetchImpl });
    expect(probe).toMatchObject({ reachable: true, modelAvailable: true, configured: true, apiKeyPresent: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toContain('/models');
    expect(JSON.stringify(probe)).not.toContain(SECRET);
  });

  it('reports an unconfigured provider without contacting the network', async () => {
    const fetchImpl = vi.fn();
    const probe = await probeGroq(makeConfig({ GROQ_API_KEY: '' }), { fetchImpl });
    expect(probe.apiKeyPresent).toBe(false);
    expect(probe.reachable).toBe(false);
    expect(probe.errorCode).toBe(DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('reports a bad key as unreachable without leaking it', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Invalid API Key', { status: 401 }));
    const probe = await probeGroq(makeConfig(), { fetchImpl });
    expect(probe.reachable).toBe(false);
    expect(probe.errorCode).toBe(DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED);
    expect(JSON.stringify(probe)).not.toContain(SECRET);
  });
});
