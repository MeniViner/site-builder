const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const axios = require('axios');
const KeyManager = require('../services/KeyManager');
const AIServiceModule = require('../services/AIService');

const originalPost = axios.post;
const originalGetKey = KeyManager.getKey;

afterEach(() => {
  axios.post = originalPost;
  KeyManager.getKey = originalGetKey;
});

test('OpenAI receives a real image data URI rather than a filename', async () => {
  let requestBody;
  KeyManager.getKey = () => 'test-key';
  axios.post = async (url, body) => {
    requestBody = body;
    return {
      data: {
        choices: [{ message: { content: '{"nodes":[],"warnings":[],"summary":""}' } }],
        usage: {},
      },
    };
  };
  const service = new AIServiceModule.AIService();
  await service.fetchFileAnalysis(
    'gpt-4o',
    'system constraints',
    'inspect attached source',
    { mimeType: 'image/png', base64: Buffer.from('image bytes').toString('base64') },
  );
  const userContent = requestBody.messages[1].content;
  assert.equal(userContent[1].type, 'image_url');
  assert.match(userContent[1].image_url.url, /^data:image\/png;base64,/);
  assert.equal(JSON.stringify(requestBody).includes('filename'), false);
});

test('Anthropic receives an actual base64 image block', async () => {
  let requestBody;
  KeyManager.getKey = () => 'test-key';
  axios.post = async (url, body) => {
    requestBody = body;
    return { data: { content: [{ type: 'text', text: '{}' }], usage: {} } };
  };
  const service = new AIServiceModule.AIService();
  const encoded = Buffer.from('image bytes').toString('base64');
  await service.fetchFileAnalysis(
    'claude-3-5-sonnet-latest',
    'system constraints',
    'inspect attached source',
    { mimeType: 'image/webp', base64: encoded },
  );
  assert.deepEqual(requestBody.messages[0].content[1], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/webp', data: encoded },
  });
});

test('unsupported providers are rejected without text-only downgrade', async () => {
  const service = new AIServiceModule.AIService();
  await assert.rejects(
    () => service.fetchFileAnalysis('gemini-1.5-pro', 'system', 'prompt', {
      mimeType: 'image/png',
      base64: 'abc',
    }),
    (error) => error.code === 'PROVIDER_MULTIMODAL_UNSUPPORTED',
  );
});
