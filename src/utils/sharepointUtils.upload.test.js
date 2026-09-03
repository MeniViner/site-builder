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
    folderCreateResponse = response({ d: {} }, 201),
} = {}) {
    const existing = new Set(existingPaths);
    return vi.fn(async (url, options = {}) => {
        if (url.includes('/_api/contextinfo')) {
            return response({ d: { GetContextWebInformation: { FormDigestValue: 'digest' } } });
        }
        if (url.includes('/Files/add(')) {
            return response(uploadPayload);
        }
        if (url.includes('GetFolderByServerRelativeUrl')) {
            const match = url.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/);
            return existing.has(match?.[1]) ? response({ d: { ServerRelativeUrl: match[1] } }) : response({}, 404);
        }
        if (url.endsWith('/_api/web/folders')) {
            const createdPath = JSON.parse(options.body).ServerRelativeUrl;
            existing.add(createdPath);
            return folderCreateResponse;
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
            .rejects.toThrow('לא החזיר נתיב תמונה תקין');
    });

    it('uses the same verified upload path for Navigation icon images', async () => {
        const url = `${imagesRoot}/NavigationIcons/nav.png`;
        vi.stubGlobal('fetch', createSharePointFetch({
            category: 'NavigationIcons',
            uploadPayload: { d: { Name: 'nav.png', ServerRelativeUrl: url } },
        }));

        await expect(uploadImage(imageFile('navigation image', 'nav.png'), 'NavigationIcons')).resolves.toBe(url);
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
        expect(createdFolders).toEqual([`${imagesRoot}/ExternalLinks`]);
    });

    it('handles a localized already-exists response by re-reading the folder after a creation race', async () => {
        const target = `${imagesRoot}/ExternalLinks`;
        let targetReadCount = 0;
        const fetchMock = vi.fn(async (url) => {
            if (url.includes('GetFolderByServerRelativeUrl')) {
                const match = url.match(/GetFolderByServerRelativeUrl\('([^']+)'\)/);
                if (match?.[1] === target) {
                    targetReadCount += 1;
                    return targetReadCount === 1 ? response({}, 404) : response({ d: { ServerRelativeUrl: target } });
                }
                return response({ d: { ServerRelativeUrl: match?.[1] } });
            }
            if (url.endsWith('/_api/web/folders')) {
                return response({ error: { message: { value: 'התיקייה כבר קיימת' } } }, 500);
            }
            throw new Error(`Unexpected SharePoint request: ${url}`);
        });
        vi.stubGlobal('fetch', fetchMock);

        await expect(ensureSharePointFolderHierarchy(target, 'digest')).resolves.toBeUndefined();
        expect(targetReadCount).toBe(2);
    });

    it('keeps permission failures actionable and never treats them as an existing folder', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'forbidden' }, 403)));

        await expect(ensureSharePointFolderHierarchy(`${imagesRoot}/ExternalLinks`, 'digest'))
            .rejects.toThrow('אין הרשאה לקרוא את נתיב התמונות ב-SharePoint (403)');
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
