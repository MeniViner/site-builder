import { describe, expect, it, vi } from 'vitest';
import {
    NavigationSharePointProvisioningError,
    buildNavigationProvisionKey,
    buildSharePointNavigationSegment,
    createNavigationSharePointService,
} from './NavigationSharePointService';

const identity = {
    siteRoot: '/sites/schedule',
    currentWebUrl: 'https://portal.example/sites/schedule',
};
const session = {
    siteRoot: identity.siteRoot,
    digest: 'digest',
    request: vi.fn(),
    logs: [],
};

describe('NavigationSharePointService', () => {
    it('creates deterministic Hebrew-safe path segments and removes encoded-risk characters', () => {
        const first = buildSharePointNavigationSegment('תכנון % ו#בקרה', 'stable-node-id', 'library');
        const retry = buildSharePointNavigationSegment('תכנון % ו#בקרה', 'stable-node-id', 'library');
        const different = buildSharePointNavigationSegment('תכנון % ו#בקרה', 'other-node-id', 'library');

        expect(first).toBe(retry);
        expect(first).not.toMatch(/[%#]/);
        expect(different).not.toBe(first);
    });

    it('derives retry-stable provisioning keys from names and verified parent identity', () => {
        const parentBinding = {
            listId: '{LIST-GUID}',
            libraryRootServerRelativeUrl: '/sites/schedule/library',
        };
        expect(buildNavigationProvisionKey({
            displayName: '  תכנון   עבודה ',
            targetKind: 'library',
        })).toBe(buildNavigationProvisionKey({
            displayName: 'תכנון עבודה',
            targetKind: 'library',
        }));
        expect(buildNavigationProvisionKey({
            displayName: 'משימות',
            targetKind: 'folder',
            parentBinding,
        })).toBe('folder:list-guid:משימות');
    });

    it('provisions and verifies a top-level document library before returning a binding', async () => {
        const provisionLibrary = vi.fn(async ({ title, rootServerRelativeUrl }) => ({
            listId: 'list-guid',
            title,
            baseTemplate: 101,
            rootServerRelativeUrl,
            welcomePage: 'Forms/AllItems.aspx',
            onQuickLaunch: true,
            wasCreated: true,
        }));
        const service = createNavigationSharePointService({
            resolveWebIdentity: () => identity,
            createSession: vi.fn().mockResolvedValue(session),
            provisionLibrary,
        });

        const result = await service.provisionCategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'node-1',
        });

        expect(provisionLibrary).toHaveBeenCalledWith(expect.objectContaining({
            session,
            title: 'תכניות עבודה',
            rootServerRelativeUrl: expect.stringMatching(/^\/sites\/schedule\/תכניות-עבודה-library-/),
        }));
        expect(result).toMatchObject({
            url: expect.stringMatching(/^\/sites\/schedule\/תכניות-עבודה-library-/),
            targetBinding: {
                mode: 'sharepoint-auto',
                targetKind: 'library',
                state: 'verified',
                listId: 'list-guid',
            },
        });
    });

    it('rejects an unverified library instead of returning a false-success node', async () => {
        const service = createNavigationSharePointService({
            resolveWebIdentity: () => identity,
            createSession: vi.fn().mockResolvedValue(session),
            provisionLibrary: vi.fn().mockResolvedValue({
                listId: 'list-guid',
                title: 'קטגוריה',
                baseTemplate: 101,
                rootServerRelativeUrl: '/sites/schedule/category-library-1234567',
                welcomePage: '',
                onQuickLaunch: true,
            }),
        });

        await expect(service.provisionCategory({
            displayName: 'קטגוריה',
            provisionKey: 'node-1',
        })).rejects.toMatchObject({ code: 'LIBRARY_VERIFICATION_FAILED' });
    });

    it('creates a subcategory folder only after validating the parent list identity', async () => {
        const probeFolder = vi.fn().mockResolvedValue({ ready: true, id: '{LIST-GUID}' });
        const ensureFolder = vi.fn(async ({ folderRel }) => ({
            created: true,
            path: folderRel,
            probe: { ready: true },
        }));
        const service = createNavigationSharePointService({
            resolveWebIdentity: () => identity,
            createSession: vi.fn().mockResolvedValue(session),
            probeFolder,
            ensureFolder,
        });

        const result = await service.provisionSubcategory({
            displayName: 'תכנון',
            provisionKey: 'node-2',
            parentBinding: {
                mode: 'sharepoint-auto',
                targetKind: 'library',
                serverRelativeUrl: '/sites/schedule/library',
                libraryRootServerRelativeUrl: '/sites/schedule/library',
                libraryTitle: 'ספרייה',
                listId: 'list-guid',
                provisionKey: 'node-1',
            },
        });

        expect(probeFolder).toHaveBeenCalledBefore(ensureFolder);
        expect(ensureFolder).toHaveBeenCalledWith(expect.objectContaining({
            siteRoot: '/sites/schedule',
            libraries: [{ title: 'ספרייה', rootRel: '/sites/schedule/library' }],
            folderRel: expect.stringMatching(/^\/sites\/schedule\/library\/תכנון-folder-/),
        }));
        expect(result.targetBinding).toMatchObject({
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            listId: 'list-guid',
            libraryRootServerRelativeUrl: '/sites/schedule/library',
        });
    });

    it('does not call SharePoint for a child of an unverified manual target', async () => {
        const ensureFolder = vi.fn();
        const service = createNavigationSharePointService({
            resolveWebIdentity: () => identity,
            createSession: vi.fn().mockResolvedValue(session),
            probeFolder: vi.fn(),
            ensureFolder,
        });

        await expect(service.provisionSubcategory({
            displayName: 'תכנון',
            provisionKey: 'node-2',
            parentBinding: { mode: 'manual' },
        })).rejects.toMatchObject({ code: 'INVALID_SHAREPOINT_PARENT' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('surfaces SharePoint permission failures with an actionable Hebrew message', async () => {
        const denied = Object.assign(new Error('Forbidden'), { status: 403 });
        const service = createNavigationSharePointService({
            resolveWebIdentity: () => identity,
            createSession: vi.fn().mockRejectedValue(denied),
        });

        await expect(service.provisionCategory({
            displayName: 'קטגוריה',
            provisionKey: 'node-1',
        })).rejects.toEqual(expect.objectContaining({
            code: 'SHAREPOINT_AUTH_FAILURE',
            userMessage: expect.stringContaining('הרשאת'),
        }));
    });

    it('rejects missing or illegal display names before provisioning', () => {
        expect(() => buildSharePointNavigationSegment('', 'node-1')).toThrow(NavigationSharePointProvisioningError);
        expect(() => buildSharePointNavigationSegment('תיקייה/אסורה', 'node-1')).toThrowError(expect.objectContaining({
            code: 'INVALID_NAME',
        }));
    });
});
