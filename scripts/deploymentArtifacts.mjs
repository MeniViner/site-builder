import fs from 'fs';
import path from 'path';

export const STORAGE_BACKENDS = Object.freeze({
  TXT: 'txt',
  MONGO: 'mongo',
});

export const RUNTIME_CONFIG_FILE = 'sitebuilder-runtime-config.json';
export const DEPLOYMENT_METADATA_FILE = 'sitebuilder-deployment.json';
export const DEPLOY_MANIFEST_FILE = 'sharepoint-deploy-manifest.json';

export function normalizeStorageBackend(value, { defaultBackend = STORAGE_BACKENDS.TXT } = {}) {
  const normalized = String(value || defaultBackend).trim();
  if (normalized !== STORAGE_BACKENDS.TXT && normalized !== STORAGE_BACKENDS.MONGO) {
    throw new Error(`Invalid storage backend "${value}". Expected txt or mongo.`);
  }
  return normalized;
}

export function assertProductionBuildConfig(config = {}) {
  const storageBackend = normalizeStorageBackend(config.storageBackend);
  if (storageBackend === STORAGE_BACKENDS.MONGO) {
    if (!String(config.backendApiUrl || '').trim()) {
      throw new Error('VITE_BACKEND_API_URL is required when VITE_STORAGE_BACKEND=mongo.');
    }
    if (!String(config.siteId || '').trim()) {
      throw new Error('VITE_SITE_ID is required when VITE_STORAGE_BACKEND=mongo.');
    }
  }
  return storageBackend;
}

export function buildRuntimeConfigPayload(config = {}) {
  const storageBackend = assertProductionBuildConfig(config);
  const sharePointSiteUrl = String(
    config.sharePointSiteUrl
    || (config.host && config.siteRootRel ? `https://${config.host}${config.siteRootRel}` : ''),
  ).trim().replace(/\/+$/g, '');
  const payload = {
    schemaVersion: 1,
    storageBackend,
    siteId: String(config.siteId || config.siteCode || '').trim(),
    generatedBy: 'site-builder-build',
    allowedSiteRoot: sharePointSiteUrl,
    sharePointSiteUrl,
    fileExplorerBridgePath: String(config.fileExplorerBridgePath || '/_site-builder/file-explorer').trim().replace(/\/+$/g, '') || '/_site-builder/file-explorer',
  };
  if (storageBackend === STORAGE_BACKENDS.MONGO) {
    payload.backendApiUrl = String(config.backendApiUrl || '').trim().replace(/\/+$/g, '');
  }
  return payload;
}

export function buildDeploymentMetadataPayload(config = {}, { generatedAt = new Date().toISOString() } = {}) {
  const runtimeConfig = buildRuntimeConfigPayload(config);
  return {
    kind: 'sitebuilder-deployment',
    schemaVersion: 2,
    generatedBy: 'site-builder-build',
    deployedAt: generatedAt,
    siteCode: String(config.siteCode || '').trim(),
    siteId: runtimeConfig.siteId,
    storageBackend: runtimeConfig.storageBackend,
    storageBackendSource: String(config.storageBackendSource || 'production-environment').trim(),
    backendApiUrl: runtimeConfig.backendApiUrl || '',
    fileExplorerBridgePath: runtimeConfig.fileExplorerBridgePath,
    allowedSiteRoot: runtimeConfig.allowedSiteRoot,
    sharePointSiteUrl: runtimeConfig.sharePointSiteUrl,
  };
}

export function collectDistFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(path.relative(rootDir, fullPath).split(path.sep).join('/'));
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

export function buildDeployManifest(files) {
  const normalizedFiles = Array.from(new Set([
    ...files,
    RUNTIME_CONFIG_FILE,
    DEPLOYMENT_METADATA_FILE,
    DEPLOY_MANIFEST_FILE,
  ])).sort();
  return {
    kind: 'sitebuilder-release-manifest',
    schemaVersion: 2,
    artifactKind: 'site-builder-frontend',
    storageCompatibility: [STORAGE_BACKENDS.TXT, STORAGE_BACKENDS.MONGO],
    requiresRuntimeConfig: true,
    preservesRuntimeConfig: false,
    runtimeConfigFiles: [RUNTIME_CONFIG_FILE],
    requiredFolders: Array.from(new Set(
      normalizedFiles
        .map((file) => file.split('/').slice(0, -1).join('/'))
        .filter(Boolean),
    )).sort(),
    files: normalizedFiles,
  };
}

export function writeDeploymentArtifacts(distRoot, config = {}, options = {}) {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`dist directory not found: ${distRoot}`);
  }
  const runtimeConfig = buildRuntimeConfigPayload(config);
  const deploymentMetadata = buildDeploymentMetadataPayload(config, options);
  fs.writeFileSync(
    path.join(distRoot, RUNTIME_CONFIG_FILE),
    `${JSON.stringify(runtimeConfig, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(distRoot, DEPLOYMENT_METADATA_FILE),
    `${JSON.stringify(deploymentMetadata, null, 2)}\n`,
    'utf8',
  );
  const manifest = buildDeployManifest(collectDistFiles(distRoot));
  fs.writeFileSync(
    path.join(distRoot, DEPLOY_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return { runtimeConfig, deploymentMetadata, manifest };
}
