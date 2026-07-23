import express from 'express';
import { createApiKeyGuard } from './auth/apiKey.js';
import { createFileExplorerBrowserGuard } from './auth/fileExplorerBrowser.js';
import { createCorsMiddleware } from './api/cors.js';
import { createSiteRouter } from './routes/siteRoutes.js';
import { getFileExplorerConfig } from './config/fileExplorer.js';
import { createFileExplorerRouter } from './routes/fileExplorerRoutes.js';
import { getFileExplorerReadiness } from './services/fileExplorerDiagnostics.js';
import { toErrorResponse } from './utils/errors.js';

export function createApp({ repository, legacyRepository, backupRepository = null, config }) {
  const app = express();
  const fileExplorerConfig = config.fileExplorer || getFileExplorerConfig();

  app.disable('x-powered-by');
  app.use('/api/file-explorer', createFileExplorerBrowserGuard({
    adminApiKey: config.adminApiKey,
    config: fileExplorerConfig,
  }));
  app.use(createCorsMiddleware({
    corsOrigins: config.corsOrigins,
    nodeEnv: config.nodeEnv,
  }));
  app.use(express.json({ limit: '10mb' }));

  const health = (_req, res) => {
    const fileExplorer = getFileExplorerReadiness(fileExplorerConfig);
    res.status(fileExplorer.requiresAttention ? 503 : 200).json({
      fileExplorer: {
        enabled: fileExplorer.enabled,
        ready: fileExplorer.ready,
        rootCount: fileExplorer.rootCount,
      },
      ok: true,
      service: 'site-builder-api',
      storageBackend: config.storageBackend,
      time: new Date().toISOString(),
    });
  };

  app.get('/healthz', health);
  app.get('/api/healthz', health);

  app.use('/api/file-explorer', createFileExplorerRouter({ config: fileExplorerConfig }));
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
