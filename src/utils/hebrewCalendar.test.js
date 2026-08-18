import { describe, expect, it } from 'vitest';
import { buildHolidayMapForRange, getHebrewDateLabel, getHolidaysForDate, getHolidaysInRange } from './hebrewCalendar';

describe('getHebrewDateLabel', () => {
    it('renders a Hebrew date for a representative Gregorian date', () => {
        expect(getHebrewDateLabel('2026-01-15')).toBe('כ״ו טבת תשפ״ו');
    });

    it('renders consecutive dates across a Hebrew month boundary', () => {
        // 29 Tevet 5786 -> 1 Shevat 5786 (Tevet has 29 days in this cycle).
        expect(getHebrewDateLabel('2026-01-18')).toContain('טבת');
        expect(getHebrewDateLabel('2026-01-19')).toContain('שבט');
    });

    it('renders dates across a Gregorian/Hebrew year boundary', () => {
        expect(getHebrewDateLabel('2025-12-31')).toContain('תשפ״ו');
        expect(getHebrewDateLabel('2026-01-01')).toContain('תשפ״ו');
    });

    it('returns null for invalid or empty input', () => {
        expect(getHebrewDateLabel('')).toBeNull();
        expect(getHebrewDateLabel('not-a-date')).toBeNull();
        expect(getHebrewDateLabel(undefined)).toBeNull();
    });
});

describe('getHolidaysInRange', () => {
    it('finds the major Israeli holidays across the 2026 Gregorian year', () => {
        const holidays = getHolidaysInRange('2026-01-01', '2026-12-31');
        const ids = holidays.map((holiday) => holiday.id);

        expect(ids).toContain('rosh-hashanah');
        expect(ids).toContain('yom-kippur');
        expect(ids).toContain('sukkot');
        expect(ids).toContain('simchat-torah');
        expect(ids).toContain('hanukkah');
        expect(ids).toContain('tu-bishvat');
        expect(ids).toContain('purim');
        expect(ids).toContain('pesach');
        expect(ids).toContain('yom-hashoah');
        expect(ids).toContain('yom-hazikaron');
        expect(ids).toContain('yom-haatzmaut');
        expect(ids).toContain('lag-baomer');
        expect(ids).toContain('shavuot');
        expect(ids).toContain('tisha-bav');

        // Sorted chronologically.
        const dates = holidays.map((holiday) => holiday.date);
        expect(dates).toEqual([...dates].sort());
    });

    it('matches known Gregorian dates for 2026', () => {
        const byId = (id) => getHolidaysInRange('2026-01-01', '2026-12-31').filter((h) => h.id === id);
        expect(byId('yom-kippur')[0].date).toBe('2026-09-21');
        expect(byId('pesach')[0].date).toBe('2026-04-02');
        expect(byId('rosh-hashanah')[0].date).toBe('2026-09-12');
    });

    it('matches known Gregorian dates for a different year (2025) to prove the calculation is not hardcoded', () => {
        const byId = (id) => getHolidaysInRange('2025-01-01', '2025-12-31').filter((h) => h.id === id);
        expect(byId('yom-kippur')[0].date).toBe('2025-10-02');
        expect(byId('pesach')[0].date).toBe('2025-04-13');
        expect(byId('rosh-hashanah')[0].date).toBe('2025-09-23');
    });

    it('numbers every Hanukkah day from 1 to 8', () => {
        const hanukkah = getHolidaysInRange('2026-01-01', '2026-12-31').filter((holiday) => holiday.id === 'hanukkah');
        expect(hanukkah).toHaveLength(8);
        expect(hanukkah.map((day) => day.dayIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('finds holidays spanning a Gregorian year boundary (Hanukkah into January)', () => {
        const holidays = getHolidaysInRange('2025-12-20', '2026-01-05');
        const hanukkahDates = holidays.filter((holiday) => holiday.id === 'hanukkah').map((holiday) => holiday.date);
        expect(hanukkahDates).toContain('2025-12-20');
        expect(hanukkahDates).toContain('2025-12-22');
    });

    it('excludes holidays outside the requested range', () => {
        const holidays = getHolidaysInRange('2026-02-10', '2026-02-15');
        expect(holidays).toEqual([]);
    });

    it('returns an empty list for invalid input', () => {
        expect(getHolidaysInRange('nope', 'nope')).toEqual([]);
    });

    it('applies the documented Yom HaAtzmaut/Yom HaZikaron weekday-shift rules', () => {
        // Yom HaZikaron always falls the day directly before Yom HaAtzmaut, and
        // neither may fall on a Friday/Saturday (Atzmaut) once shifted.
        const dayBeforeLocal = (dateString) => {
            const [year, month, day] = dateString.split('-').map(Number);
            const date = new Date(year, month - 1, day - 1);
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };
        for (let year = 2020; year <= 2030; year += 1) {
            const holidays = getHolidaysInRange(`${year}-01-01`, `${year}-12-31`);
            const atzmaut = holidays.find((holiday) => holiday.id === 'yom-haatzmaut');
            const zikaron = holidays.find((holiday) => holiday.id === 'yom-hazikaron');
            if (!atzmaut || !zikaron) continue; // may fall just outside the Gregorian year at the edges
            const atzmautDow = new Date(`${atzmaut.date}T00:00:00`).getDay();
            expect(atzmautDow).not.toBe(5); // Friday
            expect(atzmautDow).not.toBe(6); // Saturday
            expect(zikaron.date).toBe(dayBeforeLocal(atzmaut.date));
        }
    });

    it('never schedules Tisha BAv on a Saturday', () => {
        for (let year = 2020; year <= 2030; year += 1) {
            const holidays = getHolidaysInRange(`${year}-01-01`, `${year}-12-31`);
            const tishaBav = holidays.find((holiday) => holiday.id === 'tisha-bav');
            if (!tishaBav) continue;
            const dow = new Date(`${tishaBav.date}T00:00:00`).getDay();
            expect(dow).not.toBe(6);
        }
    });
});

describe('buildHolidayMapForRange / getHolidaysForDate', () => {
    it('builds a lookup map keyed by exact date', () => {
        const map = buildHolidayMapForRange('2026-09-01', '2026-09-30');
        expect(map.get('2026-09-21')?.[0]?.id).toBe('yom-kippur');
        expect(map.has('2026-09-05')).toBe(false);
    });

    it('returns holidays for a single date', () => {
        expect(getHolidaysForDate('2026-09-21')[0].id).toBe('yom-kippur');
        expect(getHolidaysForDate('2026-09-05')).toEqual([]);
    });
});
