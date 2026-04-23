const KeyManager = require('./KeyManager');
const config = require('../config');
const logger = require('../utils/logger');

class StreamingService {
  _resolveModels(explicitModel) {
    const requestedModel = (explicitModel || '').trim();
    const fallbackModels = config.ai.fallbackModels || [];

    if (!requestedModel || requestedModel.toLowerCase() === 'any') {
      return [...fallbackModels];
    }

    return [requestedModel, ...fallbackModels.filter((model) => model !== requestedModel)];
  }

  _buildProviderRequest(model, prompt, apiKey) {
    if (model.includes('gpt')) {
      return {
        url: 'https://api.openai.com/v1/chat/completions',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        }),
      };
    }

    if (model.includes('claude')) {
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          stream: true,
          messages: [{ role: 'user', content: prompt }],
        }),
      };
    }

    throw new Error(`Streaming is not supported for provider model: ${model}`);
  }

  _applySseHeaders(res, model, keyIndex) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Proxy-Model', model);
    res.setHeader('X-Proxy-Key-Index', String(keyIndex));
    res.setHeader('Access-Control-Expose-Headers', 'X-Proxy-Model,X-Proxy-Key-Index');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
  }

  _writeSse(res, payload) {
    const safePayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
    res.write(`data: ${safePayload}\n\n`);
  }

  async _streamSingleModel(model, prompt, res, req) {
    const keyInfo = KeyManager.getKeyInfo(model);
    if (!keyInfo) {
      throw new Error(`No available API key for model: ${model}`);
    }
    const { key: apiKey, keyIndex } = keyInfo;

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), config.ai.streamTimeoutMs);
    let clientClosed = false;

    const onClientClose = () => {
      clientClosed = true;
      timeoutController.abort();
    };

    req.on('close', onClientClose);

    try {
      const upstream = this._buildProviderRequest(model, prompt, apiKey);

      const streamRes = await fetch(upstream.url, {
        method: 'POST',
        headers: upstream.headers,
        body: upstream.body,
        signal: timeoutController.signal,
      });

      if (!streamRes.ok) {
        if (streamRes.status === 429) {
          KeyManager.blockKey(model, apiKey);
        }

        const upstreamText = await streamRes.text();
        throw new Error(
          `Upstream ${model} failed: HTTP ${streamRes.status}${
            upstreamText ? ` - ${upstreamText.slice(0, 250)}` : ''
          }`,
        );
      }

      if (!streamRes.body) {
        throw new Error(`Upstream ${model} returned no stream body`);
      }

      this._applySseHeaders(res, model, keyIndex);

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let pending = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        pending += decoder.decode(value, { stream: true });
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('data:')) {
            res.write(`${trimmedLine}\n\n`);
          }
        }
      }

      if (pending.trim().startsWith('data:')) {
        res.write(`${pending.trim()}\n\n`);
      }

      this._writeSse(res, '[DONE]');
      res.end();
    } catch (err) {
      if (clientClosed) {
        const disconnectError = new Error('Client disconnected');
        disconnectError.code = 'CLIENT_DISCONNECTED';
        throw disconnectError;
      }

      if (err.name === 'AbortError') {
        throw new Error(`Stream timeout reached (${config.ai.streamTimeoutMs}ms) for model ${model}`);
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
      req.off('close', onClientClose);
    }
  }

  async stream(requestedModel, prompt, res, req) {
    const modelsToTry = this._resolveModels(requestedModel);
    const failures = [];

    for (const model of modelsToTry) {
      try {
        logger.info(`Streaming attempt started for model: ${model}`);
        await this._streamSingleModel(model, prompt, res, req);
        return;
      } catch (err) {
        if (err.code === 'CLIENT_DISCONNECTED') {
          logger.warn('Frontend client disconnected. Stream stopped.');
          return;
        }

        failures.push({
          model,
          reason: err.message || 'Unknown stream failure',
        });

        // If stream has already started we cannot fallback to another model.
        if (res.headersSent) {
          this._writeSse(res, { error: err.message || 'Streaming interrupted' });
          if (!res.writableEnded) {
            res.end();
          }
          return;
        }

        logger.warn(`Streaming attempt failed for ${model}: ${err.message}`);
      }
    }

    res.status(502).json({
      error: 'All fallback models failed or timed out.',
      details: failures,
    });
  }
}

module.exports = new StreamingService();
