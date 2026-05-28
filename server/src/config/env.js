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
    mongodbDbName: env.MONGODB_DB_NAME || 'site_builder',
    serverPort: Number(env.SERVER_PORT || 4000),
    corsOrigins: splitCsv(env.CORS_ORIGINS),
    storageBackend: env.STORAGE_BACKEND || 'mongo',
    legacySharePointReadonlyFallback: String(env.LEGACY_SHAREPOINT_READONLY_FALLBACK || 'false') === 'true',
    adminApiKey: env.ADMIN_API_KEY || '',
    jwtSecret: env.JWT_SECRET || '',
    siteCollectionPrefix: env.SITE_COLLECTION_PREFIX || 'site_',
    nodeEnv: env.NODE_ENV || 'development',
  };
}

export default getServerConfig;
