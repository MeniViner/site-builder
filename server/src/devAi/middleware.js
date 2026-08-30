import { DEV_AI_ERROR_CODES, devAiError, isDevAiError, toDevAiErrorBody } from './errors.js';
import { assertDevAiEnabled, describeDevAiConfig, isDevAiEnabled, isDevAiRouteAllowed } from './env.js';
import { inspectDevAi } from './health.js';
import { createDevAiLogger, createRequestId } from './logging.js';
import { ClientDisconnected } from './providers/http.js';
import { DEFAULT_ADAPTERS, openDevAiStream } from './router.js';
import { SSE_DONE_EVENT, SSE_HEADERS, sseErrorEvent, sseTokenEvent } from './sse.js';
import { validateDevAiRequest } from './validation.js';

export const DEV_AI_MOUNT_PATH = '/api/dev-ai';

const MAX_BODY_BYTES = 12 * 1024 * 1024;

const EXPOSED_HEADERS = 'x-dev-ai-provider, x-proxy-model, x-request-id';

function routePath(req) {
  const raw = String(req.url || '/');
  const queryIndex = raw.indexOf('?');
  const withoutQuery = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const normalized = withoutQuery.replace(/\/+$/u, '');
  return normalized === '' ? '/' : normalized;
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
  res.end(payload);
}

function sendDevAiError(res, error) {
  const normalized = isDevAiError(error)
    ? error
    : devAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, 'שגיאה פנימית במנוע ה-AI לפיתוח.');
  sendJson(res, normalized.status, toDevAiErrorBody(normalized));
}

/**
 * Reads the request body without depending on a body parser, so the exact same
 * middleware works inside Express (`app.use`) and inside the Vite dev server's
 * connect stack (`server.middlewares.use`).
 */
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object') {
    return req.body;
  }

  const chunks = [];
  let total = 0;

  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(devAiError(DEV_AI_ERROR_CODES.INPUT_TOO_LARGE, 'גוף הבקשה גדול מדי.'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
  });

  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) {
    throw devAiError(DEV_AI_ERROR_CODES.INVALID_REQUEST, 'גוף הבקשה ריק.');
  }

  try {
    return JSON.parse(text);
  } catch {
    throw devAiError(DEV_AI_ERROR_CODES.INVALID_REQUEST, 'גוף הבקשה אינו JSON תקין.');
  }
}

function createClientAbortSignal(req, res) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.on?.('aborted', abort);
  res.on?.('close', () => {
    if (!res.writableEnded) abort();
  });
  return controller.signal;
}

export function createDevAiMiddleware({
  config,
  adapters = DEFAULT_ADAPTERS,
  fetchImpl = fetch,
  logger = createDevAiLogger({ enabled: config.debug }),
  validate,
  now = () => Date.now(),
} = {}) {
  // `validate` exists purely as a test seam; the shipped default is the
  // authoritative server-side check.
  const validateRequest = validate || validateDevAiRequest;

  async function handleHealth(req, res) {
    if (!isDevAiEnabled(config)) {
      const described = describeDevAiConfig(config);
      sendJson(res, 200, {
        ok: false,
        enabled: false,
        nodeEnv: described.nodeEnv,
        mode: described.mode,
        order: described.autoOrder,
        error: { code: DEV_AI_ERROR_CODES.DISABLED },
      });
      return;
    }

    const report = await inspectDevAi(config, { adapters, fetchImpl });
    logger.info({
      event: 'health',
      mode: report.mode,
      providerOrder: report.order,
      configured: Boolean(report.usableProviders.length),
    });
    sendJson(res, 200, report);
  }

  async function handleStream(req, res) {
    const requestId = createRequestId(now());
    const startedAt = now();
    res.setHeader('x-request-id', requestId);

    let parsed;
    try {
      assertDevAiEnabled(config);
      const body = await readJsonBody(req);
      parsed = validateRequest(body, { maxInputChars: config.maxInputChars });
    } catch (error) {
      logger.error({
        event: 'request-rejected',
        requestId,
        mode: config.mode,
        errorCode: isDevAiError(error) ? error.code : DEV_AI_ERROR_CODES.INVALID_REQUEST,
        durationMs: now() - startedAt,
      });
      sendDevAiError(res, error);
      return;
    }

    logger.info({
      event: 'request-accepted',
      requestId,
      mode: config.mode,
      providerOrder: config.mode === 'auto' ? [...config.autoOrder] : [config.mode],
      requestedModel: parsed.requestedModel || '(none)',
      messageCount: parsed.messageCount,
      inputChars: parsed.totalChars,
    });

    const signal = createClientAbortSignal(req, res);
    let opened;

    try {
      opened = await openDevAiStream({
        config,
        messages: parsed.messages,
        signal,
        adapters,
        fetchImpl,
        onAttempt: (provider) => logger.info({ event: 'provider-attempt', requestId, attemptedProvider: provider }),
        onNotice: (details) => logger.info({
          event: 'provider-notice',
          requestId,
          attemptedProvider: details.provider,
          outcome: details.reason,
        }),
        onFallback: (details) => logger.info({
          event: 'provider-fallback',
          requestId,
          fallbackFrom: details.from,
          fallbackTo: details.to,
          fallbackReason: details.reason,
          upstreamStatus: details.upstreamStatus ?? undefined,
        }),
      });
    } catch (error) {
      if (error instanceof ClientDisconnected) {
        logger.info({ event: 'client-disconnected', requestId, durationMs: now() - startedAt });
        if (!res.writableEnded) res.end();
        return;
      }
      logger.error({
        event: 'stream-failed',
        requestId,
        mode: config.mode,
        errorCode: isDevAiError(error) ? error.code : DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
        upstreamStatus: isDevAiError(error) ? error.upstreamStatus ?? undefined : undefined,
        durationMs: now() - startedAt,
      });
      sendDevAiError(res, error);
      return;
    }

    // The provider is committed. Headers go out only now, so no fallback can
    // happen after the response has started.
    res.statusCode = 200;
    for (const [header, value] of Object.entries(SSE_HEADERS)) res.setHeader(header, value);
    res.setHeader('x-dev-ai-provider', opened.provider);
    res.setHeader('x-proxy-model', opened.model);
    res.setHeader('x-request-id', requestId);
    res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
    res.flushHeaders?.();

    let tokensEmitted = 0;
    const meta = { model: opened.model, provider: opened.provider };

    try {
      if (opened.firstToken) {
        res.write(sseTokenEvent(opened.firstToken, meta));
        tokensEmitted += 1;
      }

      for await (const token of opened.tokens) {
        if (res.writableEnded) break;
        res.write(sseTokenEvent(token, meta));
        tokensEmitted += 1;
      }

      res.write(SSE_DONE_EVENT);
      res.end();
      logger.info({
        event: 'stream-completed',
        requestId,
        mode: config.mode,
        resolvedProvider: opened.provider,
        resolvedModel: opened.model,
        requestedModel: parsed.requestedModel || '(none)',
        tokensEmitted,
        durationMs: now() - startedAt,
        outcome: 'ok',
      });
    } catch (error) {
      if (error instanceof ClientDisconnected) {
        logger.info({ event: 'client-disconnected', requestId, durationMs: now() - startedAt });
        if (!res.writableEnded) res.end();
        return;
      }
      const code = isDevAiError(error) ? error.code : DEV_AI_ERROR_CODES.UPSTREAM_ERROR;
      const message = isDevAiError(error) ? error.message : 'הסטרימינג מספק ה-AI לפיתוח נכשל.';
      logger.error({
        event: 'stream-interrupted',
        requestId,
        resolvedProvider: opened.provider,
        resolvedModel: opened.model,
        errorCode: code,
        tokensEmitted,
        durationMs: now() - startedAt,
        outcome: 'error',
      });
      if (!res.writableEnded) {
        res.write(sseErrorEvent(code, message, { provider: opened.provider }));
        res.write(SSE_DONE_EVENT);
        res.end();
      }
    } finally {
      opened.cancel?.();
    }
  }

  return async function devAiMiddleware(req, res, next) {
    if (!isDevAiRouteAllowed(config)) {
      // Defensive: the route is not registered in production at all.
      if (typeof next === 'function') return next();
      sendDevAiError(res, devAiError(DEV_AI_ERROR_CODES.NOT_AVAILABLE_IN_PRODUCTION));
      return undefined;
    }

    const path = routePath(req);
    const method = String(req.method || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-token');
      res.setHeader('Access-Control-Expose-Headers', EXPOSED_HEADERS);
      res.end();
      return undefined;
    }

    try {
      if (method === 'GET' && (path === '/health' || path === '/init')) {
        await handleHealth(req, res);
        return undefined;
      }

      if (method === 'POST' && path === '/stream') {
        await handleStream(req, res);
        return undefined;
      }
    } catch (error) {
      sendDevAiError(res, error);
      return undefined;
    }

    if (typeof next === 'function') return next();
    sendJson(res, 404, {
      ok: false,
      error: { code: 'not_found', message: `DEV AI route not found: ${method} ${path}` },
    });
    return undefined;
  };
}
