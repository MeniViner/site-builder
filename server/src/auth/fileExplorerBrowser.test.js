import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createFileExplorerBrowserGuard } from './fileExplorerBrowser.js';

function app() {
  const server = express();
  server.use('/api/file-explorer', createFileExplorerBrowserGuard({ adminApiKey: 'operator-secret', config: { auth: { allowedOrigins: ['https://portal.army.idf'], mode: 'windows-proxy', trustedProxyAddresses: ['127.0.0.1', '::1'], trustedUserHeader: 'x-site-builder-user' }, configured: true } }));
  server.get('/api/file-explorer/check', (req, res) => res.json({ actor: req.fileExplorerAuth?.actor, ok: true }));
  server.use((cause, _req, res, _next) => {
    void _next;
    return res.status(cause.statusCode || 500).json({ error: cause.code });
  });
  return server;
}
describe('file explorer browser guard', () => {
  it('allows a trusted IIS proxy identity only from the configured origin', async () => {
    const response = await request(app()).get('/api/file-explorer/check').set('origin', 'https://portal.army.idf').set('x-site-builder-user', 'DOMAIN\\Meni').expect(200);
    expect(response.body.actor).toBe('DOMAIN\\Meni');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['content-security-policy']).toBe("frame-ancestors 'self'");
  });
  it('rejects untrusted origins and missing identities', async () => {
    await request(app()).get('/api/file-explorer/check').set('origin', 'https://blocked.test').set('x-site-builder-user', 'DOMAIN\\Meni').expect(403);
    await request(app()).get('/api/file-explorer/check').set('origin', 'https://portal.army.idf').expect(401);
  });
  it('rejects CORS preflight and retains an API-key operator fallback for loopback diagnostics', async () => {
    await request(app()).options('/api/file-explorer/check').set('origin', 'https://portal.army.idf').expect(403);
    await request(app()).get('/api/file-explorer/check').set('x-api-key', 'operator-secret').expect(200);
  });
});
