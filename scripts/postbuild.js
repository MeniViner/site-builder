import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { parseCliArgs, resolveConfig } from './sp-env.js';
import { assertLegacyDeployableDist } from './legacyDeploymentArtifacts.mjs';
import { createLegacyDeploymentPlan } from './legacyPipelinePlan.mjs';
import { logLegacyFailure, logLegacyStage } from './legacyPipelineDiagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');
const distRoot = path.resolve(projectRoot, 'dist');
const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(projectRoot, '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });

const summary = {
  build: 'SUCCESS',
  libraries: 'UNKNOWN',
  deployMode: 'NONE',
  localDist: distRoot,
  target: 'n/a',
  setupUrl: 'n/a',
  failureBoundary: 'n/a',
};

const printSummary = () => {
  console.log(`LEGACY_BUILD: ${summary.build}`);
  console.log(`LIBRARIES: ${summary.libraries}`);
  console.log(`DEPLOY MODE: ${summary.deployMode}`);
  console.log(`LOCAL DIST: ${summary.localDist}`);
  console.log(`SHAREPOINT TARGET: ${summary.target}`);
  console.log(`SETUP URL: ${summary.setupUrl}`);
  if (summary.failureBoundary !== 'n/a') console.log(`FAILURE BOUNDARY: ${summary.failureBoundary}`);
};

const printStd = (value) => {
  if (value && String(value).trim()) process.stdout.write(value);
};

const runNodeCommand = (scriptPath, args = []) => {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd: projectRoot, encoding: 'utf8' });
  printStd(result.stdout || '');
  if (result.stderr && String(result.stderr).trim()) process.stderr.write(result.stderr);
  return result;
};

const parseCheckResult = (stdout) => {
  const line = String(stdout || '').split(/\r?\n/).reverse().find((row) => row.startsWith('[init-site][result] '));
  if (!line) return null;
  try { return JSON.parse(line.slice('[init-site][result] '.length)); } catch { return null; }
};

const isBootstrapVerificationFailure = (result) => (
  `${result?.stdout || ''}\n${result?.stderr || ''}`.includes('WEBDAV_BOOTSTRAP_VERIFICATION_FAILED')
);

try {
  const manifest = assertLegacyDeployableDist(distRoot);
  console.log(`[postbuild] Legacy manifest accepted (${manifest.fileCount} files, buildId=${manifest.buildId}).`);

  if (String(config.autoDeploy || '').toLowerCase() !== 'true') {
    summary.libraries = 'NOT CHECKED';
    console.log('[postbuild] VITE_AUTO_DEPLOY is not true. Legacy SharePoint deployment skipped.');
    printSummary();
    process.exit(0);
  }

  const initScript = path.resolve(projectRoot, 'scripts/init-sharepoint-site.js');
  const deployScript = path.resolve(projectRoot, 'scripts/deploy-legacy.mjs');
  summary.failureBoundary = 'LIBRARY_CHECK';
  const checkResult = runNodeCommand(initScript, ['--env', envPath, '--check-only']);
  const checkPayload = parseCheckResult(checkResult.stdout);
  if (checkResult.status !== 0) throw new Error(`check-only failed (exit ${checkResult.status ?? 1})`);
  if (!checkPayload) throw new Error('check-only did not return structured result.');

  const librariesReady = Boolean(checkPayload.librariesReady);
  const deploymentPlan = createLegacyDeploymentPlan(config, librariesReady);
  summary.libraries = librariesReady ? 'READY' : 'MISSING';
  summary.deployMode = deploymentPlan.deployMode.toUpperCase();
  summary.target = deploymentPlan.targetDir;
  console.log(`[postbuild] librariesReady=${librariesReady}`);
  logLegacyStage('LIBRARY_CHECK', 'SUCCESS', {
    siteDb: checkPayload.siteDb?.rel,
    siteDbExists: checkPayload.siteDb?.exists,
    usersDb: checkPayload.usersDb?.rel,
    usersDbExists: checkPayload.usersDb?.exists,
    deployMode: deploymentPlan.deployMode.toUpperCase(),
    buildId: manifest.buildId,
  });

  if (librariesReady) {
    const finalizeResult = runNodeCommand(initScript, ['--env', envPath, '--finalize-existing']);
    if (finalizeResult.status !== 0) throw new Error(`finalize-existing failed (exit ${finalizeResult.status ?? 1})`);
    logLegacyStage('CREATE_FOLDERS', 'SUCCESS', { target: config.distRel, buildId: manifest.buildId });
    logLegacyStage('CREATE_TXT_SEEDS', 'SUCCESS', { target: config.siteAssetsRel, buildId: manifest.buildId });
    summary.failureBoundary = 'FINAL_UPLOAD';
    const finalDeploy = runNodeCommand(deployScript, ['--env', envPath, '--force', '--mode', 'final']);
    if (finalDeploy.status !== 0) throw new Error(`final deploy failed (exit ${finalDeploy.status ?? 1})`);
    summary.failureBoundary = 'n/a';
    printSummary();
    process.exit(0);
  }

  const bootstrapInit = runNodeCommand(initScript, ['--env', envPath, '--bootstrap-mode']);
  if (bootstrapInit.status !== 0) throw new Error(`bootstrap-mode init failed (exit ${bootstrapInit.status ?? 1})`);
  summary.failureBoundary = 'BOOTSTRAP_UPLOAD';
  const bootstrapDeploy = runNodeCommand(deployScript, ['--env', envPath, '--force', '--mode', 'bootstrap']);
  if (bootstrapDeploy.status !== 0) {
    if (isBootstrapVerificationFailure(bootstrapDeploy)) summary.failureBoundary = 'BOOTSTRAP_VERIFY';
    throw new Error(`bootstrap deploy failed (exit ${bootstrapDeploy.status ?? 1})`);
  }

  summary.setupUrl = deploymentPlan.setupUrl;
  summary.failureBoundary = 'n/a';
  console.log(`[postbuild] Setup URL: ${summary.setupUrl}`);
  printSummary();
  process.exit(0);
} catch (error) {
  logLegacyFailure({ boundary: summary.failureBoundary, operation: 'postbuild-stage', buildId: (() => { try { return assertLegacyDeployableDist(distRoot).buildId; } catch { return ''; } })(), nextAction: 'Use the first normalized failure above to correct or retry only that stage.' });
  console.error(`[postbuild] Failed: ${error.message}`);
  printSummary();
  process.exit(1);
}
