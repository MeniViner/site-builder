import dotenv from 'dotenv';
import { describe, expect, it } from 'vitest';
import { getFileExplorerConfig, parseFileExplorerRoots } from './fileExplorer.js';

const base = { CORS_ORIGINS: 'https://portal.army.idf', NODE_ENV: 'production' };
describe('file explorer configuration', () => {
  it('parses the exact unquoted dotenv UNC value operators paste on Windows', () => {
    const parsed = dotenv.parse('SITE_BUILDER_FILE_EXPLORER_ROOTS=\\\\hrmazivfs\\Malnash\n');
    const config = getFileExplorerConfig({ ...base, ...parsed });
    expect(parsed.SITE_BUILDER_FILE_EXPLORER_ROOTS).toBe('\\\\hrmazivfs\\Malnash');
    expect(config.roots[0].canonicalPath).toBe('\\\\hrmazivfs\\Malnash');
    expect(config.configurationError).toBeNull();
    expect(config.bridgePath).toBe('/_site-builder/file-explorer');
    expect(config.accessModel).toBe('service-identity');
  });
  it('supports semicolon and JSON allowlists', () => {
    expect(parseFileExplorerRoots('\\\\hrmazivfs\\Malnash;\\\\hrmazivfs\\Shared')).toHaveLength(2);
    expect(parseFileExplorerRoots('["\\\\\\\\hrmazivfs\\\\Malnash","\\\\\\\\hrmazivfs\\\\Shared"]')).toHaveLength(2);
  });
  it('surfaces malformed configured roots', () => {
    const config = getFileExplorerConfig({ ...base, SITE_BUILDER_FILE_EXPLORER_ROOTS: '[not json' });
    expect(config.configured).toBe(true);
    expect(config.configurationError).toContain('JSON array');
  });
  it('rejects an unsafe bridge path and unsupported delegation model', () => {
    const config = getFileExplorerConfig({ ...base, SITE_BUILDER_FILE_EXPLORER_ROOTS: '\\\\hrmazivfs\\Malnash', SITE_BUILDER_FILE_EXPLORER_BRIDGE_PATH: 'https://blocked.test', SITE_BUILDER_FILE_EXPLORER_ACCESS_MODEL: 'user-delegation' });
    expect(config.configurationError).toContain('portal-relative');
    expect(config.configurationError).toContain('service-identity');
  });
});
