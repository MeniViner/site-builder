import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertProductionBuildConfig,
  assertLegacyDeployableDist,
  buildDeployManifest,
  buildRuntimeConfigPayload,
  readBuildManifest,
  verifyManifestFiles,
  writeLegacyBuildArtifacts,
  writeReleaseArtifacts,
  writeDeploymentArtifacts,
} from './deploymentArtifacts.mjs';
import {
  buildLegacyProductionEnvironment,
  buildUniversalProductionEnvironment,
} from './build-production.mjs';

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
      schemaVersion: 4,
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

  it('refuses to send a universal artifact through the traditional deploy command', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-artifact-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    writeReleaseArtifacts(root);

    expect(() => assertLegacyDeployableDist(root)).toThrow('Run npm run build before npm run deploy');
    fs.rmSync(path.join(root, 'sharepoint-deploy-manifest.json'));
    expect(() => assertLegacyDeployableDist(root)).toThrow('without sharepoint-deploy-manifest.json');
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

  it('builds a legacy artifact with its configured site identity', () => {
    const environment = buildLegacyProductionEnvironment({
      storageBackend: 'txt',
      host: 'portal.army.idf',
      siteCode: 'target-site',
      siteId: 'target-site',
      siteDbFolder: 'records',
      usersDbFolder: 'users-records',
      siteAssetsFolder: 'site-assets',
      imagesFolder: 'site-images',
      widgetsDbTarget: 'site',
      siteApiRootRel: '/sites/target-site',
      siteBaseUrl: 'https://portal.army.idf/sites/target-site/records/dist',
    }, {
      VITE_STORAGE_BACKEND: 'local-dev',
      VITE_SITE_ID: 'local-dev-site',
      VITE_SITE_BUILDER_API_KEY: 'local-secret',
      VITE_SITE_BUILDER_DEV_API_KEY: 'local-dev-secret',
    });
    expect(environment).toMatchObject({
      VITE_SITE_BUILD_MODE: 'legacy',
      VITE_STORAGE_BACKEND: 'txt',
      VITE_SITE_ID: 'target-site',
      VITE_SITE_BASE_URL: 'https://portal.army.idf/sites/target-site/records/dist',
      VITE_SP_HOST: 'portal.army.idf',
      VITE_SP_SITE_CODE: 'target-site',
      VITE_SP_SITE_DB_FOLDER: 'records',
      VITE_SP_USERS_DB_FOLDER: 'users-records',
      VITE_SP_SITE_ASSETS_FOLDER: 'site-assets',
      VITE_SP_IMAGES_FOLDER: 'site-images',
      VITE_SP_WIDGETS_DB_TARGET: 'site',
      VITE_SP_SITE_API_ROOT: '/sites/target-site',
      VITE_SITE_BUILDER_API_KEY: '',
      VITE_SITE_BUILDER_DEV_API_KEY: '',
      VITE_AUTO_DEPLOY: 'false',
    });
  });

  it('removes every site identity field from a universal artifact', () => {
    const environment = buildUniversalProductionEnvironment({
      VITE_SP_HOST: 'compiled.example.test',
      VITE_SP_SITE_CODE: 'compiled-site',
      VITE_SITE_ID: 'compiled-site',
      VITE_STORAGE_BACKEND: 'txt',
    });
    expect(environment).toMatchObject({
      VITE_SITE_BUILD_MODE: 'universal',
      VITE_STORAGE_BACKEND: '',
      VITE_SITE_ID: '',
      VITE_SP_HOST: '',
      VITE_SP_SITE_CODE: '',
      VITE_SP_SITE_DB_FOLDER: '',
      VITE_SP_USERS_DB_FOLDER: '',
      VITE_SP_SITE_ASSETS_FOLDER: '',
      VITE_SP_IMAGES_FOLDER: '',
      VITE_SP_WIDGETS_DB_TARGET: '',
      VITE_SP_SITE_API_ROOT: '',
    });
  });

  it('makes a legacy build manifest prove every current index dependency', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-legacy-manifest-'));
    roots.push(root);
    fs.mkdirSync(path.join(root, 'assets'));
    fs.writeFileSync(path.join(root, 'index.html'), '<link rel="stylesheet" href="./assets/index-B.css"><script type="module" src="./assets/index-B.js"></script>');
    fs.writeFileSync(path.join(root, 'assets', 'index-B.css'), 'body{}');
    fs.writeFileSync(path.join(root, 'assets', 'index-B.js'), 'console.log("B")');

    const result = writeLegacyBuildArtifacts(root, { buildId: 'build-b' });
    expect(result.manifest).toMatchObject({ buildId: 'build-b', buildMode: 'legacy', artifactKind: 'site-builder-legacy-frontend', entryPoint: 'index.html' });
    expect(result.manifest.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'assets/index-B.css', size: 6, sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      expect.objectContaining({ path: 'assets/index-B.js', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
    ]));
    expect(result.manifest.indexReferences).toEqual(['assets/index-B.css', 'assets/index-B.js']);
  });

  it('detects a partial Bootstrap or final copy instead of accepting stale Build A assets for Build B', () => {
    const buildB = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-build-b-'));
    const partialTarget = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-partial-target-'));
    roots.push(buildB, partialTarget);
    fs.mkdirSync(path.join(buildB, 'assets'));
    fs.mkdirSync(path.join(partialTarget, 'assets'));
    fs.writeFileSync(path.join(buildB, 'index.html'), '<link rel="stylesheet" href="./assets/index-B.css"><script type="module" src="./assets/index-B.js"></script>');
    fs.writeFileSync(path.join(buildB, 'assets', 'index-B.css'), 'css-B');
    fs.writeFileSync(path.join(buildB, 'assets', 'index-B.js'), 'js-B');
    const buildBManifest = writeLegacyBuildArtifacts(buildB, { buildId: 'build-b' }).manifest;
    // Final target still serves Build A index; only one Build B chunk arrived.
    fs.writeFileSync(path.join(partialTarget, 'index.html'), '<script src="./assets/index-A.js"></script>');
    fs.writeFileSync(path.join(partialTarget, 'assets', 'index-A.js'), 'js-A');
    fs.writeFileSync(path.join(partialTarget, 'assets', 'index-B.js'), 'js-B');

    const report = verifyManifestFiles(partialTarget, buildBManifest, { includeEntryPoint: false });
    expect(report.missingFiles).toEqual(['assets/index-B.css']);
    expect(report.verifiedFiles).toBe(1);
    expect(fs.readFileSync(path.join(partialTarget, 'index.html'), 'utf8')).toContain('index-A.js');
    expect(readBuildManifest(buildB).buildId).toBe('build-b');
  });
});
