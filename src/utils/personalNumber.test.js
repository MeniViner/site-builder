import { describe, expect, it } from 'vitest';
import {
    isValidPersonalNumber,
    normalizePersonalNumber,
    personalNumberToArmyEmail,
    personalNumberToArmyMailto,
} from './personalNumber';

describe('personalNumber utilities', () => {
    it('validates S or C plus 7 or 8 digits', () => {
        expect(isValidPersonalNumber('S1234567')).toBe(true);
        expect(isValidPersonalNumber('C1234567')).toBe(true);
        expect(isValidPersonalNumber('S12345678')).toBe(true);
        expect(isValidPersonalNumber('C12345678')).toBe(true);
        expect(isValidPersonalNumber('s1234567')).toBe(true);
        expect(isValidPersonalNumber('c1234567890')).toBe(false);
        expect(isValidPersonalNumber('S123456')).toBe(false);
        expect(isValidPersonalNumber('S123456789')).toBe(false);
        expect(isValidPersonalNumber('A1234567')).toBe(false);
        expect(isValidPersonalNumber('1234567')).toBe(false);
    });

    it('normalizes valid personal numbers to uppercase', () => {
        expect(normalizePersonalNumber('  s1234567  ')).toBe('S1234567');
        expect(normalizePersonalNumber('c12345678')).toBe('C12345678');
        expect(normalizePersonalNumber('S123-4567')).toBe('');
    });

    it('converts personal numbers to army email and mailto links', () => {
        expect(personalNumberToArmyEmail('S1234567')).toBe('S1234567@army.idf.il');
        expect(personalNumberToArmyMailto('c1234567')).toBe('mailto:C1234567@army.idf.il');
        expect(personalNumberToArmyMailto('s123456')).toBe('');
    });
});
