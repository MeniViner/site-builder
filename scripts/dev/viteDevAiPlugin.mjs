import { createDevAiRuntime, devAiStartupBanner } from '../../server/src/devAi/index.js';

/**
 * DEV-only AI gateway mounted directly on the Vite development server.
 *
 * Why the Vite dev server:
 *   - it is the local development server the browser already talks to, so
 *     `/api/dev-ai/*` is same-origin (no CORS, no proxy, no extra process);
 *   - `npm run dev` and `npm run dev:vite` both start it automatically;
 *   - it does not exist in a production build, which makes the DEV AI engine
 *     architecturally impossible to activate in production.
 *
 * The plugin runs inside the Vite Node process, so `GROQ_API_KEY` is read
 * server-side only and never enters the client module graph or the bundle.
 */
export function devAiVitePlugin(options = {}) {
  return {
    name: 'site-builder-dev-ai',
    // Never applied to `vite build`.
    apply: 'serve',
    configureServer(server) {
      const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? 'development';
      if (String(nodeEnv).trim() === 'production') {
        server.config.logger.info('[dev-ai] skipped: NODE_ENV=production');
        return;
      }

      const runtime = createDevAiRuntime({ env: process.env, nodeEnv });
      if (!runtime) {
        server.config.logger.info('[dev-ai] route not registered');
        return;
      }

      server.middlewares.use(runtime.mountPath, runtime.middleware);
      server.config.logger.info(devAiStartupBanner(runtime));
    },
  };
}

export default devAiVitePlugin;
