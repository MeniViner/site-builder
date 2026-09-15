import { describe, expect, it } from 'vitest';
import {
    COMMANDER_IMAGE_OFFSET_X,
    COMMANDER_IMAGE_OFFSET_Y,
    COMMANDER_IMAGE_SCALE,
    COMMANDER_IMAGE_SOURCE,
    DEFAULT_COMMANDER_IMAGE_PATH,
    DEFAULT_COMMANDER_RANK,
    DEFAULT_COMMANDER_RANK_BACKDROP,
    DEFAULT_COMMANDER_RANK_ORIENTATION,
    DEFAULT_COMMANDER_RANK_ROTATION,
    DEFAULT_COMMANDER_RANK_MIRRORED,
    DEFAULT_COMMANDER_RANK_STYLE,
    getCommanderImageSettings,
    normalizeCommanderImageSettings,
} from './commanderImage';

describe('commander image settings', () => {
    it('uses subtle defaults for content saved before image controls existed', () => {
        expect(getCommanderImageSettings({})).toEqual({
            imageScale: COMMANDER_IMAGE_SCALE.defaultValue,
            imageOffsetX: COMMANDER_IMAGE_OFFSET_X.defaultValue,
            imageOffsetY: COMMANDER_IMAGE_OFFSET_Y.defaultValue,
        });
        expect(normalizeCommanderImageSettings({})).toMatchObject({
            imageRank: DEFAULT_COMMANDER_RANK,
            imageRankStyle: DEFAULT_COMMANDER_RANK_STYLE,
            imageRankBackdrop: DEFAULT_COMMANDER_RANK_BACKDROP,
            imageRankOrientation: DEFAULT_COMMANDER_RANK_ORIENTATION,
            imageRankRotation: DEFAULT_COMMANDER_RANK_ROTATION,
            imageRankMirrored: DEFAULT_COMMANDER_RANK_MIRRORED,
        });
    });

    it('rounds and clamps image size and both movement axes to the supported range', () => {
        expect(getCommanderImageSettings({ imageScale: 331.8, imageOffsetX: -232.4, imageOffsetY: 188 })).toEqual({
            imageScale: COMMANDER_IMAGE_SCALE.max,
            imageOffsetX: COMMANDER_IMAGE_OFFSET_X.min,
            imageOffsetY: COMMANDER_IMAGE_OFFSET_Y.max,
        });
    });

    it('keeps commander data while normalizing its image settings', () => {
        expect(normalizeCommanderImageSettings({
            sectionTitle: 'דבר המפקד',
            image: '/uploads/commander.jpg',
            imageScale: '104.6',
            imageOffsetX: '8',
            imageOffsetY: '-14',
        })).toEqual({
            sectionTitle: 'דבר המפקד',
            image: '/uploads/commander.jpg',
            imageUrl: '/uploads/commander.jpg',
            imageSource: COMMANDER_IMAGE_SOURCE.custom,
            imageAvatar: '',
            imageRank: DEFAULT_COMMANDER_RANK,
            imageRankStyle: DEFAULT_COMMANDER_RANK_STYLE,
            imageRankBackdrop: DEFAULT_COMMANDER_RANK_BACKDROP,
            imageRankOrientation: DEFAULT_COMMANDER_RANK_ORIENTATION,
            imageRankRotation: DEFAULT_COMMANDER_RANK_ROTATION,
            imageRankMirrored: DEFAULT_COMMANDER_RANK_MIRRORED,
            customImageUrl: '/uploads/commander.jpg',
            imageScale: 105,
            imageOffsetX: 8,
            imageOffsetY: -14,
        });
    });

    it('keeps a rank source independent from image URLs', () => {
        expect(normalizeCommanderImageSettings({
            imageSource: COMMANDER_IMAGE_SOURCE.rank,
            imageRank: 'סרן',
            imageRankStyle: 'field',
            image: '/uploads/old.jpg',
        })).toMatchObject({
            imageSource: COMMANDER_IMAGE_SOURCE.rank,
            imageRank: 'סרן',
            imageRankStyle: 'field',
            image: '',
            imageUrl: '',
        });
    });

    it('keeps the rank backdrop removable and migrates removed academic ranks', () => {
        expect(normalizeCommanderImageSettings({ imageRankBackdrop: false, imageRank: 'קמ"א' })).toMatchObject({
            imageRank: DEFAULT_COMMANDER_RANK,
            imageRankBackdrop: false,
        });
    });

    it('keeps valid rank orientation and defaults invalid values to native', () => {
        expect(normalizeCommanderImageSettings({ imageRankOrientation: 'landscape' })).toMatchObject({
            imageRankOrientation: 'landscape',
        });
        expect(normalizeCommanderImageSettings({ imageRankOrientation: 'diagonal' })).toMatchObject({
            imageRankOrientation: DEFAULT_COMMANDER_RANK_ORIENTATION,
        });
    });

    it('normalizes rank rotation to quarter turns and preserves mirror state', () => {
        expect(normalizeCommanderImageSettings({ imageRankRotation: 450, imageRankMirrored: true })).toMatchObject({
            imageRankRotation: 90,
            imageRankMirrored: true,
        });
        expect(normalizeCommanderImageSettings({ imageRankRotation: -90, imageRankMirrored: 'yes' })).toMatchObject({
            imageRankRotation: 270,
            imageRankMirrored: DEFAULT_COMMANDER_RANK_MIRRORED,
        });
    });

    it('resolves default, no-image, and legacy uploaded sources', () => {
        expect(normalizeCommanderImageSettings({ imageSource: 'default', customImageUrl: '/uploads/old.jpg' })).toMatchObject({
            imageSource: 'default',
            image: DEFAULT_COMMANDER_IMAGE_PATH,
            customImageUrl: '/uploads/old.jpg',
        });
        expect(normalizeCommanderImageSettings({ imageSource: 'none', image: '/uploads/old.jpg' })).toMatchObject({
            imageSource: 'none',
            image: '',
        });
        expect(normalizeCommanderImageSettings({
            imageSource: 'builtin',
            imageAvatar: 'teal',
            image: '/images/commander-avatars/commander-teal.svg',
        })).toMatchObject({
            imageSource: COMMANDER_IMAGE_SOURCE.default,
            imageAvatar: '',
            image: DEFAULT_COMMANDER_IMAGE_PATH,
        });
        expect(normalizeCommanderImageSettings({ imageUrl: '/uploads/legacy.jpg' })).toMatchObject({
            imageSource: 'custom',
            customImageUrl: '/uploads/legacy.jpg',
            image: '/uploads/legacy.jpg',
        });
    });
});
