/**
 * Deterministic Hebrew calendar helpers used by the Gantt "Show Hebrew date" /
 * "Show Israeli holidays" display options.
 *
 * All conversions are computed with the `@hebcal/hdate` Rata-Die algorithm
 * (no network calls, no per-year hardcoded tables), so results are stable for
 * any Gregorian year, past or future. Holidays that shift when they would
 * otherwise fall adjacent to Shabbat (Yom HaShoah, Yom HaZikaron,
 * Yom HaAtzmaut, Tisha B'Av) apply the standard, publicly documented Israeli
 * scheduling rules rather than a fixed date.
 *
 * The Gantt is a day-based planning tool, so every Hebrew "day" here is
 * represented by the single Gregorian calendar date the product already uses
 * for tasks/milestones — we intentionally do not model sunset-to-sunset
 * boundaries.
 */
import { HDate, months } from '@hebcal/hdate';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseIsoDateLocal(value) {
    if (!DATE_RE.test(String(value || ''))) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return null;
    return date;
}

function toIsoDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function hdateToIsoString(hdate) {
    return toIsoDateString(hdate.greg());
}

/**
 * Renders the Hebrew calendar date for a Gregorian "YYYY-MM-DD" string, e.g.
 * `"כ״ג בטבת תשפ״ו"`. Returns null for invalid/empty input.
 */
export function getHebrewDateLabel(dateString, { suppressNikud = true } = {}) {
    const date = parseIsoDateLocal(dateString);
    if (!date) return null;
    const hd = new HDate(date);
    return hd.renderGematriya(suppressNikud);
}

/** Adar in a Hebrew leap year has two months; Purim/Ta'anit Esther fall in Adar II. */
function purimMonth(hyear) {
    return HDate.isLeapYear(hyear) ? months.ADAR_II : months.ADAR_I;
}

function shiftHDate(hdate, dayOffset) {
    return dayOffset ? new HDate(hdate.abs() + dayOffset) : hdate;
}

/** Yom HaShoah (27 Nisan) moves off Friday/Sunday per Israeli law (1959, amended 1961). */
function computeYomHaShoah(hyear) {
    const base = new HDate(27, months.NISAN, hyear);
    const dow = base.getDay();
    if (dow === 5) return shiftHDate(base, -1); // Friday -> Thursday
    if (dow === 0) return shiftHDate(base, 1); // Sunday -> Monday
    return base;
}

/**
 * Yom Ha'atzmaut (5 Iyar) shifts away from Friday/Saturday (moved earlier to
 * Thursday) and away from Monday (moved later to Tuesday), per the Knesset's
 * 1998/2004 scheduling amendments. Yom HaZikaron is always the preceding day.
 */
function computeYomHaatzmaut(hyear) {
    const base = new HDate(5, months.IYYAR, hyear);
    const dow = base.getDay();
    if (dow === 5) return shiftHDate(base, -1); // Friday -> Thursday
    if (dow === 6) return shiftHDate(base, -2); // Saturday -> Thursday
    if (dow === 1) return shiftHDate(base, 1); // Monday -> Tuesday
    return base;
}

/** A public fast day is postponed to Sunday when it would fall on Shabbat. */
function computeTishaBAv(hyear) {
    const base = new HDate(9, months.AV, hyear);
    return base.getDay() === 6 ? shiftHDate(base, 1) : base;
}

function hanukkahDays(hyear) {
    return Array.from({ length: 8 }, (_, index) => ({
        id: 'hanukkah',
        nameHe: 'חנוכה',
        category: 'candle',
        date: new HDate(25 + index, months.KISLEV, hyear),
        dayIndex: index + 1,
        totalDays: 8,
    }));
}

/**
 * Every Israeli/Jewish holiday the Gantt can optionally surface, expressed as
 * fixed Hebrew-calendar dates (with the modern-day shift rules above applied
 * where relevant) — computed fresh for every requested Hebrew year.
 */
function buildHolidaysForHebrewYear(hyear) {
    const list = [
        { id: 'rosh-hashanah', nameHe: 'ראש השנה', category: 'major', date: new HDate(1, months.TISHREI, hyear) },
        { id: 'rosh-hashanah', nameHe: 'ראש השנה', category: 'major', date: new HDate(2, months.TISHREI, hyear) },
        { id: 'yom-kippur', nameHe: 'יום כיפור', category: 'major', date: new HDate(10, months.TISHREI, hyear) },
        { id: 'sukkot', nameHe: 'סוכות', category: 'major', date: new HDate(15, months.TISHREI, hyear) },
        { id: 'sukkot', nameHe: 'חול המועד סוכות', category: 'minor', date: new HDate(21, months.TISHREI, hyear) },
        { id: 'simchat-torah', nameHe: 'שמחת תורה', category: 'major', date: new HDate(22, months.TISHREI, hyear) },
        ...hanukkahDays(hyear),
        { id: 'tu-bishvat', nameHe: 'ט"ו בשבט', category: 'minor', date: new HDate(15, months.SHVAT, hyear) },
        { id: 'purim', nameHe: 'פורים', category: 'major', date: new HDate(14, purimMonth(hyear), hyear) },
        { id: 'pesach', nameHe: 'פסח', category: 'major', date: new HDate(15, months.NISAN, hyear) },
        { id: 'pesach', nameHe: 'שביעי של פסח', category: 'minor', date: new HDate(21, months.NISAN, hyear) },
        { id: 'yom-hashoah', nameHe: 'יום השואה', category: 'memorial', date: computeYomHaShoah(hyear) },
        { id: 'yom-hazikaron', nameHe: 'יום הזיכרון', category: 'memorial', date: shiftHDate(computeYomHaatzmaut(hyear), -1) },
        { id: 'yom-haatzmaut', nameHe: 'יום העצמאות', category: 'major', date: computeYomHaatzmaut(hyear) },
        { id: 'lag-baomer', nameHe: 'ל"ג בעומר', category: 'minor', date: new HDate(18, months.IYYAR, hyear) },
        { id: 'shavuot', nameHe: 'שבועות', category: 'major', date: new HDate(6, months.SIVAN, hyear) },
        { id: 'tisha-bav', nameHe: 'תשעה באב', category: 'memorial', date: computeTishaBAv(hyear) },
    ];

    return list.map((holiday) => ({
        id: holiday.id,
        nameHe: holiday.nameHe,
        category: holiday.category,
        date: hdateToIsoString(holiday.date),
        ...(holiday.dayIndex ? { dayIndex: holiday.dayIndex, totalDays: holiday.totalDays } : {}),
    }));
}

/**
 * Returns every known holiday whose Gregorian date falls within
 * `[startDateString, endDateString]` (inclusive), sorted by date. Safe to
 * call with any Gregorian range — the corresponding Hebrew year(s) are
 * derived from the requested range rather than assumed.
 */
export function getHolidaysInRange(startDateString, endDateString) {
    const startDate = parseIsoDateLocal(startDateString);
    const endDate = parseIsoDateLocal(endDateString || startDateString);
    if (!startDate || !endDate) return [];

    const startHYear = new HDate(startDate).getFullYear();
    const endHYear = new HDate(endDate).getFullYear();
    const startIso = toIsoDateString(startDate);
    const endIso = toIsoDateString(endDate);

    const holidays = [];
    for (let hyear = startHYear - 1; hyear <= endHYear + 1; hyear += 1) {
        holidays.push(...buildHolidaysForHebrewYear(hyear));
    }

    return holidays
        .filter((holiday) => holiday.date >= startIso && holiday.date <= endIso)
        .sort((a, b) => a.date.localeCompare(b.date));
}

/** Builds a `Map<dateString, holiday[]>` for O(1) per-day lookups while rendering a timeline. */
export function buildHolidayMapForRange(startDateString, endDateString) {
    const map = new Map();
    getHolidaysInRange(startDateString, endDateString).forEach((holiday) => {
        const existing = map.get(holiday.date) || [];
        existing.push(holiday);
        map.set(holiday.date, existing);
    });
    return map;
}

/** Convenience single-date lookup (uses a one-day range internally). */
export function getHolidaysForDate(dateString) {
    return getHolidaysInRange(dateString, dateString);
}
