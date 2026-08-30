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
    logger.warn('Auth guard enabled but API_SECRET_TOKEN is empty. Allowing request.');
    return next();
  }

  const token = req.headers['x-api-token'];
  
  if (!token || token !== config.security.apiSecretToken) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Token' });
  }
  
  next();
};
