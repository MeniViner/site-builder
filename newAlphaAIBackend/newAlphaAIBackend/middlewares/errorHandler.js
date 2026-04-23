const logger = require('../utils/logger');

// Global 500 handler
exports.globalErrorHandler = (err, req, res, next) => {
  logger.error(`Global Error: ${err.message}`, { stack: err.stack });
  
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: {
      message,
      status
    }
  });
};

// 404 Handler
exports.notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found or method not allowed.'
  });
};
