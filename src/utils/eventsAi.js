import { normalizeEventColor } from './colorValidation';
import {
    cleanSmartText,
    getSmartTextDocument,
    smartTextTokensToPlainText,
} from './smartText';

export const DEFAULT_AI_EVENTS_COUNT = 3;
export const MAX_AI_EVENTS_COUNT = 6;
export const MIN_AI_EVENTS_COUNT = 1;

const VALID_EVENT_DISPLAY_MODES = new Set(['default', 'monthly', 'calendar']);
const EVENT_COUNT_WORDS = new Map([
    ['אחד', 1],
    ['אחת', 1],
    ['ראשון', 1],
    ['ראשונה', 1],
    ['שני', 2],
    ['שניים', 2],
    ['שתיים', 2],
    ['שתי', 2],
    ['שלושה', 3],
    ['שלוש', 3],
    ['ארבעה', 4],
    ['ארבע', 4],
    ['חמישה', 5],
    ['חמש', 5],
    ['שישה', 6],
    ['שש', 6],
    ['one', 1],
    ['two', 2],
    ['three', 3],
    ['four', 4],
    ['five', 5],
    ['six', 6],
]);

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function clampAiEventsCount(value, fallback = DEFAULT_AI_EVENTS_COUNT) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(MIN_AI_EVENTS_COUNT, Math.min(MAX_AI_EVENTS_COUNT, Math.round(numeric)));
}

function getExplicitPayloadEventCount(payload) {
    return payload?.eventCount
        ?? payload?.numberOfEvents
        ?? payload?.eventsCount
        ?? payload?.requestedEventCount
        ?? payload?.count;
}

export function resolveRequestedAiEventCount(instruction) {
    const source = cleanSmartText(instruction).trim();
    if (!source) return DEFAULT_AI_EVENTS_COUNT;

    const eventTerms = '(?:אירוע(?:ים)?|מופע(?:ים)?|events?\\b)';
    const numericPatterns = [
        new RegExp(`(?:^|\\s)(\\d{1,2})\\s*${eventTerms}`, 'i'),
        new RegExp(`${eventTerms}\\s*(?:[:=-]|\\s)+(?:בכמות|כמות|מספר|count|number of)?\\s*(\\d{1,2})`, 'i'),
        new RegExp('(?:צור|צרי|תיצור|תיצרי|ייצר|ייצרי|הכן|הכיני|תכין|תכיני|בנה|בני|generate|create|make)\\D{0,20}(\\d{1,2})\\s*' + eventTerms, 'i'),
    ];

    for (const pattern of numericPatterns) {
        const match = source.match(pattern);
        if (match) return clampAiEventsCount(match[1]);
    }

    for (const [word, count] of EVENT_COUNT_WORDS.entries()) {
        const escapedWord = escapeRegExp(word);
        const beforeEvent = new RegExp(`(?:^|\\s)${escapedWord}\\s+${eventTerms}`, 'i');
        const afterEvent = new RegExp(`${eventTerms}\\s+(?:בכמות|כמות|מספר|count|number of)?\\s*${escapedWord}(?:\\s|$)`, 'i');
        if (beforeEvent.test(source) || afterEvent.test(source)) {
            return count;
        }
    }

    return DEFAULT_AI_EVENTS_COUNT;
}

function normalizeStringMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    return Object.entries(value).reduce((acc, [key, rawValue]) => {
        const normalizedKey = cleanSmartText(key).trim();
        const normalizedValue = cleanSmartText(rawValue).trim();
        if (normalizedKey && normalizedValue) {
            acc[normalizedKey] = normalizedValue;
        }
        return acc;
    }, {});
}

function normalizeAiEventItem(item, index) {
    const rawDate = cleanSmartText(item?.date).trim();
    const title = cleanSmartText(item?.title).trim();

    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !title) {
        return null;
    }

    const linkLabels = normalizeStringMap(item?.linkLabels);
    const fallbackSubtitle = cleanSmartText(item?.subtitle).trim();
    const subtitleRichText = getSmartTextDocument(item?.subtitleRichText, fallbackSubtitle, linkLabels);
    const subtitle = smartTextTokensToPlainText(subtitleRichText).trim() || fallbackSubtitle;

    return {
        id: String(item?.id || `ev_${Date.now()}_${index}`),
        date: rawDate,
        title,
        subtitle,
        subtitleRichText,
        linkLabels,
        color: normalizeEventColor(item?.color, 'gray'),
    };
}

export function normalizeAiEventsPayload(payload, options = {}) {
    const sourceEvents = Array.isArray(payload?.events) ? payload.events : [];
    const requestedEventCount = clampAiEventsCount(
        options.eventCount ?? getExplicitPayloadEventCount(payload),
        DEFAULT_AI_EVENTS_COUNT,
    );
    const normalizedEvents = sourceEvents
        .map((item, index) => normalizeAiEventItem(item, index))
        .filter(Boolean)
        .slice(0, requestedEventCount);

    if (!normalizedEvents.length) {
        throw new Error('לא התקבלו אירועים תקינים מה-AI');
    }

    if (normalizedEvents.length < requestedEventCount) {
        throw new Error(`ה-AI החזיר ${normalizedEvents.length} אירועים תקינים מתוך ${requestedEventCount} שביקשת. נסה שוב.`);
    }

    const requestedDisplayMode = cleanSmartText(payload?.displayMode || 'default').trim().toLowerCase();
    const displayMode = VALID_EVENT_DISPLAY_MODES.has(requestedDisplayMode)
        ? requestedDisplayMode
        : 'default';
    const requestedDisplayCount = Number(payload?.displayCount);
    const displayCount = Number.isFinite(requestedDisplayCount)
        ? Math.max(1, Math.min(normalizedEvents.length, Math.round(requestedDisplayCount)))
        : Math.min(DEFAULT_AI_EVENTS_COUNT, normalizedEvents.length);

    let intervalMs = 6000;
    if (Number.isFinite(Number(payload?.intervalMs))) {
        intervalMs = Math.max(2000, Math.round(Number(payload.intervalMs)));
    } else if (Number.isFinite(Number(payload?.intervalSeconds))) {
        intervalMs = Math.max(2000, Math.round(Number(payload.intervalSeconds) * 1000));
    }

    return {
        events: normalizedEvents,
        displayCount,
        displayMode,
        intervalMs,
    };
}

export function buildEventsAiPromptText({
    instruction,
    today,
    currentSnapshot,
    requestedEventCount = DEFAULT_AI_EVENTS_COUNT,
}) {
    const safeRequestedEventCount = clampAiEventsCount(requestedEventCount);

    return [
        'אתה עורך תוכן אירועים לפורטל ארגוני.',
        'החזר JSON בלבד ללא טקסט נוסף.',
        'סכימה נדרשת:',
        '{',
        `  "eventCount": ${safeRequestedEventCount},`,
        '  "events": [',
        '    {',
        '      "date": "YYYY-MM-DD",',
        '      "title": "string",',
        '      "subtitle": "string",',
        '      "subtitleRichText": [',
        '        { "type": "text", "text": "string", "marks": ["bold"] },',
        '        { "type": "break" },',
        '        { "type": "link", "linkType": "url|email|personalNumber|phone", "text": "string", "raw": "string", "value": "string", "href": "string", "marks": [] }',
        '      ],',
        '      "linkLabels": { "raw-or-href": "display label" },',
        '      "color": "gray|red|#RRGGBB"',
        '    }',
        '  ],',
        '  "displayCount": 1-6,',
        '  "displayMode": "default|monthly|calendar",',
        '  "intervalSeconds": number',
        '}',
        'חוקים:',
        `- צור בדיוק ${safeRequestedEventCount} אירועים. אם המשתמש לא ציין כמות, ברירת המחדל היא ${DEFAULT_AI_EVENTS_COUNT}. המקסימום הוא ${MAX_AI_EVENTS_COUNT}.`,
        '- כל title קצר וברור.',
        '- תאריכים חייבים להיות תקינים בפורמט YYYY-MM-DD.',
        '- subtitle הוא גרסת הטקסט הרגיל של subtitleRichText.',
        '- אין להחזיר HTML. טקסט עשיר מיוצג רק באמצעות subtitleRichText tokens.',
        '- marks חוקיים: bold, italic, underline. אפשר לשלב כמה marks באותו token.',
        '- type="break" משמש לשבירת שורה.',
        '- linkType="url" מיועד לכתובות https:// או www, עם target/rel לא חובה.',
        '- linkType="email" משתמש ב-href מסוג mailto:user@example.com.',
        '- linkType="personalNumber" מיועד למספר אישי שמתחיל ב-S או C ואחריו 7 או 8 ספרות; href צריך להיות mailto:S1234567@army.idf.il.',
        '- linkType="phone" משתמש ב-href מסוג tel:0501234567.',
        '- linkLabels אופציונלי: השתמש בו כשיש URL ארוך ורוצים שם תצוגה קצר.',
        `תאריך היום: ${today}`,
        `נתונים קיימים: ${JSON.stringify(currentSnapshot)}`,
        `בקשת המשתמש: ${instruction}`,
    ].join('\n');
}
