import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_V1, migrateLegacyToV1, validateAndNormalize } from './AppSchema';
import {
    COMMANDER_BUILTIN_AVATARS,
    COMMANDER_IMAGE_OFFSET_X,
    COMMANDER_IMAGE_OFFSET_Y,
    COMMANDER_IMAGE_SCALE,
} from '../utils/commanderImage';

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

    it('preserves verified SharePoint navigation bindings across schema normalization', () => {
        const binding = {
            version: 1,
            mode: 'sharepoint-auto',
            targetKind: 'library',
            state: 'verified',
            serverRelativeUrl: '/sites/demo/content-library-123',
            listId: '{LIST-ID}',
            libraryTitle: 'תוכן',
            libraryRootServerRelativeUrl: '/sites/demo/content-library-123',
            provisionKey: 'category-node-id',
        };
        const normalized = validateAndNormalize({
            ...DEFAULT_CONFIG_V1,
            navigation: {
                items: [{
                    id: 'category-1',
                    label: 'תוכן',
                    kind: 'folder',
                    url: binding.serverRelativeUrl,
                    targetBinding: binding,
                    children: [{
                        id: 'folder-1',
                        label: 'נהלים',
                        kind: 'folder',
                        url: `${binding.serverRelativeUrl}/procedures-folder-456`,
                        targetBinding: {
                            ...binding,
                            targetKind: 'folder',
                            serverRelativeUrl: `${binding.serverRelativeUrl}/procedures-folder-456`,
                            provisionKey: 'folder-node-id',
                        },
                        children: [],
                    }],
                }],
            },
        });

        expect(normalized.navigation.items[0].targetBinding).toEqual(binding);
        expect(normalized.navigation.items[0].children[0].targetBinding).toEqual({
            ...binding,
            targetKind: 'folder',
            serverRelativeUrl: `${binding.serverRelativeUrl}/procedures-folder-456`,
            provisionKey: 'folder-node-id',
        });
    });

    it('preserves and canonically normalizes Commander image geometry', () => {
        const normalized = validateAndNormalize({
            content: {
                commander: {
                    imageScale: 187,
                    imageOffsetX: -91,
                    imageOffsetY: 63,
                    imageSource: 'builtin',
                    imageAvatar: 'navy',
                },
            },
        });

        expect(normalized.content.commander).toMatchObject({
            imageScale: 187,
            imageOffsetX: -91,
            imageOffsetY: 63,
            imageSource: 'builtin',
            imageAvatar: 'navy',
            imageUrl: COMMANDER_BUILTIN_AVATARS.find((avatar) => avatar.id === 'navy').path,
        });

        const clamped = validateAndNormalize({
            content: {
                commander: {
                    imageScale: COMMANDER_IMAGE_SCALE.max + 50,
                    imageOffsetX: COMMANDER_IMAGE_OFFSET_X.min - 50,
                    imageOffsetY: COMMANDER_IMAGE_OFFSET_Y.max + 50,
                },
            },
        });

        expect(clamped.content.commander).toMatchObject({
            imageScale: COMMANDER_IMAGE_SCALE.max,
            imageOffsetX: COMMANDER_IMAGE_OFFSET_X.min,
            imageOffsetY: COMMANDER_IMAGE_OFFSET_Y.max,
        });
    });

    it('defaults old Commander data and retains valid geometry during legacy migration', () => {
        const legacyWithoutGeometry = migrateLegacyToV1({
            siteContent: {
                commander: {
                    image: '/images/legacy-commander.png',
                },
            },
        });
        const legacyWithGeometry = migrateLegacyToV1({
            siteContent: {
                commander: {
                    image: '/images/legacy-commander.png',
                    imageScale: 164,
                    imageOffsetX: 73,
                },
            },
        });

        expect(legacyWithoutGeometry.content.commander).toMatchObject({
            imageScale: COMMANDER_IMAGE_SCALE.defaultValue,
            imageOffsetX: COMMANDER_IMAGE_OFFSET_X.defaultValue,
            imageOffsetY: COMMANDER_IMAGE_OFFSET_Y.defaultValue,
            imageSource: 'custom',
        });
        expect(legacyWithGeometry.content.commander).toMatchObject({
            imageScale: 164,
            imageOffsetX: 73,
            imageOffsetY: COMMANDER_IMAGE_OFFSET_Y.defaultValue,
            imageSource: 'custom',
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
