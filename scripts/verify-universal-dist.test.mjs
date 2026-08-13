import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeReleaseArtifacts } from './deploymentArtifacts.mjs';
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
    writeReleaseArtifacts(dist);

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

  it('rejects a legacy artifact that has no universal release manifest', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-legacy-test-'));
    roots.push(dist);
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html>');

    expect(() => verifyUniversalDist(dist)).toThrow('npm run build:universal');
  });

  it('rejects a Universal asset containing the configured Legacy site root', () => {
    const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-contaminated-universal-test-'));
    roots.push(dist);
    const envText = fs.readFileSync(path.resolve('.env.production'), 'utf8');
    const siteCode = envText.match(/^VITE_SP_SITE_CODE=(.+)$/m)?.[1]?.trim();
    expect(siteCode).toBeTruthy();
    fs.mkdirSync(path.join(dist, 'assets'));
    fs.writeFileSync(path.join(dist, 'index.html'), '<script type="module" src="./assets/app.js"></script>');
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), `const legacyTarget = '/sites/${siteCode}';`);
    writeReleaseArtifacts(dist);

    expect(() => verifyUniversalDist(dist)).toThrow('contains the Legacy deployment target');
  });
});
