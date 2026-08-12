import fs from 'fs';
import path from 'path';
import {
  BUILD_ENTRY_POINT,
  DEPLOY_MANIFEST_FILE,
  assertBuildManifest,
  assertManifestFilesVerified,
  sha256File,
} from './deploymentArtifacts.mjs';

const TRANSIENT_WINDOWS_CODES = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
const FAILURE_FILE = 'build-failure.json';

const wait = (milliseconds) => {
  if (milliseconds <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

export class BuildLifecycleError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'BuildLifecycleError';
    this.code = details.code || 'build_lifecycle_error';
    this.details = details;
  }
}

const defaultFileOps = Object.freeze({
  existsSync: fs.existsSync,
  mkdirSync: fs.mkdirSync,
  copyFileSync: fs.copyFileSync,
  renameSync: fs.renameSync,
  rmSync: fs.rmSync,
  statSync: fs.statSync,
  writeFileSync: fs.writeFileSync,
});

const isTransientLock = (error) => TRANSIENT_WINDOWS_CODES.has(String(error?.code || '').toUpperCase());
const logRetry = (logger, details) => logger?.(`[build-lifecycle] filesystem retry ${JSON.stringify(details)}`);

export function runWithFileRetry(operation, action, {
  buildMode,
  sourcePath = '',
  targetPath = '',
  canonicalModified = false,
  previousArtifactPath = '',
  failedStagingPath = '',
  retries = 3,
  retryDelayMs = 60,
  logger = console.warn,
} = {}) {
  let retryCount = 0;
  while (true) {
    try {
      return action(retryCount);
    } catch (error) {
      if (!isTransientLock(error) || retryCount >= retries) {
        const details = {
          buildMode,
          operation,
          sourcePath,
          targetPath,
          osErrorCode: String(error?.code || 'unknown'),
          retryCount,
          canonicalModified,
          previousArtifactPath,
          failedStagingPath,
        };
        throw new BuildLifecycleError(
          `Build filesystem operation failed: ${operation}. ${JSON.stringify(details)}`,
          { ...details, cause: error?.message || String(error) },
        );
      }
      retryCount += 1;
      logRetry(logger, {
        buildMode,
        operation,
        sourcePath,
        targetPath,
        osErrorCode: String(error?.code || 'unknown'),
        retryCount,
      });
      wait(retryDelayMs * retryCount);
    }
  }
}

export function createBuildStaging({ projectRoot, buildMode, buildId }) {
  const stagingRoot = path.join(projectRoot, '.tmp-build', buildMode, buildId);
  const distRoot = path.join(stagingRoot, 'dist');
  fs.mkdirSync(stagingRoot, { recursive: true });
  return Object.freeze({ stagingRoot, distRoot, buildMode, buildId });
}

export function markBuildStagingFailed(staging, error, { phase, canonicalDist } = {}) {
  const failedAt = new Date().toISOString();
  const details = {
    status: 'failed',
    phase: phase || 'unknown',
    buildMode: staging?.buildMode || '',
    buildId: staging?.buildId || '',
    failedAt,
    canonicalDist: canonicalDist || '',
    stagingDist: staging?.distRoot || '',
    error: {
      message: error?.message || String(error),
      code: error?.code || error?.details?.osErrorCode || '',
      details: error?.details || null,
    },
  };
  if (staging?.stagingRoot) {
    fs.mkdirSync(staging.stagingRoot, { recursive: true });
    fs.writeFileSync(path.join(staging.stagingRoot, FAILURE_FILE), `${JSON.stringify(details, null, 2)}\n`, 'utf8');
  }
  return details;
}

const orderPromotionEntries = (entries) => {
  const rank = (entry) => {
    const candidate = entry.path.toLowerCase();
    if (/\.(?:m?js|cjs)$/.test(candidate)) return 0;
    if (/\.css$/.test(candidate)) return 1;
    if (/\.(?:woff2?|ttf|otf|eot)$/.test(candidate)) return 2;
    if (/\.(?:svg|png|jpe?g|gif|webp|avif|ico|mp4|webm|mp3|wav)$/.test(candidate)) return 3;
    return 4;
  };
  return [...entries].sort((left, right) => rank(left) - rank(right) || left.path.localeCompare(right.path));
};

const copyAndVerify = ({
  operations,
  operation,
  sourcePath,
  targetPath,
  expectedEntry,
  retryOptions,
}) => {
  runWithFileRetry('prepare-file-directory', () => operations.mkdirSync(path.dirname(targetPath), { recursive: true }), {
    ...retryOptions,
    sourcePath,
    targetPath: path.dirname(targetPath),
  });
  runWithFileRetry(operation, () => operations.copyFileSync(sourcePath, targetPath), {
    ...retryOptions,
    sourcePath,
    targetPath,
  });
  const stats = operations.statSync(targetPath);
  const actualSha256 = sha256File(targetPath);
  if (!stats.isFile() || stats.size !== expectedEntry.size || actualSha256 !== expectedEntry.sha256) {
    throw new BuildLifecycleError(`Canonical file verification failed for ${expectedEntry.path}.`, {
      ...retryOptions,
      operation: `verify-${operation}`,
      sourcePath,
      targetPath,
      expectedSize: expectedEntry.size,
      actualSize: stats.size,
      expectedSha256: expectedEntry.sha256,
      actualSha256,
    });
  }
};

const asPromotionError = (error, {
  staging,
  canonicalDist,
  operation,
  sourcePath,
  targetPath,
  canonicalModified,
  previousArtifactPath,
}) => {
  if (error instanceof BuildLifecycleError) {
    error.details = {
      ...error.details,
      buildMode: staging.buildMode,
      canonicalModified: error.details.canonicalModified || canonicalModified,
      previousArtifactPath: error.details.previousArtifactPath || previousArtifactPath || '',
      failedStagingPath: error.details.failedStagingPath || staging.distRoot,
    };
    return error;
  }
  return new BuildLifecycleError(`Validated build promotion failed: ${error?.message || error}`, {
    buildMode: staging.buildMode,
    operation,
    sourcePath,
    targetPath: targetPath || canonicalDist,
    osErrorCode: String(error?.code || 'unknown'),
    retryCount: 0,
    canonicalModified,
    previousArtifactPath: previousArtifactPath || '',
    failedStagingPath: staging.distRoot,
  });
};

const readCurrentManifestIfValid = (canonicalDist, readCurrentManifest) => {
  if (!fs.existsSync(canonicalDist)) return null;
  try {
    return readCurrentManifest(canonicalDist);
  } catch {
    return null;
  }
};

const cleanupStaleAssets = ({
  operations,
  staging,
  canonicalDist,
  previousManifest,
  newManifest,
  retries,
  retryDelayMs,
  logger,
}) => {
  const currentPaths = new Set(newManifest.files.map((entry) => entry.path));
  const staleAssets = (previousManifest?.files || [])
    .map((entry) => entry.path)
    .filter((candidate) => candidate.startsWith('assets/') && !currentPaths.has(candidate));
  const warnings = [];
  for (const relativePath of staleAssets) {
    const targetPath = path.join(canonicalDist, relativePath);
    if (!operations.existsSync(targetPath)) continue;
    try {
      runWithFileRetry('cleanup-stale-asset', () => operations.rmSync(targetPath, { force: true }), {
        buildMode: staging.buildMode,
        sourcePath: '',
        targetPath,
        canonicalModified: true,
        failedStagingPath: staging.distRoot,
        retries,
        retryDelayMs,
        logger,
      });
    } catch (error) {
      const warning = error instanceof BuildLifecycleError ? error.details : { targetPath, message: error?.message || String(error) };
      warnings.push(warning);
      logger?.(`[build-lifecycle] stale asset cleanup skipped: ${JSON.stringify(warning)}`);
    }
  }
  return Object.freeze(warnings);
};

/**
 * Promote a validated staging build without moving or deleting canonical dist.
 * The old index remains the active application until all Build B dependencies,
 * metadata, and the final index bytes have independently verified.
 */
export function promoteValidatedBuild({
  staging,
  canonicalDist,
  validateStaging = (distRoot) => assertBuildManifest(distRoot),
  validateCanonical = (distRoot) => assertBuildManifest(distRoot),
  readCurrentManifest = (distRoot) => assertBuildManifest(distRoot),
  fileOps = defaultFileOps,
  retries = 3,
  retryDelayMs = 60,
  logger = console.warn,
} = {}) {
  if (!staging?.distRoot || !staging?.stagingRoot) throw new Error('A build staging directory is required for promotion.');
  const operations = { ...defaultFileOps, ...fileOps };
  const failedStagingPath = staging.distRoot;
  const retryOptions = {
    buildMode: staging.buildMode,
    canonicalModified: false,
    failedStagingPath,
    retries,
    retryDelayMs,
    logger,
  };
  let canonicalModified = false;
  let newManifest;
  let previousManifest = null;
  let previousArtifactPath = '';
  let previousIndexBackup = null;
  const copiedFiles = [];
  try {
    // Phase 1: this happens before the canonical directory is touched.
    newManifest = validateStaging(staging.distRoot);
    if (!newManifest?.buildId || !Array.isArray(newManifest.files)) {
      throw new Error('Validated staging build did not return a complete manifest with a buildId.');
    }
    const indexEntry = newManifest.files.find((entry) => entry.path === BUILD_ENTRY_POINT);
    if (!indexEntry) throw new Error(`Validated staging build is missing ${BUILD_ENTRY_POINT}.`);
    previousManifest = readCurrentManifestIfValid(canonicalDist, readCurrentManifest);

    // A small backup of the active commit file gives post-commit verification a
    // file-level rollback path without ever moving the canonical directory.
    const canonicalIndexPath = path.join(canonicalDist, BUILD_ENTRY_POINT);
    if (operations.existsSync(canonicalIndexPath)) {
      const previousIndexStats = operations.statSync(canonicalIndexPath);
      const previousIndexEntry = {
        path: BUILD_ENTRY_POINT,
        size: previousIndexStats.size,
        sha256: sha256File(canonicalIndexPath),
      };
      const backupPath = path.join(staging.stagingRoot, 'previous-canonical-index.html');
      copyAndVerify({
        operations,
        operation: 'preserve-previous-index',
        sourcePath: canonicalIndexPath,
        targetPath: backupPath,
        expectedEntry: previousIndexEntry,
        retryOptions: { ...retryOptions, canonicalModified },
      });
      previousArtifactPath = backupPath;
      previousIndexBackup = Object.freeze({ path: backupPath, entry: previousIndexEntry });
    }

    // Phase 2: copy all Build B dependencies while Build A index remains live.
    const nonEntryFiles = orderPromotionEntries(newManifest.files.filter((entry) => entry.path !== BUILD_ENTRY_POINT));
    for (const entry of nonEntryFiles) {
      const sourcePath = path.join(staging.distRoot, entry.path);
      const targetPath = path.join(canonicalDist, entry.path);
      copyAndVerify({
        operations,
        operation: 'copy-canonical-file',
        sourcePath,
        targetPath,
        expectedEntry: entry,
        retryOptions: { ...retryOptions, canonicalModified, previousArtifactPath },
      });
      canonicalModified = true;
      copiedFiles.push(entry.path);
    }

    // The manifest is metadata, deliberately copied only after all dependencies.
    const stagingManifestPath = path.join(staging.distRoot, DEPLOY_MANIFEST_FILE);
    const canonicalManifestPath = path.join(canonicalDist, DEPLOY_MANIFEST_FILE);
    const manifestStats = operations.statSync(stagingManifestPath);
    copyAndVerify({
      operations,
      operation: 'copy-canonical-manifest',
      sourcePath: stagingManifestPath,
      targetPath: canonicalManifestPath,
      expectedEntry: {
        path: DEPLOY_MANIFEST_FILE,
        size: manifestStats.size,
        sha256: sha256File(stagingManifestPath),
      },
      retryOptions: { ...retryOptions, canonicalModified, previousArtifactPath },
    });
    canonicalModified = true;
    copiedFiles.push(DEPLOY_MANIFEST_FILE);

    // Phase 3: ensure the entirety of Build B (except its entry point) exists first.
    assertManifestFilesVerified(canonicalDist, newManifest, { includeEntryPoint: false });

    // Phase 4: stage the small commit file beside the old index, then replace it.
    const stagingIndexPath = path.join(staging.distRoot, BUILD_ENTRY_POINT);
    const preparedIndexPath = path.join(canonicalDist, `.${BUILD_ENTRY_POINT}.${staging.buildId}.next`);
    copyAndVerify({
      operations,
      operation: 'prepare-index-replacement',
      sourcePath: stagingIndexPath,
      targetPath: preparedIndexPath,
      expectedEntry: indexEntry,
      retryOptions: { ...retryOptions, canonicalModified, previousArtifactPath },
    });
    runWithFileRetry('replace-canonical-index', () => operations.renameSync(preparedIndexPath, canonicalIndexPath), {
      ...retryOptions,
      sourcePath: preparedIndexPath,
      targetPath: canonicalIndexPath,
      canonicalModified,
      previousArtifactPath,
    });
    canonicalModified = true;
    copiedFiles.push(BUILD_ENTRY_POINT);

    // Phase 5: prove the committed entry point and every current reference are Build B.
    try {
      assertManifestFilesVerified(canonicalDist, newManifest);
      validateCanonical(canonicalDist);
    } catch (error) {
      const recoveryErrors = [];
      if (previousIndexBackup) {
        const rollbackPath = path.join(canonicalDist, `.${BUILD_ENTRY_POINT}.${staging.buildId}.rollback`);
        try {
          copyAndVerify({
            operations,
            operation: 'prepare-index-rollback',
            sourcePath: previousIndexBackup.path,
            targetPath: rollbackPath,
            expectedEntry: previousIndexBackup.entry,
            retryOptions: { ...retryOptions, canonicalModified: true, previousArtifactPath },
          });
          runWithFileRetry('restore-previous-index', () => operations.renameSync(rollbackPath, canonicalIndexPath), {
            ...retryOptions,
            sourcePath: rollbackPath,
            targetPath: canonicalIndexPath,
            canonicalModified: true,
            previousArtifactPath,
          });
        } catch (recoveryError) {
          recoveryErrors.push(recoveryError?.message || String(recoveryError));
        }
      } else {
        recoveryErrors.push('No previous index.html existed to restore.');
      }
      const promotionError = asPromotionError(error, {
        staging,
        canonicalDist,
        operation: 'verify-committed-index',
        sourcePath: path.join(staging.distRoot, BUILD_ENTRY_POINT),
        targetPath: canonicalIndexPath,
        canonicalModified,
        previousArtifactPath,
      });
      promotionError.details = { ...promotionError.details, recoveryErrors, indexCommitted: false, rollbackSucceeded: recoveryErrors.length === 0 };
      throw promotionError;
    }
    const cleanupWarnings = cleanupStaleAssets({
      operations,
      staging,
      canonicalDist,
      previousManifest,
      newManifest,
      retries,
      retryDelayMs,
      logger,
    });
    return Object.freeze({
      canonicalDist,
      previousArtifactPath,
      buildId: staging.buildId,
      buildMode: staging.buildMode,
      copiedFiles: Object.freeze(copiedFiles),
      cleanupWarnings,
      indexCommitted: true,
    });
  } catch (error) {
    throw asPromotionError(error, {
      staging,
      canonicalDist,
      operation: 'promote-validated-build',
      sourcePath: staging.distRoot,
      targetPath: canonicalDist,
      canonicalModified,
      previousArtifactPath,
    });
  }
}
