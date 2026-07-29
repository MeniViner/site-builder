import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_V1, migrateLegacyToV1, validateAndNormalize } from './AppSchema';

describe('migrateLegacyToV1', () => {
    it('preserves default branches when partial legacy data omits them', () => {
        const defaults = validateAndNormalize(DEFAULT_CONFIG_V1);
        const migrated = migrateLegacyToV1({
            theme: {
                primaryColor: '#123456',
            },
        });

        expect(migrated.theme.primaryColor).toBe('#123456');
        expect(migrated.navigation.items).toEqual(defaults.navigation.items);
        expect(migrated.externalLinks.items).toEqual(defaults.externalLinks.items);
        expect(migrated.access.adminUsers).toEqual(defaults.access.adminUsers);
    });

    it('keeps explicit empty legacy branches empty', () => {
        const migrated = migrateLegacyToV1({
            nav: [],
            externalLinks: [],
            users: [],
        });

        expect(migrated.navigation.items).toEqual([]);
        expect(migrated.externalLinks.items).toEqual([]);
        expect(migrated.access.adminUsers).toEqual([]);
    });

    it('preserves legacy navigation target aliases and folder/link intent', () => {
        const migrated = migrateLegacyToV1({
            nav: [
                {
                    id: 'network-root',
                    title: 'Network root',
                    type: 'directory',
                    folderPath: '\\\\fileserver\\public',
                    children: [
                        { id: 'handbook', label: 'Handbook', href: 'smb://fileserver/public/handbook' },
                    ],
                },
            ],
        });

        expect(migrated.navigation.items[0]).toMatchObject({
            id: 'network-root',
            label: 'Network root',
            kind: 'folder',
            url: '\\\\fileserver\\public',
        });
        expect(migrated.navigation.items[0].children[0]).toMatchObject({
            id: 'handbook',
            kind: 'link',
            url: 'smb://fileserver/public/handbook',
        });
    });

    it('normalizes Image Gallery records as a backward-compatible master-config branch', () => {
        const normalized = validateAndNormalize({
            imageGalleries: {
                items: [{
                    id: 'gallery-1',
                    title: 'גלריה',
                    style: 'masonry',
                    images: [{
                        id: 'image-1',
                        mediaRef: '/images/gallery.webp',
                        alt: 'תמונה תקינה',
                        media: { fileName: 'gallery.webp', mimeType: 'image/webp', sizeBytes: 128 },
                    }],
                }],
            },
        });

        expect(normalized.imageGalleries.items[0]).toMatchObject({
            id: 'gallery-1',
            style: 'masonry',
            images: [{ mediaRef: '/images/gallery.webp', alt: 'תמונה תקינה' }],
        });
    });

    it('migrates the legacy galleries alias without requiring manual repair', () => {
        const migrated = migrateLegacyToV1({
            galleries: [{
                id: 'legacy-gallery',
                title: 'Legacy gallery',
                images: [{
                    id: 'legacy-image',
                    imageUrl: '/images/legacy.jpg',
                    alt: 'Legacy photo',
                }],
            }],
        });

        expect(migrated.imageGalleries.items[0]).toMatchObject({
            id: 'legacy-gallery',
            title: 'Legacy gallery',
            images: [{ mediaRef: '/images/legacy.jpg', alt: 'Legacy photo' }],
        });
    });

    it('persists Magal strip display settings through master-config normalization', () => {
        const normalized = validateAndNormalize({
            imageGalleries: {
                items: [{
                    id: 'magal-gallery',
                    title: 'Magal',
                    style: 'magal-strips',
                    images: [{
                        id: 'image-1',
                        mediaRef: '/images/magal.jpg',
                        alt: 'Magal',
                    }],
                    display: {
                        magalStrips: {
                            rowCount: 2,
                            cardSizePx: 204,
                            gapPx: 14,
                            rows: [
                                { direction: 'right', durationSeconds: 31, angleDegrees: 4 },
                                { direction: 'left', durationSeconds: 47, angleDegrees: -5 },
                            ],
                        },
                    },
                }],
            },
        });

        expect(normalized.imageGalleries.items[0].display.magalStrips).toMatchObject({
            rowCount: 2,
            cardSizePx: 204,
            gapPx: 14,
        });
        expect(normalized.imageGalleries.items[0].display.magalStrips.rows.slice(0, 2)).toMatchObject([
            { direction: 'right', durationSeconds: 31, angleDegrees: 4 },
            { direction: 'left', durationSeconds: 47, angleDegrees: -5 },
        ]);
    });
});
