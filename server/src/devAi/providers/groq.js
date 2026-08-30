import { DEV_AI_ERROR_CODES, devAiError } from '../errors.js';
import { extractOpenAiDeltaContent, extractSseData, splitSseEvents } from '../sse.js';
import {
  createUpstreamController,
  normalizeUpstreamStatus,
  normalizeUpstreamThrow,
  readErrorBody,
  readResponseChunks,
  safeCauseCode,
} from './http.js';

export const GROQ_PROVIDER_NAME = 'groq';

/**
 * Builds the upstream Authorization header.
 *
 * This is the ONLY place the Groq key is read, it is read from the frozen
 * server-side config's non-enumerable field, and the returned object is never
 * logged, echoed in an error, or returned from /health.
 */
function authHeaders(provider) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${provider.apiKey}`,
  };
}

function assertConfigured(provider) {
  if (!provider.hasApiKey) {
    throw devAiError(
      DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
      'לא הוגדר GROQ_API_KEY בסביבת השרת המקומית (לעולם לא במשתנה VITE_).',
      { provider: GROQ_PROVIDER_NAME },
    );
  }
  if (!provider.baseUrl) {
    throw devAiError(DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED, 'לא הוגדר DEV_AI_GROQ_BASE_URL.', {
      provider: GROQ_PROVIDER_NAME,
    });
  }
  if (!provider.model) {
    throw devAiError(
      DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED,
      'לא הוגדר מודל Groq. קבע DEV_AI_GROQ_MODEL בסביבת השרת המקומית.',
      { provider: GROQ_PROVIDER_NAME },
    );
  }
}

/**
 * Server-side model listing. Returns model IDs only — never the key, never the
 * raw upstream envelope.
 */
export async function listGroqModels(config, { fetchImpl = fetch, timeoutMs } = {}) {
  const provider = config.providers.groq;
  if (!provider.hasApiKey) {
    throw devAiError(DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED, 'לא הוגדר GROQ_API_KEY.', {
      provider: GROQ_PROVIDER_NAME,
    });
  }

  const controller = createUpstreamController({
    connectTimeoutMs: timeoutMs || config.connectTimeoutMs,
    totalTimeoutMs: timeoutMs || Math.max(config.connectTimeoutMs * 3, 10000),
  });

  try {
    const response = await fetchImpl(`${provider.baseUrl}/models`, {
      method: 'GET',
      headers: authHeaders(provider),
      signal: controller.signal,
    });
    controller.markConnected();
    if (!response.ok) {
      throw normalizeUpstreamStatus(GROQ_PROVIDER_NAME, response.status, await readErrorBody(response));
    }
    const payload = await response.json().catch(() => ({}));
    const entries = Array.isArray(payload?.data) ? payload.data : [];
    return entries
      .map((entry) => String(entry?.id || '').trim())
      .filter(Boolean)
      .sort();
  } catch (error) {
    throw normalizeUpstreamThrow(error, {
      provider: GROQ_PROVIDER_NAME,
      abortReason: controller.abortReason,
    });
  } finally {
    controller.cleanup();
  }
}

/**
 * Authentication + configured-model availability check.
 * Uses the free model-list endpoint, so no paid generation happens for health.
 */
export async function probeGroq(config, { fetchImpl = fetch, timeoutMs } = {}) {
  const provider = config.providers.groq;
  const started = Date.now();
  const result = {
    provider: GROQ_PROVIDER_NAME,
    configured: Boolean(provider.hasApiKey && provider.baseUrl && provider.model),
    baseUrl: provider.baseUrl,
    model: provider.model,
    apiKeyPresent: provider.hasApiKey,
    reachable: false,
    modelAvailable: false,
    availableModelCount: 0,
    latencyMs: 0,
    errorCode: '',
  };

  if (!provider.hasApiKey) {
    result.errorCode = DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED;
    return result;
  }

  try {
    const ids = await listGroqModels(config, { fetchImpl, timeoutMs });
    result.latencyMs = Date.now() - started;
    result.reachable = true;
    result.availableModelCount = ids.length;
    result.modelAvailable = Boolean(provider.model && ids.includes(provider.model));
    if (!provider.model) result.errorCode = DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED;
    else if (!result.modelAvailable) result.errorCode = DEV_AI_ERROR_CODES.MODEL_NOT_FOUND;
    return result;
  } catch (error) {
    result.latencyMs = Date.now() - started;
    result.errorCode = error?.code || DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE;
    result.hint = safeCauseCode(error);
    return result;
  }
}

/**
 * Optional, provider-level (never model-specific) parameters.
 *
 * Site Builder prompts are structured transformations that demand "JSON only",
 * so a reasoning model's chain of thought must neither pollute the content
 * channel nor consume the completion budget. Both knobs are configuration; the
 * downgrade below removes whichever one the configured model rejects, so no
 * model id is ever hardcoded in application logic.
 */
export function optionalGroqParams(provider) {
  const params = {};
  if (provider.reasoningFormat) params.reasoning_format = provider.reasoningFormat;
  if (provider.reasoningEffort) params.reasoning_effort = provider.reasoningEffort;
  return params;
}

function buildChatBody(provider, messages, optionalParams) {
  const body = {
    model: provider.model,
    messages: messages.map((message) => ({ role: message.role, content: message.content })),
    stream: true,
    ...optionalParams,
  };
  if (provider.maxTokens > 0) {
    body.max_completion_tokens = provider.maxTokens;
  }
  return body;
}

const UNSUPPORTED_PARAM_HINTS = ['not supported', 'unsupported', 'unrecognized', 'must be one of'];

/**
 * Returns the name of an optional parameter the upstream rejected, or '' when
 * the failure is about something else. Model capabilities change over time, so
 * the adapter drops the offending parameter instead of pinning behaviour to a
 * model id.
 */
export function findUnsupportedParam(status, bodyText, candidates = []) {
  if (status !== 400 || candidates.length === 0) return '';

  try {
    const parsed = JSON.parse(String(bodyText || ''));
    const named = String(parsed?.error?.param || '').trim();
    if (named && candidates.includes(named)) return named;
  } catch {
    // Not JSON; fall through to substring matching.
  }

  const haystack = String(bodyText || '').toLowerCase();
  if (!UNSUPPORTED_PARAM_HINTS.some((hint) => haystack.includes(hint))) return '';
  return candidates.find((candidate) => haystack.includes(candidate.toLowerCase())) || '';
}

/** Opens a Groq OpenAI-compatible chat stream and returns an async token iterator. */
export async function openGroqStream({ config, messages, signal, fetchImpl = fetch, onDowngrade = () => {} }) {
  const provider = config.providers.groq;
  assertConfigured(provider);

  const controller = createUpstreamController({
    connectTimeoutMs: config.connectTimeoutMs,
    totalTimeoutMs: config.timeoutMs,
    signal,
  });

  const send = async (optionalParams) => fetchImpl(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(provider),
    body: JSON.stringify(buildChatBody(provider, messages, optionalParams)),
    signal: controller.signal,
  });

  const describeUpstreamFailure = (status, bodyText) => {
    const normalized = normalizeUpstreamStatus(GROQ_PROVIDER_NAME, status, bodyText);
    if (normalized.code === DEV_AI_ERROR_CODES.MODEL_NOT_FOUND) {
      normalized.message = `המודל "${provider.model}" אינו זמין בחשבון Groq הנוכחי.`;
      normalized.hint = 'עדכן את DEV_AI_GROQ_MODEL והרץ npm run dev:ai:check';
    }
    return normalized;
  };

  let response;
  try {
    let optionalParams = optionalGroqParams(provider);
    // Strictly bounded: at most one retry per optional parameter, never a loop.
    const maxDowngrades = Object.keys(optionalParams).length;

    response = await send(optionalParams);

    for (let downgrades = 0; !response.ok && downgrades < maxDowngrades; downgrades += 1) {
      const bodyText = await readErrorBody(response);
      const rejected = findUnsupportedParam(response.status, bodyText, Object.keys(optionalParams));
      if (!rejected) throw describeUpstreamFailure(response.status, bodyText);

      onDowngrade({ reason: `unsupported_parameter:${rejected}` });
      const { [rejected]: _removed, ...remaining } = optionalParams;
      void _removed;
      optionalParams = remaining;
      // Nothing has been streamed to the client yet, so retrying here cannot
      // splice two answers together.
      response = await send(optionalParams);
    }
  } catch (error) {
    const abortReason = controller.abortReason;
    controller.cleanup();
    throw normalizeUpstreamThrow(error, { provider: GROQ_PROVIDER_NAME, abortReason });
  }

  controller.markConnected();

  if (!response.ok) {
    const bodyText = await readErrorBody(response);
    controller.cleanup();
    throw describeUpstreamFailure(response.status, bodyText);
  }

  async function* tokens() {
    let buffer = '';
    try {
      for await (const chunk of readResponseChunks(response)) {
        buffer += chunk;
        const { events, remainder } = splitSseEvents(buffer);
        buffer = remainder;

        for (const event of events) {
          const data = extractSseData(event);
          if (!data) continue;
          if (data === '[DONE]') return;

          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Malformed upstream chunk: skip it rather than killing the stream.
            continue;
          }

          if (parsed?.error) {
            throw devAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, 'Groq החזיר שגיאה במהלך הסטרימינג.', {
              provider: GROQ_PROVIDER_NAME,
            });
          }

          const content = extractOpenAiDeltaContent(parsed);
          if (typeof content === 'string' && content.length > 0) yield content;
        }
      }
    } catch (error) {
      throw normalizeUpstreamThrow(error, {
        provider: GROQ_PROVIDER_NAME,
        abortReason: controller.abortReason,
      });
    } finally {
      controller.cleanup();
    }
  }

  return {
    provider: GROQ_PROVIDER_NAME,
    model: provider.model,
    tokens: tokens(),
    cancel: () => controller.abort('cancelled'),
  };
}

export const groqAdapter = Object.freeze({
  name: GROQ_PROVIDER_NAME,
  probe: probeGroq,
  openStream: openGroqStream,
  listModels: listGroqModels,
});
