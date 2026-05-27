import { describe, expect, it } from 'vitest';
import {
    eventColorToHex,
    getContrastingTextColor,
    isLegacyEventColor,
    isValidHexColor,
    normalizeEventColor,
    normalizeHexColor,
} from './colorValidation';

describe('colorValidation utilities', () => {
    it('validates and normalizes hex colors', () => {
        expect(isValidHexColor('#abc')).toBe(true);
        expect(isValidHexColor('#AABBCC')).toBe(true);
        expect(isValidHexColor('AABBCC')).toBe(false);
        expect(isValidHexColor('#abcd')).toBe(false);
        expect(normalizeHexColor('#abc')).toBe('#AABBCC');
        expect(normalizeHexColor('#12ff9a')).toBe('#12FF9A');
    });

    it('keeps legacy event color values as valid fallbacks', () => {
        expect(isLegacyEventColor('RED')).toBe(true);
        expect(normalizeEventColor('red')).toBe('red');
        expect(normalizeEventColor('gray')).toBe('gray');
        expect(normalizeEventColor('#123456')).toBe('#123456');
        expect(normalizeEventColor('bad-value')).toBe('gray');
    });

    it('maps legacy event colors to hex values for render surfaces', () => {
        expect(eventColorToHex('red')).toBe('#ef4444');
        expect(eventColorToHex('gray')).toBe('#6b7280');
        expect(eventColorToHex('#abc')).toBe('#AABBCC');
        expect(eventColorToHex('bad-value', '#111111')).toBe('#111111');
    });

    it('chooses readable text over light and dark status colors', () => {
        expect(getContrastingTextColor('#FFFFFF')).toBe('#111827');
        expect(getContrastingTextColor('#111827')).toBe('#FFFFFF');
    });
});
