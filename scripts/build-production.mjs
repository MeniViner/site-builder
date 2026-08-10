#!/usr/bin/env node
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

export function buildProductionEnvironment(_legacyConfig = {}, baseEnvironment = undefined) {
  void _legacyConfig;
  const sourceEnvironment = baseEnvironment || (arguments.length > 1 ? {} : process.env);
  return {
    ...sourceEnvironment,
    NODE_ENV: 'production',
    // These are runtime configuration fields in production. Keeping them empty
    // makes accidental build-time reads visible without tying dist to a site.
    VITE_STORAGE_BACKEND: '',
    VITE_BACKEND_API_URL: '',
    VITE_SITE_ID: '',
    VITE_SITE_BASE_URL: '',
    VITE_SP_HOST: '',
    VITE_SP_SITE_CODE: '',
    VITE_SP_SITE_DB_FOLDER: '',
    VITE_SP_USERS_DB_FOLDER: '',
    VITE_SP_SITE_ASSETS_FOLDER: '',
    VITE_SP_IMAGES_FOLDER: '',
    VITE_SP_WIDGETS_DB_TARGET: '',
    VITE_SP_SITE_API_ROOT: '',
    VITE_SP_BOOTSTRAP_LIBRARY: '',
    VITE_SP_BOOTSTRAP_FOLDER: '',
    VITE_SITE_BUILDER_API_KEY: '',
    VITE_SITE_BUILDER_DEV_API_KEY: '',
    VITE_ADMIN_API_KEY: '',
    VITE_AUTO_DEPLOY: 'false',
  };
}

export function runProductionBuild({ cwd = projectRoot, argv = process.argv.slice(2) } = {}) {
  const env = buildProductionEnvironment();
  const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const result = spawnSync(process.execPath, [viteBin, 'build', '--mode', 'universal-production', ...argv], {
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
