const AIService = require('../services/AIService');
const StreamingService = require('../services/StreamingService');
const PromptCache = require('../utils/cache');

function extractPromptFromBody(body = {}) {
  if (typeof body.prompt === 'string' && body.prompt.trim()) {
    return body.prompt.trim();
  }

  if (Array.isArray(body.messages)) {
    const lastUserMessage = [...body.messages]
      .reverse()
      .find((message) => String(message?.role || '').toLowerCase() === 'user' && typeof message?.content === 'string' && message.content.trim());

    if (lastUserMessage) {
      return lastUserMessage.content.trim();
    }

    const fallbackMessage = body.messages.find((message) => typeof message?.content === 'string' && message.content.trim());
    if (fallbackMessage) {
      return fallbackMessage.content.trim();
    }
  }

  return '';
}

// Direct request to a specific model
exports.handleDirect = async (req, res, next) => {
  try {
    const { model } = req.params;
    const prompt = extractPromptFromBody(req.body);

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

// Handle Event-Stream (SSE) Request
exports.handleStream = async (req, res, next) => {
  try {
    const prompt = extractPromptFromBody(req.body);
    const model = typeof req.body?.model === 'string' && req.body.model.trim() ? req.body.model.trim() : 'any';
    // Controller delegates stream writing directly to Response object
    await StreamingService.stream(model, prompt, res, req);
  } catch (err) {
    // Standard error handler isn't fully viable if headers are already sent, 
    // but useful if it breaks beforehand.
    next(err);
  }
};
