const multer = require('multer');
const { randomUUID } = require('node:crypto');
const config = require('../config');
const FileImportError = require('../errors/FileImportError');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: Math.round(config.ai.fileImportMaxMb * 1024 * 1024),
    fields: 4,
    fieldSize: 16 * 1024,
  },
});

module.exports = (req, res, next) => {
  req.requestId = randomUUID();
  upload.single('file')(req, res, (error) => {
    if (!error) return next();
    const wrapped = error.code === 'LIMIT_FILE_SIZE'
      ? new FileImportError(
          'FILE_TOO_LARGE',
          `File exceeds the ${config.ai.fileImportMaxMb} MB upload limit.`,
          413,
        )
      : new FileImportError('MALFORMED_FILE', 'The multipart upload is malformed.', 400);
    wrapped.requestId = req.requestId;
    wrapped.failureStage = 'multipart_validation';
    return next(wrapped);
  });
};
