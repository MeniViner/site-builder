const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const supertest = require('supertest');
const app = require('../server');
const AIService = require('../services/AIService');
const logger = require('../utils/logger');

const originalFetchFileAnalysis = AIService.fetchFileAnalysis;
const originalLoggerInfo = logger.info;

function modelResponse() {
  return {
    provider: 'openai',
    content: JSON.stringify({
      nodes: [{
        id: 'root',
        name: 'אגף',
        rank: '',
        role: '',
        personalNumber: '',
        imageUrl: '',
        children: [],
      }],
      warnings: ['הקשר בין היחידות אינו ודאי'],
      summary: 'זוהה אגף אחד',
    }),
  };
}

afterEach(() => {
  AIService.fetchFileAnalysis = originalFetchFileAnalysis;
  logger.info = originalLoggerInfo;
});

test('accepts an image and sends actual image content to the provider adapter', async () => {
  let receivedAttachment;
  AIService.fetchFileAnalysis = async (model, system, prompt, attachment) => {
    receivedAttachment = attachment;
    return modelResponse();
  };
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.from('actual-image-bytes'),
  ]);

  const response = await supertest(app)
    .post('/api/ai/files/analyze')
    .field('model', 'gpt-4o')
    .attach('file', png, { filename: '../chart.png', contentType: 'image/png' });

  assert.equal(response.status, 200);
  assert.equal(response.body.result.nodeCount, 1);
  assert.equal(response.body.source.extractionStrategy, 'provider-image');
  assert.equal(receivedAttachment.mimeType, 'image/png');
  assert.equal(Buffer.from(receivedAttachment.base64, 'base64').equals(png), true);
  assert.ok(response.body.requestId);
});

test('rejects unsupported extensions with a structured request ID', async () => {
  const response = await supertest(app)
    .post('/api/ai/files/analyze')
    .field('model', 'gpt-4o')
    .attach('file', Buffer.from('x'), { filename: 'chart.exe', contentType: 'application/octet-stream' });
  assert.equal(response.status, 415);
  assert.equal(response.body.error.code, 'UNSUPPORTED_FILE_TYPE');
  assert.ok(response.body.error.requestId);
});

test('rejects oversized uploads before extraction', async () => {
  const response = await supertest(app)
    .post('/api/ai/files/analyze')
    .field('model', 'gpt-4o')
    .attach('file', Buffer.alloc(21 * 1024 * 1024), { filename: 'large.png', contentType: 'image/png' });
  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'FILE_TOO_LARGE');
});

test('returns structured extraction errors for malformed supported files', async () => {
  const response = await supertest(app)
    .post('/api/ai/files/analyze')
    .field('model', 'gpt-4o')
    .attach('file', Buffer.from('not a workbook'), {
      filename: 'chart.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'MALFORMED_FILE');
  assert.equal(response.body.error.requestId.length > 0, true);
});

test('does not write uploaded or extracted personal data to structured logs', async () => {
  const logCalls = [];
  logger.info = (...args) => logCalls.push(args);
  AIService.fetchFileAnalysis = async () => modelResponse();
  const secretDocumentText = 'TOP-SECRET-PERSON-NAME reports to another person';

  const response = await supertest(app)
    .post('/api/ai/files/analyze')
    .field('model', 'gpt-4o')
    .attach('file', Buffer.from(secretDocumentText), { filename: 'chart.txt', contentType: 'text/plain' });
  assert.equal(response.status, 200);
  const serializedLogs = JSON.stringify(logCalls);
  assert.equal(serializedLogs.includes(secretDocumentText), false);
  assert.equal(serializedLogs.includes('TOP-SECRET-PERSON-NAME'), false);
  assert.equal(serializedLogs.includes('base64'), false);
});
