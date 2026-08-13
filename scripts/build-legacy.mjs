#!/usr/bin/env node
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import { resolveConfig } from './sp-env.js';
import { LEGACY_MANIFEST_FILE, writeLegacyDeployManifest } from './legacyDeploymentArtifacts.mjs';
import { logLegacyFailure, logLegacyStage } from './legacyPipelineDiagnostics.mjs';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

export function buildLegacyProductionEnvironment(config, baseEnvironment = process.env) {
  const storageBackend = String(config.storageBackend || 'txt').trim();
  if (!['txt', 'mongo'].includes(storageBackend)) throw new Error(`Invalid Legacy storage backend "${storageBackend}".`);
  if (storageBackend === 'mongo' && (!config.backendApiUrl || !config.siteId)) {
    throw new Error('Legacy Mongo build requires VITE_BACKEND_API_URL and VITE_SITE_ID.');
  }
  return {
    ...baseEnvironment,
    NODE_ENV: 'production',
    VITE_SITE_BUILD_MODE: 'legacy',
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
  };
}

export function runLegacyBuild({ cwd = projectRoot, argv = process.argv.slice(2), spawn = spawnSync, config: suppliedConfig } = {}) {
  if (argv.some((argument) => argument === '--outDir' || argument === '-o' || argument.startsWith('--outDir='))) {
    throw new Error('Legacy build owns canonical output dist; --outDir/-o is not allowed.');
  }
  const config = suppliedConfig || resolveConfig({ envFilePath: path.resolve(cwd, '.env.production') });
  const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const result = spawn(process.execPath, [viteBin, 'build', '--mode', 'production', ...argv], {
    cwd,
    env: buildLegacyProductionEnvironment(config),
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Legacy Vite build failed with exit code ${result.status ?? 1}.`);
  const distRoot = path.resolve(cwd, 'dist');
  const manifest = writeLegacyDeployManifest(distRoot);
  const manifestPath = path.join(distRoot, LEGACY_MANIFEST_FILE);
  logLegacyStage('LEGACY_BUILD', 'SUCCESS', { localDist: distRoot, buildId: manifest.buildId, fileCount: manifest.fileCount, manifestPath });
  console.log(`LOCAL DIST: ${distRoot}`);
  console.log(`BUILD ID: ${manifest.buildId}`);
  console.log(`FILE COUNT: ${manifest.fileCount}`);
  console.log(`MANIFEST PATH: ${manifestPath}`);
  return { buildMode: 'legacy', distRoot, config, manifest, manifestPath };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    runLegacyBuild();
  } catch (error) {
    logLegacyFailure({ boundary: 'LEGACY_BUILD', operation: 'vite-build-and-manifest', source: projectRoot, target: path.resolve(projectRoot, 'dist'), nextAction: 'Fix the local Legacy build error, then rerun npm run build.' });
    console.error(`[build-legacy] ${error.message}`);
    process.exit(1);
  }
}
