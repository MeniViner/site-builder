import { DEV_AI_ERROR_CODES, devAiError } from './errors.js';

export const SUPPORTED_ROLES = Object.freeze(['system', 'user', 'assistant']);

const GENERIC_MODEL_ALIASES = new Set(['', 'any', 'auto', 'default']);

function invalid(message) {
  return devAiError(DEV_AI_ERROR_CODES.INVALID_REQUEST, message);
}

/**
 * Server-side authority over the request shape.
 *
 * The browser limits are treated as advisory only: message roles, content types
 * and the aggregate character budget are all re-checked here, before any
 * provider (including a paid one) is contacted.
 */
export function validateDevAiRequest(body, { maxInputChars } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('גוף הבקשה חייב להיות אובייקט JSON.');
  }

  const { messages } = body;
  if (!Array.isArray(messages)) {
    throw invalid('שדה messages חייב להיות מערך.');
  }
  if (messages.length === 0) {
    throw invalid('שדה messages חייב להכיל לפחות הודעה אחת.');
  }

  const normalized = [];
  let totalChars = 0;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw invalid(`הודעה ${index} אינה אובייקט תקין.`);
    }

    const role = String(message.role || '').trim().toLowerCase();
    if (!SUPPORTED_ROLES.includes(role)) {
      throw invalid(`תפקיד לא נתמך בהודעה ${index}: "${role || '(ריק)'}". תפקידים חוקיים: ${SUPPORTED_ROLES.join(', ')}.`);
    }

    if (typeof message.content !== 'string') {
      throw invalid(`תוכן הודעה ${index} חייב להיות מחרוזת.`);
    }

    // Unicode-safe: the content is passed through verbatim, no trimming of the
    // interior, no normalization, no JSON/markdown stripping.
    const content = message.content;
    if (content.trim().length === 0) {
      throw invalid(`תוכן הודעה ${index} ריק.`);
    }

    totalChars += content.length;
    normalized.push({ role, content });
  }

  if (!normalized.some((message) => message.role === 'user')) {
    throw invalid('הבקשה חייבת לכלול לפחות הודעת user אחת.');
  }

  const limit = Number.isFinite(maxInputChars) && maxInputChars > 0 ? maxInputChars : Infinity;
  if (totalChars > limit) {
    throw devAiError(
      DEV_AI_ERROR_CODES.INPUT_TOO_LARGE,
      `הבקשה מכילה ${totalChars} תווים והמגבלה היא ${limit} תווים (DEV_AI_MAX_INPUT_CHARS).`,
    );
  }

  const rawModel = body.model === undefined || body.model === null ? '' : body.model;
  if (typeof rawModel !== 'string') {
    throw invalid('שדה model חייב להיות מחרוזת אם הוא נשלח.');
  }

  const requestedModel = rawModel.trim();

  return {
    messages: normalized,
    // Recorded for diagnostics only. The DEV gateway always resolves the real
    // model from server-side configuration, because the frontend sends
    // production model names that are meaningless to Ollama/Groq.
    requestedModel,
    requestedModelIsGeneric: GENERIC_MODEL_ALIASES.has(requestedModel.toLowerCase()),
    stream: body.stream === undefined ? true : Boolean(body.stream),
    totalChars,
    messageCount: normalized.length,
  };
}
