import {
  DEV_AI_DEFAULTS,
  DEV_AI_MODES,
  DEV_AI_PROVIDERS,
  assertDevAiEnabled,
  describeDevAiConfig,
  isDevAiEnabled,
  isDevAiRouteAllowed,
  isProviderConfigured,
  loadDevAiEnv,
  resolveDevAiConfig,
  resolveProviderOrder,
} from './env.js';
import { DEV_AI_ERROR_CODES, DevAiError, devAiError, isDevAiError } from './errors.js';
import { inspectDevAi } from './health.js';
import { createDevAiLogger } from './logging.js';
import { DEV_AI_MOUNT_PATH, createDevAiMiddleware } from './middleware.js';
import { DEFAULT_ADAPTERS, openDevAiStream } from './router.js';
import { validateDevAiRequest } from './validation.js';

/**
 * THE production-isolation chokepoint.
 *
 * Returns `null` in production, which means no host (Vite dev server or the
 * Express API) can register the DEV AI route there — regardless of how
 * DEV_AI_ENABLED / VITE_DEV_AI_ENABLED are set. Outside production the route is
 * registered but only serves traffic when DEV_AI_ENABLED is also true.
 */
export function createDevAiRuntime({
  env = process.env,
  nodeEnv = env.NODE_ENV,
  adapters = DEFAULT_ADAPTERS,
  fetchImpl = fetch,
  loadEnv = loadDevAiEnv,
} = {}) {
  if (String(nodeEnv || '').trim() === 'production') {
    return null;
  }

  const loaded = loadEnv({ env: { ...env, NODE_ENV: nodeEnv || env.NODE_ENV || 'development' }, nodeEnv });
  const config = resolveDevAiConfig({ env: { ...loaded.env, NODE_ENV: nodeEnv || loaded.env.NODE_ENV || 'development' } });

  if (!isDevAiRouteAllowed(config)) {
    return null;
  }

  const logger = createDevAiLogger({ enabled: config.debug });

  return {
    config,
    mountPath: DEV_AI_MOUNT_PATH,
    secretFile: loaded.secretFile,
    serverEnvFile: loaded.serverEnvFile || { path: '', exists: false, keys: [] },
    logger,
    middleware: createDevAiMiddleware({ config, adapters, fetchImpl, logger }),
    describe: () => describeDevAiConfig(config),
    inspect: (options = {}) => inspectDevAi(config, { adapters, fetchImpl, ...options }),
  };
}

/** One-line startup banner. Prints only names and flags, never a secret value. */
export function devAiStartupBanner(runtime) {
  if (!runtime) return '[dev-ai] route not registered (production build)';
  const described = runtime.describe();
  if (!described.enabled) {
    return `[dev-ai] route registered at ${runtime.mountPath} but DEV AI is disabled (DEV_AI_ENABLED=false)`;
  }
  const secret = runtime.secretFile?.exists
    ? ` secret-file=${runtime.secretFile.keys.length} keys`
    : ' secret-file=absent';
  return `[dev-ai] enabled at ${runtime.mountPath} mode=${described.mode} order=${described.autoOrder.join(',')}`
    + ` ollama=${described.providers.ollama.model || '(unset)'} groq=${described.providers.groq.model || '(unset)'}`
    + `${secret}`;
}

export {
  DEFAULT_ADAPTERS,
  DEV_AI_DEFAULTS,
  DEV_AI_ERROR_CODES,
  DEV_AI_MODES,
  DEV_AI_MOUNT_PATH,
  DEV_AI_PROVIDERS,
  DevAiError,
  assertDevAiEnabled,
  createDevAiLogger,
  createDevAiMiddleware,
  describeDevAiConfig,
  devAiError,
  inspectDevAi,
  isDevAiEnabled,
  isDevAiError,
  isDevAiRouteAllowed,
  isProviderConfigured,
  loadDevAiEnv,
  openDevAiStream,
  resolveDevAiConfig,
  resolveProviderOrder,
  validateDevAiRequest,
};
