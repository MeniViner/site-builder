import { describe, expect, it, vi } from 'vitest';
import { decodeFileExplorerTarget } from './fileExplorerTargets';
import { getLinkTargetAttributes, isFileLinkTarget, normalizeLinkTarget, openLinkTarget } from './linkTargets';

function targetFromHref(href) { return decodeFileExplorerTarget(new URLSearchParams(href.split('?')[1]).get('target')); }

describe('link targets', () => {
  it('keeps normal HTTP and HTTPS links unchanged', () => {
    expect(normalizeLinkTarget('https://example.test/path')).toBe('https://example.test/path');
    expect(normalizeLinkTarget('http://example.test/path')).toBe('http://example.test/path');
  });
  it('keeps Site Builder and SharePoint-relative paths in their existing navigation flow', () => {
    expect(normalizeLinkTarget('/org-chart')).toBe('/org-chart');
    expect(normalizeLinkTarget('/sites/schedule/siteDB')).toBe('/sites/schedule/siteDB');
  });
  it('routes UNC, SMB, and file URLs to the internal explorer', () => {
    for (const value of ['\\\\hrmazivfs\\Malnash\\PublicMalnash', 'smb://hrmazivfs/Malnash/PublicMalnash', 'file://hrmazivfs/Malnash/PublicMalnash']) {
      const href = normalizeLinkTarget(value);
      expect(href).toMatch(/^#\/file-explorer\?target=/);
      expect(href).not.toContain('file:');
      expect(targetFromHref(href)?.canonicalPath).toBe('\\\\hrmazivfs\\Malnash\\PublicMalnash');
      expect(isFileLinkTarget(value)).toBe(true);
    }
  });
  it('preserves WebDAV SharePoint conversion to HTTPS', () => { expect(normalizeLinkTarget('\\\\tenant.sharepoint.com@SSL\\DavWWWRoot\\sites\\Team')).toBe('https://tenant.sharepoint.com/sites/Team'); });
  it('never passes a native file URL to window.open', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    openLinkTarget('\\\\hrmazivfs\\Malnash\\PublicMalnash');
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^#\/file-explorer\?target=/), '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });
  it('never generates search-ms or browser file navigation', () => {
    const href = normalizeLinkTarget('file://hrmazivfs/Malnash/PublicMalnash');
    expect(href).not.toContain('search-ms:');
    expect(href).not.toContain('file:');
  });
  it('does not turn mapped drives or local file URLs into browser navigation', () => {
    expect(getLinkTargetAttributes('C:\\Team\\Files')).toMatchObject({ href: '', rel: 'noopener noreferrer', target: '_blank' });
    expect(normalizeLinkTarget('file:///C:/Team/Files')).toBe('');
    expect(normalizeLinkTarget('afp://server/share')).toBe('');
  });
});
