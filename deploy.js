// deploy.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseCliArgs, resolveConfig } from './scripts/sp-env.js';
import {
  assertDeploymentOverlay,
  assertLegacyDeploymentConfig,
  createLegacyDeploymentStaging,
  removeLegacyDeploymentStaging,
} from './scripts/deploymentArtifacts.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });

const force = cli.force === true || String(cli.force || '').toLowerCase() === 'true';
const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
const cleanFirst = cli['clean-first'] === true || String(cli['clean-first'] || '').toLowerCase() === 'true';
const autoDeployEnabled = String(config.autoDeploy || '').toLowerCase() === 'true';
if (!force && !autoDeployEnabled) {
  console.log(`[deploy] Skipping deploy (VITE_AUTO_DEPLOY is not true). Use --force to override.`);
  process.exit(0);
}

const buildDir = cli['build-dir']
  ? path.resolve(process.cwd(), String(cli['build-dir']))
  : path.join(__dirname, 'dist');

const deployMode = String(cli.mode || 'final').toLowerCase() === 'bootstrap' ? 'bootstrap' : 'final';
const targetRel = deployMode === 'bootstrap' ? config.bootstrapDistRel : config.distRel;
const targetDir = config.toWebDav(targetRel);
const logPrefix = deployMode === 'bootstrap' ? '[bootstrap-deploy]' : '[deploy]';

console.log(`${logPrefix} Site: ${config.siteCode}`);
console.log(`${logPrefix} Mode: ${deployMode}`);
console.log(`${logPrefix} Source: ${buildDir}`);
console.log(`${logPrefix} Target: ${targetDir}`);
console.log(`${logPrefix} TargetRel: ${targetRel}`);
console.log(`${logPrefix} Storage backend: ${config.storageBackend} (${config.storageBackendSource})`);
console.log(`${logPrefix} Clean-first mode: disabled (the universal release is staged before deployment)`);
if (dryRun) {
  console.log(`${logPrefix} Dry-run mode: robocopy will not run.`);
}

function runRobocopy(command, label) {
  console.log(`${logPrefix} Running (${label}): ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
    return;
  } catch (error) {
    const exitCode = Number(error?.status ?? 1);
    // Robocopy success range is 0..7. 8+ are failures.
    if (exitCode >= 0 && exitCode < 8) {
      console.log(`${logPrefix} Robocopy exit code ${exitCode} (${label}) considered success.`);
      return;
    }
    throw new Error(`Robocopy failed (${label}) with exit code ${exitCode}`);
  }
}

try {
  if (!fs.existsSync(buildDir)) {
    throw new Error(`Build directory does not exist: ${buildDir}`);
  }
  if (cleanFirst) {
    throw new Error('--clean-first is disabled because purging a target can remove unrelated SharePoint data.');
  }

  // Validate the exact legacy .env/CLI mapping before either target readiness
  // work or filesystem writes. This uses the browser's canonical descriptor.
  const deploymentIdentity = assertLegacyDeploymentConfig(config);

  if (deployMode === 'final' && config.storageBackend === 'txt') {
    const missingTxtFiles = Object.values(config.fileMap).filter((serverRelativePath) => !fs.existsSync(config.toWebDav(serverRelativePath)));
    if (missingTxtFiles.length > 0) {
      throw new Error(`TXT backend is not ready; ${missingTxtFiles.length} required TXT file(s) are missing. Run site:init first.`);
    }
  }
  if (config.storageBackend === 'mongo') {
    if (!config.backendApiUrl || !config.siteId) {
      throw new Error('Mongo deploy requires VITE_BACKEND_API_URL and VITE_SITE_ID.');
    }
    const healthUrl = `${config.backendApiUrl.replace(/\/+$/g, '')}/api/sites/${encodeURIComponent(config.siteId)}`;
    const response = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Mongo target readiness failed (${response.status}) at ${healthUrl}.`);
    }
  }

  const staging = createLegacyDeploymentStaging(buildDir, config);
  try {
    console.log(`${logPrefix} Staging: ${staging.stagingRoot}`);
    console.log(`${logPrefix} Generated runtime overlay for ${staging.runtimeConfig.finalAppUrl}.`);

    if (dryRun) {
      console.log(`${logPrefix} Would copy staged release "${staging.stagingRoot}" => "${targetDir}"`);
    } else {
      fs.mkdirSync(targetDir, { recursive: true });
      const copyCommand = `robocopy "${staging.stagingRoot}" "${targetDir}" /E /R:3 /W:5`;
      runRobocopy(copyCommand, 'copy-staged-release');

      const targetOverlay = assertDeploymentOverlay(targetDir);
      console.log(`${logPrefix} Verified ${targetOverlay.runtimeConfig.storageBackend} runtime metadata in the SharePoint target.`);
      console.log(`${logPrefix} Final app URL: ${deploymentIdentity.descriptor.finalAppUrl}`);
      console.log(`${logPrefix} Deployment completed.`);
    }
  } finally {
    removeLegacyDeploymentStaging(staging);
  }
} catch (error) {
  console.error(`${logPrefix} Error: ${error.message}`);
  process.exit(1);
}
