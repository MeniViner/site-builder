import { describe, expect, it } from 'vitest';
import {
    createNavigationNodeId,
    getNavigationKind,
    getNavigationNodeModel,
    getNavigationUrl,
    shouldExploreNavigationNode,
} from './navigationModel';

describe('navigationModel', () => {
    it('creates collision-safe IDs for rapid additions', () => {
        const ids = Array.from({ length: 100 }, () => createNavigationNodeId('folder'));
        expect(new Set(ids).size).toBe(ids.length);
    });

    it.each([
        ['path', { path: '\\\\fileserver\\public' }],
        ['href', { href: 'smb://fileserver/public' }],
        ['folderPath', { folderPath: 'z:/public' }],
        ['target', { target: '/sites/demo/library' }],
    ])('reads a legacy %s alias without dropping the target', (_field, node) => {
        expect(getNavigationUrl(node)).toBe(Object.values(node)[0]);
    });

    it('does not confuse an HTML target name with a navigation URL', () => {
        expect(getNavigationUrl({ target: '_blank' })).toBe('');
    });

    it('keeps both actions available for a URL-plus-children hybrid folder', () => {
        const hybrid = {
            kind: 'folder',
            href: 'smb://fileserver/public',
            children: [{ id: 'child', url: 'https://example.test' }],
        };

        expect(getNavigationNodeModel(hybrid)).toMatchObject({
            kind: 'folder',
            url: 'smb://fileserver/public',
            canOpen: true,
            canExplore: true,
            isHybrid: true,
        });
        expect(shouldExploreNavigationNode(hybrid)).toBe(true);
    });

    it('infers empty nodes as folders and URL-only nodes as links', () => {
        expect(getNavigationKind({ children: [] })).toBe('folder');
        expect(getNavigationKind({ url: 'file://server/share', children: [] })).toBe('link');
    });
});
