import { describe, expect, it } from 'vitest';
import {
    COMMANDER_IMAGE_OFFSET_X,
    COMMANDER_IMAGE_SCALE,
    getCommanderImageSettings,
    normalizeCommanderImageSettings,
} from './commanderImage';

describe('commander image settings', () => {
    it('uses subtle defaults for content saved before image controls existed', () => {
        expect(getCommanderImageSettings({})).toEqual({
            imageScale: COMMANDER_IMAGE_SCALE.defaultValue,
            imageOffsetX: COMMANDER_IMAGE_OFFSET_X.defaultValue,
        });
    });

    it('rounds and clamps image size and horizontal movement to the supported range', () => {
        expect(getCommanderImageSettings({ imageScale: 131.8, imageOffsetX: -32.4 })).toEqual({
            imageScale: COMMANDER_IMAGE_SCALE.max,
            imageOffsetX: COMMANDER_IMAGE_OFFSET_X.min,
        });
    });

    it('keeps commander data while normalizing its image settings', () => {
        expect(normalizeCommanderImageSettings({ sectionTitle: 'דבר המפקד', imageScale: '104.6', imageOffsetX: '8' })).toEqual({
            sectionTitle: 'דבר המפקד',
            imageScale: 105,
            imageOffsetX: 8,
        });
    });
});
