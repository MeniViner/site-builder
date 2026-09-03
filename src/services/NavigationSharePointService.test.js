import { describe, expect, it, vi } from 'vitest';
import {
    NavigationSharePointProvisioningError,
    buildNavigationProvisionKey,
    buildSharePointNavigationSegment,
    createNavigationSharePointService,
    validateSharePointNavigationName,
} from './NavigationSharePointService';

const identity = {
    siteRoot: '/sites/alphateam',
    currentWebUrl: 'https://portal.example/sites/alphateam',
};

const createSessionMock = () => vi.fn().mockResolvedValue({
    siteRoot: identity.siteRoot,
    digest: 'digest',
    request: vi.fn(),
    logs: [],
});

const LIBRARY_ROOT = '/sites/alphateam/מסמכים מקצועיים';
const LEVEL_2_FOLDER = `${LIBRARY_ROOT}/תכניות עבודה`;
const LEVEL_3_FOLDER = `${LEVEL_2_FOLDER}/2026`;

const libraryBinding = {
    mode: 'sharepoint-auto',
    targetKind: 'library',
    state: 'verified',
    serverRelativeUrl: LIBRARY_ROOT,
    libraryRootServerRelativeUrl: LIBRARY_ROOT,
    libraryTitle: 'מסמכים מקצועיים',
    listId: 'list-guid',
    provisionKey: 'library:מסמכים מקצועיים',
};

const level2Binding = {
    mode: 'sharepoint-auto',
    targetKind: 'folder',
    state: 'verified',
    serverRelativeUrl: LEVEL_2_FOLDER,
    libraryRootServerRelativeUrl: LIBRARY_ROOT,
    parentServerRelativeUrl: LIBRARY_ROOT,
    libraryTitle: 'מסמכים מקצועיים',
    listId: 'list-guid',
    provisionKey: `folder:list-guid:${LIBRARY_ROOT}:תכניות עבודה`,
};

const MISSING_PROBE = Object.freeze({ ready: false, exists: false, reason: 'FOLDER_NOT_FOUND', status: 404 });
const readyLibraryProbe = (id = 'list-guid') => ({ ready: true, exists: true, id, status: 200 });
const readyFolderProbe = () => ({ ready: true, exists: true, id: 12, status: 200 });

/**
 * Probe stub driven by an explicit path -> probe map. Any path that is not listed
 * is reported as missing, which is the normal "name is still free" state.
 */
function probeFolderFor(pathResults) {
    return vi.fn(async ({ folderRel }) => pathResults[folderRel] || MISSING_PROBE);
}

const verifiedLibrary = (rootServerRelativeUrl, title) => ({
    listId: 'list-guid',
    title,
    baseTemplate: 101,
    rootServerRelativeUrl,
    welcomePage: 'Forms/AllItems.aspx',
    onQuickLaunch: true,
    wasCreated: true,
});

function createService(overrides = {}) {
    return createNavigationSharePointService({
        resolveWebIdentity: () => identity,
        createSession: createSessionMock(),
        probeFolder: probeFolderFor({}),
        ensureFolder: vi.fn(async ({ folderRel }) => ({ created: true, path: folderRel, probe: { ready: true } })),
        provisionLibrary: vi.fn(async ({ title, rootServerRelativeUrl }) => verifiedLibrary(rootServerRelativeUrl, title)),
        ...overrides,
    });
}

function expectThrownCode(fn, code) {
    let thrown = null;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeInstanceOf(NavigationSharePointProvisioningError);
    expect(thrown.code).toBe(code);
    expect(thrown.userMessage).toBeTruthy();
}

describe('physical SharePoint naming', () => {
    it('uses the Hebrew display name verbatim, with no kind, hash, UUID or numeric suffix', () => {
        expect(buildSharePointNavigationSegment('בדיקה')).toBe('בדיקה');
        expect(buildSharePointNavigationSegment('בדיקה')).not.toMatch(/-folder|-library|[0-9a-z]{7}$/);
    });

    it('preserves spaces and collapses only redundant whitespace', () => {
        expect(buildSharePointNavigationSegment('  תכניות   עבודה  ')).toBe('תכניות עבודה');
        expect(buildSharePointNavigationSegment('Annual Plans 2026')).toBe('Annual Plans 2026');
    });

    it('is stable across retries and independent of any provisioning key', () => {
        expect(buildSharePointNavigationSegment('בדיקה')).toBe(buildSharePointNavigationSegment('בדיקה'));
    });

    it('rejects illegal names clearly instead of silently rewriting them', () => {
        expectThrownCode(() => buildSharePointNavigationSegment(''), 'INVALID_NAME');
        expectThrownCode(() => buildSharePointNavigationSegment('תיקייה/אסורה'), 'INVALID_NAME');
        expectThrownCode(() => buildSharePointNavigationSegment('תכנון % ו#בקרה'), 'INVALID_NAME');
        expectThrownCode(() => buildSharePointNavigationSegment('דוח.'), 'INVALID_NAME');
        expectThrownCode(() => buildSharePointNavigationSegment('Forms'), 'INVALID_NAME');
        expectThrownCode(() => buildSharePointNavigationSegment('שם\u0007רע'), 'INVALID_NAME');
        expectThrownCode(() => validateSharePointNavigationName('א'.repeat(129)), 'INVALID_NAME');
    });

    it('names the physical library exactly like the display name', async () => {
        const provisionLibrary = vi.fn(async ({ title, rootServerRelativeUrl }) => verifiedLibrary(rootServerRelativeUrl, title));
        const service = createService({ provisionLibrary });

        const result = await service.provisionCategory({ displayName: 'בדיקה', provisionKey: 'library:בדיקה' });

        expect(provisionLibrary).toHaveBeenCalledWith(expect.objectContaining({
            title: 'בדיקה',
            rootServerRelativeUrl: '/sites/alphateam/בדיקה',
        }));
        expect(result.url).toBe('/sites/alphateam/בדיקה');
        expect(result.targetBinding).toMatchObject({
            targetKind: 'library',
            state: 'verified',
            physicalName: 'בדיקה',
            listId: 'list-guid',
        });
    });

    it('names the physical folder exactly like the display name', async () => {
        const ensureFolder = vi.fn(async ({ folderRel }) => ({ created: true, path: folderRel, probe: { ready: true } }));
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({ [LIBRARY_ROOT]: readyLibraryProbe() }),
        });

        await service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
        });

        expect(ensureFolder).toHaveBeenCalledWith(expect.objectContaining({ folderRel: LEVEL_2_FOLDER }));
    });
});

describe('provisioning keys', () => {
    it('derives retry-stable keys from the normalized name', () => {
        expect(buildNavigationProvisionKey({ displayName: '  תכנון   עבודה ', targetKind: 'library' }))
            .toBe(buildNavigationProvisionKey({ displayName: 'תכנון עבודה', targetKind: 'library' }));
    });

    it('includes the immediate parent so identical names under different parents stay distinct', () => {
        const underLibrary = buildNavigationProvisionKey({
            displayName: '2026',
            targetKind: 'folder',
            parentBinding: libraryBinding,
        });
        const underLevel2 = buildNavigationProvisionKey({
            displayName: '2026',
            targetKind: 'folder',
            parentBinding: level2Binding,
        });

        expect(underLibrary).not.toBe(underLevel2);
        expect(underLevel2).toContain('תכניות עבודה');
    });

    it('refuses to build a folder key without a stable parent identity', () => {
        expectThrownCode(
            () => buildNavigationProvisionKey({ displayName: 'תיקייה', targetKind: 'folder', parentBinding: { mode: 'manual' } }),
            'INVALID_PARENT_BINDING',
        );
    });
});

describe('exact-name collision behaviour', () => {
    it('refuses to create a second library when the exact name already exists', async () => {
        const provisionLibrary = vi.fn();
        const service = createService({
            provisionLibrary,
            probeFolder: probeFolderFor({ '/sites/alphateam/בדיקה': readyLibraryProbe('other-list') }),
        });

        await expect(service.provisionCategory({ displayName: 'בדיקה', provisionKey: 'library:בדיקה' }))
            .rejects.toMatchObject({
                code: 'SHAREPOINT_LIBRARY_ALREADY_EXISTS',
                userMessage: 'כבר קיימת ספריית מסמכים בשם הזה במיקום שנבחר. יש לבחור שם אחר או לקשר ליעד הקיים.',
            });
        // No fallback name is invented, and nothing is created.
        expect(provisionLibrary).not.toHaveBeenCalled();
    });

    it('refuses to create a second folder when the exact path already exists', async () => {
        const ensureFolder = vi.fn();
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({
                [LIBRARY_ROOT]: readyLibraryProbe(),
                [LEVEL_2_FOLDER]: readyFolderProbe(),
            }),
        });

        await expect(service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
        })).rejects.toMatchObject({
            code: 'SHAREPOINT_FOLDER_ALREADY_EXISTS',
            userMessage: 'כבר קיימת תיקייה בשם הזה במיקום שנבחר. יש לבחור שם אחר או לקשר ליעד הקיים.',
        });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('still succeeds for a genuine idempotent retry of the same provisioning attempt', async () => {
        const provisionLibrary = vi.fn(async ({ title, rootServerRelativeUrl }) => verifiedLibrary(rootServerRelativeUrl, title));
        const service = createService({
            provisionLibrary,
            probeFolder: probeFolderFor({ '/sites/alphateam/בדיקה': readyLibraryProbe() }),
        });

        const result = await service.provisionCategory({
            displayName: 'בדיקה',
            provisionKey: 'library:בדיקה',
            retryOfProvisionKey: 'library:בדיקה',
        });

        expect(provisionLibrary).toHaveBeenCalledOnce();
        expect(result.targetBinding.serverRelativeUrl).toBe('/sites/alphateam/בדיקה');
    });

    it('flags a failure as retryable only once a mutating SharePoint call was reached', async () => {
        // A collision is detected before anything is created, so a repeat click
        // must not be able to arm an idempotent retry from it.
        const collided = createService({
            provisionLibrary: vi.fn(),
            probeFolder: probeFolderFor({ '/sites/alphateam/בדיקה': readyLibraryProbe('other-list') }),
        });
        await expect(collided.provisionCategory({ displayName: 'בדיקה', provisionKey: 'k' }))
            .rejects.toMatchObject({ code: 'SHAREPOINT_LIBRARY_ALREADY_EXISTS', mutationAttempted: false });

        // Neither may an auth failure raised before the collision probe.
        const denied = createService({ createSession: vi.fn().mockRejectedValue(Object.assign(new Error('403'), { status: 403 })) });
        await expect(denied.provisionCategory({ displayName: 'בדיקה', provisionKey: 'k' }))
            .rejects.toMatchObject({ mutationAttempted: false });

        // Nor a parent-readiness failure, which happens before ensureFolder.
        const unreadyParent = createService({
            probeFolder: probeFolderFor({ [LIBRARY_ROOT]: readyLibraryProbe() }),
        });
        await expect(unreadyParent.provisionNestedFolder({ displayName: '2026', provisionKey: 'k', parentBinding: level2Binding }))
            .rejects.toMatchObject({ code: 'SHAREPOINT_PARENT_FOLDER_NOT_READY', mutationAttempted: false });

        // A post-creation verification failure did mutate SharePoint, so it is retryable.
        const unverified = createService({
            probeFolder: probeFolderFor({ [LIBRARY_ROOT]: readyLibraryProbe() }),
            ensureFolder: vi.fn(async ({ folderRel }) => ({ created: true, path: folderRel, probe: { ready: false } })),
        });
        await expect(unverified.provisionSubcategory({ displayName: 'תכנון', provisionKey: 'k', parentBinding: libraryBinding }))
            .rejects.toMatchObject({ code: 'FOLDER_VERIFICATION_FAILED', mutationAttempted: true });
    });

    it('treats an already-verified binding for the same path as an idempotent retry', async () => {
        const ensureFolder = vi.fn(async ({ folderRel }) => ({ created: false, path: folderRel, probe: { ready: true } }));
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({
                [LIBRARY_ROOT]: readyLibraryProbe(),
                [LEVEL_2_FOLDER]: readyFolderProbe(),
            }),
        });

        const result = await service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
            existingBinding: level2Binding,
        });

        expect(ensureFolder).toHaveBeenCalledOnce();
        expect(result.targetBinding.serverRelativeUrl).toBe(LEVEL_2_FOLDER);
    });

    it('does not accept a verified binding for a different path as an idempotent retry', async () => {
        const ensureFolder = vi.fn();
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({
                [LIBRARY_ROOT]: readyLibraryProbe(),
                [LEVEL_2_FOLDER]: readyFolderProbe(),
            }),
        });

        await expect(service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
            existingBinding: { ...level2Binding, serverRelativeUrl: `${LIBRARY_ROOT}/משהו אחר` },
        })).rejects.toMatchObject({ code: 'SHAREPOINT_FOLDER_ALREADY_EXISTS' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('does not accept a hand-written or unverified existingBinding as an idempotent retry', async () => {
        const ensureFolder = vi.fn();
        const service = () => createService({
            ensureFolder,
            probeFolder: probeFolderFor({
                [LIBRARY_ROOT]: readyLibraryProbe(),
                [LEVEL_2_FOLDER]: readyFolderProbe(),
            }),
        });
        const attempt = (existingBinding) => service().provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
            existingBinding,
        });

        // Forged config value that never went through a verified provisioning run.
        await expect(attempt({
            mode: 'sharepoint-auto',
            targetKind: 'folder',
            serverRelativeUrl: LEVEL_2_FOLDER,
            libraryRootServerRelativeUrl: LIBRARY_ROOT,
        })).rejects.toMatchObject({ code: 'SHAREPOINT_FOLDER_ALREADY_EXISTS' });

        // Verified-looking, but claiming a different owning list.
        await expect(attempt({ ...level2Binding, listId: 'someone-elses-list' }))
            .rejects.toMatchObject({ code: 'SHAREPOINT_FOLDER_ALREADY_EXISTS' });

        // Verified path and list, but the binding was never marked verified.
        await expect(attempt({ ...level2Binding, state: 'provisioning' }))
            .rejects.toMatchObject({ code: 'SHAREPOINT_FOLDER_ALREADY_EXISTS' });

        expect(ensureFolder).not.toHaveBeenCalled();
    });
});

describe('three-level SharePoint hierarchy', () => {
    it('level 1 creates a verified document library under the current web', async () => {
        const service = createService();
        const result = await service.provisionCategory({
            displayName: 'מסמכים מקצועיים',
            provisionKey: 'library:מסמכים מקצועיים',
        });

        expect(result.targetBinding).toMatchObject({
            targetKind: 'library',
            serverRelativeUrl: LIBRARY_ROOT,
            libraryRootServerRelativeUrl: LIBRARY_ROOT,
        });
    });

    it('level 2 creates a folder directly inside the level-1 library', async () => {
        const probeFolder = probeFolderFor({ [LIBRARY_ROOT]: readyLibraryProbe() });
        const ensureFolder = vi.fn(async ({ folderRel }) => ({ created: true, path: folderRel, probe: { ready: true } }));
        const service = createService({ probeFolder, ensureFolder });

        const result = await service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
        });

        expect(ensureFolder).toHaveBeenCalledWith(expect.objectContaining({
            siteRoot: '/sites/alphateam',
            folderRel: LEVEL_2_FOLDER,
            libraries: [{ title: 'מסמכים מקצועיים', rootRel: LIBRARY_ROOT }],
        }));
        expect(result.targetBinding).toMatchObject({
            targetKind: 'folder',
            serverRelativeUrl: LEVEL_2_FOLDER,
            parentServerRelativeUrl: LIBRARY_ROOT,
            libraryRootServerRelativeUrl: LIBRARY_ROOT,
            listId: 'list-guid',
        });
    });

    it('level 3 creates a folder inside the verified level-2 folder', async () => {
        const ensureFolder = vi.fn(async ({ folderRel }) => ({ created: true, path: folderRel, probe: { ready: true } }));
        const probeFolder = probeFolderFor({
            [LIBRARY_ROOT]: readyLibraryProbe(),
            [LEVEL_2_FOLDER]: readyFolderProbe(),
        });
        const service = createService({ probeFolder, ensureFolder });

        const result = await service.provisionNestedFolder({
            displayName: '2026',
            provisionKey: 'k3',
            parentBinding: level2Binding,
        });

        expect(ensureFolder).toHaveBeenCalledWith(expect.objectContaining({
            folderRel: LEVEL_3_FOLDER,
            // The owning library, not the immediate parent folder, stays the isolation boundary.
            libraries: [{ title: 'מסמכים מקצועיים', rootRel: LIBRARY_ROOT }],
        }));
        expect(result.url).toBe(LEVEL_3_FOLDER);
        expect(result.targetBinding).toMatchObject({
            targetKind: 'folder',
            serverRelativeUrl: LEVEL_3_FOLDER,
            parentServerRelativeUrl: LEVEL_2_FOLDER,
            libraryRootServerRelativeUrl: LIBRARY_ROOT,
            listId: 'list-guid',
            physicalName: '2026',
        });
    });

    it('verifies the parent folder before creating the nested folder', async () => {
        const calls = [];
        const probeFolder = vi.fn(async ({ folderRel, purpose }) => {
            calls.push(`probe:${purpose}`);
            return { [LIBRARY_ROOT]: readyLibraryProbe(), [LEVEL_2_FOLDER]: readyFolderProbe() }[folderRel] || MISSING_PROBE;
        });
        const ensureFolder = vi.fn(async ({ folderRel }) => {
            calls.push('ensureFolder');
            return { created: true, path: folderRel, probe: { ready: true } };
        });
        const service = createService({ probeFolder, ensureFolder });

        await service.provisionNestedFolder({ displayName: '2026', provisionKey: 'k3', parentBinding: level2Binding });

        expect(calls).toEqual([
            'probe:navigation-parent-library-verification',
            'probe:navigation-parent-folder-verification',
            'probe:navigation-folder-collision-check',
            'ensureFolder',
        ]);
    });

    it('refuses to create a level-4 folder underneath a level-3 folder', async () => {
        const ensureFolder = vi.fn();
        const level3Binding = {
            ...level2Binding,
            serverRelativeUrl: LEVEL_3_FOLDER,
            parentServerRelativeUrl: LEVEL_2_FOLDER,
        };
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({
                [LIBRARY_ROOT]: readyLibraryProbe(),
                [LEVEL_3_FOLDER]: readyFolderProbe(),
            }),
        });

        await expect(service.provisionNestedFolder({
            displayName: 'רבעון 1',
            provisionKey: 'k4',
            parentBinding: level3Binding,
        })).rejects.toMatchObject({ code: 'NAVIGATION_DEPTH_EXCEEDED' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });
});

describe('SharePoint isolation and identity', () => {
    it('verifies the owning library identity before touching a nested parent folder', async () => {
        const ensureFolder = vi.fn();
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({
                [LIBRARY_ROOT]: readyLibraryProbe('a-completely-different-list'),
                [LEVEL_2_FOLDER]: readyFolderProbe(),
            }),
        });

        await expect(service.provisionNestedFolder({
            displayName: '2026',
            provisionKey: 'k3',
            parentBinding: level2Binding,
        })).rejects.toMatchObject({ code: 'SHAREPOINT_PARENT_IDENTITY_MISMATCH' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('refuses a nested parent folder that is not ready in SharePoint', async () => {
        const ensureFolder = vi.fn();
        const service = createService({
            ensureFolder,
            probeFolder: probeFolderFor({ [LIBRARY_ROOT]: readyLibraryProbe() }),
        });

        await expect(service.provisionNestedFolder({
            displayName: '2026',
            provisionKey: 'k3',
            parentBinding: level2Binding,
        })).rejects.toMatchObject({ code: 'SHAREPOINT_PARENT_FOLDER_NOT_READY' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('refuses a parent folder that claims a library it does not live inside', async () => {
        const ensureFolder = vi.fn();
        const service = createService({ ensureFolder });

        await expect(service.provisionNestedFolder({
            displayName: '2026',
            provisionKey: 'k3',
            parentBinding: { ...level2Binding, serverRelativeUrl: '/sites/alphateam/ספרייה אחרת/תיקייה' },
        })).rejects.toMatchObject({ code: 'SHAREPOINT_PARENT_OUTSIDE_LIBRARY' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('rejects a parent library that belongs to a different SharePoint web', async () => {
        const ensureFolder = vi.fn();
        const service = createService({ ensureFolder });

        await expect(service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: {
                ...libraryBinding,
                serverRelativeUrl: '/sites/other/ספרייה',
                libraryRootServerRelativeUrl: '/sites/other/ספרייה',
            },
        })).rejects.toMatchObject({ code: 'SHAREPOINT_PARENT_OUTSIDE_CURRENT_WEB' });
        expect(ensureFolder).not.toHaveBeenCalled();
    });

    it('never calls SharePoint for a child of a manual or unverified parent', async () => {
        const ensureFolder = vi.fn();
        const createSession = createSessionMock();
        const service = createService({ ensureFolder, createSession });

        await expect(service.provisionSubcategory({
            displayName: 'תכנון',
            provisionKey: 'k',
            parentBinding: { mode: 'manual' },
        })).rejects.toMatchObject({ code: 'INVALID_SHAREPOINT_PARENT' });

        await expect(service.provisionNestedFolder({
            displayName: 'תכנון',
            provisionKey: 'k',
            parentBinding: { ...level2Binding, listId: '' },
        })).rejects.toMatchObject({ code: 'INVALID_SHAREPOINT_PARENT' });

        expect(ensureFolder).not.toHaveBeenCalled();
        expect(createSession).not.toHaveBeenCalled();
    });

    it('rejects an unverified library instead of returning a false-success node', async () => {
        const service = createService({
            provisionLibrary: vi.fn().mockResolvedValue({
                listId: 'list-guid',
                title: 'קטגוריה',
                baseTemplate: 101,
                rootServerRelativeUrl: '/sites/alphateam/קטגוריה',
                welcomePage: '',
                onQuickLaunch: true,
            }),
        });

        await expect(service.provisionCategory({ displayName: 'קטגוריה', provisionKey: 'library:קטגוריה' }))
            .rejects.toMatchObject({ code: 'LIBRARY_VERIFICATION_FAILED' });
    });

    it('rejects a folder whose post-creation readiness check fails', async () => {
        const service = createService({
            probeFolder: probeFolderFor({ [LIBRARY_ROOT]: readyLibraryProbe() }),
            ensureFolder: vi.fn(async ({ folderRel }) => ({ created: true, path: folderRel, probe: { ready: false } })),
        });

        await expect(service.provisionSubcategory({
            displayName: 'תכניות עבודה',
            provisionKey: 'k',
            parentBinding: libraryBinding,
        })).rejects.toMatchObject({ code: 'FOLDER_VERIFICATION_FAILED' });
    });

    it('surfaces SharePoint permission failures with an actionable Hebrew message', async () => {
        const denied = Object.assign(new Error('Forbidden'), { status: 403 });
        const service = createService({ createSession: vi.fn().mockRejectedValue(denied) });

        await expect(service.provisionCategory({ displayName: 'קטגוריה', provisionKey: 'library:קטגוריה' }))
            .rejects.toMatchObject({
                code: 'SHAREPOINT_AUTH_FAILURE',
                userMessage: expect.stringContaining('הרשאת'),
            });
    });

    it('reports a denied collision probe as a permission failure rather than a free name', async () => {
        const provisionLibrary = vi.fn();
        const service = createService({
            provisionLibrary,
            probeFolder: probeFolderFor({ '/sites/alphateam/בדיקה': { ready: false, exists: false, status: 403 } }),
        });

        await expect(service.provisionCategory({ displayName: 'בדיקה', provisionKey: 'library:בדיקה' }))
            .rejects.toMatchObject({ code: 'SHAREPOINT_AUTH_FAILURE' });
        expect(provisionLibrary).not.toHaveBeenCalled();
    });
});
