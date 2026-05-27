import { describe, expect, it, vi } from 'vitest';
import {
    getLinkTargetAttributes,
    isFileLinkTarget,
    isLocalFilePath,
    isSystemLinkTarget,
    normalizeLinkTarget,
    openLinkTarget,
} from './linkTargets';

describe('linkTargets', () => {
    it('keeps regular web links unchanged', () => {
        expect(normalizeLinkTarget('https://example.idf.il/path')).toBe('https://example.idf.il/path');
        expect(isLocalFilePath('https://example.idf.il/path')).toBe(false);
    });

    it('converts mapped drive paths to file links', () => {
        expect(normalizeLinkTarget('z:/public')).toBe('file:///Z:/public');
        expect(normalizeLinkTarget('c:\\library\\docs')).toBe('file:///C:/library/docs');
        expect(isFileLinkTarget('z:/public')).toBe(true);
    });

    it('converts macOS absolute paths to file links', () => {
        expect(normalizeLinkTarget('/Users/meni/Documents')).toBe('file:///Users/meni/Documents');
        expect(normalizeLinkTarget('/Volumes/Public/Shared Folder')).toBe('file:///Volumes/Public/Shared%20Folder');
        expect(isLocalFilePath('/Applications')).toBe(true);
    });

    it('keeps app-relative and SharePoint-relative paths unchanged', () => {
        expect(normalizeLinkTarget('/org-chart')).toBe('/org-chart');
        expect(normalizeLinkTarget('/sites/schedule/siteDB')).toBe('/sites/schedule/siteDB');
    });

    it('normalizes macOS network folder protocols', () => {
        expect(normalizeLinkTarget('smb://fileserver/public/shared folder')).toBe('smb://fileserver/public/shared%20folder');
        expect(normalizeLinkTarget('afp://fileserver/public')).toBe('afp://fileserver/public');
        expect(isSystemLinkTarget('smb://fileserver/public')).toBe(true);
    });

    it('encodes spaces inside local folder paths', () => {
        expect(normalizeLinkTarget('c:/library/shared folder')).toBe('file:///C:/library/shared%20folder');
    });

    it('converts UNC paths to file links', () => {
        expect(normalizeLinkTarget('\\\\fileserver\\public\\library')).toBe('file://fileserver/public/library');
        expect(normalizeLinkTarget('//fileserver/public/library')).toBe('file://fileserver/public/library');
    });

    it('omits noreferrer for file links so the browser can handle the file scheme directly', () => {
        expect(getLinkTargetAttributes('z:/public')).toEqual({
            href: 'file:///Z:/public',
            target: '_blank',
        });
        expect(getLinkTargetAttributes('/Users/meni/Documents')).toEqual({
            href: 'file:///Users/meni/Documents',
            target: '_blank',
        });
        expect(getLinkTargetAttributes('smb://fileserver/public')).toEqual({
            href: 'smb://fileserver/public',
            target: '_blank',
        });
    });

    it('opens file links without noopener options', () => {
        const originalOpen = window.open;
        window.open = vi.fn(() => ({}));

        expect(openLinkTarget('z:/public')).toBe(true);
        expect(window.open).toHaveBeenCalledWith('file:///Z:/public', '_blank');

        window.open = originalOpen;
    });
});
