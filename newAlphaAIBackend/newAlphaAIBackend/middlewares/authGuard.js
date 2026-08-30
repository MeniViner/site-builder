const config = require('../config');
const logger = require('../utils/logger');

/**
 * Requires a custom `x-api-token` matching the stored environment secret.
 */
module.exports = (req, res, next) => {
  if (config.security.disableAuthGuard) {
    return next();
  }

  if (!config.security.apiSecretToken) {
    logger.error('Auth guard is enabled but API_SECRET_TOKEN is not configured.');
    return res.status(503).json({
      error: {
        code: 'AUTH_NOT_CONFIGURED',
        message: 'AI API authentication is not configured.',
      },
    });
  }

  const token = req.headers['x-api-token'];
  
  if (!token || token !== config.security.apiSecretToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Token' });
  }
  
  next();
};
