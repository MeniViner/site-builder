/**
 * DEV-only AI engine error taxonomy.
 *
 * Every failure the DEV AI gateway can produce is normalized into one of these
 * machine-readable codes.  The Hebrew message is what the existing Site Builder
 * AI panels already surface to the developer, the code is what tests and logs
 * assert on.  Nothing here may ever embed provider credentials.
 */

export const DEV_AI_ERROR_CODES = Object.freeze({
  DISABLED: 'DEV_AI_DISABLED',
  NOT_AVAILABLE_IN_PRODUCTION: 'DEV_AI_NOT_AVAILABLE_IN_PRODUCTION',
  INVALID_REQUEST: 'DEV_AI_INVALID_REQUEST',
  INPUT_TOO_LARGE: 'DEV_AI_INPUT_TOO_LARGE',
  PROVIDER_NOT_CONFIGURED: 'DEV_AI_PROVIDER_NOT_CONFIGURED',
  PROVIDER_UNAVAILABLE: 'DEV_AI_PROVIDER_UNAVAILABLE',
  MODEL_NOT_CONFIGURED: 'DEV_AI_MODEL_NOT_CONFIGURED',
  MODEL_NOT_FOUND: 'DEV_AI_MODEL_NOT_FOUND',
  RATE_LIMITED: 'DEV_AI_RATE_LIMITED',
  TIMEOUT: 'DEV_AI_TIMEOUT',
  UPSTREAM_ERROR: 'DEV_AI_UPSTREAM_ERROR',
  ALL_PROVIDERS_FAILED: 'DEV_AI_ALL_PROVIDERS_FAILED',
});

const DEFAULT_STATUS = Object.freeze({
  [DEV_AI_ERROR_CODES.DISABLED]: 503,
  [DEV_AI_ERROR_CODES.NOT_AVAILABLE_IN_PRODUCTION]: 404,
  [DEV_AI_ERROR_CODES.INVALID_REQUEST]: 400,
  [DEV_AI_ERROR_CODES.INPUT_TOO_LARGE]: 413,
  [DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED]: 503,
  [DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE]: 503,
  [DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED]: 503,
  [DEV_AI_ERROR_CODES.MODEL_NOT_FOUND]: 503,
  [DEV_AI_ERROR_CODES.RATE_LIMITED]: 429,
  [DEV_AI_ERROR_CODES.TIMEOUT]: 504,
  [DEV_AI_ERROR_CODES.UPSTREAM_ERROR]: 502,
  [DEV_AI_ERROR_CODES.ALL_PROVIDERS_FAILED]: 503,
});

const DEFAULT_MESSAGES = Object.freeze({
  [DEV_AI_ERROR_CODES.DISABLED]: 'מנוע ה-AI לפיתוח כבוי. הגדר DEV_AI_ENABLED=true בסביבת השרת המקומית.',
  [DEV_AI_ERROR_CODES.NOT_AVAILABLE_IN_PRODUCTION]: 'מנוע ה-AI לפיתוח אינו זמין בסביבת ייצור.',
  [DEV_AI_ERROR_CODES.INVALID_REQUEST]: 'הבקשה למנוע ה-AI לפיתוח אינה תקינה.',
  [DEV_AI_ERROR_CODES.INPUT_TOO_LARGE]: 'הבקשה ארוכה מדי עבור מנוע ה-AI לפיתוח.',
  [DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED]: 'ספק ה-AI המקומי אינו מוגדר כראוי.',
  [DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE]: 'ספק ה-AI המקומי אינו זמין כרגע.',
  [DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED]: 'לא הוגדר מודל עבור ספק ה-AI המקומי.',
  [DEV_AI_ERROR_CODES.MODEL_NOT_FOUND]: 'המודל שהוגדר אינו קיים אצל ספק ה-AI המקומי.',
  [DEV_AI_ERROR_CODES.RATE_LIMITED]: 'ספק ה-AI המקומי החזיר חריגת קצב (429). נסה שוב בעוד רגע.',
  [DEV_AI_ERROR_CODES.TIMEOUT]: 'ספק ה-AI המקומי לא השיב בזמן שהוקצב.',
  [DEV_AI_ERROR_CODES.UPSTREAM_ERROR]: 'ספק ה-AI המקומי החזיר שגיאה.',
  [DEV_AI_ERROR_CODES.ALL_PROVIDERS_FAILED]: 'כל ספקי ה-AI לפיתוח נכשלו. בדוק את npm run dev:ai:check.',
});

/**
 * Failures that justify moving on to the next provider while DEV_AI_PROVIDER=auto.
 * Permanent request/configuration problems are deliberately excluded so a broken
 * prompt is never retried against a second (possibly paid) provider.
 */
export const FALLBACK_WORTHY_CODES = Object.freeze(new Set([
  DEV_AI_ERROR_CODES.PROVIDER_NOT_CONFIGURED,
  DEV_AI_ERROR_CODES.PROVIDER_UNAVAILABLE,
  DEV_AI_ERROR_CODES.MODEL_NOT_CONFIGURED,
  DEV_AI_ERROR_CODES.MODEL_NOT_FOUND,
  DEV_AI_ERROR_CODES.RATE_LIMITED,
  DEV_AI_ERROR_CODES.TIMEOUT,
  DEV_AI_ERROR_CODES.UPSTREAM_ERROR,
]));

export class DevAiError extends Error {
  constructor(code, message = '', options = {}) {
    super(message || DEFAULT_MESSAGES[code] || 'DEV AI error');
    this.name = 'DevAiError';
    this.code = DEV_AI_ERROR_CODES[code] ? DEV_AI_ERROR_CODES[code] : code;
    this.status = options.status || DEFAULT_STATUS[this.code] || 500;
    this.provider = options.provider || null;
    this.upstreamStatus = options.upstreamStatus ?? null;
    this.hint = options.hint || '';
    // An explicit override wins over the code-based default. Upstream 401/403
    // is a permanent configuration fault and must NOT trigger auto fallback,
    // even though a locally-detected "not configured" provider should.
    this.fallbackWorthyOverride = typeof options.fallbackWorthy === 'boolean'
      ? options.fallbackWorthy
      : null;
  }

  get fallbackWorthy() {
    if (typeof this.fallbackWorthyOverride === 'boolean') return this.fallbackWorthyOverride;
    return FALLBACK_WORTHY_CODES.has(this.code);
  }
}

export function devAiError(code, message, options) {
  return new DevAiError(code, message, options);
}

export function isDevAiError(value) {
  return value instanceof DevAiError;
}

/**
 * Only whitelisted fields are ever serialized. Provider credentials are not part
 * of DevAiError at all, so no redaction of the message body is required, but the
 * shape stays explicit so a future field cannot leak by accident.
 */
export function toDevAiErrorBody(error) {
  const normalized = isDevAiError(error)
    ? error
    : new DevAiError(DEV_AI_ERROR_CODES.UPSTREAM_ERROR, DEFAULT_MESSAGES[DEV_AI_ERROR_CODES.UPSTREAM_ERROR]);

  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      provider: normalized.provider || undefined,
      hint: normalized.hint || undefined,
    },
  };
}

export function devAiErrorStatus(error) {
  return isDevAiError(error) ? error.status : 500;
}
