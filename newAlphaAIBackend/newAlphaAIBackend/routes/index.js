const express = require('express');
const router = express.Router();
const aiController = require('../controllers/aiController');
const authGuard = require('../middlewares/authGuard');
const rateLimiter = require('../middlewares/rateLimiter');
const validator = require('../middlewares/validator');
const config = require('../config');

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
      endpoints: {
        health: '/api/health',
        init: '/api/init',
        direct: '/api/ai/direct/:model',
        smart: '/api/ai/smart',
        stream: '/api/ai/stream',
      },
    },
  });
});

// Protect all /ai/ routes below with Rate Limiter and Auth Guard
router.use('/ai', rateLimiter, authGuard);

// POST /api/ai/direct/:model
// Target specific model (includes caching & validation).
router.post('/ai/direct/:model', validator, aiController.handleDirect);

// POST /api/ai/smart
// Uses dynamic fallback.
router.post('/ai/smart', validator, aiController.handleSmart);

// POST /api/ai/stream
// SSE streaming (includes AbortController & validation).
router.post('/ai/stream', validator, aiController.handleStream);

module.exports = router;
