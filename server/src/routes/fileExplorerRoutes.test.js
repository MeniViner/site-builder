import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeFileExplorerTarget, parseFileExplorerTarget } from '../../../src/utils/fileExplorerTargets.js';
import { createFileExplorerRouter, mapFileExplorerSystemError } from './fileExplorerRoutes.js';

const temporaryDirectories = [];
function makeApp(config = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'site-builder-explorer-'));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, 'public'));
  fs.writeFileSync(path.join(root, 'public', 'readme.txt'), 'hello explorer');
  const app = express();
  app.use('/api/file-explorer', createFileExplorerRouter({ config: { roots: [parseFileExplorerTarget(root)], ...config } }));
  return { app, root };
}
function targetQuery(value) { return { target: encodeFileExplorerTarget(value) }; }
afterEach(() => { while (temporaryDirectories.length) fs.rmSync(temporaryDirectories.pop(), { force: true, recursive: true }); });

describe('file explorer routes', () => {
  it('renders opaque root, parent, child, and breadcrumb navigation without native links', async () => {
    const { app, root } = makeApp();
    const response = await request(app).get('/api/file-explorer').query(targetQuery(root));
    expect(response.status).toBe(200);
    expect(response.text).toContain('/api/file-explorer?target=');
    expect(response.text).not.toContain('file://');
    expect(response.text).not.toContain('class="entry-action"');
    const listing = await request(app).get('/api/file-explorer/directory').query(targetQuery(root)).expect(200);
    expect(listing.body.directory.entries[0].href).toContain('target=');
    expect(listing.body.directory.breadcrumbs.filter((crumb) => crumb.href).every((crumb) => crumb.href.includes('target='))).toBe(true);
  });
  it('redirects a pasted path to an opaque target and supports range and download behavior', async () => {
    const { app, root } = makeApp();
    const pasted = await request(app).get('/api/file-explorer').query({ path: root }).expect(302);
    expect(pasted.headers.location).toMatch(/^\/api\/file-explorer\?target=/);
    const file = path.join(root, 'public', 'readme.txt');
    const range = await request(app).get('/api/file-explorer').set('Range', 'bytes=0-4').query(targetQuery(file));
    const download = await request(app).get('/api/file-explorer/download').query(targetQuery(file));
    expect(range.status).toBe(206);
    expect(range.text).toBe('hello');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.text).toBe('hello explorer');
  });
  it('enforces blocked roots, traversal rejection, and file-size limits', async () => {
    const { app, root } = makeApp({ maxFileBytes: 1 });
    const traversal = await request(app).get('/api/file-explorer').query({ path: `${root}/../outside` });
    const limited = await request(app).get('/api/file-explorer/download').query(targetQuery(path.join(root, 'public', 'readme.txt')));
    expect(traversal.status).toBe(400);
    expect(limited.status).toBe(413);
    expect(mapFileExplorerSystemError({ code: 'EACCES' }).code).toBe('access_denied');
    expect(mapFileExplorerSystemError({ code: 'ENETUNREACH' }).code).toBe('unavailable_share');
    expect(mapFileExplorerSystemError({ code: 'ETIMEDOUT' }).code).toBe('timeout');
  });
  it('reports same-origin readiness and keeps the native Chrome URL diagnostic operator-only', async () => {
    const { app, root } = makeApp({ configured: true, bridgePath: '/_site-builder/file-explorer', accessModel: 'service-identity' });
    const readiness = await request(app).get('/api/file-explorer/readiness').expect(200);
    expect(readiness.body.readiness).toMatchObject({ accessModel: 'service-identity', bridge: { externalApiUrlRequired: false, path: '/_site-builder/file-explorer', routeAvailable: true, sameOrigin: true } });
    await request(app).get('/api/file-explorer/diagnostic/native-url').query(targetQuery(root)).expect(403);
  });
});
