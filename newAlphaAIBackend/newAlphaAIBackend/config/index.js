const dotenv = require('dotenv');
dotenv.config();

function parseCsv(rawValue) {
  return (rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseBoolean(rawValue, defaultValue) {
  if (rawValue === undefined) {
    return defaultValue;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(rawValue).toLowerCase());
}

const defaultFallbackModels = ['gpt-4o', 'gemini-1.5-pro', 'claude-3-haiku-20240307'];
const parsedFallbackModels = parseCsv(process.env.FALLBACK_MODELS);

module.exports = {
  port: Number(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  security: {
    frontendDomain: process.env.FRONTEND_DOMAIN || '*',
    allowAllOrigins: parseBoolean(process.env.ALLOW_ALL_ORIGINS, true),
    apiSecretToken: (process.env.API_SECRET_TOKEN || '').trim(),
    disableAuthGuard: parseBoolean(process.env.DISABLE_AUTH_GUARD, true),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
  },
  ai: {
    openaiKeys: parseCsv(process.env.OPENAI_API_KEYS),
    anthropicKeys: parseCsv(process.env.ANTHROPIC_API_KEYS),
    geminiKeys: parseCsv(process.env.GEMINI_API_KEYS),
    fallbackModels: parsedFallbackModels.length ? parsedFallbackModels : defaultFallbackModels,
    defaultTimeoutMs: Number(process.env.DEFAULT_TIMEOUT_MS) || 15000,
    streamTimeoutMs: Number(process.env.STREAM_TIMEOUT_MS) || 45000,
  },
};
