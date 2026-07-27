import { describe, expect, it } from 'vitest';
import { buildFileExplorerHref, decodeFileExplorerTarget, encodeFileExplorerTarget, parseFileExplorerTarget } from './fileExplorerTargets';

function tokenFromHref(href) { return new URLSearchParams(href.split('?')[1]).get('target'); }

describe('file explorer target parsing', () => {
  it('canonicalizes backslash, forward-slash, mixed-slash, trailing-slash, SMB, and file UNC forms', () => {
    const expected = '\\\\hrmazivfs\\Malnash\\PublicMalnash\\Alpha\\Hillel';
    for (const value of [`${expected}\\`, '//hrmazivfs/Malnash/PublicMalnash/Alpha/Hillel/', '\\\\hrmazivfs/Malnash\\PublicMalnash/Alpha\\Hillel', 'file://hrmazivfs/Malnash/PublicMalnash/Alpha/Hillel', 'smb://hrmazivfs/Malnash/PublicMalnash/Alpha/Hillel']) {
      const parsed = parseFileExplorerTarget(value);
      expect(parsed).toMatchObject({
        canonicalUncPath: expected,
        displayPath: expected,
        kind: 'unc',
        segments: ['PublicMalnash', 'Alpha', 'Hillel'],
        server: 'hrmazivfs',
        share: 'Malnash',
        shareRootPath: '\\\\hrmazivfs\\Malnash',
        shareKey: 'unc://hrmazivfs/malnash',
      });
    }
  });

  it('supports arbitrary server and share names, Unicode, spaces, administrative shares, and case-insensitive keys', () => {
    const upper = parseFileExplorerTarget('\\\\FILES-02.CORP\\TEAM$\\מרחב משותף\\דוחות');
    const lower = parseFileExplorerTarget('//files-02.corp/team$/מרחב משותף/דוחות');
    expect(upper).toMatchObject({
      canonicalUncPath: '\\\\FILES-02.CORP\\TEAM$\\מרחב משותף\\דוחות',
      segments: ['מרחב משותף', 'דוחות'],
      shareKey: 'unc://files-02.corp/team$',
    });
    expect(lower?.shareKey).toBe(upper?.shareKey);
  });

  it('preserves mixed Hebrew and English, repeated spaces, and valid punctuation', () => {
    const parsed = parseFileExplorerTarget('\\\\files-03\\צוות R&D\\Alpha  צוות\\דו״ח (סופי) 2026');
    expect(parsed).toMatchObject({
      canonicalUncPath: '\\\\files-03\\צוות R&D\\Alpha  צוות\\דו״ח (סופי) 2026',
      segments: ['Alpha  צוות', 'דו״ח (סופי) 2026'],
      share: 'צוות R&D',
    });
  });

  it('keeps opaque route tokens free of raw paths and round-trips spaces and Hebrew names', () => {
    const expected = '\\\\hrmazivfs\\Malnash\\תיקייה עם רווחים\\דוח 2026.pdf';
    const href = buildFileExplorerHref(expected);
    expect(href).toMatch(/^#\/file-explorer\?target=[A-Za-z0-9_-]+$/);
    expect(href).not.toContain('file:');
    expect(href).not.toContain('hrmazivfs');
    expect(decodeFileExplorerTarget(tokenFromHref(href))?.canonicalPath).toBe(expected);
  });
  it('rejects traversal, device paths, control characters, malformed paths, and web URLs', () => {
    expect(parseFileExplorerTarget('\\\\hrmazivfs\\Malnash\\..\\secret')).toBeNull();
    expect(parseFileExplorerTarget('\\\\hrmazivfs\\Malnash\\%2e%2e\\secret')).toBeNull();
    expect(parseFileExplorerTarget('\\\\?\\C:\\Windows')).toBeNull();
    expect(parseFileExplorerTarget('C:\\Team\\Files')).toBeNull();
    expect(parseFileExplorerTarget('file:///C:/Team/Files')).toBeNull();
    expect(parseFileExplorerTarget('\\\\hrmazivfs\\Malnash\\bad\u0001name')).toBeNull();
    expect(parseFileExplorerTarget('\\\\hrmazivfs')).toBeNull();
    expect(encodeFileExplorerTarget('https://example.test')).toBeNull();
    expect(decodeFileExplorerTarget('not-valid!')).toBeNull();
  });
});
