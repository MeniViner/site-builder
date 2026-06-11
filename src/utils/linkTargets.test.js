import { describe, expect, it, vi } from 'vitest';
import {
    buildWindowsFileOpenerHref,
    getLinkTargetAttributes,
    getWindowsNativeFilePath,
    handleLinkTargetClick,
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

    it('builds Windows native paths from file-style targets', () => {
        expect(getWindowsNativeFilePath('z:/public')).toBe('Z:\\public');
        expect(getWindowsNativeFilePath('file:///C:/library/shared%20folder')).toBe('C:\\library\\shared folder');
        expect(getWindowsNativeFilePath('file://fileserver/public/shared%20folder')).toBe('\\\\fileserver\\public\\shared folder');
        expect(getWindowsNativeFilePath('/Users/meni/Documents')).toBe('');
    });

    it('routes Windows file links through the local protocol helper', () => {
        expect(getLinkTargetAttributes('z:/public')).toEqual(expect.objectContaining({
            href: buildWindowsFileOpenerHref('z:/public'),
            'data-original-href': 'file:///Z:/public',
            onClick: expect.any(Function),
        }));
        expect(getLinkTargetAttributes('\\\\fileserver\\public\\library')).toEqual(expect.objectContaining({
            href: buildWindowsFileOpenerHref('\\\\fileserver\\public\\library'),
            'data-original-href': 'file://fileserver/public/library',
            onClick: expect.any(Function),
        }));
    });

    it('keeps non-Windows system links as direct system links', () => {
        expect(getLinkTargetAttributes('/Users/meni/Documents')).toEqual(expect.objectContaining({
            href: 'file:///Users/meni/Documents',
            onClick: expect.any(Function),
        }));
        expect(getLinkTargetAttributes('smb://fileserver/public')).toEqual(expect.objectContaining({
            href: 'smb://fileserver/public',
            onClick: expect.any(Function),
        }));
    });

    it('opens Windows file links with the local protocol helper', () => {
        const originalOpen = window.open;
        window.open = vi.fn(() => ({}));

        expect(openLinkTarget('z:/public')).toBe(true);
        expect(window.open).toHaveBeenCalledWith(buildWindowsFileOpenerHref('z:/public'), '_blank');

        window.open = originalOpen;
    });

    it('handles system link clicks explicitly so passive anchors do not swallow them', () => {
        const originalOpen = window.open;
        window.open = vi.fn(() => ({}));
        const event = {
            preventDefault: vi.fn(),
        };

        expect(handleLinkTargetClick('z:/public', event)).toBe(true);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(window.open).toHaveBeenCalledWith(buildWindowsFileOpenerHref('z:/public'), '_blank');

        window.open = originalOpen;
    });
});
