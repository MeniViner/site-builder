// Vite replaces `import.meta.env` with a plain object in the browser bundle. In a
// bare Node process (diagnostic scripts) it is simply `undefined`, so the `|| {}`
// fallback keeps this module importable from both worlds without any shim.
const VITE_ENV = import.meta.env || {};

/**
 * True only inside a Vite DEVELOPMENT runtime.
 *
 * `import.meta.env.DEV` is statically replaced with `false` by Vite in every
 * production build, so the DEV AI branch below cannot be reached from a
 * production bundle no matter how VITE_DEV_AI_ENABLED is set.
 */
const IS_VITE_DEV_RUNTIME = Boolean(import.meta.env && import.meta.env.DEV === true);

/**
 * Vitest runs with MODE='test' but DEV=true, and it loads the developer's
 * `.env.local`. Without this guard an automated run would silently inherit a
 * machine-local `VITE_DEV_AI_ENABLED=true` and change how every existing AI test
 * behaves. Tests that need the DEV transport construct it explicitly instead.
 */
const IS_AUTOMATED_TEST_RUNTIME = String(VITE_ENV.MODE || '') === 'test';

export const DEFAULT_IS_DEV_AI_RUNTIME = IS_VITE_DEV_RUNTIME && !IS_AUTOMATED_TEST_RUNTIME;

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

const fallbackModels = parseCsv(VITE_ENV.VITE_ALPHA_AI_FALLBACK_MODELS);

/**
 * The existing, verified production AI configuration. Untouched.
 */
export const PRODUCTION_AI_CONFIG = Object.freeze({
    enabled: parseBoolean(VITE_ENV.VITE_ALPHA_AI_ENABLED, false),
    apiBase: normalizeApiBase(VITE_ENV.VITE_ALPHA_AI_API_BASE),
    apiToken: String(VITE_ENV.VITE_ALPHA_AI_API_TOKEN || '').trim(),
    defaultModel: String(VITE_ENV.VITE_ALPHA_AI_MODEL || 'gpt-4o').trim(),
    fallbackModels,
    streamModel: String(VITE_ENV.VITE_ALPHA_AI_STREAM_MODEL || 'any').trim(),
    streamEndpoint: String(VITE_ENV.VITE_ALPHA_AI_STREAM_ENDPOINT || '/ai/stream').trim(),
    fileModel: String(VITE_ENV.VITE_ALPHA_AI_FILE_MODEL || '').trim(),
    fileMaxMb: 20,
    requestTimeoutMs: parseNumber(VITE_ENV.VITE_ALPHA_AI_TIMEOUT_MS, 30000),
    streamTimeoutMs: parseNumber(VITE_ENV.VITE_ALPHA_AI_STREAM_TIMEOUT_MS, 120000),
    debug: parseBoolean(VITE_ENV.VITE_ALPHA_AI_DEBUG, false),
    devAi: false,
});

/**
 * Same-origin DEV AI transport.
 *
 * `apiBase` + `streamEndpoint` compose into `/api/dev-ai/stream`, and the
 * existing `AIService.health()` / `AIService.init()` helpers land on
 * `/api/dev-ai/health` and `/api/dev-ai/init` without any caller change.
 * No provider name, no provider base URL and no credential is present here:
 * the browser only knows it is talking to its own development server.
 */
export const DEV_AI_TRANSPORT = Object.freeze({
    apiBase: '/api/dev-ai',
    streamEndpoint: '/stream',
    healthPath: '/health',
});

/**
 * Central transport resolver. Everything below `AIService` changes; nothing above it does.
 */
export function resolveAiTransportConfig({
    isDevRuntime = DEFAULT_IS_DEV_AI_RUNTIME,
    env = VITE_ENV,
    productionConfig = PRODUCTION_AI_CONFIG,
} = {}) {
    const devAiRequested = parseBoolean(env.VITE_DEV_AI_ENABLED, false);

    if (isDevRuntime !== true || !devAiRequested) {
        return productionConfig;
    }

    return Object.freeze({
        ...productionConfig,
        devAi: true,
        // The DEV engine is its own enablement switch: it does not require the
        // production VITE_ALPHA_AI_ENABLED flag to be on.
        enabled: true,
        apiBase: DEV_AI_TRANSPORT.apiBase,
        streamEndpoint: DEV_AI_TRANSPORT.streamEndpoint,
        // No token is sent to the local development server.
        apiToken: '',
        // Model selection belongs to the DEV gateway's server-side configuration;
        // the production model names mean nothing to Ollama/Groq.
        defaultModel: '',
        streamModel: '',
        fileModel: '',
        fallbackModels: Object.freeze([]),
        requestTimeoutMs: parseNumber(env.VITE_DEV_AI_TIMEOUT_MS, 30000),
        streamTimeoutMs: parseNumber(env.VITE_DEV_AI_STREAM_TIMEOUT_MS, 120000),
    });
}

export const AI_CONFIG = resolveAiTransportConfig();

export function resolveAlphaAiFileModel({
    config = AI_CONFIG,
    capabilityKind = 'local-text',
    visualTransportAvailable = false,
} = {}) {
    if (capabilityKind === 'native-import') {
        return {
            canAnalyze: true,
            path: 'native-import',
            pathLabel: 'ייבוא מקומי ללא AI',
            modelSource: 'not-required',
            resolvedModel: '',
            displayModel: 'לא נדרש',
            reasonCode: null,
            reason: '',
        };
    }

    if (capabilityKind === 'local-text') {
        const dedicatedModel = String(config?.fileModel || '').trim();
        const defaultModel = String(config?.defaultModel || '').trim();
        const useTransportDefault = Boolean(config?.devAi) && !dedicatedModel;
        const resolvedModel = dedicatedModel || (useTransportDefault ? '' : defaultModel);
        const displayModel = dedicatedModel
            || (useTransportDefault ? 'DEV AI · מודל ברירת המחדל של השרת' : defaultModel);

        if (!config?.enabled) {
            return {
                canAnalyze: false,
                path: 'local-text-extraction',
                pathLabel: 'חילוץ טקסט מקומי + AI',
                modelSource: dedicatedModel ? 'file-model' : useTransportDefault ? 'dev-transport-default' : 'default-model',
                resolvedModel,
                displayModel: displayModel || 'לא זמין',
                reasonCode: 'AI_DISABLED',
                reason: 'חיבור ה-AI כבוי. יש להפעיל אותו כדי לנתח את הטקסט שחולץ.',
            };
        }

        if (!displayModel) {
            return {
                canAnalyze: false,
                path: 'local-text-extraction',
                pathLabel: 'חילוץ טקסט מקומי + AI',
                modelSource: 'missing',
                resolvedModel: '',
                displayModel: 'לא הוגדר',
                reasonCode: 'TEXT_MODEL_NOT_CONFIGURED',
                reason: 'לא הוגדר מודל טקסט לניתוח התוכן שחולץ.',
            };
        }

        return {
            canAnalyze: true,
            path: 'local-text-extraction',
            pathLabel: 'חילוץ טקסט מקומי + AI',
            modelSource: dedicatedModel ? 'file-model' : useTransportDefault ? 'dev-transport-default' : 'default-model',
            resolvedModel,
            displayModel,
            reasonCode: null,
            reason: '',
        };
    }

    if (capabilityKind === 'visual-unverified') {
        const dedicatedModel = String(config?.fileModel || '').trim();
        if (!visualTransportAvailable) {
            return {
                canAnalyze: false,
                path: 'visual-file-analysis',
                pathLabel: 'ניתוח קובץ חזותי',
                modelSource: dedicatedModel ? 'file-model' : 'missing',
                resolvedModel: dedicatedModel,
                displayModel: dedicatedModel || 'לא הוגדר',
                reasonCode: 'VISUAL_TRANSPORT_UNAVAILABLE',
                reason: 'סוג הקובץ דורש ניתוח חזותי, אך חיבור העלאת קבצים/תמונות עדיין אינו זמין.',
            };
        }
        if (!dedicatedModel) {
            return {
                canAnalyze: false,
                path: 'visual-file-analysis',
                pathLabel: 'ניתוח קובץ חזותי',
                modelSource: 'missing',
                resolvedModel: '',
                displayModel: 'לא הוגדר',
                reasonCode: 'VISUAL_FILE_MODEL_NOT_CONFIGURED',
                reason: 'ניתוח חזותי דורש מודל קבצים ייעודי באמצעות VITE_ALPHA_AI_FILE_MODEL.',
            };
        }
        return {
            canAnalyze: Boolean(config?.enabled),
            path: 'visual-file-analysis',
            pathLabel: 'ניתוח קובץ חזותי',
            modelSource: 'file-model',
            resolvedModel: dedicatedModel,
            displayModel: dedicatedModel,
            reasonCode: config?.enabled ? null : 'AI_DISABLED',
            reason: config?.enabled ? '' : 'חיבור ה-AI כבוי.',
        };
    }

    return {
        canAnalyze: false,
        path: 'unsupported',
        pathLabel: 'סוג קובץ לא נתמך',
        modelSource: 'not-applicable',
        resolvedModel: '',
        displayModel: 'לא רלוונטי',
        reasonCode: 'UNSUPPORTED_FILE_TYPE',
        reason: 'סוג הקובץ אינו נתמך במסלול הייבוא הנוכחי.',
    };
}

export function isDevAiTransportActive(config = AI_CONFIG) {
    return Boolean(config?.devAi);
}

/**
 * Development-only engine badge reusing the model metadata the AI panels
 * already render. In production this returns the plain model name, so the
 * production UI is unchanged.
 */
export function formatAiEngineLabel(result, config = AI_CONFIG) {
    const modelUsed = String(result?.modelUsed || result?.model || '').trim();

    if (!isDevAiTransportActive(config)) {
        return modelUsed;
    }

    const provider = String(result?.providerUsed || '').trim();
    const providerLabel = provider === 'groq' ? 'Groq' : provider === 'ollama' ? 'Ollama' : provider;

    return ['DEV AI', providerLabel, modelUsed].filter(Boolean).join(' · ');
}

export function getSafeAiRuntimeConfig(config = AI_CONFIG) {
    return {
        ...config,
        apiToken: config.apiToken ? '***' : '',
    };
}
