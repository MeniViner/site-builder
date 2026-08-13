#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseCliArgs, resolveConfig } from './sp-env.js';
import {
  LEGACY_ENTRY_POINT,
  assertLegacyDeployableDist,
  assertLegacyManifestFilesVerified,
  assertLegacyTargetMatchesManifest,
  readLegacyDeployManifest,
} from './legacyDeploymentArtifacts.mjs';
import {
  BootstrapWebDavError,
  cleanupLocalBootstrapStaging,
  createLocalBootstrapStagingTree,
  resolveBootstrapWebDavTransport,
} from './bootstrapWebDavTransport.mjs';
import { logLegacyFailure, logLegacyStage } from './legacyPipelineDiagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

const enabled = (value) => value === true || String(value || '').trim().toLowerCase() === 'true';

const printRobocopyOutput = (output, stream = process.stdout) => {
  if (output && String(output).length > 0) stream.write(String(output));
};

const runAtBoundary = (boundary, operation, details, work) => {
  try {
    return work();
  } catch (error) {
    if (!error.legacyDetails) error.legacyDetails = { boundary, operation, ...details };
    throw error;
  }
};

export function runRobocopy(command, label, { execute = execSync, logPrefix = '[deploy]' } = {}) {
  console.log(`${logPrefix} Running (${label}): ${command}`);
  try {
    const stdout = execute(command, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    printRobocopyOutput(stdout);
    console.log(`${logPrefix} Robocopy exit code 0 (${label}) considered success.`);
    return 0;
  } catch (error) {
    const exitCode = Number(error?.status ?? 1);
    const stdout = error?.stdout ? String(error.stdout) : '';
    const stderr = error?.stderr ? String(error.stderr) : '';
    printRobocopyOutput(stdout);
    printRobocopyOutput(stderr, process.stderr);
    if (exitCode >= 0 && exitCode < 8) {
      console.log(`${logPrefix} Robocopy exit code ${exitCode} (${label}) considered success.`);
      return exitCode;
    }
    const failure = new Error(`Robocopy failed (${label}) with exit code ${exitCode}`);
    failure.exitCode = exitCode;
    failure.stdout = stdout;
    failure.stderr = stderr;
    throw failure;
  }
}

const runBootstrapRobocopy = ({ command, operation, source, destination, transport, buildId, options }) => {
  try {
    return runRobocopy(command, operation, options);
  } catch (error) {
    throw new BootstrapWebDavError(
      'WEBDAV_BOOTSTRAP_CHILD_COPY_FAILED',
      `Bootstrap child copy operation "${operation}" failed against "${destination}" for "${transport.bootstrapChildRel}". ${error.message}`,
      {
        operation,
        buildId,
        source,
        destination,
        childPath: transport.bootstrapChildRel,
        exitCode: error.exitCode ?? null,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        cause: error.message,
      },
    );
  }
};

const verifyBootstrapTarget = (targetDir, buildManifest, { includeEntryPoint }) => {
  try {
    const targetManifest = readLegacyDeployManifest(targetDir);
    if (targetManifest.buildId !== buildManifest.buildId) {
      throw new Error(`Legacy manifest build ID mismatch: expected ${buildManifest.buildId}, received ${targetManifest.buildId || '(missing)'}.`);
    }
    if (JSON.stringify(targetManifest) !== JSON.stringify(buildManifest)) {
      throw new Error(`Legacy manifest content mismatch for build ${buildManifest.buildId}.`);
    }
    return assertLegacyManifestFilesVerified(targetDir, buildManifest, { includeEntryPoint });
  } catch (error) {
    throw new BootstrapWebDavError(
      'WEBDAV_BOOTSTRAP_VERIFICATION_FAILED',
      `Bootstrap target verification failed at "${targetDir}": ${error.message}`,
      { targetDir, buildId: buildManifest.buildId, includeEntryPoint },
    );
  }
};

export async function runLegacyDeploy({
  cli = parseCliArgs(),
  cwd = projectRoot,
  execute = execSync,
  fileSystem = fs,
  config: suppliedConfig,
} = {}) {
  const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(cwd, '.env.production');
  const config = suppliedConfig || resolveConfig({ envFilePath: envPath, cli });
  const force = enabled(cli.force);
  const dryRun = enabled(cli['dry-run']);
  if (!force && !enabled(config.autoDeploy)) {
    console.log('[legacy-deploy] Skipping deploy (VITE_AUTO_DEPLOY is not true). Use --force to override.');
    return { skipped: true, config };
  }
  if (enabled(cli['clean-first'])) throw new Error('--clean-first is disabled because SharePoint data must be preserved.');

  const buildDir = cli['build-dir'] ? path.resolve(process.cwd(), String(cli['build-dir'])) : path.resolve(cwd, 'dist');
  const deployMode = String(cli.mode || 'final').toLowerCase() === 'bootstrap' ? 'bootstrap' : 'final';
  const targetRel = deployMode === 'bootstrap' ? config.bootstrapDistRel : config.distRel;
  const targetDir = config.toWebDav(targetRel);
  const logPrefix = deployMode === 'bootstrap' ? '[bootstrap-deploy]' : '[legacy-deploy]';

  console.log(`${logPrefix} Site: ${config.siteCode}`);
  console.log(`${logPrefix} Mode: ${deployMode}`);
  console.log(`${logPrefix} Source: ${buildDir}`);
  console.log(`${logPrefix} Target: ${targetDir}`);
  console.log(`${logPrefix} TargetRel: ${targetRel}`);
  console.log(`${logPrefix} Transport: robocopy (WebDAV directories are established from an existing library anchor)`);

  if (!fileSystem.existsSync(buildDir)) throw new Error(`Legacy build directory does not exist: ${buildDir}`);
  const buildManifest = assertLegacyDeployableDist(buildDir);
  if (!String(config.host || '').trim() || !String(config.siteCode || '').trim()) {
    throw new Error('Legacy deploy requires VITE_SP_HOST and VITE_SP_SITE_CODE.');
  }
  if (deployMode === 'final' && config.storageBackend === 'txt') {
    const missingTxtFiles = Object.values(config.fileMap).filter((serverRelativePath) => !fileSystem.existsSync(config.toWebDav(serverRelativePath)));
    if (missingTxtFiles.length) throw new Error(`TXT backend is not ready; ${missingTxtFiles.length} required TXT file(s) are missing. Run site:init first.`);
  }
  if (config.storageBackend === 'mongo') {
    if (!config.backendApiUrl || !config.siteId) throw new Error('Mongo deploy requires VITE_BACKEND_API_URL and VITE_SITE_ID.');
    const healthUrl = `${config.backendApiUrl.replace(/\/+$/g, '')}/api/sites/${encodeURIComponent(config.siteId)}`;
    const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Mongo target readiness failed (${response.status}) at ${healthUrl}.`);
  }

  const bootstrapTransport = deployMode === 'bootstrap'
    ? resolveBootstrapWebDavTransport(config, { cwd, buildId: buildManifest.buildId })
    : null;

  if (bootstrapTransport) {
    console.log(`${logPrefix} Build ID: ${buildManifest.buildId}`);
    console.log(`${logPrefix} WebDAV host: ${bootstrapTransport.host}`);
    console.log(`${logPrefix} WebDAV siteCode: ${bootstrapTransport.siteCode}`);
    console.log(`${logPrefix} WebDAV bootstrapLibrary: ${bootstrapTransport.bootstrapLibrary}`);
    console.log(`${logPrefix} WebDAV anchor server-relative: ${bootstrapTransport.bootstrapLibraryRootRel}`);
    console.log(`${logPrefix} WebDAV anchor UNC: ${bootstrapTransport.bootstrapAnchorDir}`);
    console.log(`${logPrefix} WebDAV transport probe: robocopy against the existing library anchor`);
  }

  if (dryRun) {
    console.log(`${logPrefix} Would deploy Legacy buildId=${buildManifest.buildId} from "${buildDir}" => "${targetDir}".`);
    return { dryRun: true, config, deployMode, targetDir, targetRel, buildManifest, bootstrapTransport };
  }

  if (bootstrapTransport) {
    createLocalBootstrapStagingTree({ buildDir, transport: bootstrapTransport });
    assertLegacyTargetMatchesManifest(bootstrapTransport.stagedDistRoot, buildManifest);

    try {
      runBootstrapRobocopy(
        {
          command: `robocopy "${bootstrapTransport.stagingRoot}" "${bootstrapTransport.bootstrapAnchorDir}" /E /XF "${LEGACY_ENTRY_POINT}" /R:3 /W:5`,
          operation: 'establish-bootstrap-child-tree',
          source: bootstrapTransport.stagingRoot,
          destination: bootstrapTransport.bootstrapAnchorDir,
          transport: bootstrapTransport,
          buildId: buildManifest.buildId,
          options: { execute, logPrefix },
        },
      );
      runBootstrapRobocopy(
        {
          command: `robocopy "${bootstrapTransport.stagedDistRoot}" "${bootstrapTransport.bootstrapTargetDir}" /MIR /XF "${LEGACY_ENTRY_POINT}" /R:3 /W:5`,
          operation: 'mirror-current-bootstrap-dist',
          source: bootstrapTransport.stagedDistRoot,
          destination: bootstrapTransport.bootstrapTargetDir,
          transport: bootstrapTransport,
          buildId: buildManifest.buildId,
          options: { execute, logPrefix },
        },
      );

      const dependencyReport = verifyBootstrapTarget(targetDir, buildManifest, { includeEntryPoint: false });
      console.log(`${logPrefix} Dependencies verified: ${dependencyReport.verifiedFiles}/${dependencyReport.expectedFiles} buildId=${buildManifest.buildId}`);

      runBootstrapRobocopy(
        {
          command: `robocopy "${bootstrapTransport.stagedDistRoot}" "${bootstrapTransport.bootstrapTargetDir}" "${LEGACY_ENTRY_POINT}" /R:3 /W:5`,
          operation: 'commit-index-last',
          source: bootstrapTransport.stagedDistRoot,
          destination: bootstrapTransport.bootstrapTargetDir,
          transport: bootstrapTransport,
          buildId: buildManifest.buildId,
          options: { execute, logPrefix },
        },
      );
      logLegacyStage('BOOTSTRAP_UPLOAD', 'SUCCESS', {
        source: bootstrapTransport.stagingRoot,
        target: bootstrapTransport.bootstrapAnchorDir,
        buildId: buildManifest.buildId,
      });
      const completeReport = verifyBootstrapTarget(targetDir, buildManifest, { includeEntryPoint: true });
      console.log(`${logPrefix} Complete build verified: ${completeReport.verifiedFiles}/${completeReport.expectedFiles} buildId=${buildManifest.buildId}`);
      logLegacyStage('BOOTSTRAP_VERIFY', 'SUCCESS', {
        target: targetDir,
        buildId: buildManifest.buildId,
        fileCount: completeReport.verifiedFiles,
      });
      console.log(`${logPrefix} BOOTSTRAP TRANSPORT STATUS: BOOTSTRAP TRANSPORT READY`);
      return {
        config,
        deployMode,
        targetDir,
        targetRel,
        buildManifest,
        dependencyReport,
        completeReport,
        bootstrapTransport,
      };
    } finally {
      cleanupLocalBootstrapStaging(bootstrapTransport);
    }
  }

  console.log(`[legacy][FINAL_ASSET_COPY] STARTED | source=${buildDir} | target=${targetDir} | buildId=${buildManifest.buildId}`);
  runAtBoundary('FINAL_ASSET_COPY', 'robocopy-non-index-assets', { source: buildDir, target: targetDir, buildId: buildManifest.buildId }, () => (
    runRobocopy(`robocopy "${buildDir}" "${targetDir}" /E /XF "${LEGACY_ENTRY_POINT}" /R:3 /W:5`, 'copy-non-entry-files', { execute, logPrefix })
  ));
  logLegacyStage('FINAL_ASSET_COPY', 'SUCCESS', { source: buildDir, target: targetDir, buildId: buildManifest.buildId });

  const targetManifest = runAtBoundary('FINAL_ASSET_VERIFY', 'read-final-manifest', { target: targetDir, currentFile: 'sharepoint-deploy-manifest.json', buildId: buildManifest.buildId }, () => readLegacyDeployManifest(targetDir));
  if (targetManifest.buildId !== buildManifest.buildId) {
    const error = new Error(`Legacy manifest build ID mismatch: expected ${buildManifest.buildId}, received ${targetManifest.buildId || '(missing)'}.`);
    error.legacyDetails = { boundary: 'FINAL_ASSET_VERIFY', operation: 'compare-final-build-id', target: targetDir, currentFile: 'sharepoint-deploy-manifest.json', buildId: buildManifest.buildId };
    throw error;
  }
  const dependencyReport = runAtBoundary('FINAL_ASSET_VERIFY', 'verify-final-assets', { source: buildDir, target: targetDir, buildId: buildManifest.buildId }, () => assertLegacyManifestFilesVerified(targetDir, buildManifest, { includeEntryPoint: false }));
  console.log(`${logPrefix} Dependencies verified: ${dependencyReport.verifiedFiles}/${dependencyReport.expectedFiles} buildId=${buildManifest.buildId}`);
  logLegacyStage('FINAL_ASSET_VERIFY', 'SUCCESS', { target: targetDir, buildId: buildManifest.buildId, fileCount: dependencyReport.verifiedFiles });

  console.log(`[legacy][FINAL_INDEX_COMMIT] STARTED | currentFile=${LEGACY_ENTRY_POINT} | buildId=${buildManifest.buildId}`);
  runAtBoundary('FINAL_INDEX_COMMIT', 'robocopy-index-last', { source: buildDir, target: targetDir, currentFile: LEGACY_ENTRY_POINT, buildId: buildManifest.buildId }, () => (
    runRobocopy(`robocopy "${buildDir}" "${targetDir}" "${LEGACY_ENTRY_POINT}" /R:3 /W:5`, 'commit-index-last', { execute, logPrefix })
  ));
  logLegacyStage('FINAL_INDEX_COMMIT', 'SUCCESS', { target: targetDir, currentFile: LEGACY_ENTRY_POINT, buildId: buildManifest.buildId });
  const completeReport = runAtBoundary('FINAL_INDEX_VERIFY', 'verify-final-index-and-references', { source: buildDir, target: targetDir, currentFile: LEGACY_ENTRY_POINT, buildId: buildManifest.buildId }, () => assertLegacyTargetMatchesManifest(targetDir, buildManifest));
  console.log(`${logPrefix} Complete build verified: ${completeReport.verifiedFiles}/${completeReport.expectedFiles} buildId=${buildManifest.buildId}`);
  logLegacyStage('FINAL_INDEX_VERIFY', 'SUCCESS', { target: targetDir, currentFile: LEGACY_ENTRY_POINT, buildId: buildManifest.buildId });
  logLegacyStage('FINAL_APP_SMOKE', 'STATIC PASS', { target: `https://${config.host}${config.distRel}/index.html`, buildId: buildManifest.buildId });
  logLegacyStage('COMPLETE', 'SUCCESS', { finalAppUrl: `https://${config.host}${config.distRel}/index.html`, buildId: buildManifest.buildId });
  console.log('LEGACY PIPELINE: COMPLETE');
  console.log(`FINAL APP URL: https://${config.host}${config.distRel}/index.html`);
  console.log(`${logPrefix} Deployment completed.`);
  return { config, deployMode, targetDir, targetRel, buildManifest, dependencyReport, completeReport };
}

export function reportLegacyDeployError(error) {
  console.error(`[legacy-deploy] Error${error.code ? ` [${error.code}]` : ''}: ${error.message}`);
  const boundary = error.legacyDetails?.boundary || (error.code === 'WEBDAV_BOOTSTRAP_VERIFICATION_FAILED' ? 'BOOTSTRAP_VERIFY' : 'BOOTSTRAP_UPLOAD');
  logLegacyFailure({
    boundary,
    operation: error.legacyDetails?.operation || error.details?.operation || (boundary === 'BOOTSTRAP_VERIFY' ? 'verify-bootstrap-manifest' : 'robocopy-bootstrap-child-tree'),
    source: error.legacyDetails?.source || error.details?.source,
    target: error.legacyDetails?.target || error.details?.destination || error.details?.targetDir,
    currentFile: error.legacyDetails?.currentFile || error.details?.currentFile,
    robocopyExitCode: error.exitCode ?? error.details?.exitCode,
    responsePreview: error.details?.stderr || error.details?.stdout,
    buildId: error.legacyDetails?.buildId || error.details?.buildId,
    nextAction: boundary === 'BOOTSTRAP_VERIFY' ? 'Inspect the reported remote file and retry the build before opening the Setup URL.' : `Inspect and retry only ${boundary}.`,
  });
  if (error instanceof BootstrapWebDavError) {
    console.error('[bootstrap-deploy] BOOTSTRAP TRANSPORT STATUS: BOOTSTRAP TRANSPORT NOT READY');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await runLegacyDeploy();
  } catch (error) {
    reportLegacyDeployError(error);
    process.exit(1);
  }
}
