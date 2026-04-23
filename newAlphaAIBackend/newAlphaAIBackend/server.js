const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const { globalErrorHandler, notFoundHandler } = require('./middlewares/errorHandler');
const logger = require('./utils/logger');

// Initialize the Express app
const app = express();

// Ignore noisy legacy Buffer constructor warnings from 3rd-party deps.
process.on('warning', (warning) => {
  if (warning?.name === 'DeprecationWarning' && warning?.code === 'DEP0005') {
    return;
  }

  logger.warn(`[node-warning] ${warning.name}: ${warning.message}`);
});

app.set('trust proxy', config.security.trustProxy ? 1 : false);

// Open proxy mode by default (can be restricted from env).
app.use(
  cors({
    origin: config.security.allowAllOrigins ? '*' : config.security.frontendDomain,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-token', 'Authorization'],
    exposedHeaders: ['X-Proxy-Model', 'X-Proxy-Key-Index'],
  }),
);

// 2. Body parsers
app.use(express.json());

// 3. Central Router handling all /api endpoints
app.use('/api', routes);

// 4. Catch 404
app.use(notFoundHandler);

// 5. Global Error Handler
app.use(globalErrorHandler);

// Start server
app.listen(config.port, () => {
  logger.info(`AI Proxy Server listening on API endpoints at port ${config.port}`);
  logger.info(
    `CORS mode: ${config.security.allowAllOrigins ? 'OPEN(*)' : config.security.frontendDomain}`,
  );
  logger.info(`Auth guard: ${config.security.disableAuthGuard ? 'DISABLED' : 'ENABLED'}`);
});
