#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  ARTIFACT_KINDS,
  assertBuildManifest,
  createUniversalDeploymentStaging,
  removeUniversalDeploymentStaging,
  SITE_SPECIFIC_OVERLAY_FILES,
} from './deploymentArtifacts.mjs';

const hashReleaseAssets = (distRoot) => {
  const assetsRoot = path.join(distRoot, 'assets');
  const hashes = {};
  if (!fs.existsSync(assetsRoot)) return hashes;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (/\.(?:js|css)$/i.test(entry.name)) {
        hashes[path.relative(distRoot, filePath).split(path.sep).join('/')] = crypto
          .createHash('sha256')
          .update(fs.readFileSync(filePath))
          .digest('hex');
      }
    }
  };
  walk(assetsRoot);
  return hashes;
};

const readLegacyIdentityNeedles = (envPath = path.resolve('.env.production')) => {
  if (!fs.existsSync(envPath)) return [];
  const values = Object.fromEntries(fs.readFileSync(envPath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return [];
    const separator = trimmed.indexOf('=');
    return [[trimmed.slice(0, separator), trimmed.slice(separator + 1).trim()]];
  }));
  const host = String(values.VITE_SP_HOST || '').replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  const siteCode = String(values.VITE_SP_SITE_CODE || '').replace(/^\/+|\/+$/g, '');
  const siteRoot = siteCode ? `/sites/${siteCode}` : '';
  return [...new Set([
    siteRoot,
    host && siteRoot ? `${host}${siteRoot}` : '',
    String(values.VITE_SP_USERS_DB_FOLDER || '').startsWith('/sites/') ? values.VITE_SP_USERS_DB_FOLDER : '',
    String(values.VITE_SITE_BASE_URL || ''),
  ].filter(Boolean))];
};

const assertNoLegacyTargetIdentity = (distRoot) => {
  const needles = readLegacyIdentityNeedles();
  if (!needles.length) return 0;
  const assetsRoot = path.join(distRoot, 'assets');
  const files = fs.readdirSync(assetsRoot).filter((filename) => /\.(?:js|css)$/i.test(filename));
  for (const filename of files) {
    const contents = fs.readFileSync(path.join(assetsRoot, filename), 'utf8');
    const match = needles.find((needle) => contents.includes(needle));
    if (match) throw new Error(`Universal asset ${filename} contains the Legacy deployment target ${match}.`);
  }
  return needles.length;
};

export function verifyUniversalDist(distRoot) {
  const source = path.resolve(distRoot);
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`Expected a built dist directory with index.html: ${source}`);
  }
  const manifestPath = path.join(source, 'sharepoint-deploy-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Expected a universal release manifest. Run npm run build:universal first.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.artifactKind !== ARTIFACT_KINDS.UNIVERSAL || manifest.requiresRuntimeConfig !== true) {
    throw new Error('dist is not a universal Release Manager artifact. Run npm run build:universal first.');
  }
  assertBuildManifest(source, { artifactKind: ARTIFACT_KINDS.UNIVERSAL, buildMode: 'universal' });
  const checkedIdentityNeedles = assertNoLegacyTargetIdentity(source);
  for (const overlayFile of SITE_SPECIFIC_OVERLAY_FILES) {
    if (fs.existsSync(path.join(source, overlayFile))) {
      throw new Error(`Universal dist is contaminated by site-specific ${overlayFile}. Rebuild before deployment.`);
    }
  }
  const proofRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-universal-dist-'));
  let siteA;
  let siteB;
  try {
    siteA = createUniversalDeploymentStaging(source, {
      hasExplicitSiteIdentity: true,
      storageBackend: 'txt',
      host: 'portal.army.idf',
      siteCode: 'legacy-runtime-a',
      siteId: 'legacy-runtime-a',
      siteDbFolder: 'txt-site-library',
      usersDbFolder: 'txt-users-library',
      siteAssetsFolder: 'site-assets',
      imagesFolder: 'site-images',
      widgetsDbTarget: 'users',
    }, { stagingParent: proofRoot, generatedAt: '2026-08-10T12:00:00.000Z' });
    siteB = createUniversalDeploymentStaging(source, {
      hasExplicitSiteIdentity: true,
      storageBackend: 'txt',
      host: 'mazi.army.idf',
      siteCode: 'legacy-runtime-b',
      siteId: 'legacy-runtime-b',
      siteDbFolder: 'records-library',
      usersDbFolder: 'records-users',
      siteAssetsFolder: 'site-assets',
      imagesFolder: 'site-images',
      widgetsDbTarget: 'site',
    }, { stagingParent: proofRoot, generatedAt: '2026-08-10T12:01:00.000Z' });
    const hashesA = hashReleaseAssets(siteA.stagingRoot);
    const hashesB = hashReleaseAssets(siteB.stagingRoot);
    if (Object.keys(hashesA).length === 0) throw new Error('No JS/CSS assets were found under dist/assets.');
    if (JSON.stringify(hashesA) !== JSON.stringify(hashesB)) {
      throw new Error('JS/CSS assets changed after applying per-site runtime metadata.');
    }
    if (JSON.stringify(siteB.runtimeConfig).includes('legacy-runtime-a')) {
      throw new Error('Target B runtime overlay retained Target A identity.');
    }
    return {
      assetHashes: hashesA,
      universalAssetHash: crypto.createHash('sha256').update(JSON.stringify(hashesA)).digest('hex'),
      targetA: siteA.runtimeConfig,
      targetB: siteB.runtimeConfig,
      checkedIdentityNeedles,
    };
  } finally {
    removeUniversalDeploymentStaging(siteA);
    removeUniversalDeploymentStaging(siteB);
    fs.rmSync(proofRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = verifyUniversalDist(process.argv[2] || 'dist-universal');
    console.log(`[verify-universal-dist] PASS ${Object.keys(result.assetHashes).length} JS/CSS assets are byte-identical.`);
    console.log(`[verify-universal-dist] Universal JS/CSS hash: ${result.universalAssetHash}`);
    console.log(`[verify-universal-dist] PASS no Legacy target identity found (${result.checkedIdentityNeedles} target marker(s) checked).`);
    console.log(`[verify-universal-dist] Target A: ${result.targetA.finalAppUrl}`);
    console.log(`[verify-universal-dist] Target B: ${result.targetB.finalAppUrl}`);
  } catch (error) {
    console.error(`[verify-universal-dist] FAIL ${error.message}`);
    process.exit(1);
  }
}
