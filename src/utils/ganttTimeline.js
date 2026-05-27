const DAY_MS = 24 * 60 * 60 * 1000;

export const GANTT_TIMELINE_VIEW_CONFIG = {
    week: { pixelsPerDay: 64, tickEvery: 1, minWidth: 760 },
    month: { pixelsPerDay: 24, tickEvery: 7, minWidth: 820 },
    quarter: { pixelsPerDay: 10, tickEvery: 14, minWidth: 900 },
};

const statusLabel = {
    planned: 'מתוכנן',
    blocked: 'חסום',
    completed: 'הושלם',
    cancelled: 'בוטל',
    onHold: 'בהמתנה',
};

export function parseGanttDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
}

export function toGanttDateString(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

function localDateString(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return toGanttDateString(Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function addGanttDays(timestamp, days) {
    return timestamp + days * DAY_MS;
}

export function diffGanttDays(start, end) {
    return Math.round((end - start) / DAY_MS);
}

function formatMonth(value) {
    try {
        return new Intl.DateTimeFormat('he-IL', { month: 'short', year: '2-digit' }).format(new Date(`${value}T00:00:00`));
    } catch {
        return value.slice(0, 7);
    }
}

function startOfUtcDay(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcWeek(timestamp) {
    const start = startOfUtcDay(timestamp);
    const day = new Date(start).getUTCDay();
    return addGanttDays(start, -day);
}

function endOfUtcWeek(timestamp) {
    return addGanttDays(startOfUtcWeek(timestamp), 6);
}

function startOfUtcMonth(timestamp) {
    const date = new Date(timestamp);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function endOfUtcMonth(timestamp) {
    const date = new Date(timestamp);
    return addGanttDays(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1), -1);
}

function startOfUtcQuarter(timestamp) {
    const date = new Date(timestamp);
    const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    return Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1);
}

function endOfUtcQuarter(timestamp) {
    const date = new Date(timestamp);
    const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
    return addGanttDays(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 1), -1);
}

function resolveItemExtent(items, todayString = localDateString()) {
    const timestamps = items
        .flatMap((item) => [
            parseGanttDate(item.startDate),
            parseGanttDate(item.endDate),
            ...(Array.isArray(item.milestones) ? item.milestones.map((milestone) => parseGanttDate(milestone.date)) : []),
        ])
        .filter(Number.isFinite);
    if (timestamps.length === 0) {
        const today = parseGanttDate(todayString) || parseGanttDate(localDateString());
        return { start: today, end: today };
    }
    return { start: Math.min(...timestamps), end: Math.max(...timestamps) };
}

function daysInUtcMonth(year, monthIndex) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addUtcMonths(timestamp, monthOffset) {
    const date = new Date(timestamp);
    const targetMonth = date.getUTCMonth() + monthOffset;
    const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const targetDay = Math.min(date.getUTCDate(), daysInUtcMonth(targetYear, normalizedMonth));
    return Date.UTC(targetYear, normalizedMonth, targetDay);
}

function shiftTimelineRange(range, viewMode, periodOffset) {
    const offset = Number.isFinite(Number(periodOffset)) ? Math.round(Number(periodOffset)) : 0;
    if (offset === 0) return range;
    if (viewMode === 'week') {
        return {
            start: addGanttDays(range.start, offset * 7),
            end: addGanttDays(range.end, offset * 7),
        };
    }
    const monthOffset = viewMode === 'quarter' ? offset * 3 : offset;
    return {
        start: addUtcMonths(range.start, monthOffset),
        end: addUtcMonths(range.end, monthOffset),
    };
}

export function resolveGanttTimelineRange(items, viewMode, todayString = localDateString(), periodOffset = 0) {
    const extent = resolveItemExtent(items, todayString);
    const safeViewMode = GANTT_TIMELINE_VIEW_CONFIG[viewMode] ? viewMode : 'month';
    let range;

    if (safeViewMode === 'week') {
        range = {
            start: addGanttDays(startOfUtcWeek(extent.start), -1),
            end: addGanttDays(endOfUtcWeek(extent.end), 1),
        };
        return shiftTimelineRange(range, safeViewMode, periodOffset);
    }

    if (safeViewMode === 'quarter') {
        range = {
            start: startOfUtcQuarter(extent.start),
            end: endOfUtcQuarter(extent.end),
        };
        return shiftTimelineRange(range, safeViewMode, periodOffset);
    }

    range = {
        start: startOfUtcMonth(extent.start),
        end: endOfUtcMonth(extent.end),
    };
    return shiftTimelineRange(range, safeViewMode, periodOffset);
}

function buildMonthSegments(start, end, dayWidth) {
    const segments = [];
    let cursor = start;
    while (cursor <= end) {
        const key = toGanttDateString(cursor).slice(0, 7);
        let count = 0;
        while (cursor <= end && toGanttDateString(cursor).slice(0, 7) === key) {
            count += 1;
            cursor = addGanttDays(cursor, 1);
        }
        segments.push({ key, label: formatMonth(`${key}-01`), days: count, width: count * dayWidth });
    }
    return segments;
}

function buildTicks(start, end, dayWidth, viewMode) {
    const config = GANTT_TIMELINE_VIEW_CONFIG[viewMode] || GANTT_TIMELINE_VIEW_CONFIG.month;
    const ticks = [];
    let cursor = start;
    let index = 0;
    while (cursor <= end) {
        const date = toGanttDateString(cursor);
        const dayOfMonth = new Date(`${date}T00:00:00`).getDate();
        const isMonthStart = dayOfMonth === 1;
        const shouldShow = viewMode === 'quarter'
            ? isMonthStart || index % config.tickEvery === 0
            : index % config.tickEvery === 0;
        if (shouldShow) {
            ticks.push({ date, offset: index * dayWidth, strong: isMonthStart });
        }
        cursor = addGanttDays(cursor, 1);
        index += 1;
    }
    return ticks;
}

function groupItems(items, groupBy, categories) {
    if (groupBy === 'none') return [{ id: 'all', label: 'כל המשימות', items }];
    const groups = new Map();
    items.forEach((item) => {
        const raw = groupBy === 'status'
            ? (statusLabel[item.status] || item.status)
            : (groupBy === 'owner' ? item.owner : item.category);
        const label = raw || (groupBy === 'owner' ? 'ללא אחראי' : 'כללי');
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label).push(item);
    });

    const categoryOrder = new Map(categories.map((category, index) => [category.name, index]));
    return [...groups.entries()]
        .map(([label, groupedItems]) => ({ id: label, label, items: groupedItems }))
        .sort((a, b) => {
            if (groupBy === 'category') {
                return (categoryOrder.get(a.label) ?? 999) - (categoryOrder.get(b.label) ?? 999);
            }
            return a.label.localeCompare(b.label, 'he');
        });
}

export function buildGanttTimelineModel({
    items,
    viewMode,
    compact = false,
    viewportWidth = 1280,
    taskColumnWidth = 260,
    todayString = localDateString(),
    showToday = true,
    groupBy = 'category',
    categories = [],
    periodOffset = 0,
}) {
    if (!Array.isArray(items) || items.length === 0) return null;
    const safeViewMode = GANTT_TIMELINE_VIEW_CONFIG[viewMode] ? viewMode : 'month';
    const config = GANTT_TIMELINE_VIEW_CONFIG[safeViewMode];
    const range = resolveGanttTimelineRange(items, safeViewMode, todayString, periodOffset);
    const totalDays = diffGanttDays(range.start, range.end) + 1;
    const availableTimelineMin = compact
        ? config.minWidth
        : Math.max(config.minWidth, viewportWidth - taskColumnWidth - 96);
    const dayWidth = Math.max(config.pixelsPerDay, Math.ceil(availableTimelineMin / Math.max(totalDays, 1)));
    const width = totalDays * dayWidth;
    const today = parseGanttDate(todayString);

    return {
        ...range,
        viewMode: safeViewMode,
        periodOffset: Number.isFinite(Number(periodOffset)) ? Math.round(Number(periodOffset)) : 0,
        dayWidth,
        totalDays,
        width,
        months: buildMonthSegments(range.start, range.end, dayWidth),
        ticks: buildTicks(range.start, range.end, dayWidth, safeViewMode),
        todayOffset: showToday && Number.isFinite(today) ? diffGanttDays(range.start, today) * dayWidth : null,
        groups: groupItems(items, groupBy, categories),
    };
}
