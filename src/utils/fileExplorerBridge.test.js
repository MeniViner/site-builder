import { describe, expect, it } from 'vitest';
import { buildFileExplorerUrl, DEFAULT_FILE_EXPLORER_BRIDGE_PATH, normalizeFileExplorerBridgePath, resolveFileExplorerEndpoint } from './fileExplorerBridge';

describe('file explorer same-origin bridge', () => {
  it('uses one stable portal-relative endpoint without a site code', () => {
    expect(resolveFileExplorerEndpoint()).toBe(DEFAULT_FILE_EXPLORER_BRIDGE_PATH);
    expect(resolveFileExplorerEndpoint({ bridgePath: '/_site-builder/file-explorer/' })).toBe('/_site-builder/file-explorer');
    expect(buildFileExplorerUrl('/_site-builder/file-explorer', 'opaque-token')).toBe('/_site-builder/file-explorer?target=opaque-token');
    expect(buildFileExplorerUrl('/_site-builder/file-explorer', '', 'readiness')).toBe('/_site-builder/file-explorer/readiness');
  });

  it('keeps an explicit local/test API override optional and rejects unsafe paths', () => {
    expect(resolveFileExplorerEndpoint({ apiOverride: 'http://127.0.0.1:3001' })).toBe('http://127.0.0.1:3001/api/file-explorer');
    expect(resolveFileExplorerEndpoint({ apiOverride: 'https://user:password@example.test' })).toBe(DEFAULT_FILE_EXPLORER_BRIDGE_PATH);
    expect(normalizeFileExplorerBridgePath('/sites/demo/../api')).toBe(DEFAULT_FILE_EXPLORER_BRIDGE_PATH);
  });
});
