import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const LEGACY_MANIFEST_FILE = 'sharepoint-deploy-manifest.json';
export const LEGACY_ENTRY_POINT = 'index.html';
export const LEGACY_MANIFEST_SCHEMA_VERSION = 4;
export const LEGACY_ARTIFACT_KIND = 'site-builder-legacy-frontend';

const toPosixPath = (value) => String(value || '').split(path.sep).join('/').replace(/^\/+/, '');
const sha256Buffer = (value) => crypto.createHash('sha256').update(value).digest('hex');
export const createLegacyBuildId = () => crypto.randomUUID();
export const sha256LegacyFile = (filePath) => sha256Buffer(fs.readFileSync(filePath));

const collectFiles = (rootDir) => {
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolutePath);
      else {
        const relativePath = toPosixPath(path.relative(rootDir, absolutePath));
        if (relativePath !== LEGACY_MANIFEST_FILE) files.push(relativePath);
      }
    }
  };
  walk(rootDir);
  return files.sort();
};

export function extractLegacyIndexReferences(indexHtml) {
  const references = new Set();
  const matches = String(indexHtml || '').matchAll(/<(?:script|link|img|source|video|audio)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi);
  for (const match of matches) {
    const raw = String(match[1] || '').trim();
    if (!raw || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(raw)) continue;
    const withoutQuery = raw.split(/[?#]/, 1)[0];
    if (!withoutQuery || withoutQuery.startsWith('/')) continue;
    const normalized = path.posix.normalize(withoutQuery.replace(/^\.\//, ''));
    if (!normalized || normalized === '.' || normalized.startsWith('../')) {
      throw new Error(`Legacy index contains unsafe local reference "${raw}".`);
    }
    references.add(normalized);
  }
  return [...references].sort();
}

const normalizeEntry = (entry) => ({
  path: toPosixPath(entry?.path),
  size: entry?.size,
  sha256: String(entry?.sha256 || '').toLowerCase(),
});

export function writeLegacyDeployManifest(distRoot, { buildId = createLegacyBuildId(), generatedAt = new Date().toISOString() } = {}) {
  const rootDir = path.resolve(distRoot);
  const indexPath = path.join(rootDir, LEGACY_ENTRY_POINT);
  if (!fs.existsSync(indexPath)) throw new Error(`Legacy build output is missing ${LEGACY_ENTRY_POINT}: ${rootDir}`);
  const files = collectFiles(rootDir).map((relativePath) => {
    const absolutePath = path.join(rootDir, relativePath);
    const stats = fs.statSync(absolutePath);
    return { path: relativePath, size: stats.size, sha256: sha256LegacyFile(absolutePath) };
  });
  const manifest = {
    kind: 'sitebuilder-legacy-deploy-manifest',
    schemaVersion: LEGACY_MANIFEST_SCHEMA_VERSION,
    buildId,
    buildMode: 'legacy',
    artifactKind: LEGACY_ARTIFACT_KIND,
    generatedAt,
    requiresRuntimeConfig: false,
    manifestFile: LEGACY_MANIFEST_FILE,
    entryPoint: LEGACY_ENTRY_POINT,
    commitFile: LEGACY_ENTRY_POINT,
    fileCount: files.length,
    requiredFolders: Array.from(new Set(files.map((entry) => entry.path.split('/').slice(0, -1).join('/')).filter(Boolean))).sort(),
    indexReferences: extractLegacyIndexReferences(fs.readFileSync(indexPath, 'utf8')),
    files,
  };
  fs.writeFileSync(path.join(rootDir, LEGACY_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return assertLegacyDeployableDist(rootDir);
}

export function readLegacyDeployManifest(rootDir) {
  const manifestPath = path.join(rootDir, LEGACY_MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) throw new Error(`Legacy deployment manifest is missing: ${manifestPath}`);
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error(`Legacy deployment manifest is unreadable: ${manifestPath}`);
  }
}

export function verifyLegacyManifestFiles(rootDir, manifest, { includeEntryPoint = true } = {}) {
  const entries = Array.isArray(manifest?.files) ? manifest.files.map(normalizeEntry) : [];
  const report = {
    buildId: String(manifest?.buildId || ''),
    expectedFiles: entries.filter((entry) => includeEntryPoint || entry.path !== LEGACY_ENTRY_POINT).length,
    foundFiles: 0,
    verifiedFiles: 0,
    missingFiles: [],
    mismatchedFiles: [],
  };
  for (const entry of entries) {
    if (!includeEntryPoint && entry.path === LEGACY_ENTRY_POINT) continue;
    const filePath = path.join(rootDir, entry.path);
    if (!fs.existsSync(filePath)) {
      report.missingFiles.push(entry.path);
      continue;
    }
    report.foundFiles += 1;
    const stats = fs.statSync(filePath);
    const actualSha256 = stats.isFile() ? sha256LegacyFile(filePath) : '';
    if (!stats.isFile() || stats.size !== entry.size || actualSha256 !== entry.sha256) {
      report.mismatchedFiles.push({
        path: entry.path,
        expectedSize: entry.size,
        actualSize: stats.size,
        expectedSha256: entry.sha256,
        actualSha256,
      });
      continue;
    }
    report.verifiedFiles += 1;
  }
  return Object.freeze(report);
}

export function assertLegacyManifestFilesVerified(rootDir, manifest, options = {}) {
  const report = verifyLegacyManifestFiles(rootDir, manifest, options);
  if (report.missingFiles.length || report.mismatchedFiles.length || report.verifiedFiles !== report.expectedFiles) {
    throw new Error(`Legacy build target verification failed: ${JSON.stringify(report)}`);
  }
  return report;
}

export function assertLegacyDeployableDist(rootDir) {
  const manifest = readLegacyDeployManifest(rootDir);
  if (manifest.schemaVersion !== LEGACY_MANIFEST_SCHEMA_VERSION
    || manifest.buildMode !== 'legacy'
    || manifest.artifactKind !== LEGACY_ARTIFACT_KIND
    || !String(manifest.buildId || '').trim()
    || manifest.entryPoint !== LEGACY_ENTRY_POINT
    || manifest.commitFile !== LEGACY_ENTRY_POINT) {
    throw new Error('Legacy deployment manifest identity/schema is invalid. Rebuild with npm run build.');
  }
  const entries = Array.isArray(manifest.files) ? manifest.files.map(normalizeEntry) : [];
  if (!entries.length || manifest.fileCount !== entries.length) throw new Error('Legacy deployment manifest file count is invalid.');
  const paths = new Set();
  for (const entry of entries) {
    if (!entry.path || entry.path.startsWith('../') || path.posix.isAbsolute(entry.path) || paths.has(entry.path)) {
      throw new Error(`Legacy deployment manifest contains invalid or duplicate path "${entry.path || '(empty)'}".`);
    }
    paths.add(entry.path);
    if (!Number.isInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
      throw new Error(`Legacy deployment manifest metadata is invalid for ${entry.path}.`);
    }
  }
  if (!paths.has(LEGACY_ENTRY_POINT)) throw new Error(`Legacy deployment manifest does not include ${LEGACY_ENTRY_POINT}.`);
  const references = extractLegacyIndexReferences(fs.readFileSync(path.join(rootDir, LEGACY_ENTRY_POINT), 'utf8'));
  for (const reference of references) {
    if (!paths.has(reference)) throw new Error(`Legacy index references ${reference}, but it is absent from the manifest.`);
  }
  if (JSON.stringify(references) !== JSON.stringify([...(manifest.indexReferences || [])].sort())) {
    throw new Error('Legacy index references do not match the deployment manifest.');
  }
  assertLegacyManifestFilesVerified(rootDir, manifest);
  return Object.freeze({ ...manifest, files: entries, indexReferences: references });
}

export function assertLegacyTargetMatchesManifest(rootDir, expectedManifest) {
  const targetManifest = assertLegacyDeployableDist(rootDir);
  if (targetManifest.buildId !== expectedManifest.buildId) {
    throw new Error(`Legacy target build ID mismatch: expected ${expectedManifest.buildId}, received ${targetManifest.buildId}.`);
  }
  return assertLegacyManifestFilesVerified(rootDir, expectedManifest);
}
