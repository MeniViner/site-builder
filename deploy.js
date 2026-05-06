// deploy.js
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseCliArgs, resolveConfig } from './scripts/sp-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(process.cwd(), '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });

const force = cli.force === true || String(cli.force || '').toLowerCase() === 'true';
const dryRun = cli['dry-run'] === true || String(cli['dry-run'] || '').toLowerCase() === 'true';
const disableCleanFirst = cli['no-clean-first'] === true || String(cli['clean-first'] || '').toLowerCase() === 'false';
const cleanFirst = !disableCleanFirst;
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
console.log(`${logPrefix} Clean-first mode: ${cleanFirst ? 'enabled' : 'disabled'}`);
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

  if (dryRun) {
    if (cleanFirst) {
    console.log(`${logPrefix} Would purge target folder first: "${targetDir}"`);
    }
    console.log(`${logPrefix} Would copy "${buildDir}" => "${targetDir}"`);
    process.exit(0);
  }

  fs.mkdirSync(targetDir, { recursive: true });

  let emptyDir = null;

  try {
    if (cleanFirst) {
      emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-deploy-empty-'));
      // Purge destination first so we don't need temporary extra quota during copy.
      const purgeCommand = `robocopy "${emptyDir}" "${targetDir}" /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP`;
      runRobocopy(purgeCommand, 'purge-target');
    }

    const copyCommand = `robocopy "${buildDir}" "${targetDir}" /E /R:3 /W:5`;
    runRobocopy(copyCommand, 'copy-build');
  } finally {
    if (emptyDir && fs.existsSync(emptyDir)) {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  }

  console.log(`${logPrefix} Deployment completed.`);
} catch (error) {
  console.error(`${logPrefix} Error: ${error.message}`);
  process.exit(1);
}
