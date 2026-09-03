import { describe, expect, it } from 'vitest';
import {
    createNavigationNodeId,
    getNavigationBindingFolderDepth,
    getNavigationBindingLevel,
    getNavigationKind,
    getNavigationNodeModel,
    getNavigationUrl,
    getNavigationTargetMode,
    normalizeNavigationTargetBinding,
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

    it('treats legacy URL-only nodes as manual without changing their stored shape', () => {
        const node = { id: 'legacy', label: 'Legacy', url: 'smb://server/share' };
        expect(getNavigationTargetMode(node)).toBe('manual');
        expect(normalizeNavigationTargetBinding(node.targetBinding)).toBeUndefined();
        expect(node).not.toHaveProperty('targetBinding');
    });

    it('normalizes a verified SharePoint folder binding and strips an absolute host', () => {
        expect(normalizeNavigationTargetBinding({
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            state: 'provisioning',
            serverRelativeUrl: 'https://portal.example/sites/demo/library/folder',
            listId: '{GUID}',
            libraryTitle: 'Library',
            libraryRootServerRelativeUrl: '/sites/demo/library',
            provisionKey: 'node-2',
        })).toEqual({
            version: 1,
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            state: 'verified',
            serverRelativeUrl: '/sites/demo/library/folder',
            listId: '{GUID}',
            libraryTitle: 'Library',
            libraryRootServerRelativeUrl: '/sites/demo/library',
            parentServerRelativeUrl: '/sites/demo/library',
            physicalName: 'folder',
            provisionKey: 'node-2',
        });
    });

    it('keeps a level-3 nested folder binding pointing at its own folder while owning the library identity', () => {
        const binding = normalizeNavigationTargetBinding({
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            serverRelativeUrl: '/sites/demo/מסמכים מקצועיים/תכניות עבודה/2026',
            listId: '{GUID}',
            libraryTitle: 'מסמכים מקצועיים',
            libraryRootServerRelativeUrl: '/sites/demo/מסמכים מקצועיים',
            parentServerRelativeUrl: '/sites/demo/מסמכים מקצועיים/תכניות עבודה',
            physicalName: '2026',
            provisionKey: 'node-3',
        });

        expect(binding).toMatchObject({
            serverRelativeUrl: '/sites/demo/מסמכים מקצועיים/תכניות עבודה/2026',
            libraryRootServerRelativeUrl: '/sites/demo/מסמכים מקצועיים',
            parentServerRelativeUrl: '/sites/demo/מסמכים מקצועיים/תכניות עבודה',
            physicalName: '2026',
            listId: '{GUID}',
        });
        expect(getNavigationBindingFolderDepth(binding)).toBe(2);
        expect(getNavigationBindingLevel(binding)).toBe(3);
    });

    it('reports depth for library roots and rejects paths outside the owning library', () => {
        expect(getNavigationBindingFolderDepth({
            mode: 'sharepoint-auto',
            targetKind: 'library',
            serverRelativeUrl: '/sites/demo/library',
        })).toBe(0);

        expect(getNavigationBindingFolderDepth({
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            serverRelativeUrl: '/sites/demo/other-library/folder',
            libraryRootServerRelativeUrl: '/sites/demo/library',
        })).toBe(-1);

        expect(getNavigationBindingFolderDepth({ mode: 'manual' })).toBe(-1);
    });

    it('carries unknown target-binding metadata through normalization instead of stripping it', () => {
        const binding = normalizeNavigationTargetBinding({
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            serverRelativeUrl: '/sites/demo/library/folder',
            libraryRootServerRelativeUrl: '/sites/demo/library',
            listId: 'guid',
            libraryTitle: 'Library',
            provisionedAt: '2026-01-01T00:00:00.000Z',
            provisionedByVersion: 7,
            futureFlag: true,
            // Non-primitive metadata is not a supported binding shape.
            nested: { dropped: true },
        });

        expect(binding).toMatchObject({
            provisionedAt: '2026-01-01T00:00:00.000Z',
            provisionedByVersion: 7,
            futureFlag: true,
        });
        expect(binding).not.toHaveProperty('nested');
        // A round trip must be stable.
        expect(normalizeNavigationTargetBinding(binding)).toEqual(binding);
    });
});
