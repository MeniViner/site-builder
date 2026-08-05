import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    isKashar: true,
    put: vi.fn(),
    runExclusive: vi.fn((operation) => operation()),
}));

vi.mock('../demo-data/demoProfile', () => ({
    isKasharDemoProfile: () => mocks.isKashar,
}));

vi.mock('../services/KasharAssetStore', () => ({
    kasharAssetStore: { put: mocks.put },
}));

vi.mock('../services/KasharDraftStore', () => ({
    default: { runExclusive: mocks.runExclusive },
}));

import { uploadImage } from './sharepointUtils';

describe('uploadImage Kashar boundary', () => {
    afterEach(() => {
        mocks.isKashar = true;
        mocks.put.mockReset();
        mocks.runExclusive.mockClear();
        vi.unstubAllGlobals();
    });

    it('stores Kashar uploads locally and never calls the SharePoint HTTP endpoint', async () => {
        const file = new File(['image'], 'logo.png', { type: 'image/png' });
        mocks.put.mockResolvedValue({ reference: 'kashar-asset:local-logo-1234567' });
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(uploadImage(file, 'Logo')).resolves.toBe('kashar-asset:local-logo-1234567');

        expect(mocks.runExclusive).toHaveBeenCalledTimes(1);
        expect(mocks.put).toHaveBeenCalledWith(file, { category: 'Logo' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
