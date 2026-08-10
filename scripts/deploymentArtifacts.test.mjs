import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionBuildConfig,
  buildDeployManifest,
  buildRuntimeConfigPayload,
  writeReleaseArtifacts,
  writeDeploymentArtifacts,
} from './deploymentArtifacts.mjs';
import { buildProductionEnvironment } from './build-production.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('deployment artifacts', () => {
  it('keeps the release artifact universal and writes target metadata separately', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-artifact-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'release bytes');
    const release = writeReleaseArtifacts(root);
    expect(fs.existsSync(path.join(root, 'sitebuilder-runtime-config.json'))).toBe(false);
    expect(release.manifest).toMatchObject({
      schemaVersion: 3,
      artifactKind: 'site-builder-universal-frontend',
      requiresRuntimeConfig: true,
      preservesRuntimeConfig: true,
    });

    const result = writeDeploymentArtifacts(root, {
      host: 'portal.army.idf',
      fileExplorerBridgePath: '/_site-builder/file-explorer',
      siteCode: 'schedule',
      siteId: 'schedule',
    }, {
      generatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(result.runtimeConfig).toMatchObject({ storageBackend: 'txt', siteId: 'schedule' });
    expect(result.runtimeConfig).not.toHaveProperty('fileExplorerBridgePath');
    expect(result.deploymentMetadata).not.toHaveProperty('fileExplorerBridgePath');
    expect(result.runtimeConfig).toMatchObject({
      schemaVersion: 2,
      host: 'portal.army.idf',
      siteCode: 'schedule',
      siteDbRoot: '/sites/schedule/siteDB',
      finalAppUrl: 'https://portal.army.idf/sites/schedule/siteDB/dist/index.html',
    });
    expect(result.deploymentMetadata).toMatchObject({ storageBackend: 'txt', storageBackendSource: 'deployment-target' });
  });

  it('requires complete Mongo public configuration and emits no secret fields', () => {
    expect(() => assertProductionBuildConfig({ storageBackend: 'mongo', siteId: 'site-1' })).toThrow('VITE_BACKEND_API_URL');
    const payload = buildRuntimeConfigPayload({
      storageBackend: 'mongo',
      host: 'portal.army.idf',
      siteCode: 'site-1',
      backendApiUrl: 'https://builder.example/api/',
      siteId: 'site-1',
      apiKey: 'must-not-ship',
    });
    expect(payload).toMatchObject({ storageBackend: 'mongo', backendApiUrl: 'https://builder.example/api', siteId: 'site-1' });
    expect(payload).not.toHaveProperty('apiKey');
    expect(JSON.stringify(buildDeployManifest(['index.html']))).not.toContain('must-not-ship');
  });

  it('rejects non-lowercase selectors instead of silently normalizing them', () => {
    expect(() => assertProductionBuildConfig({ storageBackend: 'MONGO' })).toThrow('Expected txt or mongo');
    expect(() => assertProductionBuildConfig({ storageBackend: 'Txt' })).toThrow('Expected txt or mongo');
  });

  it('overrides local Vite values for an isolated production TXT build', () => {
    const environment = buildProductionEnvironment({
      storageBackend: 'txt',
      siteCode: 'target-site',
      siteId: 'target-site',
    }, {
      VITE_STORAGE_BACKEND: 'local-dev',
      VITE_SITE_ID: 'local-dev-site',
      VITE_SITE_BUILDER_API_KEY: 'local-secret',
      VITE_SITE_BUILDER_DEV_API_KEY: 'local-dev-secret',
    });
    expect(environment).toMatchObject({
      VITE_STORAGE_BACKEND: '',
      VITE_SITE_ID: '',
      VITE_SITE_BASE_URL: '',
      VITE_SP_HOST: '',
      VITE_SP_SITE_CODE: '',
      VITE_SP_SITE_DB_FOLDER: '',
      VITE_SP_USERS_DB_FOLDER: '',
      VITE_SP_SITE_ASSETS_FOLDER: '',
      VITE_SP_IMAGES_FOLDER: '',
      VITE_SP_WIDGETS_DB_TARGET: '',
      VITE_SP_SITE_API_ROOT: '',
      VITE_SITE_BUILDER_API_KEY: '',
      VITE_SITE_BUILDER_DEV_API_KEY: '',
      VITE_AUTO_DEPLOY: 'false',
    });
    expect(environment).not.toHaveProperty('VITE_FILE_EXPLORER_API_URL');
    expect(environment).not.toHaveProperty('VITE_FILE_EXPLORER_BRIDGE_PATH');
    expect(environment).not.toHaveProperty('VITE_LOCAL_FILE_BRIDGE');
  });
});
