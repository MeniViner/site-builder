const config = require('../config');
const logger = require('../utils/logger');

/**
 * KeyManager handles Round-Robin strategy and 429 Error Tracking for multiple API Keys.
 */
class KeyManager {
  constructor() {
    this.keys = {
      openai: config.ai.openaiKeys.map(k => ({ key: k, blockedUntil: 0 })),
      anthropic: config.ai.anthropicKeys.map(k => ({ key: k, blockedUntil: 0 })),
      gemini: config.ai.geminiKeys.map(k => ({ key: k, blockedUntil: 0 }))
    };
    this.indices = { openai: 0, anthropic: 0, gemini: 0 };
    this.blockDurationMs = 15 * 60 * 1000; // 15 minutes block
  }

  /**
   * Identifies the provider array to use depending on model type
   */
  _getProvider(model) {
    if (model.includes('gpt')) return 'openai';
    if (model.includes('claude')) return 'anthropic';
    if (model.includes('gemini')) return 'gemini';
    return 'openai'; // default fallback
  }

  /**
   * Get an available key using round-robin, skipping blocked ones.
   */
  getKeyInfo(model) {
    const provider = this._getProvider(model);
    const keyPool = this.keys[provider];
    
    if (!keyPool || keyPool.length === 0) {
      logger.error(`No keys configured for provider: ${provider}`);
      return null;
    }

    const now = Date.now();
    let attempts = 0;
    
    while (attempts < keyPool.length) {
      const currentIndex = this.indices[provider];
      const keyObj = keyPool[currentIndex];
      
      // Advance index for next time (Round Robin step)
      this.indices[provider] = (currentIndex + 1) % keyPool.length;

      // If not blocked, return it
      if (now > keyObj.blockedUntil) {
        return {
          key: keyObj.key,
          keyIndex: currentIndex,
          provider,
        };
      }
      
      attempts++;
    }

    logger.warn(`All keys for ${provider} are currently blocked (429)!`);
    return null;
  }

  getKey(model) {
    const keyInfo = this.getKeyInfo(model);
    return keyInfo ? keyInfo.key : null;
  }

  /**
   * Marks a specific key as blocked due to Rate Limits (429)
   */
  blockKey(model, invalidKey) {
    const provider = this._getProvider(model);
    const keyPool = this.keys[provider];
    const keyObj = keyPool.find(k => k.key === invalidKey);
    
    if (keyObj) {
      keyObj.blockedUntil = Date.now() + this.blockDurationMs;
      logger.warn(`Key for ${provider} blocked for 15 minutes due to 429 / Rate Limit.`);
    }
  }
}

module.exports = new KeyManager();
