import { describe, expect, it } from 'vitest';
import { buildFileExplorerHref, decodeFileExplorerTarget, encodeFileExplorerTarget, parseFileExplorerTarget } from './fileExplorerTargets';

function tokenFromHref(href) { return new URLSearchParams(href.split('?')[1]).get('target'); }

describe('file explorer target parsing', () => {
  it('canonicalizes backslash, forward-slash, mixed-slash, trailing-slash, SMB, and file UNC forms', () => {
    const expected = '\\\\hrmazivfs\\Malnash\\PublicMalnash\\Alpha\\Hillel';
    for (const value of [`${expected}\\`, '//hrmazivfs/Malnash/PublicMalnash/Alpha/Hillel/', '\\\\hrmazivfs/Malnash\\PublicMalnash/Alpha\\Hillel', 'file://hrmazivfs/Malnash/PublicMalnash/Alpha/Hillel', 'smb://hrmazivfs/Malnash/PublicMalnash/Alpha/Hillel']) expect(parseFileExplorerTarget(value)?.canonicalPath).toBe(expected);
  });
  it('keeps opaque route tokens free of raw paths and round-trips spaces and Hebrew names', () => {
    const expected = '\\\\hrmazivfs\\Malnash\\תיקייה עם רווחים\\דוח 2026.pdf';
    const href = buildFileExplorerHref(expected);
    expect(href).toMatch(/^#\/file-explorer\?target=[A-Za-z0-9_-]+$/);
    expect(href).not.toContain('file:');
    expect(href).not.toContain('hrmazivfs');
    expect(decodeFileExplorerTarget(tokenFromHref(href))?.canonicalPath).toBe(expected);
  });
  it('rejects traversal, device paths, administrative shares, malformed paths, and web URLs', () => {
    expect(parseFileExplorerTarget('\\\\hrmazivfs\\Malnash\\..\\secret')).toBeNull();
    expect(parseFileExplorerTarget('\\\\?\\C:\\Windows')).toBeNull();
    expect(parseFileExplorerTarget('\\\\hrmazivfs\\C$\\Windows')).toBeNull();
    expect(parseFileExplorerTarget('\\\\hrmazivfs')).toBeNull();
    expect(encodeFileExplorerTarget('https://example.test')).toBeNull();
    expect(decodeFileExplorerTarget('not-valid!')).toBeNull();
  });
});
