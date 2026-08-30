import { DEV_AI_ERROR_CODES, DevAiError, devAiError } from '../errors.js';

const MODEL_NOT_FOUND_HINTS = [
  'model_not_found',
  'model not found',
  'does not exist',
  'not found, try pulling it first',
  'unknown model',
];

/**
 * Two-stage abort control:
 *   - connect timeout guards the time until upstream response headers arrive
 *   - total timeout guards the whole exchange
 * Both are cleared when the caller finishes, and a caller-supplied signal
 * (browser disconnect) aborts the upstream request immediately.
 */
export function createUpstreamController({ connectTimeoutMs, totalTimeoutMs, signal } = {}) {
  const controller = new AbortController();
  const state = { reason: null };

  const abortWith = (reason) => {
    if (state.reason) return;
    state.reason = reason;
    controller.abort();
  };

  let connectTimer = null;
  let totalTimer = null;

  if (Number.isFinite(connectTimeoutMs) && connectTimeoutMs > 0) {
    connectTimer = setTimeout(() => abortWith('connect-timeout'), connectTimeoutMs);
  }
  if (Number.isFinite(totalTimeoutMs) && totalTimeoutMs > 0) {
    totalTimer = setTimeout(() => abortWith('total-timeout'), totalTimeoutMs);
  }

  const onClientAbort = () => abortWith('client-abort');
  if (signal) {
    if (signal.aborted) onClientAbort();
    else signal.addEventListener('abort', onClientAbort, { once: true });
  }

  return {
    signal: controller.signal,
    get abortReason() {
      return state.reason;
    },
    markConnected() {
      if (connectTimer) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
    },
    cleanup() {
      if (connectTimer) clearTimeout(connectTimer);
      if (totalTimer) clearTimeout(totalTimer);
      connectTimer = null;
      totalTimer = null;
      if (signal) signal.removeEventListener('abort', onClientAbort);
    },
    abort(reason = 'cancelled') {
      abortWith(reason);
    },
  };
}

export class ClientDisconnected extends Error {
  constructor() {
    super('client disconnected');
    this.name = 'ClientDisconnected';
  }
}

/** Maps a thrown fetch/stream error into the DEV AI taxonomy. */
export function normalizeUpstreamThrow(error, { provider, abortReason }) {
  if (error instanceof DevAiError) return error;

  if (abortReason === 'client-abort') return new ClientDisconnected();

  if (abortReason === 'connect-timeout' || abortReason === 'total-timeout' || error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return devAiError(
      DEV_AI_ERROR_CODES.TIMEOUT,
      `ספק ${provider} לא השיב בזמן שהוקצב.`,
      { provider },
    );
  }

  return devAiError(
    DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
    `לא ניתן להתחבר לספק ${provider}.`,
    { provider, hint: safeCauseCode(error) },
  );
}

/** Only the error CODE is surfaced; the message may embed a URL with credentials. */
export function safeCauseCode(error) {
  const code = error?.cause?.code || error?.code || error?.errno;
  return typeof code === 'string' ? code : '';
}

export async function readErrorBody(response, maxChars = 2000) {
  try {
    const text = await response.text();
    return String(text || '').slice(0, maxChars);
  } catch {
    return '';
  }
}

function looksLikeModelNotFound(bodyText) {
  const haystack = String(bodyText || '').toLowerCase();
  return MODEL_NOT_FOUND_HINTS.some((hint) => haystack.includes(hint));
}

/**
 * Maps an upstream non-2xx response onto the DEV AI taxonomy.
 *
 * The raw upstream body is NEVER forwarded verbatim: only the status and a
 * classification survive, so an upstream echo of a request header can never
 * carry a credential into a client-visible message.
 */
export function looksLikeRateLimit(bodyText) {
  const haystack = String(bodyText || '').toLowerCase();
  return haystack.includes('rate_limit') || haystack.includes('rate limit') || haystack.includes('tokens per minute');
}

export function normalizeUpstreamStatus(provider, status, bodyText) {
  if (status === 429) {
    return devAiError(DEV_AI_ERROR_CODES.RATE_LIMITED, `ספק ${provider} החזיר 429 (חריגת קצב).`, {
      provider,
      upstreamStatus: status,
    });
  }

  // Groq reports a tokens-per-minute overage as 413 rather than 429.
  if (status === 413) {
    if (looksLikeRateLimit(bodyText)) {
      return devAiError(
        DEV_AI_ERROR_CODES.RATE_LIMITED,
        `ספק ${provider} החזיר חריגת קצב טוקנים (413). הקטן את DEV_AI_GROQ_MAX_TOKENS או המתן רגע.`,
        { provider, upstreamStatus: status },
      );
    }
    return devAiError(
      DEV_AI_ERROR_CODES.INPUT_TOO_LARGE,
      `ספק ${provider} דחה את הבקשה בגלל גודל (413).`,
      { provider, upstreamStatus: status, fallbackWorthy: true },
    );
  }

  if (status === 401 || status === 403) {
    return devAiError(
      DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
      `אימות מול ספק ${provider} נכשל (${status}). בדוק את הגדרות השרת המקומיות.`,
      { provider, upstreamStatus: status, fallbackWorthy: false },
    );
  }

  if (status === 404 || looksLikeModelNotFound(bodyText)) {
    return devAiError(
      DEV_AI_ERROR_CODES.MODEL_NOT_FOUND,
      `המודל שהוגדר אינו זמין אצל ספק ${provider} (${status}).`,
      { provider, upstreamStatus: status },
    );
  }

  if (status >= 500) {
    return devAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, `ספק ${provider} החזיר שגיאת שרת ${status}.`, {
      provider,
      upstreamStatus: status,
    });
  }

  return devAiError(
    DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
    `ספק ${provider} דחה את הבקשה (${status}).`,
    { provider, upstreamStatus: status, fallbackWorthy: false },
  );
}

/** Yields decoded UTF-8 chunks from a fetch Response body. */
export async function* readResponseChunks(response) {
  const body = response.body;
  if (!body) return;

  const decoder = new TextDecoder('utf-8');

  if (typeof body.getReader === 'function') {
    const reader = body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield decoder.decode(value, { stream: true });
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The upstream is already finished or aborted.
      }
    }
    return;
  }

  for await (const value of body) {
    yield typeof value === 'string' ? value : decoder.decode(value, { stream: true });
  }
}
