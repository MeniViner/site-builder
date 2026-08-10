import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createSharePointRuntimeDescriptor,
  SharePointRuntimeDescriptorError,
} from '../src/config/sharepointRuntimeDescriptor.js';

export const STORAGE_BACKENDS = Object.freeze({
  TXT: 'txt',
  MONGO: 'mongo',
});

export const RUNTIME_CONFIG_FILE = 'sitebuilder-runtime-config.json';
export const DEPLOYMENT_METADATA_FILE = 'sitebuilder-deployment.json';
export const DEPLOY_MANIFEST_FILE = 'sharepoint-deploy-manifest.json';

// These files are an overlay, never part of a reusable release artifact.
export const SITE_SPECIFIC_OVERLAY_FILES = Object.freeze([
  RUNTIME_CONFIG_FILE,
  DEPLOYMENT_METADATA_FILE,
  'runtime-config.json',
]);

const text = (value) => String(value ?? '').trim();

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
    if (!text(config.backendApiUrl)) {
      throw new Error('VITE_BACKEND_API_URL is required when VITE_STORAGE_BACKEND=mongo.');
    }
    if (!text(config.siteId)) {
      throw new Error('VITE_SITE_ID is required when VITE_STORAGE_BACKEND=mongo.');
    }
  }
  return storageBackend;
}

function finalAppUrlFromLegacyBaseUrl(siteBaseUrl) {
  const baseUrl = text(siteBaseUrl);
  if (!baseUrl || /\/index\.html(?:$|[?#])/i.test(baseUrl)) return baseUrl;
  return `${baseUrl.replace(/\/+$/g, '')}/index.html`;
}

/**
 * The Node deployment workflow and the browser runtime deliberately share this
 * one descriptor. `sp-env` resolves legacy variables first; this function then
 * validates every redundant path against its canonical identity.
 */
export function resolveLegacyRuntimeDescriptor(config = {}) {
  try {
    return createSharePointRuntimeDescriptor({
      host: config.host,
      siteCode: config.siteCode,
      siteRoot: config.siteRootRel,
      siteApiRoot: config.siteApiRootRel,
      siteDbFolder: config.siteDbFolder,
      siteDbRoot: config.siteDbRel,
      usersDbFolder: config.usersDbFolder,
      usersDbRoot: config.usersDbRel,
      siteAssetsFolder: config.siteAssetsFolder,
      siteAssetsRoot: config.siteAssetsRel,
      imagesFolder: config.imagesFolder,
      imagesRoot: config.imagesRel,
      widgetsDbTarget: config.widgetsDbTarget,
      bootstrapLibrary: config.bootstrapLibrary,
      bootstrapFolder: config.bootstrapFolder,
      sharePointSiteUrl: config.sharePointSiteUrl,
      allowedSiteRoot: config.allowedSiteRoot,
      targetDistPath: config.distRel,
      finalAppUrl: finalAppUrlFromLegacyBaseUrl(config.siteBaseUrl),
    }, { requireIdentity: true });
  } catch (error) {
    const message = error instanceof SharePointRuntimeDescriptorError ? error.message : String(error);
    throw new Error(`Invalid legacy SharePoint deployment environment: ${message}`);
  }
}

/** Refuse deployment defaults when a real legacy environment supplied no target. */
export function assertLegacyDeploymentConfig(config = {}) {
  const storageBackend = assertProductionBuildConfig(config);
  if (config.hasExplicitSiteIdentity === false) {
    throw new Error('Legacy deployment requires explicit VITE_SP_HOST and VITE_SP_SITE_CODE (or --host and --site).');
  }
  return {
    storageBackend,
    descriptor: resolveLegacyRuntimeDescriptor(config),
  };
}

const descriptorRuntimeFields = (descriptor) => ({
  host: descriptor.host,
  siteCode: descriptor.siteCode,
  siteRoot: descriptor.siteRoot,
  siteApiRoot: descriptor.siteApiRoot,
  siteDbFolder: descriptor.siteDbFolder,
  siteDbRoot: descriptor.siteDbRoot,
  usersDbFolder: descriptor.usersDbFolder,
  usersDbRoot: descriptor.usersDbRoot,
  siteAssetsFolder: descriptor.siteAssetsFolder,
  siteAssetsRoot: descriptor.siteAssetsRoot,
  imagesFolder: descriptor.imagesFolder,
  imagesRoot: descriptor.imagesRoot,
  widgetsDbTarget: descriptor.widgetsDbTarget,
  bootstrapLibrary: descriptor.bootstrapLibrary,
  bootstrapFolder: descriptor.bootstrapFolder,
  sharePointSiteUrl: descriptor.sharePointSiteUrl,
  allowedSiteRoot: descriptor.allowedSiteRoot,
  finalAppUrl: descriptor.finalAppUrl,
  targetDistPath: descriptor.targetDistPath,
});

/** Build target-specific runtime metadata. Never call this from a universal release build. */
export function buildRuntimeConfigPayload(config = {}, {
  generatedAt = new Date().toISOString(),
  deploymentGeneratedBy = 'site-builder-deployment',
} = {}) {
  const { storageBackend, descriptor } = assertLegacyDeploymentConfig(config);
  const payload = {
    schemaVersion: 2,
    storageBackend,
    siteId: text(config.siteId || descriptor.siteCode),
    ...descriptorRuntimeFields(descriptor),
    releaseVersion: text(config.releaseVersion || config.appVersion),
    releaseId: text(config.releaseId),
    deployedAt: text(config.deployedAt || generatedAt),
    deploymentGeneratedBy,
  };
  if (storageBackend === STORAGE_BACKENDS.MONGO) {
    payload.backendApiUrl = text(config.backendApiUrl).replace(/\/+$/g, '');
  }
  return payload;
}

export function buildDeploymentMetadataPayload(config = {}, options = {}) {
  const runtimeConfig = buildRuntimeConfigPayload(config, options);
  return {
    kind: 'sitebuilder-deployment',
    schemaVersion: 3,
    generatedBy: runtimeConfig.deploymentGeneratedBy,
    deployedAt: runtimeConfig.deployedAt,
    releaseVersion: runtimeConfig.releaseVersion,
    releaseId: runtimeConfig.releaseId,
    storageBackend: runtimeConfig.storageBackend,
    storageBackendSource: text(config.storageBackendSource || 'deployment-target'),
    ...descriptorRuntimeFields(runtimeConfig),
    siteId: runtimeConfig.siteId,
    backendApiUrl: runtimeConfig.backendApiUrl || '',
  };
}

export function collectDistFiles(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) files.push(path.relative(rootDir, fullPath).split(path.sep).join('/'));
    }
  };
  walk(rootDir);
  return files.sort();
}

export function buildDeployManifest(files) {
  const normalizedFiles = Array.from(new Set([...files, DEPLOY_MANIFEST_FILE])).sort();
  return {
    kind: 'sitebuilder-release-manifest',
    schemaVersion: 3,
    artifactKind: 'site-builder-universal-frontend',
    storageCompatibility: [STORAGE_BACKENDS.TXT, STORAGE_BACKENDS.MONGO],
    requiresRuntimeConfig: true,
    preservesRuntimeConfig: true,
    runtimeConfigFiles: [RUNTIME_CONFIG_FILE, DEPLOYMENT_METADATA_FILE],
    requiredFolders: Array.from(new Set(
      normalizedFiles.map((file) => file.split('/').slice(0, -1).join('/')).filter(Boolean),
    )).sort(),
    files: normalizedFiles,
  };
}

export function writeDeployManifest(rootDir) {
  if (!fs.existsSync(rootDir)) throw new Error(`deployment directory not found: ${rootDir}`);
  const manifest = buildDeployManifest(collectDistFiles(rootDir));
  fs.writeFileSync(path.join(rootDir, DEPLOY_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export function removeSiteSpecificOverlays(rootDir) {
  for (const filename of SITE_SPECIFIC_OVERLAY_FILES) {
    const filePath = path.join(rootDir, filename);
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }
}

/** Writes only release-invariant metadata into the canonical universal dist. */
export function writeReleaseArtifacts(distRoot) {
  if (!fs.existsSync(distRoot)) throw new Error(`dist directory not found: ${distRoot}`);
  removeSiteSpecificOverlays(distRoot);
  return { manifest: writeDeployManifest(distRoot) };
}

export function assertDeploymentOverlay(rootDir) {
  const requiredFiles = [RUNTIME_CONFIG_FILE, DEPLOYMENT_METADATA_FILE, DEPLOY_MANIFEST_FILE];
  for (const filename of requiredFiles) {
    if (!fs.existsSync(path.join(rootDir, filename))) {
      throw new Error(`Deployment overlay is incomplete; missing ${filename} in ${rootDir}`);
    }
  }

  const runtimeConfig = JSON.parse(fs.readFileSync(path.join(rootDir, RUNTIME_CONFIG_FILE), 'utf8'));
  const deploymentMetadata = JSON.parse(fs.readFileSync(path.join(rootDir, DEPLOYMENT_METADATA_FILE), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, DEPLOY_MANIFEST_FILE), 'utf8'));
  try {
    createSharePointRuntimeDescriptor(runtimeConfig, { requireIdentity: runtimeConfig.storageBackend === STORAGE_BACKENDS.TXT });
  } catch (error) {
    throw new Error(`Deployment runtime config failed canonical validation: ${error.message}`);
  }
  for (const filename of requiredFiles) {
    if (!Array.isArray(manifest.files) || !manifest.files.includes(filename)) {
      throw new Error(`Deployment manifest does not include ${filename}.`);
    }
  }
  return { runtimeConfig, deploymentMetadata, manifest };
}

/** Writes a site-specific overlay and then regenerates its deployment manifest. */
export function writeSiteDeploymentMetadata(targetRoot, config = {}, options = {}) {
  if (!fs.existsSync(targetRoot)) throw new Error(`deployment directory not found: ${targetRoot}`);
  const runtimeConfig = buildRuntimeConfigPayload(config, options);
  const deploymentMetadata = buildDeploymentMetadataPayload(config, {
    ...options,
    generatedAt: runtimeConfig.deployedAt,
    deploymentGeneratedBy: runtimeConfig.deploymentGeneratedBy,
  });
  fs.writeFileSync(path.join(targetRoot, RUNTIME_CONFIG_FILE), `${JSON.stringify(runtimeConfig, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(targetRoot, DEPLOYMENT_METADATA_FILE), `${JSON.stringify(deploymentMetadata, null, 2)}\n`, 'utf8');
  const manifest = writeDeployManifest(targetRoot);
  assertDeploymentOverlay(targetRoot);
  return { runtimeConfig, deploymentMetadata, manifest };
}

/**
 * Copy a reusable release to an owned temporary directory before adding a
 * legacy site's overlay. A new directory is used on every invocation so that
 * a deployment for Site B cannot inherit Site A's metadata.
 */
export function createLegacyDeploymentStaging(releaseRoot, config = {}, options = {}) {
  const source = path.resolve(releaseRoot);
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`Expected a universal dist directory with index.html: ${source}`);
  }
  const stagingRoot = fs.mkdtempSync(path.join(options.stagingParent || os.tmpdir(), 'sitebuilder-legacy-deploy-'));
  try {
    fs.cpSync(source, stagingRoot, { recursive: true });
    // Protect against a pre-migration or manually contaminated source release.
    removeSiteSpecificOverlays(stagingRoot);
    const artifacts = writeSiteDeploymentMetadata(stagingRoot, config, options);
    return { stagingRoot, ...artifacts };
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    throw error;
  }
}

export function removeLegacyDeploymentStaging(staging) {
  if (staging?.stagingRoot) fs.rmSync(staging.stagingRoot, { recursive: true, force: true });
}

// Compatibility name for deployment callers. It now writes the target overlay
// only; universal builds must use writeReleaseArtifacts instead.
export const writeDeploymentArtifacts = writeSiteDeploymentMetadata;
