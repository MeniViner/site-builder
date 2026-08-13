import fs from 'fs';
import path from 'path';

const safeLocalSegment = (value, label) => {
  const segment = String(value || '').trim();
  if (!segment || segment === '.' || segment === '..' || /[\\/]/.test(segment)) {
    throw new Error(`Invalid ${label} path segment "${segment || '(empty)'}".`);
  }
  return segment;
};

export class BootstrapWebDavError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'BootstrapWebDavError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export function resolveBootstrapWebDavTransport(config, { cwd = process.cwd(), buildId } = {}) {
  const bootstrapLibraryRootRel = config.bootstrapLibraryRootRel
    || `${config.siteRootRel}/${config.bootstrapLibrary}`;
  const bootstrapChildRel = `${config.bootstrapFolder}/dist`;
  const localBuildId = safeLocalSegment(buildId, 'Legacy build ID');
  const localBootstrapFolder = safeLocalSegment(config.bootstrapFolder, 'bootstrap folder');
  const stagingRoot = path.resolve(cwd, '.tmp-deploy', 'bootstrap', localBuildId);
  const stagedDistRoot = path.join(stagingRoot, localBootstrapFolder, 'dist');

  return Object.freeze({
    host: config.host,
    siteCode: config.siteCode,
    bootstrapLibrary: config.bootstrapLibrary,
    bootstrapFolder: config.bootstrapFolder,
    bootstrapLibraryRootRel,
    bootstrapAnchorDir: config.toWebDav(bootstrapLibraryRootRel),
    bootstrapChildRel,
    bootstrapTargetRel: config.bootstrapDistRel,
    bootstrapTargetDir: config.toWebDav(config.bootstrapDistRel),
    stagingRoot,
    stagedDistRoot,
  });
}

export function createLocalBootstrapStagingTree({ buildDir, transport, fileSystem = fs }) {
  const bootstrapTempRoot = path.resolve(path.dirname(path.dirname(transport.stagingRoot)));
  const relativeStage = path.relative(bootstrapTempRoot, transport.stagingRoot);
  if (!relativeStage || relativeStage.startsWith('..') || path.isAbsolute(relativeStage)) {
    throw new Error(`Refusing unsafe bootstrap staging path: ${transport.stagingRoot}`);
  }

  fileSystem.rmSync(transport.stagingRoot, { recursive: true, force: true });
  fileSystem.mkdirSync(path.dirname(transport.stagedDistRoot), { recursive: true });
  fileSystem.cpSync(buildDir, transport.stagedDistRoot, { recursive: true });
  return transport.stagedDistRoot;
}

export function cleanupLocalBootstrapStaging(transport, { fileSystem = fs } = {}) {
  fileSystem.rmSync(transport.stagingRoot, { recursive: true, force: true });
}
