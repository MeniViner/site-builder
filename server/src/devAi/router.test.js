import { describe, expect, it, vi } from 'vitest';
import { DEV_AI_ERROR_CODES, devAiError } from './errors.js';
import { openDevAiStream } from './router.js';
import { collect, fakeAdapter, makeConfig } from './testUtils/devAiTestUtils.js';

function failingAdapter(name, error) {
  return fakeAdapter(name, {
    openStream: vi.fn(async () => {
      throw error;
    }),
  });
}

function healthyAdapter(name, chunks = [`from-${name}`]) {
  return fakeAdapter(name, {
    openStream: vi.fn(async () => ({
      provider: name,
      model: `${name}-model`,
      tokens: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
      cancel: () => {},
    })),
  });
}

async function readAll(opened) {
  return [opened.firstToken, ...(await collect(opened.tokens))].join('');
}

async function expectCode(promise, code) {
  try {
    await promise;
  } catch (error) {
    expect(error.code).toBe(code);
    return error;
  }
  throw new Error(`expected ${code}`);
}

const messages = [{ role: 'user', content: 'בקשה בעברית' }];

describe('auto mode', () => {
  it('prefers Ollama when it is healthy', async () => {
    const ollama = healthyAdapter('ollama', ['שלום ', 'מ-Ollama']);
    const groq = healthyAdapter('groq');
    const opened = await openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } });

    expect(opened.provider).toBe('ollama');
    expect(await readAll(opened)).toBe('שלום מ-Ollama');
    expect(groq.openStream).not.toHaveBeenCalled();
  });

  it('falls back to Groq when Ollama is down', async () => {
    const ollama = failingAdapter('ollama', devAiError(DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'down', { provider: 'ollama' }));
    const groq = healthyAdapter('groq', ['שלום מ-Groq']);
    const onFallback = vi.fn();

    const opened = await openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq }, onFallback });

    expect(opened.provider).toBe('groq');
    expect(await readAll(opened)).toBe('שלום מ-Groq');
    expect(onFallback).toHaveBeenCalledWith(expect.objectContaining({
      from: 'ollama',
      to: 'groq',
      reason: DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    }));
  });

  it('falls back when the local model is missing', async () => {
    const ollama = failingAdapter('ollama', devAiError(DEV_AI_ERROR_CODES.MODEL_NOT_FOUND, 'missing', { provider: 'ollama' }));
    const groq = healthyAdapter('groq');
    const opened = await openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } });
    expect(opened.provider).toBe('groq');
  });

  it('falls back on a rate limit and on a provider 5xx', async () => {
    for (const code of [DEV_AI_ERROR_CODES.RATE_LIMITED, DEV_AI_ERROR_CODES.UPSTREAM_ERROR, DEV_AI_ERROR_CODES.TIMEOUT]) {
      const ollama = failingAdapter('ollama', devAiError(code, 'x', { provider: 'ollama' }));
      const groq = healthyAdapter('groq');
      const opened = await openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } });
      expect(opened.provider).toBe('groq');
    }
  });

  it('skips a provider that is not fully configured', async () => {
    const ollama = healthyAdapter('ollama');
    const groq = healthyAdapter('groq');
    const opened = await openDevAiStream({
      config: makeConfig({ DEV_AI_OLLAMA_MODEL: '' }),
      messages,
      adapters: { ollama, groq },
    });
    expect(opened.provider).toBe('groq');
    expect(ollama.openStream).not.toHaveBeenCalled();
  });

  it('returns a structured failure when every provider fails', async () => {
    const ollama = failingAdapter('ollama', devAiError(DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'down', { provider: 'ollama' }));
    const groq = failingAdapter('groq', devAiError(DEV_AI_ERROR_CODES.RATE_LIMITED, '429', { provider: 'groq' }));

    const error = await expectCode(
      openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } }),
      DEV_AI_ERROR_CODES.ALL_PROVIDERS_FAILED,
    );
    expect(error.message).toContain('ollama:DEV_AI_PROVIDER_UNAVAILABLE');
    expect(error.message).toContain('groq:DEV_AI_RATE_LIMITED');
  });

  it('does NOT fall back on a permanent configuration fault', async () => {
    const ollama = failingAdapter('ollama', devAiError(
      DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
      'bad credentials',
      { provider: 'ollama', upstreamStatus: 401, fallbackWorthy: false },
    ));
    const groq = healthyAdapter('groq');

    await expectCode(
      openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } }),
      DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
    );
    expect(groq.openStream).not.toHaveBeenCalled();
  });

  it('does NOT fall back on an invalid request', async () => {
    const ollama = failingAdapter('ollama', devAiError(DEV_AI_ERROR_CODES.INVALID_REQUEST, 'bad prompt', { provider: 'ollama' }));
    const groq = healthyAdapter('groq');
    await expectCode(
      openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } }),
      DEV_AI_ERROR_CODES.INVALID_REQUEST,
    );
    expect(groq.openStream).not.toHaveBeenCalled();
  });

  it('never switches provider after streaming has materially begun', async () => {
    const ollama = fakeAdapter('ollama', {
      openStream: async () => ({
        provider: 'ollama',
        model: 'ollama-model',
        tokens: (async function* () {
          yield 'התחלה';
          throw devAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, 'died mid-stream', { provider: 'ollama' });
        })(),
        cancel: () => {},
      }),
    });
    const groq = healthyAdapter('groq');

    const opened = await openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } });
    expect(opened.provider).toBe('ollama');
    expect(opened.firstToken).toBe('התחלה');

    // The mid-stream failure surfaces as the original error; Groq is never asked.
    await expect(collect(opened.tokens)).rejects.toMatchObject({ code: DEV_AI_ERROR_CODES.UPSTREAM_ERROR });
    expect(groq.openStream).not.toHaveBeenCalled();
  });

  it('honours a custom auto order', async () => {
    const ollama = healthyAdapter('ollama');
    const groq = healthyAdapter('groq');
    const opened = await openDevAiStream({
      config: makeConfig({ DEV_AI_AUTO_ORDER: 'groq,ollama' }),
      messages,
      adapters: { ollama, groq },
    });
    expect(opened.provider).toBe('groq');
    expect(ollama.openStream).not.toHaveBeenCalled();
  });

  it('commits a provider that closes without emitting a token', async () => {
    const ollama = fakeAdapter('ollama', {
      openStream: async () => ({
        provider: 'ollama',
        model: 'ollama-model',
        tokens: (async function* () {})(),
        cancel: () => {},
      }),
    });
    const groq = healthyAdapter('groq');
    const opened = await openDevAiStream({ config: makeConfig(), messages, adapters: { ollama, groq } });
    expect(opened.provider).toBe('ollama');
    expect(opened.firstToken).toBe('');
    expect(groq.openStream).not.toHaveBeenCalled();
  });
});

describe('explicit provider modes', () => {
  it('mode=ollama never calls Groq, even when Ollama is down', async () => {
    const ollama = failingAdapter('ollama', devAiError(DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE, 'down', { provider: 'ollama' }));
    const groq = healthyAdapter('groq');

    const error = await expectCode(
      openDevAiStream({ config: makeConfig({ DEV_AI_PROVIDER: 'ollama' }), messages, adapters: { ollama, groq } }),
      DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    );
    expect(error.provider).toBe('ollama');
    expect(groq.openStream).not.toHaveBeenCalled();
  });

  it('mode=groq never calls Ollama', async () => {
    const ollama = healthyAdapter('ollama');
    const groq = healthyAdapter('groq');
    const opened = await openDevAiStream({
      config: makeConfig({ DEV_AI_PROVIDER: 'groq' }),
      messages,
      adapters: { ollama, groq },
    });
    expect(opened.provider).toBe('groq');
    expect(ollama.openStream).not.toHaveBeenCalled();
  });

  it('mode=ollama is the offline/privacy mode: no cloud call on a rate limit either', async () => {
    const ollama = failingAdapter('ollama', devAiError(DEV_AI_ERROR_CODES.RATE_LIMITED, 'x', { provider: 'ollama' }));
    const groq = healthyAdapter('groq');
    await expectCode(
      openDevAiStream({ config: makeConfig({ DEV_AI_PROVIDER: 'ollama' }), messages, adapters: { ollama, groq } }),
      DEV_AI_ERROR_CODES.RATE_LIMITED,
    );
    expect(groq.openStream).not.toHaveBeenCalled();
  });
});
