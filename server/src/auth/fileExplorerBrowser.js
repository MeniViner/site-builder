import crypto from 'node:crypto';
import { forbidden, unauthorized } from '../utils/errors.js';

function matchesSecret(candidate, expected) {
  if (!candidate || !expected) return false;
  const actual = Buffer.from(candidate);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}
function requestOrigin(req) {
  if (req.get('origin')) return req.get('origin');
  try { return req.get('referer') ? new URL(req.get('referer')).origin : ''; } catch { return ''; }
}
function remoteAddress(req) { return String(req.socket?.remoteAddress || '').toLowerCase().replace(/^::ffff:/, ''); }
function hasControlCharacter(value) { return Array.from(value).some((character) => character.charCodeAt(0) < 32); }
function setBrowserHeaders(res) {
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
export function createFileExplorerBrowserGuard({ adminApiKey = '', config = {} } = {}) {
  return (req, res, next) => {
    const origin = requestOrigin(req);
    const allowed = new Set(config.auth?.allowedOrigins || []);
    if (req.method === 'OPTIONS') {
      return next(forbidden('File explorer does not use CORS preflight requests.'));
    }
    if (matchesSecret(req.get('x-api-key'), adminApiKey)) { setBrowserHeaders(res); req.fileExplorerAuth = { actor: 'operator-api-key', mode: 'api-key' }; return next(); }
    if (config.configurationError || !config.configured) return next();
    if (!origin || !allowed.has(origin)) return next(forbidden('File explorer origin is not allowed.'));
    if (!(config.auth?.trustedProxyAddresses || []).map((item) => String(item).toLowerCase()).includes(remoteAddress(req))) return next(forbidden('File explorer identity must arrive through the trusted reverse proxy.'));
    const identity = String(req.get(config.auth?.trustedUserHeader || 'x-site-builder-user') || '').trim();
    if (!identity || identity.length > 256 || hasControlCharacter(identity)) return next(unauthorized('Windows-integrated identity is required.'));
    setBrowserHeaders(res);
    req.fileExplorerAuth = { actor: identity, mode: 'windows-proxy' };
    return next();
  };
}
