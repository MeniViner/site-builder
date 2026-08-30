import express from 'express';
import { createApiKeyGuard } from './auth/apiKey.js';
import { createCorsMiddleware } from './api/cors.js';
import { createSiteRouter } from './routes/siteRoutes.js';
import { createDevAiRuntime, devAiStartupBanner } from './devAi/index.js';
import { serviceUnavailable, toErrorResponse } from './utils/errors.js';

export function createApp({
  repository,
  legacyRepository,
  backupRepository = null,
  config,
  readinessCheck = async () => ({ ok: true, missingCollections: [] }),
  devAiRuntime = createDevAiRuntime({ nodeEnv: config.nodeEnv }),
}) {
  const app = express();

  app.disable('x-powered-by');
  app.use(createCorsMiddleware({
    corsOrigins: config.corsOrigins,
    nodeEnv: config.nodeEnv,
  }));
  app.use(express.json({ limit: '10mb' }));

  const health = (_req, res) => {
    res.status(200).json({
      ok: true,
      service: 'site-builder-api',
      storageBackend: config.storageBackend,
      time: new Date().toISOString(),
    });
  };

  app.get('/healthz', health);
  app.get('/api/healthz', health);

  // DEV-only AI gateway. `createDevAiRuntime` returns null in production, so the
  // route is never registered there even if DEV_AI_ENABLED is accidentally set.
  // It is mounted before the API-key guard because the browser reaches it
  // same-origin from the local development server only.
  if (devAiRuntime) {
    app.use(devAiRuntime.mountPath, devAiRuntime.middleware);
    if (config.nodeEnv !== 'test') {
      console.log(devAiStartupBanner(devAiRuntime));
    }
  }

  app.use('/api', createApiKeyGuard({
    adminApiKey: config.adminApiKey,
    nodeEnv: config.nodeEnv,
  }));

  // Readiness is intentionally authenticated: it performs a data-plane check
  // and must not become a public Mongo topology probe.
  app.get('/api/readyz', async (_req, res, next) => {
    try {
      const readiness = await readinessCheck();
      if (!readiness.ok) {
        throw serviceUnavailable('Builder data plane is not ready');
      }
      res.json({ ok: true, service: 'site-builder-api', readiness: 'ready' });
    } catch (error) {
      if (error?.statusCode) return next(error);
      return next(serviceUnavailable('Builder data plane is not ready'));
    }
  });
  app.use('/api', createSiteRouter({ repository, legacyRepository, backupRepository }));

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: {
        code: 'not_found',
        message: `Route not found: ${req.method} ${req.path}`,
      },
    });
  });

  app.use((error, _req, res, _next) => {
    void _next;
    const response = toErrorResponse(error);
    res.status(response.statusCode).json(response.body);
  });

  return app;
}

export default createApp;
