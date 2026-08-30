import { describe, expect, it } from 'vitest';
import {
    COMMANDER_BUILTIN_AVATARS,
    COMMANDER_IMAGE_OFFSET_X,
    COMMANDER_IMAGE_OFFSET_Y,
    COMMANDER_IMAGE_SCALE,
    COMMANDER_IMAGE_SOURCE,
    DEFAULT_COMMANDER_IMAGE_PATH,
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
            customImageUrl: '/uploads/commander.jpg',
            imageScale: 105,
            imageOffsetX: 8,
            imageOffsetY: -14,
        });
    });

    it('resolves default, no-image, built-in, and legacy uploaded sources without embedding SVG data', () => {
        expect(normalizeCommanderImageSettings({ imageSource: 'default', customImageUrl: '/uploads/old.jpg' })).toMatchObject({
            imageSource: 'default',
            image: DEFAULT_COMMANDER_IMAGE_PATH,
            customImageUrl: '/uploads/old.jpg',
        });
        expect(normalizeCommanderImageSettings({ imageSource: 'none', image: '/uploads/old.jpg' })).toMatchObject({
            imageSource: 'none',
            image: '',
        });
        expect(normalizeCommanderImageSettings({ imageSource: 'builtin', imageAvatar: 'teal' })).toMatchObject({
            imageSource: 'builtin',
            imageAvatar: 'teal',
            image: COMMANDER_BUILTIN_AVATARS.find((avatar) => avatar.id === 'teal').path,
        });
        expect(normalizeCommanderImageSettings({ imageUrl: '/uploads/legacy.jpg' })).toMatchObject({
            imageSource: 'custom',
            customImageUrl: '/uploads/legacy.jpg',
            image: '/uploads/legacy.jpg',
        });
    });
});
