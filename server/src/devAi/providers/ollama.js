import { DEV_AI_ERROR_CODES, devAiError } from '../errors.js';
import { splitNdjsonLines } from '../sse.js';
import {
  createUpstreamController,
  normalizeUpstreamStatus,
  normalizeUpstreamThrow,
  readErrorBody,
  readResponseChunks,
  safeCauseCode,
} from './http.js';

export const OLLAMA_PROVIDER_NAME = 'ollama';

function modelMatches(installedName, configuredModel) {
  const installed = String(installedName || '').trim().toLowerCase();
  const configured = String(configuredModel || '').trim().toLowerCase();
  if (!installed || !configured) return false;
  if (installed === configured) return true;
  // Ollama reports "name" with an explicit tag; "qwen3" installed as "qwen3:latest".
  if (!configured.includes(':') && installed === `${configured}:latest`) return true;
  if (!installed.includes(':') && configured === `${installed}:latest`) return true;
  return false;
}

export function missingModelHint(model) {
  return `הרץ ידנית: ollama pull ${model}`;
}

function assertConfigured(provider) {
  if (!provider.baseUrl) {
    throw devAiError(DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED, 'לא הוגדר DEV_AI_OLLAMA_BASE_URL.', {
      provider: OLLAMA_PROVIDER_NAME,
    });
  }
  if (!provider.model) {
    throw devAiError(
      DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED,
      'לא הוגדר מודל Ollama. קבע DEV_AI_OLLAMA_MODEL בסביבת השרת המקומית.',
      { provider: OLLAMA_PROVIDER_NAME },
    );
  }
}

/**
 * Connectivity + configured-model availability check.
 * Never generates tokens, so it is safe to call from /health and dev:ai:check.
 */
export async function probeOllama(config, { fetchImpl = fetch, timeoutMs } = {}) {
  const provider = config.providers.ollama;
  const started = Date.now();
  const result = {
    provider: OLLAMA_PROVIDER_NAME,
    configured: Boolean(provider.baseUrl && provider.model),
    baseUrl: provider.baseUrl,
    model: provider.model,
    reachable: false,
    modelAvailable: false,
    installedModelCount: 0,
    latencyMs: 0,
    errorCode: '',
  };

  if (!provider.baseUrl) {
    result.errorCode = DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED;
    return result;
  }

  const controller = createUpstreamController({
    connectTimeoutMs: timeoutMs || config.connectTimeoutMs,
    totalTimeoutMs: timeoutMs || config.connectTimeoutMs,
  });

  try {
    const response = await fetchImpl(`${provider.baseUrl}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    controller.markConnected();
    result.latencyMs = Date.now() - started;

    if (!response.ok) {
      result.errorCode = normalizeUpstreamStatus(OLLAMA_PROVIDER_NAME, response.status, await readErrorBody(response)).code;
      return result;
    }

    result.reachable = true;
    const payload = await response.json().catch(() => ({}));
    const models = Array.isArray(payload?.models) ? payload.models : [];
    result.installedModelCount = models.length;
    result.modelAvailable = Boolean(
      provider.model && models.some((entry) => modelMatches(entry?.name || entry?.model, provider.model)),
    );
    if (!provider.model) result.errorCode = DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED;
    else if (!result.modelAvailable) result.errorCode = DEV_AI_ERROR_CODES.MODEL_NOT_FOUND;
    return result;
  } catch (error) {
    result.latencyMs = Date.now() - started;
    result.errorCode = controller.abortReason
      ? DEV_AI_ERROR_CODES.TIMEOUT
      : DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE;
    result.hint = safeCauseCode(error);
    return result;
  } finally {
    controller.cleanup();
  }
}

/**
 * Opens an Ollama /api/chat stream and returns an async token iterator.
 *
 * System/user/assistant roles are forwarded untouched, so Site Builder's Hebrew
 * system prompts reach the model exactly as authored.
 */
export async function openOllamaStream({ config, messages, signal, fetchImpl = fetch }) {
  const provider = config.providers.ollama;
  assertConfigured(provider);

  const controller = createUpstreamController({
    connectTimeoutMs: config.connectTimeoutMs,
    totalTimeoutMs: config.timeoutMs,
    signal,
  });

  let response;
  try {
    response = await fetchImpl(`${provider.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: provider.model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        stream: true,
        ...(provider.numPredict > 0 ? { options: { num_predict: provider.numPredict } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (error) {
    const abortReason = controller.abortReason;
    controller.cleanup();
    throw normalizeUpstreamThrow(error, { provider: OLLAMA_PROVIDER_NAME, abortReason });
  }

  controller.markConnected();

  if (!response.ok) {
    const bodyText = await readErrorBody(response);
    controller.cleanup();
    const normalized = normalizeUpstreamStatus(OLLAMA_PROVIDER_NAME, response.status, bodyText);
    if (normalized.code === DEV_AI_ERROR_CODES.MODEL_NOT_FOUND) {
      normalized.message = `המודל "${provider.model}" אינו מותקן ב-Ollama.`;
      normalized.hint = missingModelHint(provider.model);
    }
    throw normalized;
  }

  async function* tokens() {
    let buffer = '';
    try {
      for await (const chunk of readResponseChunks(response)) {
        buffer += chunk;
        const { lines, remainder } = splitNdjsonLines(buffer);
        buffer = remainder;

        for (const line of lines) {
          let parsed;
          try {
            parsed = JSON.parse(line);
          } catch {
            // A malformed upstream chunk must not abort a healthy stream.
            continue;
          }
          if (parsed?.error) {
            throw devAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, `Ollama החזיר שגיאה במהלך הסטרימינג.`, {
              provider: OLLAMA_PROVIDER_NAME,
            });
          }
          const content = parsed?.message?.content ?? parsed?.response;
          if (typeof content === 'string' && content.length > 0) {
            yield content;
          }
          if (parsed?.done === true) return;
        }
      }

      const tail = buffer.trim();
      if (tail) {
        try {
          const parsed = JSON.parse(tail);
          const content = parsed?.message?.content ?? parsed?.response;
          if (typeof content === 'string' && content.length > 0) yield content;
        } catch {
          // Trailing partial chunk; nothing further to emit.
        }
      }
    } catch (error) {
      throw normalizeUpstreamThrow(error, {
        provider: OLLAMA_PROVIDER_NAME,
        abortReason: controller.abortReason,
      });
    } finally {
      controller.cleanup();
    }
  }

  return {
    provider: OLLAMA_PROVIDER_NAME,
    model: provider.model,
    tokens: tokens(),
    cancel: () => controller.abort('cancelled'),
  };
}

export const ollamaAdapter = Object.freeze({
  name: OLLAMA_PROVIDER_NAME,
  probe: probeOllama,
  openStream: openOllamaStream,
});
