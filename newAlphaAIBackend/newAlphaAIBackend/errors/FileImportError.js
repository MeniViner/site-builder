class FileImportError extends Error {
  constructor(code, message, status = 400, details = undefined) {
    super(message);
    this.name = 'FileImportError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

module.exports = FileImportError;
