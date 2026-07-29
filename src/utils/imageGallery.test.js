import { describe, expect, it } from 'vitest';
import {
    getActiveImageGalleries,
    getImageGalleryValidationIssues,
    normalizeImageGalleryBranch,
    reorderGalleryImages,
    reorderImageGalleryItems,
} from './imageGallery';

const validImage = {
    id: 'image-1',
    mediaRef: '/images/gallery-one.webp',
    alt: 'חיילים באימון',
    caption: 'אימון בוקר',
    width: 1280,
    height: 720,
    media: { fileName: 'gallery-one.webp', mimeType: 'image/webp', sizeBytes: 34000 },
};

describe('Image Gallery schema', () => {
    it('normalizes gallery metadata while retaining only media references, never data payloads', () => {
        const branch = normalizeImageGalleryBranch({
            items: [{
                id: 'training-gallery',
                title: 'אימונים',
                style: 'coverflow',
                images: [
                    validImage,
                    { id: 'unsafe', mediaRef: 'data:image/png;base64,large-payload', alt: 'אסור' },
                ],
            }],
        });

        expect(branch.schemaVersion).toBe(1);
        expect(branch.items[0]).toMatchObject({
            id: 'training-gallery',
            title: 'אימונים',
            style: 'coverflow',
        });
        expect(branch.items[0].images[0].media).toEqual(validImage.media);
        expect(branch.items[0].images[1].mediaRef).toBe('');
    });

    it('requires a title, stable media reference, and alt text before a gallery can be published', () => {
        const invalid = {
            id: 'invalid',
            active: true,
            title: '',
            images: [{ ...validImage, alt: '' }],
        };

        expect(getImageGalleryValidationIssues(invalid).map((issue) => issue.field))
            .toEqual(expect.arrayContaining(['title', 'images.image-1.alt']));
        expect(getActiveImageGalleries({ items: [invalid] })).toEqual([]);
    });

    it('supports ordered, visible gallery records and image ordering', () => {
        const branch = normalizeImageGalleryBranch({
            items: [
                { id: 'later', title: 'Later', active: true, order: 8, images: [validImage] },
                { id: 'hidden', title: 'Hidden', active: false, order: 0, images: [validImage] },
                { id: 'first', title: 'First', active: true, order: 3, images: [validImage] },
            ],
        });
        const reordered = reorderImageGalleryItems(branch.items, 'later', 'first');
        const images = reorderGalleryImages([
            validImage,
            { ...validImage, id: 'image-2', mediaRef: '/images/gallery-two.webp', alt: 'מסדר בוקר' },
        ], 'image-2', 'image-1');

        expect(reordered.map((gallery) => gallery.id)).toEqual(['hidden', 'later', 'first']);
        expect(getActiveImageGalleries({ items: reordered }).map((gallery) => gallery.id)).toEqual(['later', 'first']);
        expect(images.map((image) => image.id)).toEqual(['image-2', 'image-1']);
    });

    it('keeps create, update, visibility, ordering, and deletion mutations configuration-safe', () => {
        const created = normalizeImageGalleryBranch({
            items: [
                { id: 'one', title: 'One', active: true, images: [validImage] },
                { id: 'two', title: 'Two', active: true, images: [{ ...validImage, id: 'image-2' }] },
            ],
        });
        const updated = created.items.map((item) => (
            item.id === 'one' ? { ...item, title: 'Updated', active: false } : item
        ));
        const ordered = reorderImageGalleryItems(updated, 'two', 'one');
        const deleted = ordered.filter((item) => item.id !== 'one');

        expect(ordered[0]).toMatchObject({ id: 'two', order: 0 });
        expect(getActiveImageGalleries({ items: updated }).map((item) => item.id)).toEqual(['two']);
        expect(normalizeImageGalleryBranch({ items: deleted }).items).toHaveLength(1);
        expect(normalizeImageGalleryBranch({ items: deleted }).items[0]).toMatchObject({ id: 'two', title: 'Two' });
    });
});
