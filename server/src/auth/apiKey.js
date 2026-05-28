import { forbidden, unauthorized } from '../utils/errors.js';

const extractBearer = (header = '') => {
  const match = String(header || '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
};

export function actorFromRequest(req) {
  return (
    req.get('x-actor')
    || req.get('x-user')
    || extractBearer(req.get('authorization')).slice(0, 24)
    || 'api'
  );
}

export function createApiKeyGuard({ adminApiKey = '', nodeEnv = 'development' } = {}) {
  return function apiKeyGuard(req, _res, next) {
    if (!adminApiKey && nodeEnv === 'production') {
      return next(forbidden('ADMIN_API_KEY is required in production'));
    }

    if (!adminApiKey) {
      return next();
    }

    const candidate = req.get('x-api-key') || extractBearer(req.get('authorization'));
    if (candidate && candidate === adminApiKey) {
      return next();
    }

    return next(unauthorized('A valid API key is required'));
  };
}
