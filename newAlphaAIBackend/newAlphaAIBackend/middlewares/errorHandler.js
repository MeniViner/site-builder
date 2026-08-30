const logger = require('../utils/logger');

// Global 500 handler
exports.globalErrorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const requestId = err.requestId || req.requestId;
  const isFileImportError = Boolean(requestId);
  const message = status >= 500 && !isFileImportError
    ? 'Internal Server Error'
    : (err.message || 'Internal Server Error');

  if (isFileImportError) {
    logger.error('AI_FILE_IMPORT_FAILED', {
      requestId,
      failureStage: err.failureStage || 'unknown',
      errorCode: code,
      status,
    });
  } else {
    logger.error('Global request error', { code, status, stack: err.stack });
  }

  res.status(status).json({
    error: {
      message,
      status,
      code,
      ...(requestId ? { requestId } : {}),
    }
  });
};

// 404 Handler
exports.notFoundHandler = (req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found or method not allowed.'
  });
};
