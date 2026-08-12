import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARTIFACT_KINDS,
  assertBuildManifest,
  readBuildManifest,
  writeLegacyBuildArtifacts,
  writeReleaseArtifacts,
} from './deploymentArtifacts.mjs';
import {
  BuildLifecycleError,
  createBuildStaging,
  promoteValidatedBuild,
} from './buildLifecycle.mjs';
import { SITE_BUILD_MODES, runProductionBuild } from './build-production.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-build-lifecycle-'));
  roots.push(root);
  return root;
};

const writeBuild = (distRoot, label) => {
  fs.mkdirSync(path.join(distRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distRoot, 'index.html'), `<link rel="stylesheet" href="./assets/index-${label}.css"><script type="module" src="./assets/index-${label}.js"></script>`);
  fs.writeFileSync(path.join(distRoot, 'assets', `index-${label}.js`), `console.log('${label}')`);
  fs.writeFileSync(path.join(distRoot, 'assets', `index-${label}.css`), `body{--build:${label}}`);
};

const writeManifest = (distRoot, buildMode, buildId) => (
  buildMode === 'universal'
    ? writeReleaseArtifacts(distRoot, { buildId })
    : writeLegacyBuildArtifacts(distRoot, { buildId })
);

const artifactKindFor = (buildMode) => (
  buildMode === 'universal' ? ARTIFACT_KINDS.UNIVERSAL : ARTIFACT_KINDS.LEGACY
);

const createBuildPair = (buildMode = 'legacy') => {
  const root = makeRoot();
  const canonical = path.join(root, 'dist');
  writeBuild(canonical, 'A');
  writeManifest(canonical, buildMode, 'build-a');
  const staging = createBuildStaging({ projectRoot: root, buildMode, buildId: 'build-b' });
  writeBuild(staging.distRoot, 'B');
  writeManifest(staging.distRoot, buildMode, 'build-b');
  const validate = (dist) => assertBuildManifest(dist, { artifactKind: artifactKindFor(buildMode), buildMode });
  return { root, canonical, staging, validate };
};

describe('atomic production build lifecycle', () => {
  it.each(['legacy', 'universal'])('retains canonical Build A when a %s staging build fails with EPERM, then promotes Build C', (buildMode) => {
    const root = makeRoot();
    const canonical = path.join(root, 'dist');
    writeBuild(canonical, 'A');
    writeManifest(canonical, buildMode, 'build-a');
    const beforeFailure = fs.readFileSync(path.join(canonical, 'index.html'), 'utf8');

    expect(() => runProductionBuild({
      cwd: root,
      buildMode,
      buildId: 'build-b',
      spawn: () => ({ error: Object.assign(new Error('locked by antivirus'), { code: 'EPERM' }), status: 1 }),
    })).toThrow('locked by antivirus');

    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toBe(beforeFailure);
    expect(readBuildManifest(canonical).buildId).toBe('build-a');
    expect(fs.existsSync(path.join(root, '.tmp-build', buildMode, 'build-b', 'build-failure.json'))).toBe(true);

    const success = runProductionBuild({
      cwd: root,
      buildMode,
      buildId: 'build-c',
      spawn: (_command, args) => {
        const output = args[args.indexOf('--outDir') + 1];
        writeBuild(output, 'C');
        return { status: 0 };
      },
    });
    expect(success.buildId).toBe('build-c');
    expect(assertBuildManifest(canonical, { artifactKind: artifactKindFor(buildMode), buildMode }).buildId).toBe('build-c');
    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toContain('index-C');
  });

  it.each(['legacy', 'universal'])('does not require a canonical-directory rename when a %s build promotes', (buildMode) => {
    const { canonical, staging, validate } = createBuildPair(buildMode);
    const renameCalls = [];
    const originalRename = fs.renameSync;
    const result = promoteValidatedBuild({
      staging,
      canonicalDist: canonical,
      validateStaging: validate,
      validateCanonical: validate,
      fileOps: {
        renameSync(sourcePath, targetPath) {
          renameCalls.push([sourcePath, targetPath]);
          // This reproduces the real Windows failure only for a whole dist swap.
          if (sourcePath === staging.distRoot || targetPath === canonical) {
            throw Object.assign(new Error('locked canonical directory'), { code: 'EPERM' });
          }
          return originalRename(sourcePath, targetPath);
        },
      },
    });

    expect(result.indexCommitted).toBe(true);
    expect(readBuildManifest(canonical).buildId).toBe('build-b');
    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toContain('index-B');
    expect(renameCalls).toEqual([[path.join(canonical, '.index.html.build-b.next'), path.join(canonical, 'index.html')]]);
  });

  it('keeps Build A active when copying a Build B dependency fails', () => {
    const { canonical, staging, validate } = createBuildPair();
    const beforeIndex = fs.readFileSync(path.join(canonical, 'index.html'), 'utf8');
    const sourceJs = path.join(staging.distRoot, 'assets', 'index-B.js');
    const targetJs = path.join(canonical, 'assets', 'index-B.js');

    expect(() => promoteValidatedBuild({
      staging,
      canonicalDist: canonical,
      validateStaging: validate,
      validateCanonical: validate,
      retries: 1,
      logger: () => {},
      fileOps: {
        copyFileSync(sourcePath, targetPath) {
          if (sourcePath === sourceJs && targetPath === targetJs) {
            throw Object.assign(new Error('locked Build B JavaScript'), { code: 'EPERM' });
          }
          return fs.copyFileSync(sourcePath, targetPath);
        },
      },
    })).toThrow('copy-canonical-file');

    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toBe(beforeIndex);
    expect(readBuildManifest(canonical).buildId).toBe('build-a');
    expect(fs.existsSync(path.join(staging.distRoot, 'index.html'))).toBe(true);
  });

  it('keeps Build A index active when the canonical index is locked after every retry', () => {
    const { canonical, staging, validate } = createBuildPair();
    const beforeIndex = fs.readFileSync(path.join(canonical, 'index.html'), 'utf8');
    const expectedTempIndex = path.join(canonical, '.index.html.build-b.next');
    const retryLogs = [];
    let thrown;
    try {
      promoteValidatedBuild({
        staging,
        canonicalDist: canonical,
        validateStaging: validate,
        validateCanonical: validate,
        retries: 1,
        logger: (message) => retryLogs.push(message),
        fileOps: {
          renameSync(sourcePath, targetPath) {
            if (sourcePath === expectedTempIndex && targetPath === path.join(canonical, 'index.html')) {
              throw Object.assign(new Error('index.html is locked'), { code: 'EPERM' });
            }
            return fs.renameSync(sourcePath, targetPath);
          },
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildLifecycleError);
    expect(thrown.message).toContain('replace-canonical-index');
    expect(thrown.details).toMatchObject({
      operation: 'replace-canonical-index',
      targetPath: path.join(canonical, 'index.html'),
      osErrorCode: 'EPERM',
      retryCount: 1,
      canonicalModified: true,
      failedStagingPath: staging.distRoot,
    });
    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toBe(beforeIndex);
    expect(fs.existsSync(expectedTempIndex)).toBe(true);
    expect(fs.existsSync(path.join(staging.distRoot, 'index.html'))).toBe(true);
    expect(retryLogs.join('\n')).toContain('"operation":"replace-canonical-index"');
    expect(retryLogs.join('\n')).toContain(`"targetPath":"${path.join(canonical, 'index.html')}"`);
    expect(retryLogs.join('\n')).toContain('"osErrorCode":"EPERM"');
  });

  it('restores the prior small index backup if post-commit verification fails', () => {
    const { canonical, staging, validate } = createBuildPair();
    const beforeIndex = fs.readFileSync(path.join(canonical, 'index.html'), 'utf8');
    let thrown;
    try {
      promoteValidatedBuild({
        staging,
        canonicalDist: canonical,
        validateStaging: validate,
        validateCanonical: (distRoot) => {
          validate(distRoot);
          throw new Error('simulated post-commit verification failure');
        },
        logger: () => {},
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BuildLifecycleError);
    expect(thrown.details).toMatchObject({ indexCommitted: false, rollbackSucceeded: true, recoveryErrors: [] });
    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toBe(beforeIndex);
    expect(fs.existsSync(path.join(staging.stagingRoot, 'previous-canonical-index.html'))).toBe(true);
  });

  it('commits Build B index only after all verified dependencies and cleans stale assets best-effort', () => {
    const { canonical, staging, validate } = createBuildPair();
    const warnings = [];
    const staleAsset = path.join(canonical, 'assets', 'index-A.js');
    const result = promoteValidatedBuild({
      staging,
      canonicalDist: canonical,
      validateStaging: validate,
      validateCanonical: validate,
      retries: 1,
      logger: (message) => warnings.push(message),
      fileOps: {
        rmSync(targetPath, options) {
          if (targetPath === staleAsset) {
            throw Object.assign(new Error('stale file is open'), { code: 'EPERM' });
          }
          return fs.rmSync(targetPath, options);
        },
      },
    });

    expect(result).toMatchObject({ buildId: 'build-b', indexCommitted: true });
    expect(result.copiedFiles.slice(-2)).toEqual(['sharepoint-deploy-manifest.json', 'index.html']);
    expect(result.cleanupWarnings).toHaveLength(1);
    expect(result.cleanupWarnings[0]).toMatchObject({ operation: 'cleanup-stale-asset', targetPath: staleAsset, osErrorCode: 'EPERM' });
    expect(warnings.join('\n')).toContain(staleAsset);
    expect(fs.readFileSync(path.join(canonical, 'index.html'), 'utf8')).toContain('index-B');
    expect(assertBuildManifest(canonical, { artifactKind: ARTIFACT_KINDS.LEGACY, buildMode: 'legacy' }).buildId).toBe('build-b');
    expect(fs.existsSync(staleAsset)).toBe(true);
  });

  it('refuses a caller-supplied Vite output directory so staging cannot be bypassed', () => {
    const root = makeRoot();
    expect(() => runProductionBuild({
      cwd: root,
      buildMode: SITE_BUILD_MODES.UNIVERSAL,
      argv: ['--outDir', 'dist'],
    })).toThrow('--outDir/-o is not allowed');
  });
});
