const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authGuard = require('../middlewares/authGuard');
const rateLimiter = require('../middlewares/rateLimiter');
const validator = require('../middlewares/validator');
const config = require('../config');
const fileUpload = require('../middlewares/fileUpload');
const fileAnalysisController = require('../controllers/fileAnalysisController');

// GET /api/health - JSON Health Check
router.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'AI Gateway is online' });
});

// GET /api/init - Compatible bootstrap payload like old backend.
router.get('/init', (req, res) => {
  res.json({
    ok: true,
    status: 'ready',
    timestamp: new Date().toISOString(),
    config: {
      availableModels: config.ai.fallbackModels,
      defaultModel: config.ai.fallbackModels[0] || null,
      streamEnabled: true,
      fileImportMaxMb: config.ai.fileImportMaxMb,
      fileImportExtensions: ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.docx', '.xlsx', '.json', '.txt', '.md', '.markdown', '.csv'],
      endpoints: {
        health: '/api/health',
        init: '/api/init',
        direct: '/api/ai/direct/:model',
        stream: '/api/ai/stream',
        fileAnalysis: '/api/ai/files/analyze',
      },
    },
  });
});

// Protect all /ai/ routes below with Rate Limiter and Auth Guard
router.use('/ai', rateLimiter, authGuard);

// POST /api/ai/direct/:model
// Target specific model (includes caching & validation).
router.post('/ai/direct/:model', validator, aiController.handleDirect);

// POST /api/ai/stream
// SSE streaming (includes AbortController & validation).
router.post('/ai/stream', validator, aiController.handleStream);

// POST /api/ai/files/analyze
// Memory-only multipart intake for reusable file-aware AI analysis.
router.post('/ai/files/analyze', fileUpload, fileAnalysisController.handleFileAnalysis);

module.exports = router;
