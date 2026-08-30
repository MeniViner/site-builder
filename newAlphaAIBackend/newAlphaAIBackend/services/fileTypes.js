const path = require('node:path');
const FileImportError = require('../errors/FileImportError');

const FILE_TYPES = {
  '.png': { mimeTypes: ['image/png'], kind: 'image', strategy: 'provider-image' },
  '.jpg': { mimeTypes: ['image/jpeg'], kind: 'image', strategy: 'provider-image' },
  '.jpeg': { mimeTypes: ['image/jpeg'], kind: 'image', strategy: 'provider-image' },
  '.webp': { mimeTypes: ['image/webp'], kind: 'image', strategy: 'provider-image' },
  '.pdf': { mimeTypes: ['application/pdf'], kind: 'document', strategy: 'pdf-text' },
  '.docx': {
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    kind: 'document',
    strategy: 'docx-text',
  },
  '.xlsx': {
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    kind: 'spreadsheet',
    strategy: 'xlsx-rows',
  },
  '.json': { mimeTypes: ['application/json', 'text/json'], kind: 'text', strategy: 'json-text' },
  '.txt': { mimeTypes: ['text/plain'], kind: 'text', strategy: 'utf8-text' },
  '.md': { mimeTypes: ['text/markdown', 'text/plain'], kind: 'text', strategy: 'utf8-text' },
  '.markdown': { mimeTypes: ['text/markdown', 'text/plain'], kind: 'text', strategy: 'utf8-text' },
  '.csv': { mimeTypes: ['text/csv', 'application/csv', 'text/plain'], kind: 'text', strategy: 'utf8-text' },
};

function resolveFileType(file) {
  const safeName = path.basename(String(file?.originalname || ''));
  const extension = path.extname(safeName).toLowerCase();
  const definition = FILE_TYPES[extension];
  if (!definition) {
    throw new FileImportError('UNSUPPORTED_FILE_TYPE', `Unsupported file extension: ${extension || 'none'}`, 415);
  }
  if (!definition.mimeTypes.includes(String(file?.mimetype || '').toLowerCase())) {
    throw new FileImportError('UNSUPPORTED_FILE_TYPE', 'File MIME type does not match its extension.', 415);
  }
  return { ...definition, extension, safeName };
}

function isValidImageSignature(buffer, extension) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (extension === '.png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (extension === '.webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  return false;
}

module.exports = { FILE_TYPES, resolveFileType, isValidImageSignature };
