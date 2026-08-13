import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildRuntimeConfigCandidateUrls,
  clearRuntimeConfigForTests,
  getDeploymentMetadata,
  getRuntimeConfig,
  getRuntimeConfigSource,
  getRuntimeLog,
  getRuntimeValue,
  getSiteBuildMode,
  loadRuntimeConfig,
  setRuntimeConfigForTests,
} from './runtimeConfig';
import {
  buildTxtStoragePath,
  clearStorageDescriptorForTests,
  getBackendApiBaseUrl,
  getSiteId,
  getStorageBackend,
  getStorageDescriptor,
  getTxtSiteRoot,
  resolveSharePointAppHostingContext,
  resolveHostedTxtSiteRoot,
  SHAREPOINT_APP_HOSTING_CONTEXTS,
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

const configureLegacyBootstrapEnvironment = ({
  host = 'portal.army.idf',
  siteCode = 'new-site-a',
  siteDbFolder = 'siteDB',
  usersDbFolder = `/sites/${siteCode}/siteUsersDB`,
  bootstrapLibrary = 'SiteAssets',
  bootstrapFolder = 'sitebuilder-bootstrap',
} = {}) => {
  vi.stubEnv('DEV', false);
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('VITE_SITE_BUILD_MODE', 'legacy');
  vi.stubEnv('VITE_STORAGE_BACKEND', 'txt');
  vi.stubEnv('VITE_SP_HOST', host);
  vi.stubEnv('VITE_SP_SITE_CODE', siteCode);
  vi.stubEnv('VITE_SITE_ID', siteCode);
  vi.stubEnv('VITE_SP_SITE_DB_FOLDER', siteDbFolder);
  vi.stubEnv('VITE_SP_USERS_DB_FOLDER', usersDbFolder);
  vi.stubEnv('VITE_SP_SITE_ASSETS_FOLDER', 'siteAssets');
  vi.stubEnv('VITE_SP_IMAGES_FOLDER', 'images');
  vi.stubEnv('VITE_SP_WIDGETS_DB_TARGET', 'users');
  vi.stubEnv('VITE_SP_SITE_API_ROOT', `/sites/${siteCode}`);
  vi.stubEnv('VITE_SP_BOOTSTRAP_LIBRARY', bootstrapLibrary);
  vi.stubEnv('VITE_SP_BOOTSTRAP_FOLDER', bootstrapFolder);
  vi.stubEnv('VITE_SITE_BASE_URL', `https://${host}/sites/${siteCode}/${siteDbFolder}/dist`);
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
    vi.stubEnv('VITE_SITE_BUILD_MODE', 'universal');
    setWindowLocation('https://portal.army.idf/sites/runtime-target/siteDB/dist/index.html');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await expect(loadRuntimeConfig()).rejects.toMatchObject({ code: 'missing_runtime_config' });
  });

  it('boots a universal deployment from its generated runtime overlay', async () => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_SITE_BUILD_MODE', 'universal');
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

  it.each([
    {
      label: 'Site A with a non-default TXT library and user widgets',
      host: 'portal.army.idf',
      siteCode: 'legacy-site-a',
      siteDbFolder: 'txt-library',
      usersDbFolder: '/sites/legacy-site-a/txt-users',
      widgetsDbTarget: 'users',
      expectedWidgets: '/sites/legacy-site-a/txt-users/widgets_data.txt',
    },
    {
      label: 'Site B with a non-default TXT library and site widgets',
      host: 'mazi.army.idf',
      siteCode: 'legacy-site-b',
      siteDbFolder: 'records-library',
      usersDbFolder: '/sites/legacy-site-b/records-users',
      widgetsDbTarget: 'site',
      expectedWidgets: '/sites/legacy-site-b/records-library/site-assets/widgets_data.txt',
    },
  ])('boots legacy $label with no runtime configuration file', async ({
    host,
    siteCode,
    siteDbFolder,
    usersDbFolder,
    widgetsDbTarget,
    expectedWidgets,
  }) => {
    vi.stubEnv('DEV', false);
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('VITE_SITE_BUILD_MODE', 'legacy');
    vi.stubEnv('VITE_STORAGE_BACKEND', 'txt');
    vi.stubEnv('VITE_SP_HOST', host);
    vi.stubEnv('VITE_SP_SITE_CODE', siteCode);
    vi.stubEnv('VITE_SITE_ID', siteCode);
    vi.stubEnv('VITE_SP_SITE_DB_FOLDER', siteDbFolder);
    vi.stubEnv('VITE_SP_USERS_DB_FOLDER', usersDbFolder);
    vi.stubEnv('VITE_SP_SITE_ASSETS_FOLDER', 'site-assets');
    vi.stubEnv('VITE_SP_IMAGES_FOLDER', 'site-images');
    vi.stubEnv('VITE_SP_WIDGETS_DB_TARGET', widgetsDbTarget);
    vi.stubEnv('VITE_SP_SITE_API_ROOT', `/sites/${siteCode}`);
    vi.stubEnv('VITE_SITE_BASE_URL', `https://${host}/sites/${siteCode}/${siteDbFolder}/dist`);
    setWindowLocation(`https://${host}/sites/${siteCode}/${siteDbFolder}/dist/index.html`);
    const deploymentFixture = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-legacy-recovery-'));
    fs.writeFileSync(path.join(deploymentFixture, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(deploymentFixture, 'sitebuilder-runtime-config.json'), '{}');
    fs.writeFileSync(path.join(deploymentFixture, 'runtime-config.json'), '{}');
    // Recovery explicitly removes both overlay files before legacy bootstrap.
    fs.rmSync(path.join(deploymentFixture, 'sitebuilder-runtime-config.json'));
    fs.rmSync(path.join(deploymentFixture, 'runtime-config.json'));
    expect(fs.existsSync(path.join(deploymentFixture, 'sitebuilder-runtime-config.json'))).toBe(false);
    expect(fs.existsSync(path.join(deploymentFixture, 'runtime-config.json'))).toBe(false);
    const fetchMock = vi.fn(() => Promise.resolve(asResponse({}, 404)));
    vi.stubGlobal('fetch', fetchMock);

    try {
      await expect(loadRuntimeConfig()).resolves.toMatchObject({
        host,
        siteCode,
        siteDbRoot: `/sites/${siteCode}/${siteDbFolder}`,
        widgetsDbTarget,
        widgetsFileServerRelativeUrl: expectedWidgets,
      });
      expect(getSiteBuildMode()).toBe('legacy');
      expect(getRuntimeConfigSource()).toBe('legacy-build-env');
      expect(getStorageBackend()).toBe('txt');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(deploymentFixture, { recursive: true, force: true });
    }
  });

  it.each([
    {
      label: 'the default configured bootstrap library',
      siteCode: 'new-site-a',
      bootstrapLibrary: 'SiteAssets',
      bootstrapFolder: 'sitebuilder-bootstrap',
      browserPath: '/sites/new-site-a/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup',
    },
    {
      label: 'a non-default configured bootstrap library',
      siteCode: 'new-site-b',
      bootstrapLibrary: 'CustomAssets',
      bootstrapFolder: 'install-temp',
      browserPath: '/sites/new-site-b/CustomAssets/install-temp/dist/index.html#/admin/sharepoint-setup',
    },
  ])('boots a legacy new-site setup from $label without changing TXT identity', async ({
    siteCode,
    bootstrapLibrary,
    bootstrapFolder,
    browserPath,
  }) => {
    configureLegacyBootstrapEnvironment({ siteCode, bootstrapLibrary, bootstrapFolder });
    setWindowLocation(`https://portal.army.idf${browserPath}`);
    const fetchMock = vi.fn(() => Promise.resolve(asResponse({}, 404)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadRuntimeConfig()).resolves.toMatchObject({
      siteRoot: `/sites/${siteCode}`,
      siteDbRoot: `/sites/${siteCode}/siteDB`,
      usersDbRoot: `/sites/${siteCode}/siteUsersDB`,
      bootstrapLibrary,
      bootstrapFolder,
    });
    expect(getStorageDescriptor()).toMatchObject({
      backend: 'txt',
      siteRoot: `/sites/${siteCode}`,
    });
    expect(getTxtSiteRoot()).toBe(`/sites/${siteCode}`);
    expect(buildTxtStoragePath('events_data.txt')).toBe(`/sites/${siteCode}/siteDB/siteAssets/events_data.txt`);
    expect(getRuntimeConfig().widgetsFileServerRelativeUrl).toBe(`/sites/${siteCode}/siteUsersDB/widgets_data.txt`);
    expect(getTxtSiteRoot()).not.toContain(bootstrapLibrary);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'a bootstrap location under another site',
      href: 'https://portal.army.idf/sites/other-site/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup',
    },
    {
      label: 'an arbitrary nested folder inside the configured site',
      href: 'https://portal.army.idf/sites/new-site-a/random-folder/dist/index.html#/admin/sharepoint-setup',
    },
    {
      label: 'the configured bootstrap path on another host',
      href: 'https://other.army.idf/sites/new-site-a/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup',
    },
  ])('rejects $label in legacy TXT mode', async ({ href }) => {
    configureLegacyBootstrapEnvironment();
    setWindowLocation(href);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(asResponse({}, 404))));

    await loadRuntimeConfig();

    expect(() => getStorageDescriptor()).toThrow(expect.objectContaining({
      code: 'txt_site_root_mismatch',
    }));
  });

  it('does not allow a universal artifact to treat a bootstrap folder as its TXT site root', () => {
    vi.stubEnv('VITE_SITE_BUILD_MODE', 'universal');
    setWindowLocation('https://portal.army.idf/sites/new-site-a/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup');
    setRuntimeConfigForTests({
      storageBackend: 'txt',
      host: 'portal.army.idf',
      siteCode: 'new-site-a',
      siteRoot: '/sites/new-site-a',
      siteDbFolder: 'siteDB',
      usersDbFolder: 'siteUsersDB',
      bootstrapLibrary: 'SiteAssets',
      bootstrapFolder: 'sitebuilder-bootstrap',
    });

    expect(() => getStorageDescriptor()).toThrow(expect.objectContaining({
      code: 'txt_site_root_mismatch',
    }));
  });

  it('preserves configured /teams roots for a legacy bootstrap location', () => {
    expect(resolveHostedTxtSiteRoot(
      new URL('https://portal.army.idf/teams/new-site-a/CustomAssets/install-temp/dist/index.html'),
      {
        host: 'portal.army.idf',
        siteRoot: '/teams/new-site-a',
        siteDbFolder: 'siteDB',
        bootstrapLibrary: 'CustomAssets',
        bootstrapFolder: 'install-temp',
      },
      { buildMode: 'legacy' },
    )).toBe('/teams/new-site-a');
  });

  it('classifies final and bootstrap hosting from canonical configured paths, including non-default names', () => {
    const runtime = {
      host: 'portal.army.idf',
      siteRoot: '/teams/new-site-a',
      siteDbFolder: 'RecordsDb',
      siteDbRoot: '/teams/new-site-a/RecordsDb',
      targetDistPath: '/teams/new-site-a/RecordsDb/dist',
      bootstrapLibrary: 'DeploymentAssets',
      bootstrapFolder: 'install-temp',
    };

    expect(resolveSharePointAppHostingContext(
      new URL('https://portal.army.idf/teams/new-site-a/RecordsDb/dist/index.html#/admin'),
      runtime,
      { buildMode: 'legacy' },
    )).toBe(SHAREPOINT_APP_HOSTING_CONTEXTS.FINAL);
    expect(resolveSharePointAppHostingContext(
      new URL('https://portal.army.idf/teams/new-site-a/DeploymentAssets/install-temp/dist/index.html#/admin/sharepoint-setup'),
      runtime,
      { buildMode: 'legacy' },
    )).toBe(SHAREPOINT_APP_HOSTING_CONTEXTS.BOOTSTRAP);
    expect(resolveSharePointAppHostingContext(
      new URL('https://portal.army.idf/teams/new-site-a/Unrelated/dist/index.html'),
      runtime,
      { buildMode: 'legacy' },
    )).toBe(SHAREPOINT_APP_HOSTING_CONTEXTS.OTHER);
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
