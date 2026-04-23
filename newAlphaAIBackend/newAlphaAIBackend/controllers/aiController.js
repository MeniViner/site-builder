const AIService = require('../services/AIService');
const StreamingService = require('../services/StreamingService');
const PromptCache = require('../utils/cache');

// Direct request to a specific model
exports.handleDirect = async (req, res, next) => {
  try {
    const { model } = req.params;
    const { prompt } = req.body;

    // 1. Check Cache
    const cachedResponse = PromptCache.get(prompt, model);
    if (cachedResponse) {
      return res.json({ modelUsed: model, content: cachedResponse, cached: true });
    }

    // 2. Fetch using Core AIService
    const content = await AIService.fetchDirect(model, prompt);
    
    // 3. Set Cache
    PromptCache.set(prompt, model, content);
    
    res.json({ modelUsed: model, content, cached: false });
  } catch (err) {
    next(err);
  }
};

// Smart fallback request
exports.handleSmart = async (req, res, next) => {
  try {
    const { prompt } = req.body;
    
    // No specific caching for Smart as the exact model used isn't predetermined,
    // though caching could be modified to support it later.
    
    const { modelUsed, content } = await AIService.fetchSmart(prompt);
    
    res.json({ modelUsed, content, smartFeedback: true });
  } catch (err) {
    next(err);
  }
};

// Handle Event-Stream (SSE) Request
exports.handleStream = async (req, res, next) => {
  try {
    const { prompt, model = 'any' } = req.body;
    // Controller delegates stream writing directly to Response object
    await StreamingService.stream(model, prompt, res, req);
  } catch (err) {
    // Standard error handler isn't fully viable if headers are already sent, 
    // but useful if it breaks beforehand.
    next(err);
  }
};
