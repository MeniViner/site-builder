import { describe, expect, it } from 'vitest';
import { toSafeHebrewError } from './userFacingError';

describe('toSafeHebrewError', () => {
    it('never exposes a raw server payload in the fallback message', () => {
        const error = Object.assign(new Error('SQL trace 0x99AF'), {
            responseBody: { error: 'secret internal details' },
        });

        const message = toSafeHebrewError(error, 'הפעולה נכשלה. נסו שוב.');

        expect(message).toBe('הפעולה נכשלה. נסו שוב.');
        expect(message).not.toMatch(/SQL|0x99AF|secret/i);
    });

    it('returns actionable Hebrew guidance for authorization and connectivity failures', () => {
        expect(toSafeHebrewError({ status: 403 }, 'הפעולה נכשלה.'))
            .toBe('אין הרשאה לבצע את הפעולה. פנו למנהל האתר ובקשו הרשאה מתאימה.');
        expect(toSafeHebrewError(new TypeError('Failed to fetch'), 'הפעולה נכשלה.'))
            .toBe('לא ניתן להתחבר לשירות כרגע. בדקו את החיבור ונסו שוב.');
    });
});
