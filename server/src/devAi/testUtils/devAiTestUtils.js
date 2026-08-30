import { resolveDevAiConfig } from '../env.js';

/** Builds a DEV AI config without touching process.env or the developer secret file. */
export function makeConfig(overrides = {}) {
  return resolveDevAiConfig({
    env: {
      NODE_ENV: 'development',
      DEV_AI_ENABLED: 'true',
      DEV_AI_PROVIDER: 'auto',
      DEV_AI_OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      DEV_AI_OLLAMA_MODEL: 'test-local-model',
      DEV_AI_GROQ_BASE_URL: 'https://groq.test/openai/v1',
      DEV_AI_GROQ_MODEL: 'test-cloud-model',
      GROQ_API_KEY: 'test-key-never-logged',
      DEV_AI_TIMEOUT_MS: '2000',
      DEV_AI_CONNECT_TIMEOUT_MS: '500',
      DEV_AI_DEBUG: 'false',
      ...overrides,
    },
  });
}

/** A real Response whose body streams the given chunks, like a live provider. */
export function streamingResponse(chunks, init = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
    ...init,
  });
}

export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Groq-style SSE chunk carrying one content delta. */
export function groqSseChunk(content) {
  return `data: ${JSON.stringify({
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  })}\n\n`;
}

/** Ollama-style NDJSON line carrying one content delta. */
export function ollamaNdjsonLine(content, done = false) {
  return `${JSON.stringify({ message: { role: 'assistant', content }, done })}\n`;
}

/** Collects everything an async iterator yields. */
export async function collect(iterator) {
  const out = [];
  for await (const value of iterator) out.push(value);
  return out;
}

/** In-memory logger sink so tests can assert on what was (and was not) logged. */
export function createSinkSpy() {
  const lines = [];
  const push = (line) => lines.push(String(line));
  return {
    lines,
    log: push,
    error: push,
    text: () => lines.join('\n'),
  };
}

/** Adapter stub that never touches the network. */
export function fakeAdapter(name, { probe, openStream } = {}) {
  return {
    name,
    probe: probe || (async () => ({
      provider: name,
      configured: true,
      reachable: true,
      model: `${name}-model`,
      modelAvailable: true,
      latencyMs: 1,
      errorCode: '',
    })),
    openStream: openStream || (async () => ({
      provider: name,
      model: `${name}-model`,
      tokens: (async function* () { yield `token-from-${name}`; })(),
      cancel: () => {},
    })),
  };
}
