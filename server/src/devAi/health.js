import { describeDevAiConfig, isProviderConfigured, resolveProviderOrder } from './env.js';
import { DEFAULT_ADAPTERS } from './router.js';

/**
 * Safe structured status for GET /api/dev-ai/health and dev:ai:check.
 *
 * Distinguishes "configured" (env is complete) from "reachable" (the service
 * answered) from "model ready" (the configured model actually exists), and it
 * never performs a paid generation to do so.
 */
export async function inspectDevAi(config, { adapters = DEFAULT_ADAPTERS, fetchImpl = fetch, probeTimeoutMs } = {}) {
  const described = describeDevAiConfig(config);
  const providerNames = Object.keys(adapters);

  const probes = await Promise.all(providerNames.map(async (name) => {
    const configured = isProviderConfigured(config, name);
    if (!configured.configured && name === 'groq' && !config.providers.groq.hasApiKey) {
      return [name, {
        configured: false,
        reachable: false,
        model: config.providers[name].model,
        modelAvailable: false,
        errorCode: 'DEV_AI_PROVIDER_NOT_CONFIGURED',
        reason: configured.reason,
      }];
    }

    const probe = await adapters[name].probe(config, { fetchImpl, timeoutMs: probeTimeoutMs });
    return [name, {
      configured: configured.configured,
      reachable: Boolean(probe.reachable),
      baseUrl: probe.baseUrl,
      model: probe.model,
      modelAvailable: Boolean(probe.modelAvailable),
      latencyMs: probe.latencyMs ?? 0,
      errorCode: probe.errorCode || '',
      reason: configured.reason || '',
    }];
  }));

  const providers = Object.fromEntries(probes);
  const order = resolveProviderOrder(config);
  const usable = order.filter((name) => providers[name]?.configured && providers[name]?.reachable && providers[name]?.modelAvailable);

  return {
    ok: config.enabled && usable.length > 0,
    enabled: described.enabled,
    nodeEnv: described.nodeEnv,
    mode: described.mode,
    order,
    limits: {
      timeoutMs: described.timeoutMs,
      connectTimeoutMs: described.connectTimeoutMs,
      maxInputChars: described.maxInputChars,
    },
    providers: {
      ollama: providers.ollama,
      groq: providers.groq ? { ...providers.groq, apiKeyPresent: config.providers.groq.hasApiKey } : undefined,
    },
    usableProviders: usable,
  };
}
