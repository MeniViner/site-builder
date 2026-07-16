import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeConfigCandidateUrls,
  clearRuntimeConfigForTests,
  getDeploymentMetadata,
  getRuntimeConfig,
  getRuntimeConfigSource,
  getRuntimeLog,
  getRuntimeValue,
  loadRuntimeConfig,
  setRuntimeConfigForTests,
} from './runtimeConfig';
import {
  clearStorageDescriptorForTests,
  getBackendApiBaseUrl,
  getSiteId,
  getStorageBackend,
  getStorageDescriptor,
} from './storageBackend';

const asResponse = (body, status = 200, contentType = 'application/json') => new Response(
  typeof body === 'string' ? body : JSON.stringify(body),
  {
    status,
    headers: { 'content-type': contentType },
  },
);

const setWindowLocation = (href, runtimeConfig = undefined) => {
  vi.stubGlobal('window', {
    ...window,
    ...(runtimeConfig === undefined ? {} : { SITE_BUILDER_RUNTIME_CONFIG: runtimeConfig }),
    location: new URL(href),
  });
};

describe('runtimeConfig and storage descriptor', () => {
  beforeEach(() => {
    clearRuntimeConfigForTests();
    clearStorageDescriptorForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses an embedded runtime config without accepting or diagnosing secrets', async () => {
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html', {
      storageBackend: 'mongo',
      backendApiUrl: 'https://api.example.test',
      siteId: 'runtime-site',
      apiKey: 'must-not-escape',
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toMatchObject({
      storageBackend: 'mongo',
      backendApiUrl: 'https://api.example.test',
      siteId: 'runtime-site',
    });
    expect(getRuntimeConfig()).not.toHaveProperty('apiKey');
    expect(getRuntimeConfigSource()).toBe('window-runtime-config');
    expect(getStorageBackend()).toBe('mongo');
    expect(getBackendApiBaseUrl()).toBe('https://api.example.test');
    expect(getSiteId()).toBe('runtime-site');
    expect(JSON.stringify(getRuntimeLog())).not.toContain('must-not-escape');
  });

  it('rejects an HTML fallback and loads the next JSON candidate beside nested index.html', async () => {
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html#/admin/navigation');
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('sitebuilder-runtime-config.json')) {
        return Promise.resolve(asResponse('<!DOCTYPE html><html><body>index</body></html>', 200, 'text/html'));
      }
      if (String(url).endsWith('sitebuilder-deployment.json')) {
        return Promise.resolve(asResponse({}, 404));
      }
      return Promise.resolve(asResponse({
        storageBackend: 'mongo',
        backendApiUrl: 'https://api.example.test',
        siteId: 'file-site',
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadRuntimeConfig();

    expect(fetchMock.mock.calls[0][0]).toBe('https://portal.army.idf/sites/demo/siteDB/dist/sitebuilder-runtime-config.json');
    expect(fetchMock.mock.calls[1][0]).toBe('https://portal.army.idf/sites/demo/siteDB/dist/runtime-config.json');
    expect(getRuntimeValue('siteId')).toBe('file-site');
    expect(getRuntimeLog().attempts[0]).toMatchObject({
      status: 200,
      contentType: 'text/html',
      error: expect.stringContaining('HTML response rejected'),
    });
  });

  it('builds correct candidates for a bare dist URL', () => {
    const urls = buildRuntimeConfigCandidateUrls(new URL('https://portal.army.idf/sites/demo/siteDB/dist'));
    expect(urls).toEqual([
      'https://portal.army.idf/sites/demo/siteDB/dist/sitebuilder-runtime-config.json',
      'https://portal.army.idf/sites/demo/siteDB/dist/runtime-config.json',
    ]);
  });

  it('keeps deployment audit metadata separate from runtime settings', async () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', 'txt');
    setWindowLocation('https://portal.army.idf/sites/runtime-target/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).endsWith('sitebuilder-deployment.json')) {
        return Promise.resolve(asResponse({
          storageBackend: 'txt',
          releaseVersion: '2.3.4',
          releaseId: 'release-123',
          allowedSiteRoot: 'https://portal.army.idf/sites/runtime-target',
        }));
      }
      return Promise.resolve(asResponse({}, 404));
    }));

    await loadRuntimeConfig();

    expect(getRuntimeValue('releaseVersion')).toBe('');
    expect(getDeploymentMetadata()).toMatchObject({
      releaseVersion: '2.3.4',
      storageBackend: 'txt',
    });
    expect(getRuntimeConfigSource()).toBe('production-env');
    expect(getStorageBackend()).toBe('txt');
  });

  it('fails on an invalid explicit runtime backend', async () => {
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      String(url).endsWith('sitebuilder-runtime-config.json')
        ? asResponse({ storageBackend: 'sharepoint-readonly' })
        : asResponse({}, 404),
    )));

    await expect(loadRuntimeConfig()).rejects.toMatchObject({
      code: 'invalid_storage_backend',
    });
  });

  it('treats a successful malformed runtime file as a fatal configuration error', async () => {
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      String(url).endsWith('sitebuilder-runtime-config.json')
        ? asResponse('{not-json', 200)
        : asResponse({}, 404),
    )));

    await expect(loadRuntimeConfig()).rejects.toMatchObject({
      code: 'invalid_runtime_json',
    });
    expect(getRuntimeLog().attempts[0]).toMatchObject({
      status: 200,
      error: expect.stringContaining('Invalid JSON'),
    });
  });

  it('uses the safe TXT production default when every candidate is an HTML fallback', async () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', '');
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html#/');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      asResponse('<!DOCTYPE html><html>fallback</html>', 200, 'text/html'),
    )));

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toEqual({});
    expect(getStorageBackend()).toBe('txt');
    expect(getStorageDescriptor()).toMatchObject({
      source: 'safe-default',
      siteId: 'demo',
      siteRoot: '/sites/demo',
    });
  });

  it('fails closed when Mongo is missing a URL or site ID', () => {
    setRuntimeConfigForTests({ storageBackend: 'mongo', siteId: 'alpha' });
    expect(() => getStorageDescriptor()).toThrow('backendApiUrl is required');

    clearStorageDescriptorForTests();
    clearRuntimeConfigForTests();
    setRuntimeConfigForTests({ storageBackend: 'mongo', backendApiUrl: 'https://api.example.test' });
    expect(() => getStorageDescriptor()).toThrow('siteId is required');
  });

  it('rejects credentials embedded in a Mongo backend URL', () => {
    setRuntimeConfigForTests({
      storageBackend: 'mongo',
      backendApiUrl: 'https://operator:secret@api.example.test',
      siteId: 'alpha',
    });
    expect(() => getStorageDescriptor()).toThrow('must not contain embedded credentials');
  });

  it('blocks an HTTP Mongo API when the deployed page is HTTPS', () => {
    setWindowLocation('https://portal.army.idf/sites/alpha/siteDB/dist/index.html');
    setRuntimeConfigForTests({
      storageBackend: 'mongo',
      backendApiUrl: 'http://127.0.0.1:3001',
      siteId: 'alpha',
    });
    expect(() => getStorageDescriptor()).toThrow('cannot use an insecure Mongo backendApiUrl');
  });

  it('accepts only the exact lowercase backend values and rejects URL query credentials', () => {
    expect(() => setRuntimeConfigForTests({ storageBackend: 'MONGO' })).toThrow('Expected "txt" or "mongo"');

    clearRuntimeConfigForTests();
    setRuntimeConfigForTests({
      storageBackend: 'mongo',
      backendApiUrl: 'https://api.example.test?token=must-not-ship',
      siteId: 'alpha',
    });
    expect(() => getStorageDescriptor()).toThrow('must not contain a query string or fragment');
  });

  it('rejects legacy selector aliases instead of activating an ambiguous backend', () => {
    expect(() => setRuntimeConfigForTests({ backendStorage: 'mongo' })).toThrow('Use "storageBackend"');
    expect(() => setRuntimeConfigForTests({ storage: 'mongo' })).toThrow('Use "storageBackend"');
  });

  it('fails when deployment audit backend disagrees with runtime selection', () => {
    expect(() => setRuntimeConfigForTests(
      { storageBackend: 'mongo', backendApiUrl: 'https://api.example.test', siteId: 'alpha' },
      { storageBackend: 'txt' },
    )).toThrow('disagrees');
  });

  it('fails on an invalid explicit build-time backend', () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', 'local-dev');
    setRuntimeConfigForTests({});
    expect(() => getStorageDescriptor()).toThrow('Expected "txt" or "mongo"');
  });
});
