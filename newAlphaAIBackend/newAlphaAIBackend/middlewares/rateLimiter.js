const rateLimit = require('express-rate-limit');

/**
 * Prevents abuse: limits requests to 30 requests per minute per IP.
 */
module.exports = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per `window`
  standardHeaders: true, 
  legacyHeaders: false, 
  message: {
    error: 'Too many requests generated from this IP, please try again after 1 minute.'
  }
});
