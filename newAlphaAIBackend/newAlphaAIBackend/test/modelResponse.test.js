const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseModelResponse } = require('../controllers/fileAnalysisController');

test('parses the strict Org Chart extraction response', () => {
  const parsed = parseModelResponse(JSON.stringify({
    nodes: [{
      id: 'root',
      name: '',
      rank: '',
      role: '',
      personalNumber: '',
      imageUrl: '',
      children: [],
    }],
    warnings: [],
    summary: 'one unresolved node',
  }));
  assert.equal(parsed.nodeCount, 1);
});

test('rejects unexpected model-generated fields', () => {
  assert.throws(() => parseModelResponse(JSON.stringify({
    nodes: [],
    warnings: [],
    summary: '',
    pageTitle: 'model-controlled title',
  })), (error) => error.code === 'INVALID_ORG_CHART_STRUCTURE');
});
