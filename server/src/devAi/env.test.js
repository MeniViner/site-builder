import { describe, expect, it } from 'vitest';
import {
  DEV_AI_DEFAULTS,
  describeDevAiConfig,
  isDevAiEnabled,
  isDevAiRouteAllowed,
  isProviderConfigured,
  loadDevAiEnv,
  resolveDevAiConfig,
  resolveProviderOrder,
} from './env.js';
import { createDevAiRuntime } from './index.js';
import {
  loadDevAiSecretFile,
  loadDevAiServerEnvFile,
  mergeDevAiEnv,
  parseDevAiEnvText,
  pickDevAiEnvKeys,
} from './secretFile.js';

const SECRET_VALUE = 'gsk-not-a-real-key-0000';

describe('DEV AI configuration defaults', () => {
  it('is off when nothing is configured', () => {
    const config = resolveDevAiConfig({ env: {} });
    expect(config.enabled).toBe(false);
    expect(config.mode).toBe('auto');
    expect(config.autoOrder).toEqual(['ollama', 'groq']);
    expect(config.timeoutMs).toBe(DEV_AI_DEFAULTS.timeoutMs);
    expect(config.connectTimeoutMs).toBe(DEV_AI_DEFAULTS.connectTimeoutMs);
    expect(config.maxInputChars).toBe(DEV_AI_DEFAULTS.maxInputChars);
  });

  it('requires DEV_AI_ENABLED even outside production', () => {
    const config = resolveDevAiConfig({ env: { NODE_ENV: 'development' } });
    expect(isDevAiRouteAllowed(config)).toBe(true);
    expect(isDevAiEnabled(config)).toBe(false);
  });

  it('enables only when NODE_ENV is not production AND DEV_AI_ENABLED is true', () => {
    const config = resolveDevAiConfig({ env: { NODE_ENV: 'development', DEV_AI_ENABLED: 'true' } });
    expect(isDevAiEnabled(config)).toBe(true);
  });

  it('never enables in production even with both flags set', () => {
    const config = resolveDevAiConfig({
      env: { NODE_ENV: 'production', DEV_AI_ENABLED: 'true', GROQ_API_KEY: SECRET_VALUE },
    });
    expect(config.enabled).toBe(false);
    expect(isDevAiRouteAllowed(config)).toBe(false);
    expect(isDevAiEnabled(config)).toBe(false);
  });

  it('resolves the provider order per mode', () => {
    expect(resolveProviderOrder(resolveDevAiConfig({ env: { DEV_AI_PROVIDER: 'ollama' } }))).toEqual(['ollama']);
    expect(resolveProviderOrder(resolveDevAiConfig({ env: { DEV_AI_PROVIDER: 'groq' } }))).toEqual(['groq']);
    expect(resolveProviderOrder(resolveDevAiConfig({
      env: { DEV_AI_PROVIDER: 'auto', DEV_AI_AUTO_ORDER: 'groq,ollama' },
    }))).toEqual(['groq', 'ollama']);
  });

  it('falls back to the default auto order when DEV_AI_AUTO_ORDER is nonsense', () => {
    const config = resolveDevAiConfig({ env: { DEV_AI_AUTO_ORDER: 'chatgpt , , mistral' } });
    expect(config.autoOrder).toEqual(['ollama', 'groq']);
  });

  it('reports per-provider configuration completeness', () => {
    const config = resolveDevAiConfig({
      env: { DEV_AI_OLLAMA_MODEL: 'qwen-local', DEV_AI_GROQ_MODEL: 'cloud-model' },
    });
    expect(isProviderConfigured(config, 'ollama')).toEqual({ configured: true, reason: '' });
    expect(isProviderConfigured(config, 'groq')).toEqual({ configured: false, reason: 'missing-api-key' });
  });

  it('does not hardcode a provider model', () => {
    const config = resolveDevAiConfig({ env: {} });
    expect(config.providers.ollama.model).toBe('');
    expect(config.providers.groq.model).toBe('');
  });
});

describe('Groq secret handling in the resolved configuration', () => {
  it('keeps GROQ_API_KEY out of every serialization path', () => {
    const config = resolveDevAiConfig({ env: { GROQ_API_KEY: SECRET_VALUE, DEV_AI_GROQ_MODEL: 'm' } });

    expect(config.providers.groq.apiKey).toBe(SECRET_VALUE);
    expect(JSON.stringify(config)).not.toContain(SECRET_VALUE);
    expect(Object.keys(config.providers.groq)).not.toContain('apiKey');
    expect(JSON.stringify(describeDevAiConfig(config))).not.toContain(SECRET_VALUE);
    expect(describeDevAiConfig(config).providers.groq.apiKeyPresent).toBe(true);
  });

  it('reports absence without inventing a value', () => {
    const config = resolveDevAiConfig({ env: {} });
    expect(config.providers.groq.hasApiKey).toBe(false);
    expect(describeDevAiConfig(config).providers.groq.apiKeyPresent).toBe(false);
  });
});

describe('optional machine-local developer secret file', () => {
  const fileText = [
    '# developer only',
    'DEV_AI_ENABLED=true',
    'DEV_AI_PROVIDER=groq',
    `GROQ_API_KEY=${SECRET_VALUE}`,
    'DEV_AI_GROQ_MODEL="from-file"',
  ].join('\n');

  it('parses comments, quotes and export prefixes', () => {
    const values = parseDevAiEnvText([
      '# comment',
      '',
      'export A=1',
      "B='two'",
      'C="three"',
      'not-an-assignment',
    ].join('\n'));
    expect(values).toEqual({ A: '1', B: 'two', C: 'three' });
  });

  it('is optional: the application works when the file is absent', () => {
    const loaded = loadDevAiEnv({
      env: { NODE_ENV: 'development' },
      loadSecretFile: () => ({ exists: false, path: '/nowhere', values: {}, keys: [] }),
    });
    expect(loaded.secretFile.exists).toBe(false);
    expect(resolveDevAiConfig({ env: loaded.env }).enabled).toBe(false);
  });

  it('is never read in production', () => {
    const result = loadDevAiSecretFile({
      env: { NODE_ENV: 'production' },
      nodeEnv: 'production',
      readFile: () => {
        throw new Error('the secret file must not be read in production');
      },
    });
    expect(result.exists).toBe(false);
    expect(result.skippedForProduction).toBe(true);
    expect(result.values).toEqual({});
  });

  it('never overwrites an explicitly supplied environment value', () => {
    const { env, sources } = mergeDevAiEnv(
      { DEV_AI_PROVIDER: 'ollama', GROQ_API_KEY: '' },
      { DEV_AI_PROVIDER: 'groq', GROQ_API_KEY: SECRET_VALUE },
    );
    expect(env.DEV_AI_PROVIDER).toBe('ollama');
    expect(sources.DEV_AI_PROVIDER).toBe('environment');
    // An empty environment value is not "explicitly supplied".
    expect(env.GROQ_API_KEY).toBe(SECRET_VALUE);
    expect(sources.GROQ_API_KEY).toBe('secret-file');
  });

  it('exposes key NAMES for diagnostics but never values', () => {
    const result = loadDevAiSecretFile({
      env: { NODE_ENV: 'development' },
      nodeEnv: 'development',
      readFile: () => fileText,
    });
    expect(result.keys).toEqual(['DEV_AI_ENABLED', 'DEV_AI_PROVIDER', 'GROQ_API_KEY', 'DEV_AI_GROQ_MODEL']);
    expect(JSON.stringify(result.keys)).not.toContain(SECRET_VALUE);
  });

  it('feeds the runtime without leaking the value into describe()', () => {
    const runtime = createDevAiRuntime({
      env: { NODE_ENV: 'development' },
      nodeEnv: 'development',
      loadEnv: ({ env }) => {
        const secretValues = {
          DEV_AI_ENABLED: 'true',
          DEV_AI_GROQ_MODEL: 'from-file',
          GROQ_API_KEY: SECRET_VALUE,
        };
        const merged = mergeDevAiEnv(env, secretValues);
        return {
          env: merged.env,
          sources: merged.sources,
          secretFile: { path: '/home/dev/.config/site-builder/dev-ai.env', exists: true, keys: Object.keys(secretValues) },
        };
      },
    });

    expect(runtime).not.toBeNull();
    expect(runtime.config.enabled).toBe(true);
    expect(runtime.config.providers.groq.model).toBe('from-file');
    expect(JSON.stringify(runtime.describe())).not.toContain(SECRET_VALUE);
    expect(runtime.secretFile.keys).toContain('GROQ_API_KEY');
  });
});

describe('repository-local server environment file', () => {
  it('picks up only DEV AI keys', () => {
    expect(pickDevAiEnvKeys({
      MONGODB_URI: 'mongodb://localhost:27017/x',
      ADMIN_API_KEY: 'dev-local-api-key',
      DEV_AI_ENABLED: 'true',
      DEV_AI_PROVIDER: 'auto',
      GROQ_API_KEY: SECRET_VALUE,
    })).toEqual({
      DEV_AI_ENABLED: 'true',
      DEV_AI_PROVIDER: 'auto',
      GROQ_API_KEY: SECRET_VALUE,
    });
  });

  it('is never read in production', () => {
    const result = loadDevAiServerEnvFile({
      env: { NODE_ENV: 'production' },
      nodeEnv: 'production',
      readFile: () => {
        throw new Error('server/.env.local must not be read in production');
      },
    });
    expect(result.exists).toBe(false);
    expect(result.skippedForProduction).toBe(true);
  });

  it('is optional', () => {
    const result = loadDevAiServerEnvFile({
      env: { NODE_ENV: 'development' },
      nodeEnv: 'development',
      readFile: () => {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      },
    });
    expect(result.exists).toBe(false);
    expect(result.values).toEqual({});
  });

  it('ranks between the process environment and the machine-local secret file', () => {
    const loaded = loadDevAiEnv({
      env: { NODE_ENV: 'development', DEV_AI_PROVIDER: 'ollama' },
      loadServerEnvFile: () => ({
        exists: true,
        path: 'server/.env.local',
        keys: ['DEV_AI_PROVIDER', 'DEV_AI_GROQ_MODEL'],
        values: { DEV_AI_PROVIDER: 'groq', DEV_AI_GROQ_MODEL: 'from-server-file' },
      }),
      loadSecretFile: () => ({
        exists: true,
        path: '/home/dev/.config/site-builder/dev-ai.env',
        keys: ['DEV_AI_PROVIDER', 'DEV_AI_GROQ_MODEL', 'GROQ_API_KEY'],
        values: {
          DEV_AI_PROVIDER: 'auto',
          DEV_AI_GROQ_MODEL: 'from-secret-file',
          GROQ_API_KEY: SECRET_VALUE,
        },
      }),
    });

    // process env wins
    expect(loaded.env.DEV_AI_PROVIDER).toBe('ollama');
    expect(loaded.sources.DEV_AI_PROVIDER).toBe('environment');
    // server env file beats the machine-local secret file
    expect(loaded.env.DEV_AI_GROQ_MODEL).toBe('from-server-file');
    expect(loaded.sources.DEV_AI_GROQ_MODEL).toBe('server-env-file');
    // the secret file still supplies what nothing above it provided
    expect(loaded.env.GROQ_API_KEY).toBe(SECRET_VALUE);
    expect(loaded.sources.GROQ_API_KEY).toBe('secret-file');
  });

  it('exposes only key names in the loader envelope', () => {
    const loaded = loadDevAiEnv({
      env: { NODE_ENV: 'development' },
      loadServerEnvFile: () => ({ exists: true, path: 'server/.env.local', keys: ['DEV_AI_ENABLED'], values: { DEV_AI_ENABLED: 'true' } }),
      loadSecretFile: () => ({ exists: true, path: '/x', keys: ['GROQ_API_KEY'], values: { GROQ_API_KEY: SECRET_VALUE } }),
    });
    expect(JSON.stringify({
      serverEnvFile: loaded.serverEnvFile,
      secretFile: loaded.secretFile,
    })).not.toContain(SECRET_VALUE);
  });
});
