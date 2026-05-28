import { forbidden } from '../utils/errors.js';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

export function createCorsMiddleware({ corsOrigins = [], nodeEnv = 'development' } = {}) {
  const configured = Array.isArray(corsOrigins) ? corsOrigins : [];
  const allowAny = configured.includes('*');
  const allowed = new Set(configured.length > 0 ? configured : (nodeEnv === 'production' ? [] : DEFAULT_DEV_ORIGINS));

  return function corsMiddleware(req, res, next) {
    const origin = req.get('origin');

    if (origin) {
      if (allowAny || allowed.has(origin)) {
        res.setHeader('Access-Control-Allow-Origin', allowAny ? origin : origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Actor, If-Match');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      } else {
        return next(forbidden(`CORS origin is not allowed: ${origin}`));
      }
    }

    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    return next();
  };
}
