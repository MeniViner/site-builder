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
import { getSharePointPaths } from '../../config/sharepointPaths';
import { buildRuntimeConfigPayload } from '../../../scripts/deploymentArtifacts.mjs';

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

  it('uses an embedded runtime config without accepting secrets or obsolete explorer settings', async () => {
    setWindowLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html', {
      storageBackend: 'mongo',
      backendApiUrl: 'https://api.example.test',
      fileExplorerApiUrl: 'https://explorer-api.example.test',
      fileExplorerBridgePath: '/_site-builder/file-explorer',
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
    expect(getRuntimeConfig()).not.toHaveProperty('fileExplorerApiUrl');
    expect(getRuntimeConfig()).not.toHaveProperty('fileExplorerBridgePath');
    expect(getRuntimeConfigSource()).toBe('window-runtime-config');
    expect(getStorageBackend()).toBe('mongo');
    expect(getBackendApiBaseUrl()).toBe('https://api.example.test');
    expect(getSiteId()).toBe('runtime-site');
    expect(JSON.stringify(getRuntimeLog())).not.toContain('must-not-escape');
  });

  it('derives a descriptor from a legacy Mongo SharePoint URL for compatibility', async () => {
    setWindowLocation('https://portal.army.idf/sites/legacy-target/siteDB/dist/index.html', {
      schemaVersion: 1,
      storageBackend: 'mongo',
      backendApiUrl: 'https://api.example.test',
      siteId: 'legacy-target',
      allowedSiteRoot: 'https://portal.army.idf/sites/legacy-target',
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toMatchObject({
      host: 'portal.army.idf',
      siteCode: 'legacy-target',
      siteRoot: '/sites/legacy-target',
    });
  });

  it('does not let obsolete explorer configuration alter the TXT storage selection', async () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', 'txt');
    vi.stubEnv('VITE_BACKEND_API_URL', '');
    setWindowLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html', {
      fileExplorerApiUrl: 'https://obsolete.example.test',
      fileExplorerBridgePath: '/_site-builder/file-explorer',
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await loadRuntimeConfig();

    expect(getStorageBackend()).toBe('txt');
    expect(getRuntimeConfig()).not.toHaveProperty('fileExplorerApiUrl');
    expect(getRuntimeConfig()).not.toHaveProperty('fileExplorerBridgePath');
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
    setWindowLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html');
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
    expect(getRuntimeConfigSource()).toBe('development-env');
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

  it('uses Vite values only as a development fallback when every candidate is an HTML fallback', async () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', '');
    setWindowLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html#/');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(
      asResponse('<!DOCTYPE html><html>fallback</html>', 200, 'text/html'),
    )));

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toMatchObject({
      storageBackend: 'txt',
      host: 'portal.army.idf',
      siteCode: 'schedule',
      siteRoot: '/sites/schedule',
    });
    expect(getStorageBackend()).toBe('txt');
    expect(getStorageDescriptor()).toMatchObject({
      source: 'development-env',
      siteId: 'local-dev-site',
      siteRoot: '/sites/schedule',
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

  it('rejects an invalid development fallback backend in the runtime loader', async () => {
    vi.stubEnv('VITE_STORAGE_BACKEND', 'local-dev');
    setWindowLocation('https://portal.army.idf/sites/schedule/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));
    await expect(loadRuntimeConfig()).rejects.toMatchObject({ code: 'invalid_storage_backend' });
  });

  it('fails closed in production when the runtime config file is missing', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    setWindowLocation('https://portal.army.idf/sites/runtime-target/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await expect(loadRuntimeConfig()).rejects.toMatchObject({ code: 'missing_runtime_config' });
  });

  it('boots a simulated legacy deployment from its generated runtime overlay', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    const generatedOverlay = buildRuntimeConfigPayload({
      hasExplicitSiteIdentity: true,
      storageBackend: 'txt',
      host: 'portal.army.idf',
      siteCode: 'legacy-recovered',
      siteId: 'legacy-recovered',
      siteDbFolder: 'legacy-txt-library',
      usersDbFolder: 'legacy-users',
      siteAssetsFolder: 'site-assets',
      imagesFolder: 'site-images',
      widgetsDbTarget: 'users',
      siteRootRel: '/sites/legacy-recovered',
      siteApiRootRel: '/sites/legacy-recovered',
      siteDbRel: '/sites/legacy-recovered/legacy-txt-library',
      usersDbRel: '/sites/legacy-recovered/legacy-users',
      siteAssetsRel: '/sites/legacy-recovered/legacy-txt-library/site-assets',
      imagesRel: '/sites/legacy-recovered/legacy-txt-library/site-images',
      distRel: '/sites/legacy-recovered/legacy-txt-library/dist',
      siteBaseUrl: 'https://portal.army.idf/sites/legacy-recovered/legacy-txt-library/dist',
    });
    setWindowLocation('https://portal.army.idf/sites/legacy-recovered/legacy-txt-library/dist/index.html');
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      String(url).endsWith('sitebuilder-runtime-config.json')
        ? asResponse(generatedOverlay)
        : asResponse({}, 404),
    )));

    await expect(loadRuntimeConfig()).resolves.toMatchObject({
      siteCode: 'legacy-recovered',
      siteDbRoot: '/sites/legacy-recovered/legacy-txt-library',
    });
    expect(getStorageBackend()).toBe('txt');
    expect(getRuntimeConfigSource()).toContain('sitebuilder-runtime-config.json');
  });

  it('uses runtime metadata ahead of conflicting development Vite values', async () => {
    vi.stubEnv('VITE_SP_HOST', 'compiled.example.test');
    vi.stubEnv('VITE_SP_SITE_CODE', 'compiled-site');
    setWindowLocation('https://mazi.army.idf/sites/runtime-site/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve(
      String(url).endsWith('sitebuilder-runtime-config.json')
        ? asResponse({ storageBackend: 'txt', host: 'mazi.army.idf', siteCode: 'runtime-site' })
        : asResponse({}, 404),
    )));

    await loadRuntimeConfig();

    expect(getRuntimeConfig()).toMatchObject({
      host: 'mazi.army.idf',
      siteCode: 'runtime-site',
      siteRoot: '/sites/runtime-site',
      usersDbRoot: '/sites/runtime-site/siteUsersDb',
    });
  });

  it('exposes one immutable SharePoint identity to all consumers in a session', () => {
    setRuntimeConfigForTests({
      storageBackend: 'txt',
      host: 'portal.army.idf',
      siteCode: 'immutable-site',
    });

    const runtime = getRuntimeConfig();
    const paths = getSharePointPaths();
    expect(paths).toBe(runtime);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(() => { runtime.siteCode = 'other-site'; }).toThrow();
    expect(getSharePointPaths().siteRoot).toBe('/sites/immutable-site');
  });
});
