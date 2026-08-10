#!/usr/bin/env node
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { assertProductionBuildConfig, writeReleaseArtifacts } from './deploymentArtifacts.mjs';
import { resolveConfig } from './sp-env.js';

export const SITE_BUILD_MODES = Object.freeze({
  LEGACY: 'legacy',
  UNIVERSAL: 'universal',
});

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

const SITE_IDENTITY_ENV_KEYS = Object.freeze([
  'VITE_SP_HOST',
  'VITE_SP_SITE_CODE',
  'VITE_SP_SITE_DB_FOLDER',
  'VITE_SP_USERS_DB_FOLDER',
  'VITE_SP_SITE_ASSETS_FOLDER',
  'VITE_SP_IMAGES_FOLDER',
  'VITE_SP_WIDGETS_DB_TARGET',
  'VITE_SP_SITE_API_ROOT',
  'VITE_SP_BOOTSTRAP_LIBRARY',
  'VITE_SP_BOOTSTRAP_FOLDER',
  'VITE_SITE_BASE_URL',
  'VITE_STORAGE_BACKEND',
  'VITE_BACKEND_API_URL',
  'VITE_SITE_ID',
]);

const emptySiteIdentityEnvironment = () => Object.fromEntries(SITE_IDENTITY_ENV_KEYS.map((key) => [key, '']));

/** Legacy dist intentionally contains one site's immutable SharePoint identity. */
export function buildLegacyProductionEnvironment(config, baseEnvironment = process.env) {
  const storageBackend = assertProductionBuildConfig(config);
  return {
    ...baseEnvironment,
    NODE_ENV: 'production',
    VITE_SITE_BUILD_MODE: SITE_BUILD_MODES.LEGACY,
    VITE_SP_HOST: String(config.host || ''),
    VITE_SP_SITE_CODE: String(config.siteCode || ''),
    VITE_SP_SITE_DB_FOLDER: String(config.siteDbFolder || ''),
    VITE_SP_USERS_DB_FOLDER: String(config.usersDbFolder || ''),
    VITE_SP_SITE_ASSETS_FOLDER: String(config.siteAssetsFolder || ''),
    VITE_SP_IMAGES_FOLDER: String(config.imagesFolder || ''),
    VITE_SP_WIDGETS_DB_TARGET: String(config.widgetsDbTarget || ''),
    VITE_SP_SITE_API_ROOT: String(config.siteApiRootRel || ''),
    VITE_SP_BOOTSTRAP_LIBRARY: String(config.bootstrapLibrary || ''),
    VITE_SP_BOOTSTRAP_FOLDER: String(config.bootstrapFolder || ''),
    VITE_SITE_BASE_URL: String(config.siteBaseUrl || ''),
    VITE_STORAGE_BACKEND: storageBackend,
    VITE_BACKEND_API_URL: String(config.backendApiUrl || ''),
    VITE_SITE_ID: String(config.siteId || config.siteCode || ''),
    VITE_SITE_BUILDER_API_KEY: '',
    VITE_SITE_BUILDER_DEV_API_KEY: '',
    VITE_ADMIN_API_KEY: '',
    VITE_AUTO_DEPLOY: 'false',
  };
}

/** Universal dist deliberately has no deploy-target identity. */
export function buildUniversalProductionEnvironment(baseEnvironment = process.env) {
  return {
    ...baseEnvironment,
    NODE_ENV: 'production',
    VITE_SITE_BUILD_MODE: SITE_BUILD_MODES.UNIVERSAL,
    ...emptySiteIdentityEnvironment(),
    VITE_SITE_BUILDER_API_KEY: '',
    VITE_SITE_BUILDER_DEV_API_KEY: '',
    VITE_ADMIN_API_KEY: '',
    VITE_AUTO_DEPLOY: 'false',
  };
}

// Retained for callers that used the old helper: default production builds are legacy builds.
export const buildProductionEnvironment = buildLegacyProductionEnvironment;

export function runProductionBuild({
  cwd = projectRoot,
  argv = process.argv.slice(2),
  buildMode = SITE_BUILD_MODES.LEGACY,
} = {}) {
  if (!Object.values(SITE_BUILD_MODES).includes(buildMode)) {
    throw new Error(`Unsupported Site Builder production build mode "${buildMode}".`);
  }

  const envFilePath = path.resolve(cwd, '.env.production');
  const config = buildMode === SITE_BUILD_MODES.LEGACY
    ? resolveConfig({ envFilePath })
    : null;
  const env = buildMode === SITE_BUILD_MODES.LEGACY
    ? buildLegacyProductionEnvironment(config)
    : buildUniversalProductionEnvironment();
  const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteMode = buildMode === SITE_BUILD_MODES.LEGACY ? 'production' : 'universal-production';
  const result = spawnSync(process.execPath, [viteBin, 'build', '--mode', viteMode, ...argv], {
    cwd,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Vite ${buildMode} production build failed with exit code ${result.status ?? 1}.`);

  if (buildMode === SITE_BUILD_MODES.UNIVERSAL) {
    const artifacts = writeReleaseArtifacts(path.resolve(cwd, 'dist'));
    console.log(`[build-production] generated universal release manifest (${artifacts.manifest.files.length} files).`);
  }
  return { config, buildMode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const universal = argv.includes('--universal');
  try {
    runProductionBuild({
      buildMode: universal ? SITE_BUILD_MODES.UNIVERSAL : SITE_BUILD_MODES.LEGACY,
      argv: argv.filter((argument) => argument !== '--universal'),
    });
  } catch (error) {
    console.error(`[build-production] ${error.message}`);
    process.exit(1);
  }
}
