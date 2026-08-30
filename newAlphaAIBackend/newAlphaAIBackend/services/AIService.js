const axios = require('axios');
const logger = require('../utils/logger');
const KeyManager = require('./KeyManager');
const config = require('../config');
const FileImportError = require('../errors/FileImportError');

const AI_SCOPE_SYSTEM_PROMPT = [
  'You are an internal פרוייקט מתנ"ה website operations assistant.',
  'You must only help with building, configuring, maintaining, and operating this specific website system.',
  'Allowed topics include admin screens, widgets, site content, navigation, events, theme, SharePoint data/config, and internal integrations.',
  'If a request is outside this scope, politely refuse and redirect to a relevant website-management phrasing.',
  'Never provide unrelated general advice; keep answers practical, concise, and implementation-focused.',
].join('\n');

function resolveProvider(model) {
  const normalized = String(model || '').toLowerCase();
  if (normalized.includes('claude')) return 'anthropic';
  if (normalized.includes('gemini')) return 'gemini';
  if (normalized.includes('gpt') || /(^|[/_-])o[134](?:-|$)/.test(normalized)) return 'openai';
  return null;
}

class AIService {
  async _fetchFromProvider(model, prompt, timeoutMs, options = {}) {
    const provider = resolveProvider(model);
    if (!provider || provider === 'gemini') {
      throw new FileImportError(
        'PROVIDER_MULTIMODAL_UNSUPPORTED',
        `The configured model provider is not supported: ${provider || 'unknown'}.`,
        422,
      );
    }

    const apiKey = KeyManager.getKey(model);
    if (!apiKey) throw new Error(`Provider keys exhausted or not configured for model: ${model}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const systemPrompt = options.systemPrompt || AI_SCOPE_SYSTEM_PROMPT;
    const attachment = options.attachment;

    try {
      if (provider === 'openai') {
        const userContent = attachment
          ? [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:${attachment.mimeType};base64,${attachment.base64}` },
              },
            ]
          : prompt;
        const response = await axios.post(
          'https://api.openai.com/v1/chat/completions',
          {
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userContent },
            ],
          },
          {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: controller.signal,
            maxBodyLength: Math.round(config.ai.fileImportMaxMb * 1.5 * 1024 * 1024),
          },
        );
        return {
          provider,
          content: response.data.choices[0].message.content,
          usage: response.data.usage,
        };
      }

      const userContent = attachment
        ? [
            { type: 'text', text: prompt },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: attachment.mimeType,
                data: attachment.base64,
              },
            },
          ]
        : prompt;
      const response = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model,
          system: systemPrompt,
          max_tokens: options.maxTokens || 4096,
          messages: [{ role: 'user', content: userContent }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          signal: controller.signal,
          maxBodyLength: Math.round(config.ai.fileImportMaxMb * 1.5 * 1024 * 1024),
        },
      );
      return {
        provider,
        content: response.data.content.map((part) => part.text || '').join(''),
        usage: response.data.usage,
      };
    } catch (error) {
      if (error.response?.status === 429) {
        KeyManager.blockKey(model, apiKey);
        throw new Error('429_TOO_MANY_REQUESTS');
      }
      if (axios.isCancel(error) || error.code === 'ECONNABORTED' || error.name === 'AbortError') {
        throw new FileImportError('TIMEOUT', 'The AI provider request timed out.', 504);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async fetchDirect(model, prompt, maxRetries = 2) {
    for (let attempts = 0; attempts <= maxRetries; attempts += 1) {
      try {
        const result = await this._fetchFromProvider(model, prompt, config.ai.defaultTimeoutMs);
        logger.info(`Tokens used: [${model}]`, result.usage);
        return result.content;
      } catch (error) {
        logger.warn(`Direct fetch failed. Attempt: ${attempts}. Reason: ${error.message}`);
        if (attempts === maxRetries || !['429_TOO_MANY_REQUESTS', 'TIMEOUT'].includes(error.code || error.message)) {
          throw error;
        }
      }
    }
    return null;
  }

  async fetchFileAnalysis(model, systemPrompt, prompt, attachment) {
    const result = await this._fetchFromProvider(model, prompt, config.ai.fileImportTimeoutMs, {
      systemPrompt,
      attachment,
      maxTokens: 4096,
    });
    logger.info('AI file model usage recorded', {
      model,
      provider: result.provider,
      usage: result.usage,
    });
    return { provider: result.provider, content: result.content };
  }

  async fetchSmart(prompt) {
    const modelsToTry = config.ai.fallbackModels;
    for (let i = 0; i < modelsToTry.length; i += 1) {
      const currentModel = modelsToTry[i];
      logger.info(`Smart Fetch: Attempting ${currentModel}...`);
      try {
        const content = await this.fetchDirect(currentModel, prompt, 0);
        return { modelUsed: currentModel, content };
      } catch (error) {
        logger.warn(`Smart Fetch: ${currentModel} failed (${error.message}). Falling back...`);
      }
    }
    throw new Error('All fallback models failed or timed out.');
  }
}

const aiService = new AIService();
aiService.AIService = AIService;
aiService.resolveProvider = resolveProvider;

module.exports = aiService;
