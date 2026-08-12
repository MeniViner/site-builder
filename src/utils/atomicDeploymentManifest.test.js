import { describe, expect, it } from 'vitest';
import {
  assertIndexReferencesMatchManifest,
  normalizeAtomicBuildManifest,
  orderFilesForAtomicDeployment,
} from './atomicDeploymentManifest';

const sha = (letter) => letter.repeat(64);

const manifestFor = (label) => ({
  schemaVersion: 4,
  buildId: `build-${label}`,
  artifactKind: 'site-builder-legacy-frontend',
  buildMode: 'legacy',
  entryPoint: 'index.html',
  commitFile: 'index.html',
  fileCount: 3,
  indexReferences: [`assets/index-${label}.css`, `assets/index-${label}.js`],
  files: [
    { path: 'index.html', size: 90, sha256: sha('a') },
    { path: `assets/index-${label}.js`, size: 10, sha256: sha('b') },
    { path: `assets/index-${label}.css`, size: 10, sha256: sha('c') },
  ],
});

describe('atomic deployment manifest', () => {
  it('requires Build B index references to be present in Build B manifest before index commit', () => {
    const buildB = normalizeAtomicBuildManifest(manifestFor('B'));
    const indexB = '<link rel="stylesheet" href="./assets/index-B.css"><script type="module" src="./assets/index-B.js"></script>';
    expect(assertIndexReferencesMatchManifest(buildB, indexB)).toEqual(['assets/index-B.css', 'assets/index-B.js']);

    const partialBuildB = normalizeAtomicBuildManifest({
      ...manifestFor('B'),
      fileCount: 2,
      files: manifestFor('B').files.filter((file) => !file.path.endsWith('.css')),
    });
    expect(() => assertIndexReferencesMatchManifest(partialBuildB, indexB)).toThrow('missing manifest file assets/index-B.css');
  });

  it('orders Build B assets before metadata and commits index.html separately', () => {
    const buildB = normalizeAtomicBuildManifest(manifestFor('B'));
    const order = orderFilesForAtomicDeployment(buildB.files).map((file) => file.path);
    expect(order).toEqual(['assets/index-B.js', 'assets/index-B.css']);
    expect(order).not.toContain('index.html');
  });

  it('rejects a malformed or mixed manifest instead of falling back to directory discovery', () => {
    expect(() => normalizeAtomicBuildManifest({ files: [] })).toThrow('Unsupported bootstrap manifest schema');
    expect(() => normalizeAtomicBuildManifest({
      ...manifestFor('B'),
      files: [...manifestFor('B').files, { path: 'assets/index-B.js', size: 10, sha256: sha('d') }],
      fileCount: 4,
    })).toThrow('duplicate');
  });
});

