// scripts/postbuild.js
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { parseCliArgs, resolveConfig } from './sp-env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const cli = parseCliArgs();
const envPath = cli.env ? path.resolve(process.cwd(), String(cli.env)) : path.resolve(projectRoot, '.env.production');
const config = resolveConfig({ envFilePath: envPath, cli });
const strictDeploy =
  String(process.env.VITE_AUTO_DEPLOY_STRICT || config.envFromFile?.VITE_AUTO_DEPLOY_STRICT || '').toLowerCase() === 'true';

const autoDeployEnabled = String(config.autoDeploy || '').toLowerCase() === 'true';
if (!autoDeployEnabled) {
  console.log('[postbuild] VITE_AUTO_DEPLOY is not true. Skipping SharePoint init/deploy.');
  process.exit(0);
}

const commands = [
  `node "${path.resolve(projectRoot, 'scripts/init-sharepoint-site.js')}" --env "${envPath}"`,
  `node "${path.resolve(projectRoot, 'deploy.js')}" --env "${envPath}" --force`,
];

try {
  for (const command of commands) {
    console.log(`[postbuild] ${command}`);
    execSync(command, { stdio: 'inherit' });
  }
  console.log('[postbuild] SharePoint init + deploy completed.');
} catch (error) {
  if (strictDeploy) {
    console.error(`[postbuild] Failed (strict mode): ${error.message}`);
    process.exit(1);
  }

  console.warn(`[postbuild] Warning: init/deploy failed but strict mode is off. ${error.message}`);
  process.exit(0);
}
