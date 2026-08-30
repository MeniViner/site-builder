import { DEV_AI_ERROR_CODES, devAiError } from './errors.js';
import { loadDevAiSecretFile, loadDevAiServerEnvFile, mergeDevAiEnv } from './secretFile.js';

export const DEV_AI_PROVIDERS = Object.freeze(['ollama', 'groq']);
export const DEV_AI_MODES = Object.freeze(['ollama', 'groq', 'auto']);

export const DEV_AI_DEFAULTS = Object.freeze({
  provider: 'auto',
  autoOrder: Object.freeze(['ollama', 'groq']),
  ollamaBaseUrl: 'http://127.0.0.1:11434',
  groqBaseUrl: 'https://api.groq.com/openai/v1',
  groqReasoningFormat: 'hidden',
  groqReasoningEffort: 'none',
  groqMaxTokens: 4096,
  timeoutMs: 60000,
  connectTimeoutMs: 5000,
  maxInputChars: 200000,
});

function parseBoolean(rawValue, defaultValue = false) {
  if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
    return defaultValue;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(rawValue).trim().toLowerCase());
}

function parsePositiveInt(rawValue, defaultValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : defaultValue;
}

function normalizeBaseUrl(rawValue, fallback) {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback;
  return raw.replace(/\/+$/u, '');
}

function parseAutoOrder(rawValue) {
  const parsed = String(rawValue || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => DEV_AI_PROVIDERS.includes(item));

  const deduped = [...new Set(parsed)];
  return deduped.length > 0 ? deduped : [...DEV_AI_DEFAULTS.autoOrder];
}

/** '', 'off' and 'none' all mean "do not send the parameter at all". */
function normalizeReasoningFormat(rawValue, defaultValue = DEV_AI_DEFAULTS.groqReasoningFormat) {
  if (rawValue === undefined) return defaultValue;
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === '' || normalized === 'off' || normalized === 'none') return '';
  return ['hidden', 'parsed', 'raw'].includes(normalized) ? normalized : defaultValue;
}

/** '' and 'off' mean "do not send the parameter at all". */
function normalizeReasoningEffort(rawValue, defaultValue = DEV_AI_DEFAULTS.groqReasoningEffort) {
  if (rawValue === undefined) return defaultValue;
  const normalized = String(rawValue).trim().toLowerCase();
  if (normalized === '' || normalized === 'off') return '';
  return ['none', 'default', 'low', 'medium', 'high'].includes(normalized) ? normalized : defaultValue;
}

function normalizeMode(rawValue) {
  const mode = String(rawValue || '').trim().toLowerCase();
  return DEV_AI_MODES.includes(mode) ? mode : DEV_AI_DEFAULTS.provider;
}

/**
 * Loads the DEV AI environment.
 *
 * Precedence, highest first:
 *   1. explicit process environment
 *   2. repository-local server/.env.local (DEV AI keys only)
 *   3. optional machine-local ~/.config/site-builder/dev-ai.env
 *   4. safe defaults, applied by resolveDevAiConfig
 *
 * None of the file sources are read when NODE_ENV=production.
 */
export function loadDevAiEnv({
  env = process.env,
  nodeEnv = env.NODE_ENV,
  loadSecretFile = loadDevAiSecretFile,
  loadServerEnvFile = loadDevAiServerEnvFile,
} = {}) {
  const serverEnvFile = loadServerEnvFile({ env, nodeEnv });
  const secretFile = loadSecretFile({ env, nodeEnv });
  const { env: merged, sources } = mergeDevAiEnv(
    env,
    { label: 'server-env-file', values: serverEnvFile.values || {} },
    { label: 'secret-file', values: secretFile.values || {} },
  );

  return {
    env: merged,
    sources,
    serverEnvFile: {
      path: serverEnvFile.path,
      exists: Boolean(serverEnvFile.exists),
      keys: serverEnvFile.keys || [],
    },
    secretFile: {
      path: secretFile.path,
      exists: Boolean(secretFile.exists),
      skippedForProduction: Boolean(secretFile.skippedForProduction),
      keys: secretFile.keys || [],
    },
  };
}

/**
 * Resolves the immutable DEV AI runtime configuration.
 *
 * `groq.apiKey` is intentionally defined as a NON-ENUMERABLE property: it is
 * invisible to JSON.stringify, console.log and util.inspect, so the key cannot
 * leak into logs, diagnostics or test snapshots by accident.
 */
export function resolveDevAiConfig(source = {}) {
  const env = source.env || source;
  const nodeEnv = String(env.NODE_ENV || 'development').trim();
  const isProduction = nodeEnv === 'production';

  const groqApiKey = String(env.GROQ_API_KEY || '').trim();
  const groq = {
    name: 'groq',
    baseUrl: normalizeBaseUrl(env.DEV_AI_GROQ_BASE_URL, DEV_AI_DEFAULTS.groqBaseUrl),
    model: String(env.DEV_AI_GROQ_MODEL || '').trim(),
    // Provider-level (NOT model-specific) parameter deciding where a reasoning
    // model puts its chain of thought. Site Builder prompts demand "JSON only",
    // so reasoning must not land in the content channel. Models that do not
    // support the parameter are handled by a single capability downgrade in the
    // adapter, so no model id is ever hardcoded in application logic.
    reasoningFormat: normalizeReasoningFormat(env.DEV_AI_GROQ_REASONING_FORMAT),
    // Site Builder prompts are structured transformations, not open-ended
    // reasoning tasks. Suppressing the chain of thought keeps the completion
    // budget for the actual JSON answer.
    reasoningEffort: normalizeReasoningEffort(env.DEV_AI_GROQ_REASONING_EFFORT),
    // Reasoning models spend completion budget on their chain of thought. Groq's
    // own default (2048) is not enough for Site Builder's structured JSON
    // prompts, so the DEV engine raises it and keeps it configurable. It must
    // still fit inside the account's tokens-per-minute allowance: prompt tokens
    // plus this value are charged against TPM, and an overage returns 413.
    maxTokens: parsePositiveInt(env.DEV_AI_GROQ_MAX_TOKENS, DEV_AI_DEFAULTS.groqMaxTokens),
    hasApiKey: groqApiKey.length > 0,
  };
  Object.defineProperty(groq, 'apiKey', {
    value: groqApiKey,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  const ollama = {
    name: 'ollama',
    baseUrl: normalizeBaseUrl(env.DEV_AI_OLLAMA_BASE_URL, DEV_AI_DEFAULTS.ollamaBaseUrl),
    model: String(env.DEV_AI_OLLAMA_MODEL || '').trim(),
    // Optional. 0 means "leave Ollama's own default alone".
    numPredict: parsePositiveInt(env.DEV_AI_OLLAMA_NUM_PREDICT, 0),
    hasApiKey: true,
  };

  return Object.freeze({
    nodeEnv,
    isProduction,
    // Registration gate: the route is never created in production.
    routeAllowed: !isProduction,
    // Operation gate: both NODE_ENV and DEV_AI_ENABLED must agree.
    enabled: !isProduction && parseBoolean(env.DEV_AI_ENABLED, false),
    mode: normalizeMode(env.DEV_AI_PROVIDER),
    autoOrder: Object.freeze(parseAutoOrder(env.DEV_AI_AUTO_ORDER)),
    timeoutMs: parsePositiveInt(env.DEV_AI_TIMEOUT_MS, DEV_AI_DEFAULTS.timeoutMs),
    connectTimeoutMs: parsePositiveInt(env.DEV_AI_CONNECT_TIMEOUT_MS, DEV_AI_DEFAULTS.connectTimeoutMs),
    maxInputChars: parsePositiveInt(env.DEV_AI_MAX_INPUT_CHARS, DEV_AI_DEFAULTS.maxInputChars),
    debug: parseBoolean(env.DEV_AI_DEBUG, true),
    providers: Object.freeze({ ollama: Object.freeze(ollama), groq: Object.freeze(groq) }),
  });
}

/** The DEV AI route may only be registered outside production. */
export function isDevAiRouteAllowed(config) {
  return Boolean(config && config.routeAllowed === true && config.isProduction !== true);
}

/** The DEV AI route may only serve traffic when both gates agree. */
export function isDevAiEnabled(config) {
  return isDevAiRouteAllowed(config) && config.enabled === true;
}

export function assertDevAiEnabled(config) {
  if (!config || config.isProduction) {
    throw devAiError(DEV_AI_ERROR_CODES.NOT_AVAILABLE_IN_PRODUCTION);
  }
  if (!config.enabled) {
    throw devAiError(DEV_AI_ERROR_CODES.DISABLED);
  }
  return config;
}

/** Ordered provider list for the current mode. */
export function resolveProviderOrder(config) {
  if (config.mode === 'ollama') return ['ollama'];
  if (config.mode === 'groq') return ['groq'];
  return [...config.autoOrder];
}

export function isProviderConfigured(config, providerName) {
  const provider = config.providers[providerName];
  if (!provider) return { configured: false, reason: 'unknown-provider' };
  if (providerName === 'groq' && !provider.hasApiKey) {
    return { configured: false, reason: 'missing-api-key' };
  }
  if (!provider.baseUrl) return { configured: false, reason: 'missing-base-url' };
  if (!provider.model) return { configured: false, reason: 'missing-model' };
  return { configured: true, reason: '' };
}

/**
 * The ONLY representation of the DEV AI configuration that may be serialized,
 * logged, returned from /health or printed by the diagnostic scripts.
 */
export function describeDevAiConfig(config) {
  return {
    enabled: config.enabled,
    nodeEnv: config.nodeEnv,
    mode: config.mode,
    autoOrder: [...config.autoOrder],
    timeoutMs: config.timeoutMs,
    connectTimeoutMs: config.connectTimeoutMs,
    maxInputChars: config.maxInputChars,
    providers: {
      ollama: {
        configured: isProviderConfigured(config, 'ollama').configured,
        baseUrl: config.providers.ollama.baseUrl,
        model: config.providers.ollama.model,
      },
      groq: {
        configured: isProviderConfigured(config, 'groq').configured,
        baseUrl: config.providers.groq.baseUrl,
        model: config.providers.groq.model,
        reasoningFormat: config.providers.groq.reasoningFormat || '(not sent)',
        reasoningEffort: config.providers.groq.reasoningEffort || '(not sent)',
        maxTokens: config.providers.groq.maxTokens,
        // Presence only. The value never leaves the server process.
        apiKeyPresent: config.providers.groq.hasApiKey,
      },
    },
  };
}
