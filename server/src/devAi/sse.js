/**
 * Normalized Server-Sent Events output.
 *
 * The DEV gateway is the ONLY place that knows about Groq SSE and Ollama NDJSON.
 * Everything downstream sees the OpenAI-style delta envelope that the existing
 * Site Builder `AIService._extractToken` already understands, terminated by the
 * `data: [DONE]` sentinel it already looks for.
 */

export const SSE_DONE_EVENT = 'data: [DONE]\n\n';

export const SSE_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Disables proxy buffering so tokens reach the browser as they are produced.
  'X-Accel-Buffering': 'no',
});

export function sseEvent(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Model text is transported verbatim: braces, markdown fences and raw JSON are
 * preserved byte-for-byte so `parseJsonFromModel` stays authoritative.
 */
export function sseTokenEvent(token, { model = '', provider = '' } = {}) {
  return sseEvent({
    object: 'chat.completion.chunk',
    model,
    provider,
    choices: [{ index: 0, delta: { content: token }, finish_reason: null }],
  });
}

export function sseErrorEvent(code, message, extra = {}) {
  return sseEvent({ error: { code, message, ...extra } });
}

/**
 * Incremental OpenAI-compatible SSE parser used by the Groq adapter.
 * Returns the complete events found so far plus the unconsumed remainder.
 */
export function splitSseEvents(buffer) {
  const parts = String(buffer).split(/\r?\n\r?\n/u);
  const remainder = parts.pop() ?? '';
  return { events: parts, remainder };
}

export function extractSseData(eventChunk) {
  const dataLines = [];
  for (const rawLine of String(eventChunk || '').split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  return dataLines.length > 0 ? dataLines.join('\n') : '';
}

export function extractOpenAiDeltaContent(parsed) {
  if (!parsed || typeof parsed !== 'object') return '';
  const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : null;
  if (!choice) return '';
  if (typeof choice?.delta?.content === 'string') return choice.delta.content;
  if (typeof choice?.message?.content === 'string') return choice.message.content;
  if (typeof choice?.text === 'string') return choice.text;
  return '';
}

/** Splits a buffer of newline-delimited JSON (Ollama) into whole lines. */
export function splitNdjsonLines(buffer) {
  const parts = String(buffer).split(/\r?\n/u);
  const remainder = parts.pop() ?? '';
  return { lines: parts.filter((line) => line.trim().length > 0), remainder };
}
