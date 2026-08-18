/**
 * Deterministic Hebrew calendar helpers used by the Gantt Hebrew-date and
 * Israeli/Jewish-holiday display options.
 *
 * Date conversion uses @hebcal/hdate only; holiday selection remains local,
 * deterministic and network-free. The Gantt is day-based, so sunset boundaries
 * are intentionally represented by the product's existing Gregorian day cell.
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

export function getHebrewDateLabel(dateString, { suppressNikud = true } = {}) {
    const date = parseIsoDateLocal(dateString);
    if (!date) return null;
    return new HDate(date).renderGematriya(suppressNikud);
}

function purimMonth(hyear) {
    return HDate.isLeapYear(hyear) ? months.ADAR_II : months.ADAR_I;
}

function shiftHDate(hdate, dayOffset) {
    return dayOffset ? new HDate(hdate.abs() + dayOffset) : hdate;
}

function postponeFromShabbat(hdate) {
    return hdate.getDay() === 6 ? shiftHDate(hdate, 1) : hdate;
}

function computeYomHaShoah(hyear) {
    if (hyear < 5711) return null;
    const base = new HDate(27, months.NISAN, hyear);
    if (base.getDay() === 5) return shiftHDate(base, -1);
    if (base.getDay() === 0) return shiftHDate(base, 1);
    return base;
}

function computeYomHaatzmaut(hyear) {
    if (hyear < 5708) return null;
    const base = new HDate(5, months.IYYAR, hyear);
    const dow = base.getDay();
    if (dow === 5) return shiftHDate(base, -1);
    if (dow === 6) return shiftHDate(base, -2);
    if (dow === 1 && hyear >= 5764) return shiftHDate(base, 1);
    return base;
}

function computeTaanitEsther(hyear) {
    const base = new HDate(13, purimMonth(hyear), hyear);
    return base.getDay() === 6 ? shiftHDate(base, -2) : base;
}

function hanukkahDays(hyear) {
    return Array.from({ length: 8 }, (_, index) => ({
        id: 'hanukkah',
        nameHe: `חנוכה · יום ${index + 1}`,
        category: 'candle',
        date: new HDate(25 + index, months.KISLEV, hyear),
        dayIndex: index + 1,
        totalDays: 8,
    }));
}

function buildHolidaysForHebrewYear(hyear) {
    const list = [
        { id: 'rosh-hashanah', nameHe: 'ראש השנה · יום א׳', category: 'major', date: new HDate(1, months.TISHREI, hyear) },
        { id: 'rosh-hashanah', nameHe: 'ראש השנה · יום ב׳', category: 'major', date: new HDate(2, months.TISHREI, hyear) },
        { id: 'tzom-gedaliah', nameHe: 'צום גדליה', category: 'fast', date: postponeFromShabbat(new HDate(3, months.TISHREI, hyear)) },
        { id: 'yom-kippur', nameHe: 'יום כיפור', category: 'major', date: new HDate(10, months.TISHREI, hyear) },
        { id: 'sukkot', nameHe: 'סוכות', category: 'major', date: new HDate(15, months.TISHREI, hyear) },
        ...Array.from({ length: 5 }, (_, index) => ({ id: 'chol-hamoed-sukkot', nameHe: 'חול המועד סוכות', category: 'minor', date: new HDate(16 + index, months.TISHREI, hyear) })),
        { id: 'hoshana-rabbah', nameHe: 'הושענא רבה', category: 'minor', date: new HDate(21, months.TISHREI, hyear) },
        { id: 'simchat-torah', nameHe: 'שמיני עצרת ושמחת תורה', category: 'major', date: new HDate(22, months.TISHREI, hyear) },
        ...(hyear >= 5769 ? [{ id: 'sigd', nameHe: 'סיגד', category: 'modern', date: new HDate(29, months.CHESHVAN, hyear) }] : []),
        ...hanukkahDays(hyear),
        { id: 'asara-btevet', nameHe: 'עשרה בטבת', category: 'fast', date: new HDate(10, months.TEVET, hyear) },
        { id: 'tu-bishvat', nameHe: 'ט״ו בשבט', category: 'minor', date: new HDate(15, months.SHVAT, hyear) },
        ...(HDate.isLeapYear(hyear) ? [
            { id: 'purim-katan', nameHe: 'פורים קטן', category: 'minor', date: new HDate(14, months.ADAR_I, hyear) },
            { id: 'shushan-purim-katan', nameHe: 'שושן פורים קטן', category: 'minor', date: new HDate(15, months.ADAR_I, hyear) },
        ] : []),
        { id: 'taanit-esther', nameHe: 'תענית אסתר', category: 'fast', date: computeTaanitEsther(hyear) },
        { id: 'purim', nameHe: 'פורים', category: 'major', date: new HDate(14, purimMonth(hyear), hyear) },
        { id: 'shushan-purim', nameHe: 'שושן פורים', category: 'minor', date: new HDate(15, purimMonth(hyear), hyear) },
        { id: 'pesach', nameHe: 'פסח', category: 'major', date: new HDate(15, months.NISAN, hyear) },
        ...Array.from({ length: 5 }, (_, index) => ({ id: 'chol-hamoed-pesach', nameHe: 'חול המועד פסח', category: 'minor', date: new HDate(16 + index, months.NISAN, hyear) })),
        { id: 'shvii-shel-pesach', nameHe: 'שביעי של פסח', category: 'major', date: new HDate(21, months.NISAN, hyear) },
        { id: 'yom-hashoah', nameHe: 'יום השואה', category: 'memorial', date: computeYomHaShoah(hyear) },
        ...(hyear >= 5708 ? [
            { id: 'yom-hazikaron', nameHe: 'יום הזיכרון', category: 'memorial', date: shiftHDate(computeYomHaatzmaut(hyear), -1) },
            { id: 'yom-haatzmaut', nameHe: 'יום העצמאות', category: 'modern', date: computeYomHaatzmaut(hyear) },
        ] : []),
        { id: 'lag-baomer', nameHe: 'ל״ג בעומר', category: 'minor', date: new HDate(18, months.IYYAR, hyear) },
        ...(hyear >= 5727 ? [{ id: 'yom-yerushalayim', nameHe: 'יום ירושלים', category: 'modern', date: new HDate(28, months.IYYAR, hyear) }] : []),
        { id: 'shavuot', nameHe: 'שבועות', category: 'major', date: new HDate(6, months.SIVAN, hyear) },
        { id: 'shiva-asar-btammuz', nameHe: 'י״ז בתמוז', category: 'fast', date: postponeFromShabbat(new HDate(17, months.TAMUZ, hyear)) },
        { id: 'tisha-bav', nameHe: 'תשעה באב', category: 'fast', date: postponeFromShabbat(new HDate(9, months.AV, hyear)) },
        { id: 'tu-bav', nameHe: 'ט״ו באב', category: 'minor', date: new HDate(15, months.AV, hyear) },
    ];

    return list
        .filter((holiday) => holiday.date)
        .map((holiday) => ({
            id: holiday.id,
            nameHe: holiday.nameHe,
            category: holiday.category,
            date: hdateToIsoString(holiday.date),
            ...(holiday.dayIndex ? { dayIndex: holiday.dayIndex, totalDays: holiday.totalDays } : {}),
        }));
}

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
        .sort((a, b) => a.date.localeCompare(b.date) || a.nameHe.localeCompare(b.nameHe, 'he'));
}

export function buildHolidayMapForRange(startDateString, endDateString) {
    const map = new Map();
    getHolidaysInRange(startDateString, endDateString).forEach((holiday) => {
        const existing = map.get(holiday.date) || [];
        existing.push(holiday);
        map.set(holiday.date, existing);
    });
    return map;
}

export function getHolidaysForDate(dateString) {
    return getHolidaysInRange(dateString, dateString);
}
