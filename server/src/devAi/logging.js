/**
 * DEV-only structured diagnostics.
 *
 * Only the whitelisted metadata fields below are ever emitted. Prompts, widget
 * or site content, model output text, API keys and authorization headers are
 * structurally incapable of reaching the log because anything outside the
 * whitelist is dropped rather than redacted.
 */
const ALLOWED_FIELDS = Object.freeze([
  'event',
  'requestId',
  'mode',
  'providerOrder',
  'attemptedProvider',
  'resolvedProvider',
  'requestedModel',
  'resolvedModel',
  'messageCount',
  'inputChars',
  'durationMs',
  'fallbackFrom',
  'fallbackTo',
  'fallbackReason',
  'upstreamStatus',
  'errorCode',
  'outcome',
  'reachable',
  'modelAvailable',
  'configured',
  'secretFileLoaded',
  'secretFileKeys',
  'tokensEmitted',
]);

const ALLOWED_FIELD_SET = new Set(ALLOWED_FIELDS);

export function sanitizeDevAiLogFields(fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELD_SET.has(key)) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }
    if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
      safe[key] = [...value];
    }
  }
  return safe;
}

export function createDevAiLogger({ enabled = true, sink = console } = {}) {
  const emit = (level, fields) => {
    if (!enabled) return;
    const safe = sanitizeDevAiLogFields(fields);
    const writer = level === 'error' ? sink.error : sink.log;
    if (typeof writer !== 'function') return;
    writer.call(sink, `[dev-ai] ${JSON.stringify(safe)}`);
  };

  return {
    info: (fields) => emit('info', fields),
    error: (fields) => emit('error', fields),
    allowedFields: ALLOWED_FIELDS,
  };
}

let requestCounter = 0;

export function createRequestId(now = Date.now()) {
  requestCounter = (requestCounter + 1) % 100000;
  return `devai_${now.toString(36)}_${requestCounter.toString(36).padStart(4, '0')}`;
}
