#!/usr/bin/env node
/**
 * npm run dev:ai:smoke [-- --structured] [-- --prompt "..."]
 *
 * EXPLICITLY developer-triggered real request through the COMPLETE DEV AI path:
 *
 *   Site Builder frontend module graph (real ai.config resolver + real AIService)
 *     -> http://127.0.0.1:<port>/api/dev-ai/stream   (real Vite dev server + DEV AI plugin)
 *       -> provider router (ollama / groq / auto)
 *         -> normalized SSE
 *           -> AIService reconstruction
 *             -> existing parseJsonFromModel / domain normalizer
 *
 * The frontend modules are loaded with Vite's own SSR loader, so this is the
 * same `AIService` and the same `ai.config` resolver the browser runs — not a
 * re-implementation, and not a standalone curl.
 *
 * Never runs automatically: no build step, test run or npm lifecycle hook
 * invokes it, so no cloud quota is consumed unless a developer asks for it.
 */
import process from 'process';
import { createServer } from 'vite';

const args = process.argv.slice(2);
const wantsStructured = args.includes('--structured');
const promptIndex = args.indexOf('--prompt');
const customPrompt = promptIndex !== -1 ? args[promptIndex + 1] : '';

const DEFAULT_HEBREW_PROMPT =
  'החזר JSON בלבד: {"status":"תקין","message":"מנוע ה-AI המקומי עובד בעברית"}';

function print(label, value) {
  console.log(`${label.padEnd(12)} ${value}`);
}

async function startDevServer() {
  const server = await createServer({
    configFile: 'vite.config.js',
    server: { host: '127.0.0.1', port: 0, strictPort: false },
    logLevel: 'warn',
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  if (!port) throw new Error('Vite dev server did not report a port');
  return { server, origin: `http://127.0.0.1:${port}` };
}

async function runGenericSmoke({ service, parseJsonFromModel }) {
  const prompt = customPrompt || DEFAULT_HEBREW_PROMPT;
  const startedAt = Date.now();
  const result = await service.ask(prompt);
  const durationMs = Date.now() - startedAt;

  console.log('--- DEV AI smoke (generic Hebrew) ---');
  print('provider', result.providerUsed || '(unknown)');
  print('model', result.modelUsed || '(unknown)');
  print('requestId', result.requestId || '(none)');
  print('duration', `${durationMs} ms`);
  print('events', String(result.eventsCount));
  console.log('response:');
  console.log(result.content);

  const parsed = parseJsonFromModel(result.content);
  console.log('parsed JSON:', JSON.stringify(parsed));
  return { result, parsed, durationMs };
}

async function runStructuredSmoke({ service, parseJsonFromModel, capabilities }) {
  const {
    buildAdminAiPrompt,
    extractAdminAiCandidates,
    normalizeAdminAiCandidate,
    sanitizeAdminAiSnapshot,
  } = capabilities;

  // Dummy DEV-only state. No production data is touched.
  const baseline = {
    items: [{ id: 'news_existing', text: 'מבזק קיים לבדיקה בלבד', isUrgent: false }],
  };
  const instruction = [
    'הטקסט הבא הוא נתוני בדיקה בלבד:',
    'ביום ראשון תתקיים סדנת בטיחות במרכז ההדרכה בשעה 09:00.',
    'החל מהשבוע הבא שעות פעילות מרכז השירות משתנות ל-08:00 עד 16:00.',
    'צור שני מבזקים חדשים בעברית מהטקסט הזה ושמור את המבזק הקיים.',
  ].join('\n');

  const prompt = buildAdminAiPrompt({
    tab: 'news',
    actionId: 'split',
    instruction,
    currentSnapshot: sanitizeAdminAiSnapshot('news', baseline),
  });

  const startedAt = Date.now();
  const result = await service.ask(prompt);
  const durationMs = Date.now() - startedAt;

  console.log('--- DEV AI smoke (real Site Builder News prompt) ---');
  print('provider', result.providerUsed || '(unknown)');
  print('model', result.modelUsed || '(unknown)');
  print('requestId', result.requestId || '(none)');
  print('duration', `${durationMs} ms`);
  console.log('raw response:');
  console.log(result.content);

  const parsed = parseJsonFromModel(result.content);
  const candidates = extractAdminAiCandidates(parsed)
    .map((candidate) => normalizeAdminAiCandidate('news', candidate, baseline, {
      instruction,
      actionId: 'split',
    }))
    .filter(Boolean);

  if (!candidates.length) {
    throw new Error('No normalized News candidate produced by the domain normalizer');
  }

  console.log('normalized domain result:');
  console.log(JSON.stringify(candidates[0], null, 2));
  return { result, candidates, durationMs };
}

async function main() {
  const { server, origin } = await startDevServer();

  try {
    const healthResponse = await fetch(`${origin}/api/dev-ai/health`);
    const health = await healthResponse.json();
    if (!health.enabled) {
      throw new Error('DEV AI is disabled. Set DEV_AI_ENABLED=true server-side and VITE_DEV_AI_ENABLED=true.');
    }
    print('origin', origin);
    print('mode', health.mode);
    print('usable', (health.usableProviders || []).join(', ') || '(none)');
    console.log('');

    // Real frontend modules, loaded through Vite exactly as the browser sees them.
    const configModule = await server.ssrLoadModule('/src/config/ai.config.js');
    const aiServiceModule = await server.ssrLoadModule('/src/services/AIService.js');
    const aiJsonModule = await server.ssrLoadModule('/src/utils/aiJson.js');

    if (!configModule.AI_CONFIG.devAi) {
      throw new Error('The frontend resolver did not select the DEV AI transport. Check VITE_DEV_AI_ENABLED.');
    }
    print('transport', `${configModule.AI_CONFIG.apiBase}${configModule.AI_CONFIG.streamEndpoint}`);
    console.log('');

    const service = new aiServiceModule.AIService({
      ...configModule.AI_CONFIG,
      // Node's fetch needs an absolute URL; the browser uses the same-origin path.
      apiBase: `${origin}${configModule.AI_CONFIG.apiBase}`,
    });

    if (wantsStructured) {
      const capabilities = await server.ssrLoadModule('/src/utils/adminAiCapabilities.js');
      await runStructuredSmoke({ service, parseJsonFromModel: aiJsonModule.parseJsonFromModel, capabilities });
    } else {
      await runGenericSmoke({ service, parseJsonFromModel: aiJsonModule.parseJsonFromModel });
    }

    console.log('');
    console.log('DEV AI smoke: PASS');
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(`[dev:ai:smoke] FAILED: ${error?.message || error?.code || 'unknown error'}`);
  process.exitCode = 1;
});
