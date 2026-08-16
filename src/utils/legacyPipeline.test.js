import { describe, expect, it, vi } from 'vitest';
import {
  EXISTING_SITE_STAGE_ORDER,
  LEGACY_PIPELINE_STAGES,
  NEW_SITE_STAGE_ORDER,
  classifyTxtSeed,
  deriveRequiredFolders,
  executeBrowserStage,
  formatLegacyFailure,
  runFinalAssetStages,
} from './legacyPipeline';

const manifest = {
  buildId: 'build-b',
  targetRoot: '/sites/EnergyEfficiency/siteDB/dist',
};
const entries = [
  { path: 'assets/app.js', size: 2, sha256: 'a'.repeat(64) },
  { path: 'assets/app.css', size: 3, sha256: 'b'.repeat(64) },
  { path: 'images/kashar-demo/icon.svg', size: 4, sha256: 'c'.repeat(64) },
  { path: 'index.html', size: 5, sha256: 'd'.repeat(64) },
];

describe('Legacy pipeline contract', () => {
  it('defines the complete new-site order and skips bootstrap for an existing site', () => {
    expect(NEW_SITE_STAGE_ORDER).toEqual(LEGACY_PIPELINE_STAGES);
    expect(EXISTING_SITE_STAGE_ORDER).not.toContain('BOOTSTRAP_UPLOAD');
    expect(EXISTING_SITE_STAGE_ORDER).not.toContain('CREATE_LIBRARIES');
    expect(EXISTING_SITE_STAGE_ORDER.at(-1)).toBe('COMPLETE');
  });

  it('derives arbitrary nested parent folders shallowest-first', () => {
    expect(deriveRequiredFolders(manifest.targetRoot, entries)).toEqual([
      '/sites/EnergyEfficiency/siteDB/dist',
      '/sites/EnergyEfficiency/siteDB/dist/assets',
      '/sites/EnergyEfficiency/siteDB/dist/images',
      '/sites/EnergyEfficiency/siteDB/dist/images/kashar-demo',
    ]);
  });

  it('creates nested folders before upload and commits index only after every asset verifies', async () => {
    const events = [];
    await runFinalAssetStages({
      manifest,
      deploymentEntries: entries,
      ensureFolder: async (folder) => events.push(`folder:${folder}`),
      uploadFile: async (entry) => events.push(`upload:${entry.path}`),
      verifyFile: async (entry) => events.push(`verify:${entry.path}`),
      commitIndex: async () => events.push('commit:index.html'),
      verifyIndex: async () => events.push('verify-index'),
      smoke: async () => 'STATIC PASS',
    });
    expect(events.indexOf('folder:/sites/EnergyEfficiency/siteDB/dist/images/kashar-demo')).toBeLessThan(events.indexOf('upload:images/kashar-demo/icon.svg'));
    expect(events.indexOf('verify:images/kashar-demo/icon.svg')).toBeLessThan(events.indexOf('commit:index.html'));
  });

  it('blocks upload when nested folder creation fails', async () => {
    const uploadFile = vi.fn();
    await expect(runFinalAssetStages({
      manifest,
      deploymentEntries: entries,
      ensureFolder: async (folder) => { if (folder.endsWith('kashar-demo')) throw new Error('DirectoryNotFoundException'); },
      uploadFile,
      verifyFile: vi.fn(),
      commitIndex: vi.fn(),
      verifyIndex: vi.fn(),
      smoke: vi.fn(),
    })).rejects.toThrow('DirectoryNotFoundException');
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it('does not commit index if one asset verification fails', async () => {
    const commitIndex = vi.fn();
    await expect(runFinalAssetStages({
      manifest,
      deploymentEntries: entries,
      ensureFolder: vi.fn(),
      uploadFile: vi.fn(),
      verifyFile: async (entry) => { if (entry.path.endsWith('.css')) throw new Error('FINAL_ASSET_VERIFY'); },
      commitIndex,
      verifyIndex: vi.fn(),
      smoke: vi.fn(),
    })).rejects.toThrow('FINAL_ASSET_VERIFY');
    expect(commitIndex).not.toHaveBeenCalled();
  });

  it('reports a missing primary asset as FINAL_INDEX_VERIFY', async () => {
    await expect(runFinalAssetStages({
      manifest,
      deploymentEntries: entries,
      ensureFolder: vi.fn(),
      uploadFile: vi.fn(),
      verifyFile: vi.fn(),
      commitIndex: vi.fn(),
      verifyIndex: async () => { throw new Error('FINAL_INDEX_VERIFY: missing assets/app.css'); },
      smoke: vi.fn(),
    })).rejects.toThrow('FINAL_INDEX_VERIFY');
  });

  it('is safe to retry after a partial failure when operations are idempotent', async () => {
    const remote = new Set();
    let failOnce = true;
    const options = {
      manifest,
      deploymentEntries: entries,
      ensureFolder: async (folder) => remote.add(`folder:${folder}`),
      uploadFile: async (entry) => {
        if (entry.path.endsWith('.css') && failOnce) { failOnce = false; throw new Error('temporary'); }
        remote.add(`file:${entry.path}`);
      },
      verifyFile: async (entry) => { if (!remote.has(`file:${entry.path}`)) throw new Error('missing'); },
      commitIndex: async (entry) => remote.add(`file:${entry.path}`),
      verifyIndex: async () => undefined,
      smoke: async () => 'STATIC PASS',
    };
    await expect(runFinalAssetStages(options)).rejects.toThrow('temporary');
    await expect(runFinalAssetStages(options)).resolves.toMatchObject({ buildId: 'build-b' });
  });

  it('formats only applicable normalized diagnostic fields', () => {
    expect(formatLegacyFailure({ boundary: 'CREATE_FOLDERS', operation: 'ensure-folder', target: '/nested', status: 404, responsePreview: 'DirectoryNotFoundException' }))
      .toContain('FAILURE BOUNDARY: CREATE_FOLDERS');
  });

  it.each([
    ['synchronous throw', () => { throw new Error('sync failure'); }],
    ['promise rejection', () => Promise.reject(new Error('async failure'))],
    ['JSOM failure', () => Promise.reject(Object.assign(new Error('query failed'), { code: 'JSOM_QUERY_FAILED' }))],
  ])('%s cannot leave a Browser stage running', async (_label, work) => {
    const statuses = [];
    await expect(executeBrowserStage({
      stage: 'CREATE_LIBRARIES',
      operation: 'ensure-configured-libraries',
      work,
      onStatus: (_stage, status) => statuses.push(status),
    })).rejects.toMatchObject({ legacyFailure: expect.objectContaining({ boundary: 'CREATE_LIBRARIES' }) });
    expect(statuses).toEqual(['running', 'failed']);
  });

  it('turns an unresolved Browser operation into STAGE_TIMEOUT', async () => {
    vi.useFakeTimers();
    const statuses = [];
    try {
      const pending = executeBrowserStage({
        stage: 'CREATE_FOLDERS',
        operation: 'ensure-folder',
        work: () => new Promise(() => {}),
        timeoutMs: 180_000,
        onStatus: (_stage, status) => statuses.push(status),
      });
      const rejection = expect(pending).rejects.toMatchObject({
        legacyFailure: expect.objectContaining({
          boundary: 'CREATE_FOLDERS',
          operation: 'ensure-folder',
          error: 'STAGE_TIMEOUT',
        }),
      });
      await vi.advanceTimersByTimeAsync(180_000);
      await rejection;
      expect(statuses).toEqual(['running', 'failed']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks a successful Browser stage passed', async () => {
    const statuses = [];
    await expect(executeBrowserStage({
      stage: 'CREATE_TXT_SEEDS',
      operation: 'create-missing-seeds',
      work: async () => 'ok',
      onStatus: (_stage, status) => statuses.push(status),
    })).resolves.toBe('ok');
    expect(statuses).toEqual(['running', 'passed']);
  });

  it('preserves existing non-empty TXT data and creates only missing or empty seeds', () => {
    expect(classifyTxtSeed({ status: 200, text: '{"real":"content"}' })).toBe('preserve');
    expect(classifyTxtSeed({ status: 200, text: '  ' })).toBe('create');
    expect(classifyTxtSeed({ status: 404 })).toBe('create');
    expect(classifyTxtSeed({ status: 403 })).toBe('fail');
  });
});
