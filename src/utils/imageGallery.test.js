import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MAGAL_STRIPS_SETTINGS,
    getActiveImageGalleries,
    getImageGalleryValidationIssues,
    normalizeImageGalleryBranch,
    normalizeImageGalleryDisplay,
    normalizeMagalStripsSettings,
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

    it('provides backward-compatible Magal strip defaults for existing galleries', () => {
        const branch = normalizeImageGalleryBranch({
            items: [{ id: 'legacy', title: 'Legacy', style: 'classic-carousel', images: [validImage] }],
        });

        expect(branch.items[0].style).toBe('classic-carousel');
        expect(branch.items[0].display).toMatchObject({
            showTitle: true,
            showDescription: true,
            titleAlignment: 'center',
        });
        expect(branch.items[0].display.magalStrips).toEqual({
            rowCount: 2,
            cardSizePx: 180,
            gapPx: 12,
            rows: DEFAULT_MAGAL_STRIPS_SETTINGS.rows.map((row) => ({ ...row })),
        });
    });

    it('normalizes and persists Magal row direction, speed, angle, size, and gap', () => {
        const settings = normalizeMagalStripsSettings({
            rowCount: 3,
            cardSizePx: 220,
            gapPx: 18,
            rows: [
                { direction: 'right', durationSeconds: 27.5, angleDegrees: -4.5 },
                { direction: 'left', speedSeconds: 51, angle: 5 },
                { direction: 'right', durationSeconds: 62, angleDegrees: 1.5 },
            ],
        });
        const branch = normalizeImageGalleryBranch({
            items: [{
                id: 'magal',
                title: 'Magal',
                style: 'magal-strips',
                images: [validImage],
                display: { magalStrips: settings },
            }],
        });

        expect(branch.items[0].style).toBe('magal-strips');
        expect(branch.items[0].display.magalStrips).toMatchObject({
            rowCount: 3,
            cardSizePx: 220,
            gapPx: 18,
        });
        expect(branch.items[0].display.magalStrips.rows.slice(0, 3)).toMatchObject([
            { direction: 'right', durationSeconds: 27.5, angleDegrees: -4.5 },
            { direction: 'left', durationSeconds: 51, angleDegrees: 5 },
            { direction: 'right', durationSeconds: 62, angleDegrees: 1.5 },
        ]);
    });

    it('normalizes and persists backward-compatible heading visibility and alignment settings', () => {
        const branch = normalizeImageGalleryBranch({
            items: [{
                id: 'custom-heading',
                title: 'Custom heading',
                images: [validImage],
                display: {
                    showTitle: false,
                    showDescription: false,
                    titleAlignment: 'right',
                },
            }],
        });

        expect(branch.items[0].display).toMatchObject({
            showTitle: false,
            showDescription: false,
            titleAlignment: 'right',
        });
        expect(normalizeImageGalleryDisplay({ titleAlignment: 'unsupported' })).toMatchObject({
            showTitle: true,
            showDescription: true,
            titleAlignment: 'center',
        });
        expect(normalizeImageGalleryDisplay(undefined, {
            showTitle: false,
            showDescription: true,
            titleAlignment: 'right',
        })).toMatchObject({
            showTitle: false,
            showDescription: true,
            titleAlignment: 'right',
        });
    });
});
