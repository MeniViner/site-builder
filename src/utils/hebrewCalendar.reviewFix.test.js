import { describe, expect, it } from 'vitest';
import { getHolidaysInRange } from './hebrewCalendar';

describe('expanded Israeli/Jewish holiday coverage', () => {
    it('includes the additional annual observances requested for an Israeli calendar', () => {
        const ids = new Set(getHolidaysInRange('2026-01-01', '2026-12-31').map((holiday) => holiday.id));
        [
            'asara-btevet',
            'taanit-esther',
            'shushan-purim',
            'chol-hamoed-pesach',
            'yom-yerushalayim',
            'shiva-asar-btammuz',
            'tu-bav',
            'tzom-gedaliah',
            'chol-hamoed-sukkot',
            'hoshana-rabbah',
        ].forEach((id) => expect(ids.has(id)).toBe(true));
    });

    it('represents every Chol HaMoed day rather than a single placeholder day', () => {
        const holidays = getHolidaysInRange('2026-01-01', '2026-12-31');
        expect(holidays.filter((holiday) => holiday.id === 'chol-hamoed-pesach')).toHaveLength(5);
        expect(holidays.filter((holiday) => holiday.id === 'chol-hamoed-sukkot')).toHaveLength(5);
    });
});
