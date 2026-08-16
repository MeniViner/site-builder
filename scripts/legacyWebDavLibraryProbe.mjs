import { execSync } from 'child_process';

export const LEGACY_WEBDAV_LIBRARY_STATUS = Object.freeze({
  EXISTS: 'EXISTS',
  MISSING: 'MISSING',
  TRANSPORT_ERROR: 'TRANSPORT_ERROR',
});

const missingSourcePattern = /(?:ERROR\s+(?:2|3)\b|cannot find (?:the )?(?:file|path)|system cannot find)/i;

const outputOf = (error) => [error?.stdout, error?.stderr].filter(Boolean).map(String).join('\n');

export function runLegacyWebDavListProbe(source, probeDestination, {
  execute = execSync,
  label = 'configured-root',
} = {}) {
  const command = `robocopy "${source}" "${probeDestination}" /L /E /R:0 /W:0 /NFL /NDL /NJH /NJS /NP`;
  try {
    const stdout = execute(command, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    return Object.freeze({ ok: true, label, source, command, exitCode: 0, output: String(stdout || '') });
  } catch (error) {
    const exitCode = Number(error?.status ?? 16);
    const output = outputOf(error);
    if (exitCode >= 0 && exitCode < 8) {
      return Object.freeze({ ok: true, label, source, command, exitCode, output });
    }
    return Object.freeze({
      ok: false,
      label,
      source,
      command,
      exitCode,
      output,
      missingLike: missingSourcePattern.test(output),
    });
  }
}

export function probeLegacyWebDavLibrary({
  title,
  libraryRel,
  siteRootRel,
  toWebDav,
  probeDestination,
  execute = execSync,
} = {}) {
  const librarySource = toWebDav(libraryRel);
  const libraryProbe = runLegacyWebDavListProbe(librarySource, probeDestination, {
    execute,
    label: 'configured-library-root',
  });
  if (libraryProbe.ok) {
    return Object.freeze({
      title,
      rel: libraryRel,
      source: librarySource,
      status: LEGACY_WEBDAV_LIBRARY_STATUS.EXISTS,
      exists: true,
      ready: true,
      libraryProbe,
    });
  }

  if (!libraryProbe.missingLike) {
    return Object.freeze({
      title,
      rel: libraryRel,
      source: librarySource,
      status: LEGACY_WEBDAV_LIBRARY_STATUS.TRANSPORT_ERROR,
      exists: false,
      ready: false,
      error: libraryProbe.output || `Robocopy exited ${libraryProbe.exitCode}`,
      libraryProbe,
    });
  }

  const siteSource = toWebDav(siteRootRel);
  const parentProbe = runLegacyWebDavListProbe(siteSource, probeDestination, {
    execute,
    label: 'sharepoint-site-root',
  });
  if (parentProbe.ok) {
    return Object.freeze({
      title,
      rel: libraryRel,
      source: librarySource,
      status: LEGACY_WEBDAV_LIBRARY_STATUS.MISSING,
      exists: false,
      ready: false,
      libraryProbe,
      parentProbe,
    });
  }

  return Object.freeze({
    title,
    rel: libraryRel,
    source: librarySource,
    status: LEGACY_WEBDAV_LIBRARY_STATUS.TRANSPORT_ERROR,
    exists: false,
    ready: false,
    error: parentProbe.output || libraryProbe.output || `Robocopy exited ${parentProbe.exitCode}`,
    libraryProbe,
    parentProbe,
  });
}

export function decideLegacyLibraryDeployment(siteDb, usersDb) {
  const probes = [siteDb, usersDb];
  const transportError = probes.find((probe) => probe.status === LEGACY_WEBDAV_LIBRARY_STATUS.TRANSPORT_ERROR);
  if (transportError) {
    return Object.freeze({ librariesReady: false, deployMode: 'none', transportError });
  }
  const librariesReady = probes.every((probe) => probe.status === LEGACY_WEBDAV_LIBRARY_STATUS.EXISTS);
  return Object.freeze({ librariesReady, deployMode: librariesReady ? 'final' : 'bootstrap', transportError: null });
}
