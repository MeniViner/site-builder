import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
    KASHAR_ASSET_REFERENCE_PREFIX,
    KasharAssetStore,
    collectKasharAssetReferences,
} from './KasharAssetStore';

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

function imageFile(bytes = PNG_BYTES, { name = 'logo.png', type = 'image/png' } = {}) {
    return {
        name,
        type,
        size: bytes.byteLength,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
}

function createStore() {
    const urls = {
        createObjectURL: vi.fn(() => 'blob:kashar-test-asset'),
        revokeObjectURL: vi.fn(),
    };
    const factory = new IDBFactory();
    return {
        store: new KasharAssetStore({
            indexedDBFactory: () => factory,
            urlApi: urls,
            now: () => '2026-08-04T10:00:00.000Z',
            readDimensions: async () => ({ width: 640, height: 480 }),
        }),
        urls,
    };
}

describe('KasharAssetStore', () => {
    it('stores an image Blob record under a stable non-blob reference', async () => {
        const { store } = createStore();

        const asset = await store.put(imageFile(), { category: 'Logo' });
        const record = await store.get(asset.reference);

        expect(asset.reference).toMatch(new RegExp(`^${KASHAR_ASSET_REFERENCE_PREFIX}`));
        expect(asset.reference).not.toMatch(/^blob:/);
        expect(record).toMatchObject({
            id: asset.id,
            originalFilename: 'logo.png',
            mimeType: 'image/png',
            userUploaded: true,
            fixtureProvided: false,
            category: 'Logo',
        });
        // fake-indexeddb does not retain JSDOM Blobs, so assert the
        // structured-clone-safe binary fallback rather than the runtime Blob.
        expect(record.binaryBase64).toEqual(expect.any(String));
    });

    it('rejects unsafe or invalid image content before persisting it', async () => {
        const { store } = createStore();
        const unsafeSvg = new TextEncoder().encode('<svg><script>alert(1)</script></svg>');

        await expect(store.put(imageFile(unsafeSvg, { name: 'unsafe.svg', type: 'image/svg+xml' }))).rejects.toMatchObject({
            code: 'unsupported_image',
        });
        await expect(store.list()).resolves.toEqual([]);
    });

    it('deduplicates equal files and releases cached object URLs only after all consumers release', async () => {
        const { store, urls } = createStore();
        const first = await store.put(imageFile());
        const duplicate = await store.put(imageFile());

        expect(duplicate.reference).toBe(first.reference);
        const firstUse = await store.acquireObjectUrl(first.reference);
        const secondUse = await store.acquireObjectUrl(first.reference);
        expect(urls.createObjectURL).toHaveBeenCalledTimes(1);
        firstUse.release();
        expect(urls.revokeObjectURL).not.toHaveBeenCalled();
        secondUse.release();
        expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:kashar-test-asset');
    });

    it('exports referenced assets and restores them through a self-contained export payload', async () => {
        const source = createStore();
        const asset = await source.store.put(imageFile());
        const exported = await source.store.exportAll([asset.reference]);
        const destination = createStore();

        await destination.store.replaceUserAssets(exported);

        await expect(destination.store.exists(asset.reference)).resolves.toBe(true);
        expect(exported[0]).toMatchObject({
            id: asset.id,
            reference: asset.reference,
            mimeType: 'image/png',
            binaryBase64: expect.any(String),
        });
    });

    it('does not remove an asset while it is still referenced elsewhere', async () => {
        const { store } = createStore();
        const shared = await store.put(imageFile());
        const other = await store.put(imageFile(new Uint8Array([...PNG_BYTES, 0x01]), { name: 'other.png' }));

        await store.cleanupUnreferenced([shared.reference]);

        await expect(store.exists(shared.reference)).resolves.toBe(true);
        await expect(store.exists(other.reference)).resolves.toBe(false);
    });

    it('collects asset references from all draft branches without treating fixture paths as local assets', () => {
        const refs = [...collectKasharAssetReferences({
            hero: { logo: 'kashar-asset:logo-1234567', backgroundImages: ['/images/kashar-demo/hero.jpg'] },
            galleries: [{ mediaRef: 'kashar-asset:gallery-1234567' }],
        })];
        expect(refs).toEqual(['kashar-asset:logo-1234567', 'kashar-asset:gallery-1234567']);
    });
});
