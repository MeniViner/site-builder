import crypto from 'crypto';
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
export const BUILD_MANIFEST_SCHEMA_VERSION = 4;
export const BUILD_ENTRY_POINT = 'index.html';
export const ARTIFACT_KINDS = Object.freeze({
  LEGACY: 'site-builder-legacy-frontend',
  UNIVERSAL: 'site-builder-universal-frontend',
});

// These files are an overlay, never part of a reusable release artifact.
export const SITE_SPECIFIC_OVERLAY_FILES = Object.freeze([
  RUNTIME_CONFIG_FILE,
  DEPLOYMENT_METADATA_FILE,
  'runtime-config.json',
]);

const text = (value) => String(value ?? '').trim();
const toPosixPath = (value) => String(value || '').split(path.sep).join('/').replace(/^\/+/, '');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const createBuildId = () => crypto.randomUUID();

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

export function collectDistFiles(rootDir, { exclude = [] } = {}) {
  const files = [];
  const excluded = new Set(exclude.map((file) => toPosixPath(file)));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile()) {
        const relative = toPosixPath(path.relative(rootDir, fullPath));
        if (!excluded.has(relative)) files.push(relative);
      }
    }
  };
  walk(rootDir);
  return files.sort();
}

export function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function collectBuildFileEntries(rootDir) {
  return collectDistFiles(rootDir, { exclude: [DEPLOY_MANIFEST_FILE] })
    .map((relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      const stats = fs.statSync(absolutePath);
      return Object.freeze({
        path: relativePath,
        size: stats.size,
        sha256: sha256File(absolutePath),
      });
    });
}

const normalizeManifestEntry = (file) => {
  if (typeof file === 'string') return { path: toPosixPath(file), size: null, sha256: '' };
  return {
    path: toPosixPath(file?.path),
    size: Number.isInteger(file?.size) && file.size >= 0 ? file.size : null,
    sha256: text(file?.sha256).toLowerCase(),
  };
};

export function manifestFilePaths(manifest = {}) {
  return Array.isArray(manifest.files) ? manifest.files.map((file) => normalizeManifestEntry(file).path) : [];
}

export function extractLocalIndexReferences(indexHtml) {
  const references = new Set();
  const tags = String(indexHtml || '').matchAll(/<(?:script|link|img|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi);
  for (const match of tags) {
    const raw = text(match[1]);
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(raw)) continue;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    if (!withoutQuery || withoutQuery.startsWith('/')) continue;
    const normalized = path.posix.normalize(withoutQuery.replace(/^\.\//, ''));
    if (!normalized || normalized === '.' || normalized.startsWith('../')) {
      throw new Error(`index.html contains an unsafe local reference "${raw}".`);
    }
    references.add(normalized);
  }
  return [...references].sort();
}

export function buildDeployManifest(files, {
  buildId = createBuildId(),
  buildMode = 'universal',
  artifactKind = ARTIFACT_KINDS.UNIVERSAL,
  requiresRuntimeConfig = artifactKind === ARTIFACT_KINDS.UNIVERSAL,
  generatedAt = new Date().toISOString(),
  indexReferences = [],
} = {}) {
  const normalizedFiles = Array.from(new Map(
    files.map((file) => {
      const entry = normalizeManifestEntry(file);
      if (!entry.path || entry.path === DEPLOY_MANIFEST_FILE) throw new Error(`Invalid build manifest file path "${entry.path || '(empty)'}".`);
      return [entry.path, entry];
    }),
  ).values()).sort((a, b) => a.path.localeCompare(b.path));
  if (!normalizedFiles.some((file) => file.path === BUILD_ENTRY_POINT)) {
    throw new Error(`Build manifest requires ${BUILD_ENTRY_POINT}.`);
  }
  return {
    kind: 'sitebuilder-release-manifest',
    schemaVersion: BUILD_MANIFEST_SCHEMA_VERSION,
    buildId,
    buildMode,
    artifactKind,
    generatedAt,
    storageCompatibility: [STORAGE_BACKENDS.TXT, STORAGE_BACKENDS.MONGO],
    requiresRuntimeConfig,
    preservesRuntimeConfig: true,
    runtimeConfigFiles: [RUNTIME_CONFIG_FILE, DEPLOYMENT_METADATA_FILE],
    manifestFile: DEPLOY_MANIFEST_FILE,
    entryPoint: BUILD_ENTRY_POINT,
    commitFile: BUILD_ENTRY_POINT,
    fileCount: normalizedFiles.length,
    requiredFolders: Array.from(new Set(
      normalizedFiles.map((file) => file.path.split('/').slice(0, -1).join('/')).filter(Boolean),
    )).sort(),
    indexReferences: [...new Set(indexReferences)].sort(),
    files: normalizedFiles,
  };
}

export function readBuildManifest(rootDir) {
  const manifestPath = path.join(rootDir, DEPLOY_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) throw new Error(`Build manifest is missing: ${manifestPath}`);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error(`Build manifest is unreadable: ${manifestPath}`);
  }
}

export function assertBuildManifest(rootDir, {
  artifactKind,
  buildMode,
  requireHashes = true,
} = {}) {
  const manifestPath = path.join(rootDir, DEPLOY_MANIFEST_FILE);
  const manifest = readBuildManifest(rootDir);
  if (manifest?.schemaVersion !== BUILD_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported build manifest schema in ${manifestPath}. Rebuild the artifact.`);
  }
  if (!text(manifest.buildId)) throw new Error(`Build manifest has no buildId: ${manifestPath}`);
  if (artifactKind && manifest.artifactKind !== artifactKind) throw new Error(`Build manifest artifact kind mismatch: expected ${artifactKind}, received ${manifest.artifactKind || '(empty)'}.`);
  if (buildMode && manifest.buildMode !== buildMode) throw new Error(`Build manifest build mode mismatch: expected ${buildMode}, received ${manifest.buildMode || '(empty)'}.`);
  if (manifest.entryPoint !== BUILD_ENTRY_POINT || manifest.commitFile !== BUILD_ENTRY_POINT) {
    throw new Error(`Build manifest must designate ${BUILD_ENTRY_POINT} as its entry point and commit file.`);
  }
  const entries = Array.isArray(manifest.files) ? manifest.files.map(normalizeManifestEntry) : [];
  if (entries.length === 0 || manifest.fileCount !== entries.length) throw new Error('Build manifest file count is invalid.');
  const paths = new Set();
  for (const entry of entries) {
    if (!entry.path || entry.path.startsWith('../') || path.posix.isAbsolute(entry.path) || paths.has(entry.path)) {
      throw new Error(`Build manifest has an invalid or duplicate path "${entry.path || '(empty)'}".`);
    }
    paths.add(entry.path);
    if (!Number.isInteger(entry.size) || entry.size < 0) throw new Error(`Build manifest has invalid size for ${entry.path}.`);
    if (requireHashes && !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Build manifest has invalid SHA-256 for ${entry.path}.`);
    const filePath = path.join(rootDir, entry.path);
    if (!fs.existsSync(filePath)) throw new Error(`Build output is missing ${entry.path}.`);
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size !== entry.size) throw new Error(`Build output size mismatch for ${entry.path}.`);
    if (requireHashes && sha256File(filePath) !== entry.sha256) throw new Error(`Build output SHA-256 mismatch for ${entry.path}.`);
  }
  const indexEntry = entries.find((entry) => entry.path === BUILD_ENTRY_POINT);
  if (!indexEntry) throw new Error(`Build manifest does not include ${BUILD_ENTRY_POINT}.`);
  const references = extractLocalIndexReferences(fs.readFileSync(path.join(rootDir, BUILD_ENTRY_POINT), 'utf8'));
  for (const reference of references) {
    if (!paths.has(reference)) throw new Error(`index.html references ${reference}, but it is absent from the build manifest.`);
  }
  if (JSON.stringify(references) !== JSON.stringify([...(manifest.indexReferences || [])].sort())) {
    throw new Error('Build manifest index references do not match index.html.');
  }
  return Object.freeze({ ...manifest, files: entries, indexReferences: references });
}

/** Verify copied bytes against an already-validated manifest without trusting a copy exit code. */
export function verifyManifestFiles(rootDir, manifest, { includeEntryPoint = true } = {}) {
  const entries = Array.isArray(manifest?.files) ? manifest.files.map(normalizeManifestEntry) : [];
  const report = {
    buildId: text(manifest?.buildId),
    expectedFiles: entries.filter((entry) => includeEntryPoint || entry.path !== BUILD_ENTRY_POINT).length,
    foundFiles: 0,
    verifiedFiles: 0,
    missingFiles: [],
    mismatchedFiles: [],
  };
  for (const entry of entries) {
    if (!includeEntryPoint && entry.path === BUILD_ENTRY_POINT) continue;
    const filePath = path.join(rootDir, entry.path);
    if (!fs.existsSync(filePath)) {
      report.missingFiles.push(entry.path);
      continue;
    }
    report.foundFiles += 1;
    const stats = fs.statSync(filePath);
    if (!stats.isFile() || stats.size !== entry.size) {
      report.mismatchedFiles.push({ path: entry.path, expectedSize: entry.size, actualSize: stats.size, expectedSha256: entry.sha256, actualSha256: '' });
      continue;
    }
    const actualSha256 = sha256File(filePath);
    if (actualSha256 !== entry.sha256) {
      report.mismatchedFiles.push({ path: entry.path, expectedSize: entry.size, actualSize: stats.size, expectedSha256: entry.sha256, actualSha256 });
      continue;
    }
    report.verifiedFiles += 1;
  }
  return Object.freeze(report);
}

export function assertManifestFilesVerified(rootDir, manifest, options = {}) {
  const report = verifyManifestFiles(rootDir, manifest, options);
  if (report.missingFiles.length || report.mismatchedFiles.length || report.verifiedFiles !== report.expectedFiles) {
    throw new Error(`Build target verification failed: ${JSON.stringify(report)}`);
  }
  return report;
}

export function assertTargetBuildMatchesManifest(rootDir, manifest, options = {}) {
  const targetManifest = assertBuildManifest(rootDir, {
    artifactKind: manifest.artifactKind,
    buildMode: manifest.buildMode,
  });
  if (targetManifest.buildId !== manifest.buildId) {
    throw new Error(`Build ID mismatch at target: expected ${manifest.buildId}, received ${targetManifest.buildId}.`);
  }
  return assertManifestFilesVerified(rootDir, targetManifest, options);
}

export function writeDeployManifest(rootDir, options = {}) {
  if (!fs.existsSync(rootDir)) throw new Error(`deployment directory not found: ${rootDir}`);
  const manifestPath = path.join(rootDir, DEPLOY_MANIFEST_FILE);
  if (fs.existsSync(manifestPath)) fs.rmSync(manifestPath, { force: true });
  const indexPath = path.join(rootDir, BUILD_ENTRY_POINT);
  if (!fs.existsSync(indexPath)) throw new Error(`Build output is missing ${BUILD_ENTRY_POINT}.`);
  const manifest = buildDeployManifest(collectBuildFileEntries(rootDir), {
    ...options,
    indexReferences: extractLocalIndexReferences(fs.readFileSync(indexPath, 'utf8')),
  });
  fs.writeFileSync(path.join(rootDir, DEPLOY_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return assertBuildManifest(rootDir, {
    artifactKind: options.artifactKind,
    buildMode: options.buildMode,
  });
}

export function removeSiteSpecificOverlays(rootDir) {
  for (const filename of SITE_SPECIFIC_OVERLAY_FILES) {
    const filePath = path.join(rootDir, filename);
    if (fs.existsSync(filePath)) fs.rmSync(filePath, { force: true });
  }
}

/** Writes only release-invariant metadata into the canonical universal dist. */
export function writeReleaseArtifacts(distRoot, { buildId = createBuildId() } = {}) {
  if (!fs.existsSync(distRoot)) throw new Error(`dist directory not found: ${distRoot}`);
  removeSiteSpecificOverlays(distRoot);
  return {
    manifest: writeDeployManifest(distRoot, {
      buildId,
      buildMode: 'universal',
      artifactKind: ARTIFACT_KINDS.UNIVERSAL,
      requiresRuntimeConfig: true,
    }),
  };
}

/** A legacy dist is site-specific but still requires the same complete-build proof. */
export function writeLegacyBuildArtifacts(distRoot, { buildId = createBuildId() } = {}) {
  if (!fs.existsSync(distRoot)) throw new Error(`dist directory not found: ${distRoot}`);
  removeSiteSpecificOverlays(distRoot);
  return {
    manifest: writeDeployManifest(distRoot, {
      buildId,
      buildMode: 'legacy',
      artifactKind: ARTIFACT_KINDS.LEGACY,
      requiresRuntimeConfig: false,
    }),
  };
}

/** Prevent the traditional deploy command from publishing a Release Manager artifact. */
export function assertLegacyDeployableDist(distRoot) {
  const manifestPath = path.join(distRoot, DEPLOY_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Legacy deploy refused a dist without ${DEPLOY_MANIFEST_FILE}. Run npm run build before npm run deploy.`);
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch {
    throw new Error(`Legacy deploy refused unreadable ${DEPLOY_MANIFEST_FILE}; rebuild with npm run build.`);
  }
  if (manifest?.artifactKind === ARTIFACT_KINDS.UNIVERSAL) {
    throw new Error('Legacy deploy refused a universal Release Manager artifact. Run npm run build before npm run deploy.');
  }
  return assertBuildManifest(distRoot, {
    artifactKind: ARTIFACT_KINDS.LEGACY,
    buildMode: 'legacy',
  });
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
  const manifestFiles = new Set(manifestFilePaths(manifest));
  for (const filename of [RUNTIME_CONFIG_FILE, DEPLOYMENT_METADATA_FILE]) {
    if (!manifestFiles.has(filename)) throw new Error(`Deployment manifest does not include ${filename}.`);
  }
  assertBuildManifest(rootDir, {
    artifactKind: manifest.artifactKind,
    buildMode: manifest.buildMode,
  });
  return { runtimeConfig, deploymentMetadata, manifest };
}

/** Writes a site-specific overlay and then regenerates its deployment manifest. */
export function writeSiteDeploymentMetadata(targetRoot, config = {}, options = {}) {
  if (!fs.existsSync(targetRoot)) throw new Error(`deployment directory not found: ${targetRoot}`);
  const sourceManifest = assertBuildManifest(targetRoot);
  const runtimeConfig = buildRuntimeConfigPayload(config, options);
  const deploymentMetadata = buildDeploymentMetadataPayload(config, {
    ...options,
    generatedAt: runtimeConfig.deployedAt,
    deploymentGeneratedBy: runtimeConfig.deploymentGeneratedBy,
  });
  fs.writeFileSync(path.join(targetRoot, RUNTIME_CONFIG_FILE), `${JSON.stringify(runtimeConfig, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(targetRoot, DEPLOYMENT_METADATA_FILE), `${JSON.stringify(deploymentMetadata, null, 2)}\n`, 'utf8');
  const manifest = writeDeployManifest(targetRoot, {
    buildId: sourceManifest.buildId,
    buildMode: sourceManifest.buildMode,
    artifactKind: sourceManifest.artifactKind,
    requiresRuntimeConfig: sourceManifest.requiresRuntimeConfig,
  });
  assertDeploymentOverlay(targetRoot);
  return { runtimeConfig, deploymentMetadata, manifest };
}

/**
 * Copy a universal release to an owned temporary directory before adding a
 * Release Manager-style target overlay. A new directory is used on every
 * invocation so that Target B cannot inherit Target A's metadata.
 */
export function createUniversalDeploymentStaging(releaseRoot, config = {}, options = {}) {
  const source = path.resolve(releaseRoot);
  if (!fs.existsSync(path.join(source, 'index.html'))) {
    throw new Error(`Expected a universal dist directory with index.html: ${source}`);
  }
  assertBuildManifest(source, {
    artifactKind: ARTIFACT_KINDS.UNIVERSAL,
    buildMode: 'universal',
  });
  const stagingRoot = fs.mkdtempSync(path.join(options.stagingParent || os.tmpdir(), 'sitebuilder-universal-deploy-'));
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

export function removeUniversalDeploymentStaging(staging) {
  if (staging?.stagingRoot) fs.rmSync(staging.stagingRoot, { recursive: true, force: true });
}

// Compatibility name for deployment callers. It now writes the target overlay
// only; universal builds must use writeReleaseArtifacts instead.
export const writeDeploymentArtifacts = writeSiteDeploymentMetadata;
