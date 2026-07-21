import dotenv from 'dotenv';

dotenv.config();

const splitCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function getServerConfig(env = process.env) {
  return {
    mongodbUri: env.MONGODB_URI || '',
    // The database name must be explicit.  Falling back to the historical
    // development database makes an accidental deployment especially risky.
    mongodbDbName: env.MONGODB_DB_NAME || '',
    serverPort: Number(env.SERVER_PORT || 3001),
    corsOrigins: splitCsv(env.CORS_ORIGINS),
    storageBackend: env.STORAGE_BACKEND || 'mongo',
    legacySharePointReadonlyFallback: String(env.LEGACY_SHAREPOINT_READONLY_FALLBACK || 'false') === 'true',
    adminApiKey: env.ADMIN_API_KEY || '',
    jwtSecret: env.JWT_SECRET || '',
    siteCollectionPrefix: env.SITE_COLLECTION_PREFIX || 'site_',
    nodeEnv: env.NODE_ENV || 'development',
    requireStartupCollections: String(
      env.REQUIRE_STARTUP_COLLECTIONS ?? (env.NODE_ENV === 'production' ? 'true' : 'false'),
    ).toLowerCase() === 'true',
    shutdownTimeoutMs: Number(env.SHUTDOWN_TIMEOUT_MS || 30000),
  };
}

export function validateServerConfig(config) {
  const errors = [];
  const storageBackend = String(config.storageBackend || '').trim().toLowerCase();

  if (storageBackend === 'mongo') {
    if (!String(config.mongodbUri || '').trim()) {
      errors.push('MONGODB_URI is required when STORAGE_BACKEND=mongo.');
    }
    if (!String(config.mongodbDbName || '').trim()) {
      errors.push('MONGODB_DB_NAME is required when STORAGE_BACKEND=mongo.');
    }
  }

  if (!Number.isInteger(config.serverPort) || config.serverPort < 1 || config.serverPort > 65535) {
    errors.push('SERVER_PORT must be an integer between 1 and 65535.');
  }

  if (!Number.isInteger(config.shutdownTimeoutMs) || config.shutdownTimeoutMs < 1000 || config.shutdownTimeoutMs > 300000) {
    errors.push('SHUTDOWN_TIMEOUT_MS must be an integer between 1000 and 300000.');
  }

  return errors;
}

export function assertServerConfig(config) {
  const errors = validateServerConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid Site Builder server configuration:\n- ${errors.join('\n- ')}`);
  }
  return config;
}

export default getServerConfig;
