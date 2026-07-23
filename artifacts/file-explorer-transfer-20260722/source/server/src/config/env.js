import dotenv from 'dotenv';
import { getFileExplorerConfig } from './fileExplorer.js';

dotenv.config();

const splitCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function getServerConfig(env = process.env) {
  const fileExplorer = getFileExplorerConfig(env);
  return {
    mongodbUri: env.MONGODB_URI || '',
    mongodbDbName: env.MONGODB_DB_NAME || 'site_builder',
    serverPort: Number(env.SERVER_PORT || 4000),
    corsOrigins: splitCsv(env.CORS_ORIGINS),
    storageBackend: env.STORAGE_BACKEND || 'mongo',
    legacySharePointReadonlyFallback: String(env.LEGACY_SHAREPOINT_READONLY_FALLBACK || 'false') === 'true',
    adminApiKey: env.ADMIN_API_KEY || '',
    jwtSecret: env.JWT_SECRET || '',
    siteCollectionPrefix: env.SITE_COLLECTION_PREFIX || 'site_',
    nodeEnv: env.NODE_ENV || 'development',
    serverHost: env.SERVER_HOST || (fileExplorer.configured && fileExplorer.auth.mode === 'windows-proxy' ? '127.0.0.1' : '0.0.0.0'),
    fileExplorer,
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

  if (config.fileExplorer?.configured && config.fileExplorer.configurationError) {
    errors.push(`File explorer configuration is invalid: ${config.fileExplorer.configurationError}`);
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
