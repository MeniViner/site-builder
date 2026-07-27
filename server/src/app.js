import express from 'express';
import { createApiKeyGuard } from './auth/apiKey.js';
import { createCorsMiddleware } from './api/cors.js';
import { createSiteRouter } from './routes/siteRoutes.js';
import { toErrorResponse } from './utils/errors.js';

export function createApp({ repository, legacyRepository, backupRepository = null, config }) {
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

  app.use('/api', createApiKeyGuard({
    adminApiKey: config.adminApiKey,
    nodeEnv: config.nodeEnv,
  }));
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
