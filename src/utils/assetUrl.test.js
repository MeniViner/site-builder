import { afterEach, describe, expect, it, vi } from 'vitest';

const assetPath = '/sites/test-site/siteDB/images/ExternalLinks/badge.png';

describe('targeted site-image cache versions', () => {
    afterEach(() => {
        sessionStorage.clear();
        vi.resetModules();
    });

    it('keeps the canonical image path in storage while restoring its content version after reload', async () => {
        const first = await import('./assetUrl');
        first.rememberSiteImageVersion(assetPath, 'content-v2');
        expect(first.resolveSiteImageUrl(assetPath)).toBe(`${assetPath}?sitebuilderAssetVersion=content-v2`);

        // A new module instance models a page reload: the version is recovered
        // from session storage without adding it to the persisted config value.
        vi.resetModules();
        const reloaded = await import('./assetUrl');
        expect(reloaded.resolveSiteImageUrl(assetPath)).toBe(`${assetPath}?sitebuilderAssetVersion=content-v2`);
        expect(assetPath).toBe('/sites/test-site/siteDB/images/ExternalLinks/badge.png');
    });
});
