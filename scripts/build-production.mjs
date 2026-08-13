#!/usr/bin/env node
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';
import {
  ARTIFACT_KINDS,
  assertBuildManifest,
  createBuildId,
  writeReleaseArtifacts,
} from './deploymentArtifacts.mjs';
import {
  BuildLifecycleError,
  createBuildStaging,
  markBuildStagingFailed,
  promoteValidatedBuild,
} from './buildLifecycle.mjs';

export const SITE_BUILD_MODES = Object.freeze({
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

const assertNoOutputDirectoryOverride = (argv) => {
  const outputOverride = argv.find((argument, index) => (
    argument === '--outDir'
    || argument === '-o'
    || argument.startsWith('--outDir=')
    || (index > 0 && (argv[index - 1] === '--outDir' || argv[index - 1] === '-o'))
  ));
  if (outputOverride) {
    throw new Error('Production builds manage Vite output internally; --outDir/-o is not allowed.');
  }
};

export function runProductionBuild({
  cwd = projectRoot,
  argv = process.argv.slice(2),
  buildMode = SITE_BUILD_MODES.UNIVERSAL,
  spawn = spawnSync,
  buildId = createBuildId(),
} = {}) {
  if (buildMode !== SITE_BUILD_MODES.UNIVERSAL) {
    throw new Error('scripts/build-production.mjs is reserved for the isolated Universal Release Manager build. Use npm run build for Legacy.');
  }
  assertNoOutputDirectoryOverride(argv);

  const config = null;
  const env = buildUniversalProductionEnvironment();
  const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');
  const viteMode = 'universal-production';
  const staging = createBuildStaging({ projectRoot: cwd, buildMode, buildId });
  const canonicalDist = path.resolve(cwd, 'dist-universal');
  let phase = 'vite-build';
  try {
    const result = spawn(process.execPath, [viteBin, 'build', '--mode', viteMode, '--outDir', staging.distRoot, ...argv], {
      cwd,
      env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const viteError = new Error(`Vite ${buildMode} production build failed with exit code ${result.status ?? 1}.`);
      viteError.code = `VITE_BUILD_EXIT_${result.status ?? 1}`;
      throw viteError;
    }

    phase = 'generate-manifest';
    const artifacts = writeReleaseArtifacts(staging.distRoot, { buildId });
    const expectedKind = ARTIFACT_KINDS.UNIVERSAL;

    phase = 'validate-staging';
    assertBuildManifest(staging.distRoot, { artifactKind: expectedKind, buildMode });

    phase = 'promote-canonical-dist';
    const promotion = promoteValidatedBuild({
      staging,
      canonicalDist,
      validateStaging: (distRoot) => assertBuildManifest(distRoot, { artifactKind: expectedKind, buildMode }),
      validateCanonical: (distRoot) => assertBuildManifest(distRoot, { artifactKind: expectedKind, buildMode }),
    });
    console.log(`[build-production] promoted ${buildMode} build ${buildId} to ${canonicalDist}.`);
    if (promotion.cleanupWarnings.length) {
      console.warn(`[build-production] ${promotion.cleanupWarnings.length} stale asset cleanup warning(s); the promoted build remains valid.`);
    }
    console.log(`[build-production] generated ${buildMode} release manifest (${artifacts.manifest.files.length} files, buildId=${buildId}).`);
    return { config, buildMode, buildId, staging, promotion, artifacts };
  } catch (error) {
    const failure = markBuildStagingFailed(staging, error, { phase, canonicalDist });
    const details = error instanceof BuildLifecycleError ? error.details : {};
    console.error(`[build-production] ${buildMode} build ${buildId} failed during ${phase}. Canonical dist modified=${details.canonicalModified === true}. Previous known-good=${details.previousArtifactPath || canonicalDist}. Failed staging=${failure.stagingDist || staging.stagingRoot}.`);
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const universal = argv.includes('--universal');
  try {
    if (!universal) throw new Error('Universal build requires --universal. Use npm run build for Legacy.');
    runProductionBuild({ buildMode: SITE_BUILD_MODES.UNIVERSAL, argv: argv.filter((argument) => argument !== '--universal') });
  } catch (error) {
    console.error(`[build-production] ${error.message}`);
    process.exit(1);
  }
}
