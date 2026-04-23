function parseBoolean(rawValue, defaultValue = false) {
    if (rawValue === undefined) {
        return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(rawValue).trim().toLowerCase());
}

function parseNumber(rawValue, defaultValue) {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function parseCsv(rawValue) {
    return String(rawValue || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function isLocalHostName(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function normalizeApiBase(rawValue) {
    const fallback = 'https://alphaai.idf/api';
    const raw = String(rawValue || '').trim();

    if (!raw) {
        return fallback;
    }

    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;

    try {
        const parsed = new URL(withProtocol);

        if (parsed.protocol === 'http:' && !isLocalHostName(parsed.hostname)) {
            parsed.protocol = 'https:';
        }

        return parsed.toString().replace(/\/+$/, '');
    } catch {
        return fallback;
    }
}

function normalizeRequestMode(rawValue) {
    const mode = String(rawValue || '').trim().toLowerCase();
    if (mode === 'smart') {
        return 'smart';
    }
    return 'direct';
}

const fallbackModels = parseCsv(import.meta.env.VITE_ALPHA_AI_FALLBACK_MODELS);

export const AI_CONFIG = Object.freeze({
    enabled: parseBoolean(import.meta.env.VITE_ALPHA_AI_ENABLED, false),
    apiBase: normalizeApiBase(import.meta.env.VITE_ALPHA_AI_API_BASE),
    apiToken: String(import.meta.env.VITE_ALPHA_AI_API_TOKEN || '').trim(),
    requestMode: normalizeRequestMode(import.meta.env.VITE_ALPHA_AI_REQUEST_MODE),
    defaultModel: String(import.meta.env.VITE_ALPHA_AI_MODEL || 'gpt-4o').trim(),
    fallbackModels,
    streamModel: String(import.meta.env.VITE_ALPHA_AI_STREAM_MODEL || 'any').trim(),
    requestTimeoutMs: parseNumber(import.meta.env.VITE_ALPHA_AI_TIMEOUT_MS, 30000),
    streamTimeoutMs: parseNumber(import.meta.env.VITE_ALPHA_AI_STREAM_TIMEOUT_MS, 120000),
    useSmartFallback: parseBoolean(import.meta.env.VITE_ALPHA_AI_USE_SMART_FALLBACK, true),
    debug: parseBoolean(import.meta.env.VITE_ALPHA_AI_DEBUG, false),
});

export function getSafeAiRuntimeConfig() {
    return {
        ...AI_CONFIG,
        apiToken: AI_CONFIG.apiToken ? '***' : '',
    };
}
