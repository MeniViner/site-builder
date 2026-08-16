import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runLegacyBuild } from './build-legacy.mjs';
import { commitFinalIndex, commitIndexLast, runLegacyDeploy, runRobocopy } from './deploy-legacy.mjs';
import {
  assertLegacyManifestFilesVerified,
  readLegacyDeployManifest,
  writeLegacyDeployManifest,
} from './legacyDeploymentArtifacts.mjs';
import { createLegacyDeploymentPlan } from './legacyPipelinePlan.mjs';
import {
  createLocalBootstrapStagingTree,
  resolveBootstrapWebDavTransport,
} from './bootstrapWebDavTransport.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const makeRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-legacy-pipeline-'));
  roots.push(root);
  return root;
};

const config = (root = 'C:\\webdav', overrides = {}) => {
  const siteCode = overrides.siteCode || 'EnergyEfficiency';
  const bootstrapLibrary = overrides.bootstrapLibrary || 'SiteAssets';
  const bootstrapFolder = overrides.bootstrapFolder || 'sitebuilder-bootstrap';
  const siteRootRel = `/sites/${siteCode}`;
  const bootstrapLibraryRootRel = `${siteRootRel}/${bootstrapLibrary}`;
  return {
    host: 'portal.army.idf',
    siteCode,
    storageBackend: 'txt',
    autoDeploy: 'true',
    siteRootRel,
    bootstrapLibrary,
    bootstrapFolder,
    bootstrapLibraryRootRel,
    bootstrapDistRel: `${bootstrapLibraryRootRel}/${bootstrapFolder}/dist`,
    distRel: `${siteRootRel}/siteDB/dist`,
    fileMap: {},
    toWebDav(relativePath) { return path.join(root, ...relativePath.split('/').filter(Boolean)); },
    ...overrides,
  };
};

const writeBuild = (distRoot, label = 'A') => {
  fs.mkdirSync(path.join(distRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(distRoot, 'index.html'), `<link rel="stylesheet" href="./assets/index-${label}.css"><script type="module" src="./assets/index-${label}.js"></script>`);
  fs.writeFileSync(path.join(distRoot, 'assets', `index-${label}.css`), `body{--build:${label}}`);
  fs.writeFileSync(path.join(distRoot, 'assets', `index-${label}.js`), `console.log('${label}')`);
  writeLegacyDeployManifest(distRoot, { buildId: `build-${label.toLowerCase()}` });
};

const copyWithoutIndex = (source, destination) => {
  fs.cpSync(source, destination, {
    recursive: true,
    filter: (entry) => path.basename(entry) !== 'index.html',
  });
};

const mirrorWithoutIndex = (source, destination) => {
  const oldIndexPath = path.join(destination, 'index.html');
  const oldIndex = fs.existsSync(oldIndexPath) ? fs.readFileSync(oldIndexPath) : null;
  fs.rmSync(destination, { recursive: true, force: true });
  copyWithoutIndex(source, destination);
  if (oldIndex) fs.writeFileSync(path.join(destination, 'index.html'), oldIndex);
};

describe('Bootstrap WebDAV Boundary A transport', () => {
  it('derives the existing bootstrap library anchor separately from the deep dist target', () => {
    const root = makeRoot();
    const transport = resolveBootstrapWebDavTransport(config(root), { cwd: root, buildId: 'build-a' });
    expect(transport.bootstrapLibraryRootRel).toBe('/sites/EnergyEfficiency/SiteAssets');
    expect(transport.bootstrapAnchorDir).toBe(path.join(root, 'sites', 'EnergyEfficiency', 'SiteAssets'));
    expect(transport.bootstrapTargetDir).toBe(path.join(transport.bootstrapAnchorDir, 'sitebuilder-bootstrap', 'dist'));
  });

  it('uses a configured non-default bootstrap library as the remote anchor', () => {
    const root = makeRoot();
    const custom = config(root, { bootstrapLibrary: 'DeploymentAssets' });
    custom.bootstrapLibraryRootRel = '/sites/EnergyEfficiency/DeploymentAssets';
    custom.bootstrapDistRel = '/sites/EnergyEfficiency/DeploymentAssets/sitebuilder-bootstrap/dist';
    const transport = resolveBootstrapWebDavTransport(custom, { cwd: root, buildId: 'build-a' });
    expect(transport.bootstrapLibraryRootRel).toBe('/sites/EnergyEfficiency/DeploymentAssets');
    expect(transport.bootstrapAnchorDir).toBe(path.join(root, 'sites', 'EnergyEfficiency', 'DeploymentAssets'));
  });

  it('uses a configured non-default bootstrap folder in the local staging tree', () => {
    const root = makeRoot();
    const custom = config(root, { bootstrapFolder: 'energy-bootstrap' });
    custom.bootstrapDistRel = '/sites/EnergyEfficiency/SiteAssets/energy-bootstrap/dist';
    const transport = resolveBootstrapWebDavTransport(custom, { cwd: root, buildId: 'build-a' });
    expect(transport.stagedDistRoot).toBe(path.join(root, '.tmp-deploy', 'bootstrap', 'build-a', 'energy-bootstrap', 'dist'));
    expect(transport.bootstrapChildRel).toBe('energy-bootstrap/dist');
  });

  it('generates a clean local staging tree containing only the current Legacy dist', () => {
    const root = makeRoot();
    const source = path.join(root, 'dist');
    writeBuild(source, 'B');
    const transport = resolveBootstrapWebDavTransport(config(root), { cwd: root, buildId: 'build-b' });
    fs.mkdirSync(transport.stagedDistRoot, { recursive: true });
    fs.writeFileSync(path.join(transport.stagedDistRoot, 'stale.txt'), 'stale');

    createLocalBootstrapStagingTree({ buildDir: source, transport });

    expect(fs.existsSync(path.join(transport.stagedDistRoot, 'stale.txt'))).toBe(false);
    expect(readLegacyDeployManifest(transport.stagedDistRoot).buildId).toBe('build-b');
    expect(fs.existsSync(path.join(transport.stagedDistRoot, 'assets', 'index-B.js'))).toBe(true);
  });

  it('does not expose a Node filesystem probe as a WebDAV reachability gate', () => {
    const root = makeRoot();
    const transport = resolveBootstrapWebDavTransport(config(root), { cwd: root, buildId: 'build-a' });
    expect(transport.bootstrapAnchorDir).toBe(path.join(root, 'sites', 'EnergyEfficiency', 'SiteAssets'));
    expect(transport).not.toHaveProperty('reachable');
  });

  it('does not let a stale bootstrap build satisfy the current build manifest', () => {
    const root = makeRoot();
    const oldTarget = path.join(root, 'old-target');
    const currentSource = path.join(root, 'current-source');
    writeBuild(oldTarget, 'A');
    writeBuild(currentSource, 'B');
    const currentManifest = readLegacyDeployManifest(currentSource);
    expect(() => assertLegacyManifestFilesVerified(oldTarget, currentManifest)).toThrow('index-B');
  });

  it('rejects a copied bootstrap manifest whose build ID matches but content was altered', async () => {
    const root = makeRoot();
    const legacyDist = path.join(root, 'dist');
    const deploymentConfig = config(path.join(root, 'webdav'));
    const transport = resolveBootstrapWebDavTransport(deploymentConfig, { cwd: root, buildId: 'build-b' });
    writeBuild(legacyDist, 'B');
    fs.mkdirSync(transport.bootstrapAnchorDir, { recursive: true });
    let operation = 0;

    await expect(runLegacyDeploy({
      cwd: root,
      cli: { force: true, mode: 'bootstrap' },
      config: deploymentConfig,
      execute() {
        operation += 1;
        if (operation === 1) copyWithoutIndex(transport.stagingRoot, transport.bootstrapAnchorDir);
        if (operation === 2) {
          mirrorWithoutIndex(transport.stagedDistRoot, transport.bootstrapTargetDir);
          const manifestPath = path.join(transport.bootstrapTargetDir, 'sharepoint-deploy-manifest.json');
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          manifest.generatedAt = 'tampered-after-copy';
          fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        }
      },
    })).rejects.toThrowError(expect.objectContaining({
      code: 'WEBDAV_BOOTSTRAP_VERIFICATION_FAILED',
      message: expect.stringContaining('manifest content mismatch'),
    }));

    expect(operation).toBe(2);
    expect(fs.existsSync(path.join(transport.bootstrapTargetDir, 'index.html'))).toBe(false);
  });

  it('continues Bootstrap index commit after Robocopy 9 when the remote index independently verifies', async () => {
    const root = makeRoot();
    const legacyDist = path.join(root, 'dist');
    const deploymentConfig = config(path.join(root, 'webdav'));
    const transport = resolveBootstrapWebDavTransport(deploymentConfig, { cwd: root, buildId: 'build-b' });
    writeBuild(legacyDist, 'B');
    fs.mkdirSync(transport.bootstrapAnchorDir, { recursive: true });
    let operation = 0;

    const result = await runLegacyDeploy({
      cwd: root,
      cli: { force: true, mode: 'bootstrap' },
      config: deploymentConfig,
      execute() {
        operation += 1;
        if (operation === 1) copyWithoutIndex(transport.stagingRoot, transport.bootstrapAnchorDir);
        if (operation === 2) mirrorWithoutIndex(transport.stagedDistRoot, transport.bootstrapTargetDir);
        if (operation === 3) {
          fs.copyFileSync(path.join(transport.stagedDistRoot, 'index.html'), path.join(transport.bootstrapTargetDir, 'index.html'));
          throw Object.assign(new Error('destination scan warning'), { status: 9, stdout: '100% New File index.html', stderr: 'ERROR 2' });
        }
      },
    });

    expect(result.bootstrapIndexCommit).toMatchObject({ status: 'SUCCESS_WITH_TRANSPORT_WARNING', exitCode: 9 });
    expect(result.completeReport.verifiedFiles).toBe(result.completeReport.expectedFiles);
  });

  it.each([
    ['missing', () => {}],
    ['hash mismatch', (source, target) => fs.writeFileSync(path.join(target, 'index.html'), `stale ${path.basename(source)}`)],
  ])('fails BOOTSTRAP_INDEX_COMMIT on Robocopy 9 with %s remote index', (label, prepareTarget) => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    writeBuild(source, 'B');
    copyWithoutIndex(source, target);

    expect(() => commitIndexLast({
      buildDir: source,
      targetDir: target,
      buildManifest: readLegacyDeployManifest(source),
      stage: 'BOOTSTRAP_INDEX_COMMIT',
      boundary: 'BOOTSTRAP_INDEX_COMMIT',
      execute() {
        prepareTarget(source, target);
        throw Object.assign(new Error('destination scan warning'), { status: 9, stderr: 'ERROR 2' });
      },
    })).toThrowError(expect.objectContaining({
      legacyDetails: expect.objectContaining({ boundary: 'BOOTSTRAP_INDEX_COMMIT' }),
    }));
  });
});

describe('historical Legacy pipeline isolation', () => {
  it('uses the final route for an existing site', () => {
    const plan = createLegacyDeploymentPlan(config(), true);
    expect(plan).toMatchObject({
      librariesReady: true,
      deployMode: 'final',
      targetRel: '/sites/EnergyEfficiency/siteDB/dist',
      setupUrl: 'n/a',
    });
  });

  it('uses the exact bootstrap route and setup URL for a new site', () => {
    const plan = createLegacyDeploymentPlan(config(), false);
    expect(plan).toMatchObject({
      librariesReady: false,
      deployMode: 'bootstrap',
      targetRel: '/sites/EnergyEfficiency/SiteAssets/sitebuilder-bootstrap/dist',
      setupUrl: 'https://portal.army.idf/sites/EnergyEfficiency/SiteAssets/sitebuilder-bootstrap/dist/index.html#/admin/sharepoint-setup',
    });
  });

  it('runs the site-specific production Vite mode with no Universal output or runtime requirement', () => {
    const root = makeRoot();
    let invocation;
    const result = runLegacyBuild({
      cwd: root,
      spawn(command, args, options) {
        invocation = { command, args, options };
        writeBuild(path.join(root, 'dist'), 'A');
        return { status: 0 };
      },
    });
    expect(invocation.args).toContain('production');
    expect(invocation.args).not.toContain('universal-production');
    expect(invocation.args).not.toContain('dist-universal');
    expect(invocation.options.env.VITE_SITE_BUILD_MODE).toBe('legacy');
    expect(result.distRoot).toBe(path.join(root, 'dist'));
  });

  it('uses an independent Legacy manifest and rejects a partial Build B before index commit', () => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    writeBuild(source, 'B');
    fs.mkdirSync(path.join(target, 'assets'), { recursive: true });
    fs.copyFileSync(path.join(source, 'assets', 'index-B.js'), path.join(target, 'assets', 'index-B.js'));
    const manifest = readLegacyDeployManifest(source);

    expect(manifest).toMatchObject({
      buildMode: 'legacy',
      artifactKind: 'site-builder-legacy-frontend',
      requiresRuntimeConfig: false,
      commitFile: 'index.html',
    });
    expect(() => assertLegacyManifestFilesVerified(target, manifest, { includeEntryPoint: false })).toThrow('index-B.css');
    expect(fs.existsSync(path.join(target, 'index.html'))).toBe(false);
  });

  it('reports the Robocopy exit code and output when child creation fails', async () => {
    const root = makeRoot();
    const legacyDist = path.join(root, 'dist');
    writeBuild(legacyDist, 'A');
    const deploymentConfig = config(path.join(root, 'webdav'));
    const anchor = deploymentConfig.toWebDav(deploymentConfig.bootstrapLibraryRootRel);
    fs.mkdirSync(anchor, { recursive: true });

    let failure;
    try {
      await runLegacyDeploy({
        cwd: root,
        cli: { force: true, mode: 'bootstrap' },
        config: deploymentConfig,
        fileSystem: {
          existsSync: fs.existsSync,
          rmSync: fs.rmSync,
          mkdirSync: fs.mkdirSync,
          cpSync: fs.cpSync,
        },
        execute() {
          throw Object.assign(new Error('simulated WebDAV failure'), {
            status: 8,
            stdout: 'robocopy stdout',
            stderr: 'ERROR 53',
          });
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: 'WEBDAV_BOOTSTRAP_CHILD_COPY_FAILED',
      message: expect.stringContaining('establish-bootstrap-child-tree'),
      details: expect.objectContaining({
        buildId: 'build-a',
        source: expect.stringContaining('.tmp-deploy'),
        destination: anchor,
        exitCode: 8,
        stdout: 'robocopy stdout',
        stderr: 'ERROR 53',
      }),
    });
  });

  it('continues when a Node anchor probe is false, then copies from staged root to the existing library anchor and commits index.html last', async () => {
    const root = makeRoot();
    const legacyDist = path.join(root, 'dist');
    const webDavRoot = path.join(root, 'webdav');
    const deploymentConfig = config(webDavRoot);
    const anchor = deploymentConfig.toWebDav(deploymentConfig.bootstrapLibraryRootRel);
    const target = deploymentConfig.toWebDav(deploymentConfig.bootstrapDistRel);
    writeBuild(legacyDist, 'B');
    fs.mkdirSync(anchor, { recursive: true });
    const commands = [];
    const transport = resolveBootstrapWebDavTransport(deploymentConfig, { cwd: root, buildId: 'build-b' });

    const nodeFalseForAnchor = {
      existsSync(candidate) {
        return candidate === anchor ? false : fs.existsSync(candidate);
      },
      rmSync: fs.rmSync,
      mkdirSync: fs.mkdirSync,
      cpSync: fs.cpSync,
    };

    const result = await runLegacyDeploy({
      cwd: root,
      cli: { force: true, mode: 'bootstrap' },
      config: deploymentConfig,
      fileSystem: nodeFalseForAnchor,
      execute(command) {
        commands.push(command);
        if (commands.length === 1) {
          copyWithoutIndex(transport.stagingRoot, anchor);
          expect(fs.existsSync(path.join(target, 'index.html'))).toBe(false);
        } else if (commands.length === 2) {
          mirrorWithoutIndex(transport.stagedDistRoot, target);
          expect(readLegacyDeployManifest(target).buildId).toBe('build-b');
          expect(fs.existsSync(path.join(target, 'index.html'))).toBe(false);
        } else {
          expect(assertLegacyManifestFilesVerified(target, readLegacyDeployManifest(legacyDist), { includeEntryPoint: false }).missingFiles).toEqual([]);
          fs.copyFileSync(path.join(transport.stagedDistRoot, 'index.html'), path.join(target, 'index.html'));
        }
      },
    });

    expect(commands).toHaveLength(3);
    expect(commands[0]).toContain(`"${transport.stagingRoot}" "${anchor}" /E /XF "index.html"`);
    expect(commands[0]).not.toContain(`"${transport.stagingRoot}" "${target}"`);
    expect(commands[1]).toContain(`"${transport.stagedDistRoot}" "${target}" /MIR /XF "index.html"`);
    expect(commands[2]).toContain(`"${target}" "index.html"`);
    expect(result.completeReport.verifiedFiles).toBe(result.completeReport.expectedFiles);
    expect(fs.readFileSync(path.join(target, 'index.html'), 'utf8')).toContain('index-B');
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7])('treats Robocopy exit code %i as success', (exitCode) => {
    const execute = exitCode === 0
      ? () => undefined
      : () => { throw Object.assign(new Error('robocopy completed'), { status: exitCode }); };
    expect(runRobocopy('robocopy "source" "target"', 'test-copy', { execute })).toBe(exitCode);
  });

  it('treats Robocopy exit code 8 as a failure', () => {
    expect(() => runRobocopy('robocopy "source" "target"', 'test-copy', {
      execute() { throw Object.assign(new Error('robocopy failed'), { status: 8 }); },
    })).toThrow('exit code 8');
  });

  it.each([0, 7])('commits and normally verifies a valid final index after Robocopy exit code %i', (exitCode) => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    writeBuild(source, 'A');
    copyWithoutIndex(source, target);
    const buildManifest = readLegacyDeployManifest(source);

    const result = commitFinalIndex({
      buildDir: source,
      targetDir: target,
      buildManifest,
      execute() {
        fs.copyFileSync(path.join(source, 'index.html'), path.join(target, 'index.html'));
        if (exitCode) throw Object.assign(new Error('robocopy copied with metadata differences'), { status: exitCode });
      },
    });

    expect(result).toMatchObject({ status: 'SUCCESS', exitCode });
    expect(assertLegacyManifestFilesVerified(target, buildManifest).missingFiles).toEqual([]);
  });

  it('accepts Robocopy 9 only when the current-build remote index independently matches', () => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    writeBuild(source, 'B');
    copyWithoutIndex(source, target);
    const buildManifest = readLegacyDeployManifest(source);

    const result = commitFinalIndex({
      buildDir: source,
      targetDir: target,
      buildManifest,
      execute() {
        fs.copyFileSync(path.join(source, 'index.html'), path.join(target, 'index.html'));
        throw Object.assign(new Error('destination scan warning'), {
          status: 9,
          stdout: '100% New File index.html',
          stderr: 'ERROR 2 The system cannot find the file specified.',
        });
      },
    });

    expect(result).toMatchObject({
      status: 'SUCCESS_WITH_TRANSPORT_WARNING',
      exitCode: 9,
      verificationReport: { expectedFiles: 1, verifiedFiles: 1 },
      transportWarning: {
        source,
        target,
        buildId: 'build-b',
        output: expect.stringContaining('100% New File index.html'),
      },
    });
  });

  it('fails FINAL_INDEX_COMMIT when Robocopy 9 leaves the remote index missing', () => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    writeBuild(source, 'A');
    copyWithoutIndex(source, target);

    expect(() => commitFinalIndex({
      buildDir: source,
      targetDir: target,
      buildManifest: readLegacyDeployManifest(source),
      execute() { throw Object.assign(new Error('scan warning'), { status: 9, stderr: 'ERROR 2' }); },
    })).toThrowError(expect.objectContaining({
      message: expect.stringContaining('missingFiles'),
      legacyDetails: expect.objectContaining({ boundary: 'FINAL_INDEX_COMMIT' }),
    }));
  });

  it('fails FINAL_INDEX_COMMIT when Robocopy 9 leaves a hash-mismatched remote index', () => {
    const root = makeRoot();
    const source = path.join(root, 'source');
    const target = path.join(root, 'target');
    writeBuild(source, 'A');
    copyWithoutIndex(source, target);

    expect(() => commitFinalIndex({
      buildDir: source,
      targetDir: target,
      buildManifest: readLegacyDeployManifest(source),
      execute() {
        fs.writeFileSync(path.join(target, 'index.html'), 'stale index from a different build');
        throw Object.assign(new Error('scan warning'), { status: 9, stdout: '100% New File index.html' });
      },
    })).toThrowError(expect.objectContaining({
      message: expect.stringContaining('mismatchedFiles'),
      legacyDetails: expect.objectContaining({ boundary: 'FINAL_INDEX_COMMIT' }),
    }));
  });

  it('continues through FINAL_INDEX_VERIFY and smoke before COMPLETE after a verified warning', async () => {
    const root = makeRoot();
    const legacyDist = path.join(root, 'dist');
    const deploymentConfig = config(path.join(root, 'webdav'));
    const target = deploymentConfig.toWebDav(deploymentConfig.distRel);
    writeBuild(legacyDist, 'B');
    const logs = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));
    let operation = 0;

    const result = await runLegacyDeploy({
      cwd: root,
      cli: { force: true, mode: 'final' },
      config: deploymentConfig,
      execute() {
        operation += 1;
        if (operation === 1) copyWithoutIndex(legacyDist, target);
        if (operation === 2) {
          fs.copyFileSync(path.join(legacyDist, 'index.html'), path.join(target, 'index.html'));
          throw Object.assign(new Error('destination scan warning'), { status: 9, stdout: '100% New File index.html' });
        }
      },
    });
    logSpy.mockRestore();

    expect(result.indexCommit.status).toBe('SUCCESS_WITH_TRANSPORT_WARNING');
    expect(result.completeReport.verifiedFiles).toBe(result.completeReport.expectedFiles);
    const verifyIndex = logs.findIndex((line) => line.includes('FINAL_INDEX_VERIFY: SUCCESS'));
    const smokeIndex = logs.findIndex((line) => line.includes('FINAL_APP_SMOKE: STATIC PASS'));
    const completeIndex = logs.findIndex((line) => line.includes('LEGACY PIPELINE: COMPLETE'));
    expect(verifyIndex).toBeGreaterThan(-1);
    expect(smokeIndex).toBeGreaterThan(verifyIndex);
    expect(completeIndex).toBeGreaterThan(smokeIndex);
  });

  it('keeps package commands and canonical output directories hard-separated', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(packageJson.scripts.build).toBe('node scripts/build-legacy.mjs');
    expect(packageJson.scripts['build:universal']).toContain('scripts/build-production.mjs --universal');
    expect(packageJson.scripts['verify:universal-dist']).toContain('dist-universal');
    expect(packageJson.scripts.deploy).toBe('node scripts/deploy-legacy.mjs --force');
  });
});
