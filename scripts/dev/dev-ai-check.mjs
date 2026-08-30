#!/usr/bin/env node
/**
 * npm run dev:ai:check
 *
 * Prints the DEV AI engine status for the current machine.
 *
 * It may CONSUME the developer secret source internally (it needs the Groq key
 * to authenticate against the free model-list endpoint) but it only ever prints
 * safe facts: configured yes/no, reachable yes/no, model id, model available
 * yes/no, latency and a normalized error code. No credential is printed, and
 * no paid generation is performed.
 */
import process from 'process';
import { createDevAiRuntime, resolveProviderOrder } from '../../server/src/devAi/index.js';
import { listGroqModels } from '../../server/src/devAi/providers/groq.js';

const wantsModels = process.argv.includes('--models');

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function line(label, value) {
  console.log(`  ${label}: ${value}`);
}

async function main() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const runtime = createDevAiRuntime({ env: process.env, nodeEnv });

  if (!runtime) {
    console.log('DEV AI: not available (NODE_ENV=production)');
    process.exitCode = 1;
    return;
  }

  const described = runtime.describe();

  console.log(`DEV AI: ${described.enabled ? 'enabled' : 'disabled'}`);
  console.log(`Mode: ${described.mode}`);
  console.log(`Order: ${resolveProviderOrder(runtime.config).join(', ')} (auto order: ${described.autoOrder.join(', ')})`);
  console.log(`NODE_ENV: ${described.nodeEnv}`);
  console.log(
    `Server env file: ${runtime.serverEnvFile.exists ? 'loaded' : 'absent'}`
    + ` (${runtime.serverEnvFile.path})`
    + (runtime.serverEnvFile.exists ? ` keys: ${runtime.serverEnvFile.keys.join(', ') || '(none)'}` : ''),
  );
  console.log(
    `Secret file: ${runtime.secretFile.exists ? 'loaded' : 'absent'}`
    + ` (${runtime.secretFile.path})`
    + (runtime.secretFile.exists ? ` keys: ${runtime.secretFile.keys.join(', ')}` : ''),
  );
  console.log('');

  if (!described.enabled) {
    console.log('Set DEV_AI_ENABLED=true in the server environment (or in the local secret file) to enable the DEV AI engine.');
    process.exitCode = 1;
    return;
  }

  const report = await runtime.inspect();

  console.log('Ollama:');
  line('configured', yesNo(report.providers.ollama?.configured));
  line('base url', report.providers.ollama?.baseUrl || '(unset)');
  line('reachable', yesNo(report.providers.ollama?.reachable));
  line('model', report.providers.ollama?.model || '(unset)');
  line('model installed', yesNo(report.providers.ollama?.modelAvailable));
  line('latency ms', report.providers.ollama?.latencyMs ?? 0);
  if (report.providers.ollama?.errorCode) line('error code', report.providers.ollama.errorCode);
  console.log('');

  console.log('Groq:');
  line('configured', yesNo(report.providers.groq?.configured));
  line('api key present', yesNo(report.providers.groq?.apiKeyPresent));
  line('base url', report.providers.groq?.baseUrl || '(unset)');
  line('authentication reachable', yesNo(report.providers.groq?.reachable));
  line('model', report.providers.groq?.model || '(unset)');
  line('model available', yesNo(report.providers.groq?.modelAvailable));
  line('latency ms', report.providers.groq?.latencyMs ?? 0);
  if (report.providers.groq?.errorCode) line('error code', report.providers.groq.errorCode);
  console.log('');

  if (wantsModels) {
    console.log('Groq model ids available to this account:');
    try {
      const ids = await listGroqModels(runtime.config);
      for (const id of ids) console.log(`  ${id}`);
    } catch (error) {
      console.log(`  (unavailable: ${error?.code || 'DEV_AI_PROVIDER_UNAVAILABLE'})`);
    }
    console.log('');
  }

  console.log(`Usable providers: ${report.usableProviders.length ? report.usableProviders.join(', ') : '(none)'}`);

  if (!report.ok) {
    console.log('');
    console.log('DEV AI is enabled but no configured provider is ready.');
    console.log('  - Ollama: install it yourself and run `ollama pull <DEV_AI_OLLAMA_MODEL>`.');
    console.log('  - Groq: set GROQ_API_KEY and DEV_AI_GROQ_MODEL server-side (never in a VITE_ variable).');
    process.exitCode = 1;
    return;
  }

  console.log('DEV AI check: PASS');
}

main().catch((error) => {
  // Never print the raw error: an upstream URL could embed a credential.
  console.error(`[dev:ai:check] failed (${error?.code || error?.name || 'ERROR'})`);
  process.exitCode = 1;
});
