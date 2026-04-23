const crypto = require('crypto');
const logger = require('./logger');

class PromptCache {
  constructor(timeoutMs = 1000 * 60 * 60) { // Default 1 hour TTL
    this.cache = new Map();
    this.timeoutMs = timeoutMs;
  }

  hash(prompt, model) {
    return crypto.createHash('sha256').update(`${model}:${prompt}`).digest('hex');
  }

  get(prompt, model) {
    const key = this.hash(prompt, model);
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    logger.info(`Cache Hit! Saved tokens for model: ${model}`);
    return item.response;
  }

  set(prompt, model, response) {
    const key = this.hash(prompt, model);
    this.cache.set(key, {
      response,
      expiry: Date.now() + this.timeoutMs
    });
  }
}

// Singleton export
module.exports = new PromptCache();
