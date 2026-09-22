import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isKashar: false,
}));

vi.mock('../demo-data/demoProfile', () => ({
    isKasharDemoProfile: () => mocks.isKashar,
}));

import { resolveSiteImageUrl } from './assetUrl';
import { ensureSharePointFolderHierarchy, uploadImage } from './sharepointUtils';

const siteRoot = '/sites/test-site';
const imagesRoot = `${siteRoot}/siteDB/images`;
const response = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
});
const imageFile = (body = 'image contents', name = 'badge.png') => ({
    name,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
});

function createSharePointFetch({
    uploadPayload,
    existingPaths = [ `${siteRoot}/siteDB`, imagesRoot ],
} = {}) {
    const existing = new Set(existingPaths);
    const uploadedFiles = new Map();
    class ClientContext {
        get_web() {
            return {
                get_lists: () => ({
                    getById: () => ({
                        addItem: (creation) => ({
                            update: () => {
                                existing.add(`${creation.parentRel}/${creation.leafName}`);
                            },
                            get_id: () => existing.size,
                        }),
                    }),
                }),
            };
        }
        load() {}
        executeQueryAsync(success) {
            success();
        }
    }
    class ListItemCreationInformation {
        set_underlyingObjectType() {}
        set_folderUrl(value) {
            this.parentRel = value;
        }
        set_leafName(value) {
            this.leafName = value;
        }
    }
    vi.stubGlobal('SP', {
        ClientContext,
        ListCreationInformation: class {},
        ListItemCreationInformation,
        FileSystemObjectType: { folder: 1 },
    });

    return vi.fn(async (url, options = {}) => {
        const decodedUrl = decodeURIComponent(String(url));
        if (url.includes('/_api/contextinfo')) {
            return response({ d: { GetContextWebInformation: { FormDigestValue: 'digest' } } });
        }
        if (url.includes("GetByTitle('siteDB')")) {
            return response({
                d: {
                    Id: 'site-db-list',
                    Title: 'siteDB',
                    BaseTemplate: 101,
                    RootFolder: { ServerRelativeUrl: `${siteRoot}/siteDB` },
                },
            });
        }
        if (url.includes("GetByTitle('siteUsersDb')")) {
            return response({
                d: {
                    Id: 'users-db-list',
                    Title: 'siteUsersDb',
                    BaseTemplate: 101,
                    RootFolder: { ServerRelativeUrl: `${siteRoot}/siteUsersDb` },
                },
            });
        }
        if (url.includes('GetFileByServerRelativeUrl')) {
            const filePath = decodedUrl.match(/GetFileByServerRelativeUrl\('([^']+)'\)/)?.[1] || '';
            const stored = uploadedFiles.get(filePath);
            return stored
                ? response({
                    d: {
                        Exists: true,
                        Name: filePath.split('/').pop(),
                        ServerRelativeUrl: filePath,
                        Length: stored.byteLength,
                        ListItemAllFields: { Id: 91 },
                    },
                })
                : response({}, 404);
        }
        if (/\/Files\/add\(/i.test(String(url))) {
            const folder = decodedUrl.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/)?.[1] || '';
            const fileName = decodedUrl.match(/url='([^']+)'/)?.[1] || '';
            const filePath = `${folder}/${fileName}`;
            uploadedFiles.set(filePath, options.body);
            return response(uploadPayload ?? { d: { Name: fileName, ServerRelativeUrl: filePath } });
        }
        if (url.includes('/ListItemAllFields')) {
            const folder = decodedUrl.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/)?.[1] || '';
            return existing.has(folder)
                ? response({
                    d: {
                        Id: [...existing].indexOf(folder) + 1,
                        FileSystemObjectType: 1,
                        FileRef: folder,
                        FileDirRef: folder.slice(0, folder.lastIndexOf('/')),
                    },
                })
                : response({}, 404);
        }
        if (url.includes('/Folders?')) {
            const parent = decodedUrl.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/)?.[1] || '';
            const children = [...existing]
                .filter((path) => path.slice(0, path.lastIndexOf('/')) === parent)
                .map((path) => ({
                    Name: path.split('/').pop(),
                    ServerRelativeUrl: path,
                    Exists: true,
                    ListItemAllFields: {
                        Id: [...existing].indexOf(path) + 1,
                        FileSystemObjectType: 1,
                        FileRef: path,
                        FileDirRef: parent,
                    },
                }));
            return response({ d: { results: children } });
        }
        if (url.includes('GetFolderByServerRelativeUrl')) {
            const folder = decodedUrl.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/)?.[1] || '';
            return existing.has(folder)
                ? response({ d: { Exists: true, ServerRelativeUrl: folder } })
                : response({ d: { Exists: false, ServerRelativeUrl: folder } }, 200);
        }
        throw new Error(`Unexpected SharePoint request: ${url}`);
    });
}

describe('SharePoint image uploads', () => {
    afterEach(() => {
        mocks.isKashar = false;
        vi.unstubAllGlobals();
    });

    it('accepts the documented verbose SP.File response and returns its server-relative URL', async () => {
        const url = `${imagesRoot}/ExternalLinks/badge.png`;
        vi.stubGlobal('fetch', createSharePointFetch({
            uploadPayload: { d: { Name: 'badge.png', ServerRelativeUrl: url } },
        }));

        await expect(uploadImage(imageFile(), 'ExternalLinks')).resolves.toBe(url);
    });

    it('accepts the explicitly supported non-verbose SP.File response envelope', async () => {
        const url = `${imagesRoot}/ExternalLinks/badge.png`;
        vi.stubGlobal('fetch', createSharePointFetch({
            uploadPayload: { Name: 'badge.png', ServerRelativeUrl: url },
        }));

        await expect(uploadImage(imageFile(), 'ExternalLinks')).resolves.toBe(url);
    });

    it('rejects a successful response with no usable file reference instead of returning undefined', async () => {
        vi.stubGlobal('fetch', createSharePointFetch({
            uploadPayload: { d: { Name: 'badge.png' } },
        }));

        await expect(uploadImage(imageFile(), 'ExternalLinks'))
            .rejects.toThrow('הסתיימה ללא אימות תקין');
    });

    it('uses the same verified upload path for Navigation icon images', async () => {
        const url = `${imagesRoot}/NavigationIcons/nav.png`;
        vi.stubGlobal('fetch', createSharePointFetch({
            category: 'NavigationIcons',
            uploadPayload: { d: { Name: 'nav.png', ServerRelativeUrl: url } },
        }));

        await expect(uploadImage(imageFile('navigation image', 'nav.png'), 'NavigationIcons')).resolves.toBe(url);
    });

    it.each([
        'Hero',
        'Commander',
        'Logo',
        'Overlay',
        'ExternalLinks',
        'NavigationIcons',
        'OrgChart',
        'ImageGallery',
    ])('routes %s media through the verified runtime images library', async (category) => {
        vi.stubGlobal('fetch', createSharePointFetch());
        const fileName = `${category}.png`;

        await expect(uploadImage(imageFile(`${category} bytes`, fileName), category))
            .resolves.toBe(`${imagesRoot}/${category}/${fileName}`);
    });

    it('does not try to recreate an existing document-library root or image folder', async () => {
        const fetchMock = createSharePointFetch({
            uploadPayload: { d: { Name: 'badge.png', ServerRelativeUrl: `${imagesRoot}/ExternalLinks/badge.png` } },
        });
        vi.stubGlobal('fetch', fetchMock);

        await uploadImage(imageFile(), 'ExternalLinks');

        const createdFolders = fetchMock.mock.calls
            .filter(([url]) => url.endsWith('/_api/web/folders'))
            .map(([, options]) => JSON.parse(options.body).ServerRelativeUrl);
        expect(createdFolders).toEqual([]);
    });

    it('keeps permission failures actionable and never treats them as an existing folder', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'forbidden' }, 403)));

        await expect(ensureSharePointFolderHierarchy(`${imagesRoot}/ExternalLinks`, 'digest'))
            .rejects.toThrow('אין הרשאה מתאימה לביצוע הכנת התיקייה ב-SharePoint');
    });

    it('uses a content-derived cache version when replacing a same-name SharePoint image', async () => {
        const url = `${imagesRoot}/ExternalLinks/badge.png`;
        const fetchMock = createSharePointFetch({
            uploadPayload: { d: { Name: 'badge.png', ServerRelativeUrl: url } },
            existingPaths: [siteRoot, `${siteRoot}/siteDB`, imagesRoot, `${imagesRoot}/ExternalLinks`],
        });
        vi.stubGlobal('fetch', fetchMock);

        await uploadImage(imageFile('first version'), 'ExternalLinks');
        const firstResolvedUrl = resolveSiteImageUrl(url);
        await uploadImage(imageFile('replacement version'), 'ExternalLinks');
        const replacementResolvedUrl = resolveSiteImageUrl(url);

        expect(firstResolvedUrl).toMatch(new RegExp(`^${url}\\?sitebuilderAssetVersion=`));
        expect(replacementResolvedUrl).toMatch(new RegExp(`^${url}\\?sitebuilderAssetVersion=`));
        expect(replacementResolvedUrl).not.toBe(firstResolvedUrl);
        // The uploaded/persisted reference remains the canonical SharePoint path.
        expect(url).not.toContain('?');
    });
});
