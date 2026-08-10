import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLegacyDeploymentConfig,
  createLegacyDeploymentStaging,
  removeLegacyDeploymentStaging,
  resolveLegacyRuntimeDescriptor,
  writeReleaseArtifacts,
} from './deploymentArtifacts.mjs';

const roots = [];
const stages = [];

afterEach(() => {
  for (const stage of stages.splice(0)) removeLegacyDeploymentStaging(stage);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const hashAssets = (root) => Object.fromEntries(
  ['assets/app.js', 'assets/app.css'].map((file) => [
    file,
    crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex'),
  ]),
);

const createUniversalRelease = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-universal-release-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'assets', 'app.js'), 'universal application javascript');
  fs.writeFileSync(path.join(root, 'assets', 'app.css'), 'universal application css');
  // A stale pre-migration overlay must not survive as part of the release.
  fs.writeFileSync(path.join(root, 'sitebuilder-runtime-config.json'), '{"siteCode":"stale"}');
  writeReleaseArtifacts(root);
  return root;
};

const legacyConfig = (overrides = {}) => ({
  hasExplicitSiteIdentity: true,
  storageBackend: 'txt',
  host: 'portal.army.idf',
  siteCode: 'legacy-runtime-a',
  siteId: 'legacy-runtime-a',
  siteDbFolder: 'txt-library',
  usersDbFolder: 'txt-users',
  siteAssetsFolder: 'site-assets',
  imagesFolder: 'site-images',
  widgetsDbTarget: 'users',
  siteRootRel: '/sites/legacy-runtime-a',
  siteApiRootRel: '/sites/legacy-runtime-a',
  siteDbRel: '/sites/legacy-runtime-a/txt-library',
  usersDbRel: '/sites/legacy-runtime-a/txt-users',
  siteAssetsRel: '/sites/legacy-runtime-a/txt-library/site-assets',
  imagesRel: '/sites/legacy-runtime-a/txt-library/site-images',
  distRel: '/sites/legacy-runtime-a/txt-library/dist',
  siteBaseUrl: 'https://portal.army.idf/sites/legacy-runtime-a/txt-library/dist',
  ...overrides,
});

describe('legacy deployment staging', () => {
  it('keeps the raw release site-neutral and produces independent A/B overlays', () => {
    const release = createUniversalRelease();
    const universalManifest = JSON.parse(fs.readFileSync(path.join(release, 'sharepoint-deploy-manifest.json'), 'utf8'));
    expect(fs.existsSync(path.join(release, 'sitebuilder-runtime-config.json'))).toBe(false);
    expect(universalManifest.files).not.toContain('sitebuilder-runtime-config.json');
    expect(universalManifest.files).not.toContain('sitebuilder-deployment.json');

    const targetA = createLegacyDeploymentStaging(release, legacyConfig(), {
      generatedAt: '2026-08-10T12:00:00.000Z',
    });
    stages.push(targetA);
    const targetB = createLegacyDeploymentStaging(release, legacyConfig({
      host: 'mazi.army.idf',
      siteCode: 'legacy-runtime-b',
      siteId: 'legacy-runtime-b',
      siteRootRel: '/sites/legacy-runtime-b',
      siteApiRootRel: '/sites/legacy-runtime-b',
      siteDbRel: '/sites/legacy-runtime-b/records',
      usersDbRel: '/sites/legacy-runtime-b/txt-users',
      siteAssetsRel: '/sites/legacy-runtime-b/records/site-assets',
      imagesRel: '/sites/legacy-runtime-b/records/site-images',
      distRel: '/sites/legacy-runtime-b/records/dist',
      siteDbFolder: 'records',
      siteBaseUrl: 'https://mazi.army.idf/sites/legacy-runtime-b/records/dist',
      widgetsDbTarget: 'site',
    }), { generatedAt: '2026-08-10T12:01:00.000Z' });
    stages.push(targetB);

    expect(targetA.runtimeConfig).toMatchObject({
      host: 'portal.army.idf',
      siteCode: 'legacy-runtime-a',
      siteDbRoot: '/sites/legacy-runtime-a/txt-library',
      widgetsDbTarget: 'users',
    });
    expect(resolveLegacyRuntimeDescriptor(legacyConfig()).widgetsFileServerRelativeUrl)
      .toBe('/sites/legacy-runtime-a/txt-users/widgets_data.txt');
    expect(targetB.runtimeConfig).toMatchObject({
      host: 'mazi.army.idf',
      siteCode: 'legacy-runtime-b',
      siteDbRoot: '/sites/legacy-runtime-b/records',
      widgetsDbTarget: 'site',
    });
    expect(resolveLegacyRuntimeDescriptor(legacyConfig({
      host: 'mazi.army.idf',
      siteCode: 'legacy-runtime-b',
      siteRootRel: '/sites/legacy-runtime-b',
      siteApiRootRel: '/sites/legacy-runtime-b',
      siteDbFolder: 'records',
      siteDbRel: '/sites/legacy-runtime-b/records',
      usersDbRel: '/sites/legacy-runtime-b/txt-users',
      siteAssetsRel: '/sites/legacy-runtime-b/records/site-assets',
      imagesRel: '/sites/legacy-runtime-b/records/site-images',
      distRel: '/sites/legacy-runtime-b/records/dist',
      siteBaseUrl: 'https://mazi.army.idf/sites/legacy-runtime-b/records/dist',
      widgetsDbTarget: 'site',
    })).widgetsFileServerRelativeUrl).toBe('/sites/legacy-runtime-b/records/site-assets/widgets_data.txt');
    expect(hashAssets(targetA.stagingRoot)).toEqual(hashAssets(targetB.stagingRoot));

    const runtimeBText = fs.readFileSync(path.join(targetB.stagingRoot, 'sitebuilder-runtime-config.json'), 'utf8');
    expect(runtimeBText).not.toContain('legacy-runtime-a');
    expect(runtimeBText).not.toContain('portal.army.idf');
    const targetManifest = JSON.parse(fs.readFileSync(path.join(targetB.stagingRoot, 'sharepoint-deploy-manifest.json'), 'utf8'));
    expect(targetManifest.files).toEqual(expect.arrayContaining([
      'sitebuilder-runtime-config.json',
      'sitebuilder-deployment.json',
      'sharepoint-deploy-manifest.json',
    ]));
  });

  it('fails before staging when legacy identity is missing or paths disagree', () => {
    expect(() => assertLegacyDeploymentConfig(legacyConfig({ hasExplicitSiteIdentity: false })))
      .toThrow('requires explicit VITE_SP_HOST and VITE_SP_SITE_CODE');
    expect(() => assertLegacyDeploymentConfig(legacyConfig({ siteApiRootRel: '/sites/not-this-site' })))
      .toThrow('does not match the canonical runtime path');
  });
});
