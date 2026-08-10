import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { verifyUniversalDist } from './verify-universal-dist.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('verifyUniversalDist', () => {
  it('proves target metadata changes do not change release assets', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-universal-test-'));
    roots.push(dist);
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(dist, 'assets', 'app-abc.js'), 'universal javascript');
    fs.writeFileSync(path.join(dist, 'assets', 'app-abc.css'), 'universal css');

    const proof = verifyUniversalDist(dist);

    expect(proof.targetA).toMatchObject({
      host: 'portal.army.idf', siteCode: 'legacy-runtime-a', siteRoot: '/sites/legacy-runtime-a',
      siteDbRoot: '/sites/legacy-runtime-a/txt-site-library', widgetsDbTarget: 'users',
    });
    expect(proof.targetB).toMatchObject({
      host: 'mazi.army.idf', siteCode: 'legacy-runtime-b', siteRoot: '/sites/legacy-runtime-b',
      siteDbRoot: '/sites/legacy-runtime-b/records-library', widgetsDbTarget: 'site',
    });
    expect(Object.keys(proof.assetHashes)).toEqual(['assets/app-abc.css', 'assets/app-abc.js']);
    expect(proof.universalAssetHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
