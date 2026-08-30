import { DEV_AI_ERROR_CODES, devAiError, isDevAiError } from './errors.js';
import { isProviderConfigured, resolveProviderOrder } from './env.js';
import { ClientDisconnected } from './providers/http.js';
import { groqAdapter } from './providers/groq.js';
import { ollamaAdapter } from './providers/ollama.js';

export const DEFAULT_ADAPTERS = Object.freeze({
  ollama: ollamaAdapter,
  groq: groqAdapter,
});

/**
 * Opens a DEV AI stream, honouring the configured provider mode.
 *
 * Commit semantics: a provider is only "committed" once its first token has
 * been pulled successfully. Fallback can therefore never splice two answers
 * together — after the stream has materially begun, the original failure is
 * returned instead of a silent provider switch.
 */
export async function openDevAiStream({
  config,
  messages,
  signal,
  adapters = DEFAULT_ADAPTERS,
  fetchImpl = fetch,
  onAttempt = () => {},
  onFallback = () => {},
  onNotice = () => {},
}) {
  const order = resolveProviderOrder(config);
  const explicitMode = config.mode !== 'auto';
  const attempts = [];
  let lastError = null;

  for (let index = 0; index < order.length; index += 1) {
    const providerName = order[index];
    const adapter = adapters[providerName];
    onAttempt(providerName);

    let error = null;
    try {
      if (!adapter) {
        throw devAiError(DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED, `ספק לא מוכר: ${providerName}`, {
          provider: providerName,
        });
      }

      const configured = isProviderConfigured(config, providerName);
      if (!configured.configured) {
        throw devAiError(
          configured.reason === 'missing-model'
            ? DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED
            : DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          `ספק ${providerName} אינו מוגדר במלואו (${configured.reason}).`,
          { provider: providerName },
        );
      }

      const opened = await adapter.openStream({
        config,
        messages,
        signal,
        fetchImpl,
        onDowngrade: (details) => onNotice({ provider: providerName, ...details }),
      });

      // Pull the first token BEFORE committing. Everything up to this point is
      // still safely retryable against the next provider.
      const first = await opened.tokens.next();
      if (first.done) {
        attempts.push({ provider: providerName, outcome: 'empty' });
        return {
          provider: providerName,
          model: opened.model,
          firstToken: '',
          tokens: emptyIterator(),
          cancel: opened.cancel,
          attempts,
        };
      }

      attempts.push({ provider: providerName, outcome: 'committed' });
      return {
        provider: providerName,
        model: opened.model,
        firstToken: first.value,
        tokens: opened.tokens,
        cancel: opened.cancel,
        attempts,
      };
    } catch (caught) {
      if (caught instanceof ClientDisconnected) throw caught;
      error = isDevAiError(caught)
        ? caught
        : devAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, `ספק ${providerName} נכשל.`, { provider: providerName });
    }

    lastError = error;
    attempts.push({
      provider: providerName,
      outcome: 'failed',
      errorCode: error.code,
      upstreamStatus: error.upstreamStatus,
    });

    const hasNext = index < order.length - 1;
    if (explicitMode) break;
    if (!error.fallbackWorthy) break;
    if (!hasNext) break;

    onFallback({
      from: providerName,
      to: order[index + 1],
      reason: error.code,
      upstreamStatus: error.upstreamStatus,
    });
  }

  if (!lastError) {
    throw devAiError(DEV_AI_ERROR_CODES.ALL_PROVIDERS_FAILED, undefined, { provider: null });
  }

  if (explicitMode || order.length === 1 || !lastError.fallbackWorthy) {
    lastError.attempts = attempts;
    throw lastError;
  }

  const aggregate = devAiError(
    DEV_AI_ERROR_CODES.ALL_PROVIDERS_FAILED,
    `כל ספקי ה-AI לפיתוח נכשלו (${attempts
      .filter((attempt) => attempt.outcome === 'failed')
      .map((attempt) => `${attempt.provider}:${attempt.errorCode}`)
      .join(', ')}).`,
    { hint: 'npm run dev:ai:check' },
  );
  aggregate.attempts = attempts;
  throw aggregate;
}

async function* emptyIterator() {
  // Intentionally empty: a provider that closed without producing a token.
}
