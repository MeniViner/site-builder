const axios = require('axios');
const logger = require('../utils/logger');
const KeyManager = require('./KeyManager');
const config = require('../config');

const AI_SCOPE_SYSTEM_PROMPT = [
  'You are an internal BIHS 7134 website operations assistant.',
  'You must only help with building, configuring, maintaining, and operating this specific website system.',
  'Allowed topics include admin screens, widgets, site content, navigation, events, theme, SharePoint data/config, and internal integrations.',
  'If a request is outside this scope, politely refuse and redirect to a relevant website-management phrasing.',
  'Never provide unrelated general advice; keep answers practical, concise, and implementation-focused.',
].join('\n');

class AIService {
  /**
   * Helper function to format the request to the correct Provider API
   */
  async _fetchFromProvider(model, prompt, timeoutMs) {
    const apiKey = KeyManager.getKey(model);
    if (!apiKey) throw new Error(`Provider keys exhausted or not configured for model: ${model}`);

    // Dynamic AbortSignal for Timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      if (model.includes('gpt')) {
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: AI_SCOPE_SYSTEM_PROMPT },
              { role: 'user', content: prompt }
            ]
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal
          }
        );
        return {
          content: response.data.choices[0].message.content,
          usage: response.data.usage
        };
      } 
      else if (model.includes('claude')) {
        const response = await axios.post(
          'https://api.anthropic.com/v1/messages',
          {
            model,
            system: AI_SCOPE_SYSTEM_PROMPT,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }]
          },
          {
            headers: { 
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01' 
            },
            signal: controller.signal
          }
        );
        return {
          content: response.data.content[0].text,
          usage: response.data.usage
        };
      }
      // Add other providers (Gemini) as needed...
      throw new Error('Model provider not supported yet');

    } catch (error) {
      if (error.response && error.response.status === 429) {
        KeyManager.blockKey(model, apiKey);
        throw new Error('429_TOO_MANY_REQUESTS');
      }
      if (axios.isCancel(error) || error.code === 'ECONNABORTED' || error.name === 'AbortError') {
        throw new Error('TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Standard single request targeting a specific model.
   * Handles internal retries if a specific key was 429'd but other keys are available.
   */
  async fetchDirect(model, prompt, maxRetries = 2) {
    for (let attempts = 0; attempts <= maxRetries; attempts++) {
      try {
        const result = await this._fetchFromProvider(model, prompt, config.ai.defaultTimeoutMs);
        
        // Log token usage for tracking
        logger.info(`Tokens used: [${model}]`, result.usage);
        return result.content;
      } catch (error) {
        logger.warn(`Direct fetch failed. Attempt: ${attempts}. Reason: ${error.message}`);
        // If it's a general generic error or we exhausted retries, throw
        if (attempts === maxRetries || !['429_TOO_MANY_REQUESTS', 'TIMEOUT'].includes(error.message)) {
          throw error;
        }
      }
    }
  }

  /**
   * Smart Fetch implementation - Dynamically iterates through multiple available models if one fails.
   */
  async fetchSmart(prompt) {
    const modelsToTry = config.ai.fallbackModels;
    
    for (let i = 0; i < modelsToTry.length; i++) {
        const currentModel = modelsToTry[i];
        logger.info(`Smart Fetch: Attempting ${currentModel}...`);
        
        try {
            // Give each model a chance. Timeout triggers the catch block and falls back to the next
            const content = await this.fetchDirect(currentModel, prompt, 0); // No key retry, fail fast to next model
            return {
                modelUsed: currentModel,
                content: content
            };
        } catch (error) {
            logger.warn(`Smart Fetch: ${currentModel} failed (${error.message}). Falling back...`);
        }
    }
    
    throw new Error('All fallback models failed or timed out.');
  }
}

module.exports = new AIService();
