import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { loadEnvFile, parseCliArgs, resolveConfig } from './sp-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(projectRoot, '.env.production');
const envFromFile = loadEnvFile(envPath);
const config = resolveConfig({ envFilePath: envPath, cli });
const postbuildDeployOptIn = String(
  process.env.SITE_BUILDER_POSTBUILD_DEPLOY
  || envFromFile.SITE_BUILDER_POSTBUILD_DEPLOY
  || '',
).trim().toLowerCase() === 'true';
const autoDeployEnabled = postbuildDeployOptIn && String(config.autoDeploy || '').toLowerCase() === 'true';

const printStd = (value) => {
  if (value && String(value).trim().length > 0) {
    process.stdout.write(value);
  }
};

const runNodeCommand = (scriptPath, args = []) => {
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  printStd(result.stdout || '');
  if (result.stderr && String(result.stderr).trim().length > 0) process.stderr.write(result.stderr);
  return result;
};

const parseCheckResult = (stdout) => {
  const lines = String(stdout || '').split(/\r?\n/);
  const line = lines.reverse().find((row) => row.startsWith('[init-site][result] '));
  if (!line) return null;
  const payload = line.slice('[init-site][result] '.length);
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

try {
  if (!autoDeployEnabled) {
    console.log('[postbuild] Legacy site-specific build completed; SharePoint deploy was skipped. Set SITE_BUILDER_POSTBUILD_DEPLOY=true plus VITE_AUTO_DEPLOY=true for an explicit postbuild deploy.');
    process.exit(0);
  }

  const initScript = path.resolve(projectRoot, 'scripts/init-sharepoint-site.js');
  const deployScript = path.resolve(projectRoot, 'deploy.js');

  console.log('[postbuild] Running lightweight library check...');
  const checkResult = runNodeCommand(initScript, ['--env', envPath, '--check-only']);
  const checkPayload = parseCheckResult(checkResult.stdout);

  if (checkResult.status !== 0) {
    throw new Error(`check-only failed (exit ${checkResult.status ?? 1})`);
  }
  if (!checkPayload) {
    throw new Error('check-only did not return structured result.');
  }

  const librariesReady = Boolean(checkPayload?.librariesReady);
  console.log(`[postbuild] librariesReady=${librariesReady}`);

  if (librariesReady) {
    console.log('[postbuild] final libraries detected. Running finalize + final deploy.');
    const finalizeResult = runNodeCommand(initScript, ['--env', envPath, '--finalize-existing']);
    if (finalizeResult.status !== 0) {
      throw new Error(`finalize-existing failed (exit ${finalizeResult.status ?? 1})`);
    }

    const finalDeploy = runNodeCommand(deployScript, ['--env', envPath, '--force', '--mode', 'final']);
    if (finalDeploy.status !== 0) {
      throw new Error(`final deploy failed (exit ${finalDeploy.status ?? 1})`);
    }

    console.log('[postbuild] SharePoint final deploy completed.');
    console.log(`[postbuild] Final app URL: https://${config.host}${config.distRel}/index.html`);
    process.exit(0);
  }

  console.log('[postbuild] Document Libraries are missing. Switching to bootstrap deploy mode.');
  const bootstrapInit = runNodeCommand(initScript, ['--env', envPath, '--bootstrap-mode']);
  if (bootstrapInit.status !== 0) {
    throw new Error(`bootstrap-mode init failed (exit ${bootstrapInit.status ?? 1})`);
  }

  const bootstrapDeploy = runNodeCommand(deployScript, ['--env', envPath, '--force', '--mode', 'bootstrap']);
  if (bootstrapDeploy.status !== 0) {
    throw new Error(`bootstrap deploy failed (exit ${bootstrapDeploy.status ?? 1})`);
  }

  const setupUrl = `https://${config.host}${config.bootstrapDistRel}/index.html#/admin/sharepoint-setup`;
  console.log('[postbuild] Document Libraries are missing. Open this setup URL as a SharePoint site owner/admin to complete provisioning.');
  console.log(`[postbuild] Setup URL: ${setupUrl}`);
  process.exit(0);
} catch (error) {
  console.error(`[postbuild] Failed: ${error.message}`);
  process.exit(1);
}
