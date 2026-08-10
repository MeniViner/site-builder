import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveConfig, writeEnvProduction } from './sp-env.js';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('SharePoint deployment environment', () => {
  it('defaults to TXT and derives the target-specific site ID', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-sp-env-'));
    roots.push(root);
    const envPath = path.join(root, '.env.production');
    fs.writeFileSync(envPath, 'VITE_SP_SITE_CODE=nested-target\n');
    const config = resolveConfig({ envFilePath: envPath, environment: {} });
    expect(config).toMatchObject({ storageBackend: 'txt', storageBackendSource: 'safe-production-default', siteId: 'nested-target' });
  });

  it('maps a non-default legacy TXT environment without assuming siteDB', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-sp-env-nondefault-'));
    roots.push(root);
    const envPath = path.join(root, '.env.production');
    fs.writeFileSync(envPath, [
      'VITE_SP_HOST=mazi.army.idf',
      'VITE_SP_SITE_CODE=legacy-runtime-b',
      'VITE_SP_SITE_DB_FOLDER=records-library',
      'VITE_SP_USERS_DB_FOLDER=/sites/legacy-runtime-b/records-users',
      'VITE_SP_SITE_ASSETS_FOLDER=site-assets',
      'VITE_SP_IMAGES_FOLDER=site-images',
      'VITE_SP_WIDGETS_DB_TARGET=site',
      'VITE_SP_SITE_API_ROOT=/sites/legacy-runtime-b',
      'VITE_SITE_BASE_URL=https://mazi.army.idf/sites/legacy-runtime-b/records-library/dist',
    ].join('\n'));

    const config = resolveConfig({ envFilePath: envPath, environment: {} });

    expect(config).toMatchObject({
      hasExplicitSiteIdentity: true,
      host: 'mazi.army.idf',
      siteCode: 'legacy-runtime-b',
      siteDbFolder: 'records-library',
      usersDbFolder: 'records-users',
      widgetsDbTarget: 'site',
      distRel: '/sites/legacy-runtime-b/records-library/dist',
      siteBaseUrl: 'https://mazi.army.idf/sites/legacy-runtime-b/records-library/dist',
    });
  });

  it('rejects ambiguous backend values and writes explicit backend fields', () => {
    expect(() => resolveConfig({
      envFilePath: '/missing',
      cli: { 'storage-backend': 'unknown' },
      environment: {},
    })).toThrow('Expected txt or mongo');

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sitebuilder-sp-write-'));
    roots.push(root);
    const output = path.join(root, '.env.production');
    const config = resolveConfig({ envFilePath: '/missing', cli: { site: 'alpha', 'storage-backend': 'txt' }, environment: {} });
    writeEnvProduction(config, output);
    const text = fs.readFileSync(output, 'utf8');
    expect(text).toContain('VITE_STORAGE_BACKEND=txt');
    expect(text).toContain('VITE_SITE_ID=alpha');
    expect(text).toContain('VITE_AUTO_DEPLOY_STRICT=true');
  });

  it('rejects selectors that are not exactly lowercase txt or mongo', () => {
    expect(() => resolveConfig({
      envFilePath: '/missing',
      cli: { 'storage-backend': 'MONGO' },
      environment: {},
    })).toThrow('Expected txt or mongo');
  });
});
