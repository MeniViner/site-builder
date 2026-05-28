import { execFile } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { describe, expect, it } from 'vitest';
import {
  assertSafeHelperInstallPlan,
  createHelperFiles,
  installHelperFiles,
  resolveHelperInstallPlan,
} from './installExportHelperCore.mjs';
import { createClosedSharePointExportArtifact } from './exportKitCore.mjs';

const execFileAsync = promisify(execFile);

const sampleFiles = {
  'bihs_master_config_v1.txt': { schemaVersion: '1.0.0' },
  'users_data.txt': [{ id: 'admin-1', name: 'Admin' }],
  'events_data.txt': { events: [{ id: 'event-1', title: 'Event' }] },
  'nav_data.txt': [{ id: 'home', label: 'Home' }],
  'site_content_data.txt': { hero: { title: 'Site' } },
  'theme_data.txt': { primaryColor: '#0891b2' },
  'widgets_data.txt': { activeWidgets: ['events'] },
  'external_links_data.txt': [{ id: 'link-1', title: 'Link' }],
  'gantt_data.txt': { enabled: false, items: [] },
};

async function makeDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'sp-export-helper-'));
}

describe('SharePoint hosted export helper installer', () => {
  it('dry-run script prints the expected SharePoint helper URL', async () => {
    const { stdout } = await execFileAsync('node', [
      'scripts/sharepoint-closed-export/install-export-helper.mjs',
      '--dry-run',
      '--host',
      'portal.example',
      '--site',
      'Sites/my-site/subsite',
    ], { cwd: process.cwd() });
    const parsed = JSON.parse(stdout);

    expect(parsed.dryRun).toBe(true);
    expect(parsed.helperUrl).toBe('https://portal.example/Sites/my-site/subsite/siteDB/siteAssets/export-helper/index.html');
    expect(parsed.files.map((file) => file.serverRelativePath)).toEqual([
      '/Sites/my-site/subsite/siteDB/siteAssets/export-helper/index.html',
      '/Sites/my-site/subsite/siteDB/siteAssets/export-helper/export-helper.js',
    ]);
  });

  it('uses only the dedicated helper path and never targets legacy TXT files', () => {
    const config = {
      host: 'portal.example',
      siteCode: 'demo/subsite',
      siteDbFolder: 'siteDB',
      usersDbFolder: 'siteUsersDb',
      siteAssetsFolder: 'siteAssets',
      widgetsDbTarget: 'users',
      toWebDav: (serverRelativePath) => `WEB_DAV:${serverRelativePath}`,
    };
    const plan = resolveHelperInstallPlan({ config, cli: { site: 'demo/subsite' } });
    const files = createHelperFiles(plan);

    expect(assertSafeHelperInstallPlan(plan)).toBe(true);
    expect(files).toHaveLength(2);
    expect(files.every((file) => file.serverRelativePath.startsWith('/sites/demo/subsite/siteDB/siteAssets/export-helper/'))).toBe(true);
    expect(files.some((file) => file.serverRelativePath.endsWith('.txt'))).toBe(false);
    expect(plan.filePlan.find((file) => file.fileName === 'widgets_data.txt').serverRelativePath)
      .toBe('/sites/demo/subsite/siteUsersDb/widgets_data.txt');
  });

  it('refuses to install if the siteAssets parent does not already exist', () => {
    const config = {
      host: 'portal.example',
      siteCode: 'demo',
      siteDbFolder: 'siteDB',
      usersDbFolder: 'siteUsersDb',
      siteAssetsFolder: 'siteAssets',
      widgetsDbTarget: 'users',
      toWebDav: (serverRelativePath) => `WEB_DAV:${serverRelativePath}`,
    };
    const plan = resolveHelperInstallPlan({ config, cli: { site: 'demo' } });
    const fsAdapter = {
      existsSync: () => false,
      mkdirSync: () => {
        throw new Error('mkdir should not be called');
      },
      writeFileSync: () => {
        throw new Error('write should not be called');
      },
    };

    expect(() => installHelperFiles({ plan, config, fsAdapter })).toThrow('siteAssets folder does not exist');
  });

  it('accepts a hosted browser artifact in the existing validation pipeline', async () => {
    const browserExportPath = path.join(await makeDir(), 'hosted-export.json');
    const outputRoot = await makeDir();
    const files = Object.entries(sampleFiles).map(([fileName, data]) => ({
      fileName,
      text: JSON.stringify(data, null, 2),
      ok: true,
      status: 200,
    }));
    await fs.writeFile(browserExportPath, JSON.stringify({
      kind: 'site-builder-closed-sharepoint-hosted-export',
      siteCode: 'Sites/demo/subsite',
      displayName: 'Demo Subsite',
      siteRelativePath: '/Sites/demo/subsite',
      readOnly: true,
      files,
    }, null, 2), 'utf8');

    const result = await createClosedSharePointExportArtifact({
      browserExportPath,
      outputRoot,
      exportId: 'from-hosted-browser',
    });

    expect(result.manifest.siteCode).toBe('Sites/demo/subsite');
    expect(result.manifest.displayName).toBe('Demo Subsite');
    expect(result.manifest.safeForMongoDryRun).toBe(true);
    expect(result.legacyObjects.objects).toHaveLength(9);
  });
});
