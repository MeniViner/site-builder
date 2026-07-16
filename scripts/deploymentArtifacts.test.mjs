import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionBuildConfig,
  buildDeployManifest,
  buildRuntimeConfigPayload,
  writeDeploymentArtifacts,
} from './deploymentArtifacts.mjs';
import { buildProductionEnvironment } from './build-production.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('deployment artifacts', () => {
  it('defaults to TXT and emits selector, metadata, and object manifest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-artifact-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const result = writeDeploymentArtifacts(root, { siteCode: 'schedule', siteId: 'schedule' }, {
      generatedAt: '2026-07-13T00:00:00.000Z',
    });

    expect(result.runtimeConfig).toMatchObject({ storageBackend: 'txt', siteId: 'schedule' });
    expect(result.deploymentMetadata).toMatchObject({ storageBackend: 'txt', storageBackendSource: 'production-environment' });
    expect(result.manifest).toMatchObject({
      schemaVersion: 2,
      storageCompatibility: ['txt', 'mongo'],
      requiresRuntimeConfig: true,
      preservesRuntimeConfig: false,
    });
    expect(result.manifest.files).toEqual(expect.arrayContaining([
      'index.html',
      'sitebuilder-runtime-config.json',
      'sitebuilder-deployment.json',
      'sharepoint-deploy-manifest.json',
    ]));
  });

  it('requires complete Mongo public configuration and emits no secret fields', () => {
    expect(() => assertProductionBuildConfig({ storageBackend: 'mongo', siteId: 'site-1' })).toThrow('VITE_BACKEND_API_URL');
    const payload = buildRuntimeConfigPayload({
      storageBackend: 'mongo',
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
      VITE_LOCAL_FILE_BRIDGE: 'true',
    });
    expect(environment).toMatchObject({
      VITE_STORAGE_BACKEND: 'txt',
      VITE_SITE_ID: 'target-site',
      VITE_SITE_BUILDER_API_KEY: '',
      VITE_SITE_BUILDER_DEV_API_KEY: '',
      VITE_LOCAL_FILE_BRIDGE: 'false',
      VITE_AUTO_DEPLOY: 'false',
    });
  });
});
