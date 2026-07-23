#!/usr/bin/env node
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { assertProductionBuildConfig } from './deploymentArtifacts.mjs';
import { resolveConfig } from './sp-env.js';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

export function buildProductionEnvironment(config, baseEnvironment = process.env) {
  const storageBackend = assertProductionBuildConfig(config);
  return {
    ...baseEnvironment,
    NODE_ENV: 'production',
    VITE_STORAGE_BACKEND: storageBackend,
    VITE_BACKEND_API_URL: String(config.backendApiUrl || ''),
    VITE_FILE_EXPLORER_API_URL: String(config.fileExplorerApiUrl || ''),
    VITE_SITE_ID: String(config.siteId || config.siteCode || ''),
    VITE_SITE_BUILDER_API_KEY: '',
    VITE_SITE_BUILDER_DEV_API_KEY: '',
    VITE_ADMIN_API_KEY: '',
    VITE_LOCAL_FILE_BRIDGE: 'false',
    VITE_AUTO_DEPLOY: 'false',
  };
}

export function runProductionBuild({ cwd = projectRoot, argv = process.argv.slice(2) } = {}) {
  const envFilePath = path.resolve(cwd, '.env.production');
  const config = resolveConfig({ envFilePath, environment: {} });
  const env = buildProductionEnvironment(config);
  const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const result = spawnSync(process.execPath, [viteBin, 'build', ...argv], {
    cwd,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Vite production build failed with exit code ${result.status ?? 1}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runProductionBuild();
  } catch (error) {
    console.error(`[build-production] ${error.message}`);
    process.exit(1);
  }
}
