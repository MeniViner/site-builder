import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearRuntimeConfigForTests,
  getRuntimeConfig,
  getRuntimeConfigSource,
  getRuntimeLog,
  getRuntimeValue,
  loadRuntimeConfig,
  setRuntimeConfigForTests,
} from './runtimeConfig';
import {
  getBackendApiBaseUrl,
  getSiteId,
  getStorageBackend,
} from './storageBackend';

const asResponse = (body, status = 200) => new Response(
  typeof body === 'string' ? body : JSON.stringify(body),
  {
    status,
    headers: {
      'content-type': 'application/json',
    },
  },
);

const setWindowLocation = (href) => {
  vi.stubGlobal('window', {
    ...window,
    location: new URL(href),
  });
};

describe('runtimeConfig', () => {
  beforeEach(() => {
    clearRuntimeConfigForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses embedded runtime config object when provided', async () => {
    vi.stubGlobal('window', {
      ...window,
      SITE_BUILDER_RUNTIME_CONFIG: {
        storageBackend: 'mongo',
        backendApiUrl: 'http://127.0.0.1:3001',
        siteId: 'runtime-site',
        apiKey: 'runtime-key',
      },
      location: { href: 'https://portal.army.idf/sites/demo/siteDB/dist/index.html' },
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toMatchObject({
      storageBackend: 'mongo',
      backendApiUrl: 'http://127.0.0.1:3001',
      siteId: 'runtime-site',
      apiKey: 'runtime-key',
    });
    expect(getRuntimeConfigSource()).toBe('window-runtime-config');
    expect(getRuntimeLog().source).toContain('window-runtime-config');
    expect(getStorageBackend()).toBe('mongo');
    expect(getBackendApiBaseUrl()).toBe('http://127.0.0.1:3001');
    expect(getSiteId()).toBe('runtime-site');
  });

  it('falls back to the first available runtime config file', async () => {
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html');
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('sitebuilder-runtime-config.json')) {
        return Promise.reject(new Error('missing first file'));
      }
      if (String(url).endsWith('sitebuilder-deployment.json')) {
        return Promise.resolve(asResponse({}, 404));
      }
      return Promise.resolve(asResponse({
        storageBackend: 'mongo',
        backendApiUrl: 'http://127.0.0.1:3001',
        siteId: 'file-site',
        apiKey: 'file-key',
      }, 200));
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadRuntimeConfig();

    expect(getRuntimeValue('siteId')).toBe('file-site');
    expect(getRuntimeConfigSource()).toContain('runtime-config.json');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getStorageBackend()).toBe('mongo');
    expect(getBackendApiBaseUrl()).toBe('http://127.0.0.1:3001');
  });

  it('loads deployment metadata for release version and authorized site root', async () => {
    setWindowLocation('https://portal.army.idf/sites/runtime-target/siteDB/dist/index.html');
    const fetchMock = vi.fn((url) => {
      if (String(url).endsWith('sitebuilder-deployment.json')) {
        return Promise.resolve(asResponse({
          releaseVersion: '2.3.4',
          releaseId: 'release-123',
          allowedSiteRoot: 'https://portal.army.idf/sites/runtime-target',
          finalAppUrl: 'https://portal.army.idf/sites/runtime-target/siteDB/dist/index.html',
        }, 200));
      }
      return Promise.resolve(asResponse({}, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    await loadRuntimeConfig();

    expect(getRuntimeValue('releaseVersion')).toBe('2.3.4');
    expect(getRuntimeValue('allowedSiteRoot')).toBe('https://portal.army.idf/sites/runtime-target');
    expect(getRuntimeValue('finalAppUrl')).toContain('/sites/runtime-target/siteDB/dist/index.html');
    expect(getRuntimeConfigSource()).toBe('vite-env');
    expect(getRuntimeLog().deploymentSource).toBe('deployment:sitebuilder-deployment.json');
  });

  it('does not crash on invalid runtime JSON and keeps env fallback', async () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', 'sharepoint-readonly');
    vi.stubEnv('VITE_BACKEND_API_URL', 'http://from-env:3001');
    setWindowLocation('https://portal.army.idf/sites/demo/siteDB/dist/index.html');
    vi.stubGlobal('fetch', () => Promise.resolve(asResponse('not-json', 200)));

    await loadRuntimeConfig();

    expect(getRuntimeConfigSource()).toBe('vite-env');
    expect(getStorageBackend()).toBe('sharepoint-readonly');
    expect(getBackendApiBaseUrl()).toBe('http://from-env:3001');
  });

  it('supports runtime override for service-layer decisions', () => {
    setRuntimeConfigForTests({
      storageBackend: 'mongo',
      backendApiUrl: 'http://127.0.0.1:3001',
      siteId: 'test-site',
    });

    expect(getStorageBackend()).toBe('mongo');
    expect(getBackendApiBaseUrl()).toBe('http://127.0.0.1:3001');
    expect(getSiteId()).toBe('test-site');
  });
});
