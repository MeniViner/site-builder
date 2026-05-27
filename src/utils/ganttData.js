export const GANTT_STATUS_OPTIONS = [
    { value: 'planned', label: 'מתוכנן' },
    { value: 'blocked', label: 'חסום' },
    { value: 'completed', label: 'הושלם' },
    { value: 'cancelled', label: 'בוטל' },
    { value: 'onHold', label: 'בהמתנה' },
];

export const GANTT_TIME_STATUS_OPTIONS = [
    { value: 'upcoming', label: 'עתידי' },
    { value: 'active', label: 'בתהליך' },
    { value: 'overdue', label: 'מאחר' },
    { value: 'completed', label: 'הושלם' },
    { value: 'cancelled', label: 'בוטל' },
    { value: 'ended', label: 'הסתיים' },
    { value: 'invalidDate', label: 'תאריך לא תקין' },
];

export const GANTT_VIEW_OPTIONS = [
    { value: 'week', label: 'שבוע' },
    { value: 'month', label: 'חודש' },
    { value: 'quarter', label: 'רבעון' },
];

export const GANTT_COLOR_OPTIONS = [
    '#2563eb',
    '#0891b2',
    '#16a34a',
    '#d97706',
    '#dc2626',
    '#7c3aed',
    '#0f766e',
    '#475569',
];

export const DEFAULT_GANTT_DATA = {
    enabled: false,
    buttonLabel: 'גאנט עבודה',
    pageTitle: 'גאנט עבודה',
    description: '',
    groupBy: 'category',
    defaultView: 'month',
    showLegend: true,
    showToday: true,
    categories: [],
    items: [],
};

export const DEFAULT_GANTT_DESIGN = {
    presetId: 'classic-beige',
    layoutMode: 'fullWidth',
    chartWidthMode: 'full',
    chartHeightMode: 'viewport',
    density: 'comfortable',
    taskColumnWidth: 'medium',
    cardStyle: 'soft',
    backgroundStyle: 'site',
    toolbarStyle: 'comfortable',
    gridStyle: 'subtle',
    barStyle: 'rounded',
    milestoneStyle: 'diamond',
    legendPlacement: 'bottom',
    todayLineStyle: 'soft',
    showOuterCard: true,
    barShadow: true,
    showProgressLabel: true,
    colors: {
        chartBackground: '#ffffff',
        cardBackground: '#ffffff',
        accentColor: '#2563eb',
        todayLineColor: '#ef4444',
    },
};

export const GANTT_DESIGN_PRESETS = [
    {
        id: 'classic-beige',
        name: 'קלאסי חמים',
        description: 'העיצוב הציבורי הנוכחי בגווני בז׳ וחום, מתאים לאתר בעיצוב חמים.',
        settings: {
            ...DEFAULT_GANTT_DESIGN,
            presetId: 'classic-beige',
            layoutMode: 'fullWidth',
            chartWidthMode: 'full',
            cardStyle: 'soft',
            backgroundStyle: 'site',
            toolbarStyle: 'comfortable',
            density: 'comfortable',
            gridStyle: 'subtle',
        },
    },
    {
        id: 'clean-card',
        name: 'כרטיס נקי',
        description: 'עיצוב בהיר ונקי כמו התצוגה המקדימה בניהול, עם כרטיס ממורכז, רקע בהיר וגבולות עדינים.',
        settings: {
            ...DEFAULT_GANTT_DESIGN,
            presetId: 'clean-card',
            layoutMode: 'centered',
            chartWidthMode: 'contained',
            cardStyle: 'clean',
            backgroundStyle: 'clean',
            toolbarStyle: 'compact',
            density: 'comfortable',
            gridStyle: 'subtle',
            barShadow: false,
            colors: {
                chartBackground: '#f8fafc',
                cardBackground: '#ffffff',
                accentColor: '#2563eb',
                todayLineColor: '#ef4444',
            },
        },
    },
    {
        id: 'full-board',
        name: 'לוח מלא',
        description: 'תרשים רחב שמנצל את כל רוחב המסך, מתאים להרבה משימות.',
        settings: {
            ...DEFAULT_GANTT_DESIGN,
            presetId: 'full-board',
            layoutMode: 'fullWidth',
            chartWidthMode: 'full',
            cardStyle: 'minimal',
            backgroundStyle: 'clean',
            toolbarStyle: 'compact',
            density: 'comfortable',
            taskColumnWidth: 'wide',
            showOuterCard: true,
            barShadow: false,
        },
    },
    {
        id: 'compact',
        name: 'קומפקטי',
        description: 'עיצוב צפוף יותר שמתאים למסכים קטנים או להרבה משימות.',
        settings: {
            ...DEFAULT_GANTT_DESIGN,
            presetId: 'compact',
            layoutMode: 'fullWidth',
            chartWidthMode: 'full',
            cardStyle: 'clean',
            backgroundStyle: 'clean',
            toolbarStyle: 'compact',
            chartHeightMode: 'compact',
            density: 'compact',
            taskColumnWidth: 'narrow',
            gridStyle: 'minimal',
            barShadow: false,
            showProgressLabel: false,
        },
    },
    {
        id: 'glass-modern',
        name: 'זכוכית מודרנית',
        description: 'עיצוב זכוכית עדין עם רקע מטושטש ושקיפות קלה.',
        settings: {
            ...DEFAULT_GANTT_DESIGN,
            presetId: 'glass-modern',
            layoutMode: 'centered',
            chartWidthMode: 'contained',
            cardStyle: 'glass',
            backgroundStyle: 'glass',
            toolbarStyle: 'comfortable',
            density: 'comfortable',
            gridStyle: 'subtle',
            colors: {
                chartBackground: '#f8fafc',
                cardBackground: '#ffffff',
                accentColor: '#0f766e',
                todayLineColor: '#dc2626',
            },
        },
    },
];

const VALID_GROUP_BY = new Set(['category', 'owner', 'status', 'none']);
const VALID_STATUS = new Set(GANTT_STATUS_OPTIONS.map((option) => option.value));
const VALID_VIEW = new Set(GANTT_VIEW_OPTIONS.map((option) => option.value));
const VALID_DESIGN_PRESET = new Set(GANTT_DESIGN_PRESETS.map((preset) => preset.id));
const VALID_LAYOUT_MODE = new Set(['fullWidth', 'centered']);
const VALID_CHART_WIDTH_MODE = new Set(['full', 'contained']);
const VALID_CHART_HEIGHT_MODE = new Set(['auto', 'viewport', 'fixed', 'compact']);
const VALID_DENSITY = new Set(['compact', 'comfortable', 'spacious']);
const VALID_TASK_COLUMN_WIDTH = new Set(['narrow', 'medium', 'wide']);
const VALID_CARD_STYLE = new Set(['soft', 'clean', 'minimal', 'glass']);
const VALID_BACKGROUND_STYLE = new Set(['site', 'clean', 'subtle', 'glass']);
const VALID_TOOLBAR_STYLE = new Set(['compact', 'comfortable', 'sticky']);
const VALID_GRID_STYLE = new Set(['minimal', 'subtle', 'strong']);
const VALID_BAR_STYLE = new Set(['rounded', 'flat']);
const VALID_MILESTONE_STYLE = new Set(['diamond', 'dot', 'flag']);
const VALID_LEGEND_PLACEMENT = new Set(['bottom', 'top', 'hidden']);
const VALID_TODAY_LINE_STYLE = new Set(['soft', 'strong', 'minimal']);
const LEGACY_STATUS_MAP = {
    active: 'planned',
    done: 'completed',
};
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const toString = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

const toId = (value, fallback) => {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
};

export const isValidGanttColor = (value) => HEX_COLOR_RE.test(String(value || '').trim());

const normalizeColor = (value, fallback) => {
    const color = toString(value, fallback).trim();
    return isValidGanttColor(color) ? color : fallback;
};

const normalizeOrder = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
};

const normalizeChoice = (value, validValues, fallback) => (
    validValues.has(value) ? value : fallback
);

const normalizeBoolean = (value, fallback) => (
    typeof value === 'boolean' ? value : fallback
);

function getPresetSettings(presetId) {
    return GANTT_DESIGN_PRESETS.find((preset) => preset.id === presetId)?.settings || DEFAULT_GANTT_DESIGN;
}

export function normalizeGanttDesignSettings(designLike) {
    const source = isObject(designLike) ? designLike : {};
    const requestedPresetId = normalizeChoice(source.presetId, VALID_DESIGN_PRESET, DEFAULT_GANTT_DESIGN.presetId);
    const presetDefaults = getPresetSettings(requestedPresetId);
    const merged = {
        ...DEFAULT_GANTT_DESIGN,
        ...presetDefaults,
        ...source,
        presetId: requestedPresetId,
        colors: {
            ...DEFAULT_GANTT_DESIGN.colors,
            ...(isObject(presetDefaults.colors) ? presetDefaults.colors : {}),
            ...(isObject(source.colors) ? source.colors : {}),
        },
    };

    return {
        presetId: requestedPresetId,
        layoutMode: normalizeChoice(merged.layoutMode, VALID_LAYOUT_MODE, presetDefaults.layoutMode),
        chartWidthMode: normalizeChoice(merged.chartWidthMode, VALID_CHART_WIDTH_MODE, presetDefaults.chartWidthMode),
        chartHeightMode: normalizeChoice(merged.chartHeightMode, VALID_CHART_HEIGHT_MODE, presetDefaults.chartHeightMode),
        density: normalizeChoice(merged.density, VALID_DENSITY, presetDefaults.density),
        taskColumnWidth: normalizeChoice(merged.taskColumnWidth, VALID_TASK_COLUMN_WIDTH, presetDefaults.taskColumnWidth),
        cardStyle: normalizeChoice(merged.cardStyle, VALID_CARD_STYLE, presetDefaults.cardStyle),
        backgroundStyle: normalizeChoice(merged.backgroundStyle, VALID_BACKGROUND_STYLE, presetDefaults.backgroundStyle),
        toolbarStyle: normalizeChoice(merged.toolbarStyle, VALID_TOOLBAR_STYLE, presetDefaults.toolbarStyle),
        gridStyle: normalizeChoice(merged.gridStyle, VALID_GRID_STYLE, presetDefaults.gridStyle),
        barStyle: normalizeChoice(merged.barStyle, VALID_BAR_STYLE, presetDefaults.barStyle),
        milestoneStyle: normalizeChoice(merged.milestoneStyle, VALID_MILESTONE_STYLE, presetDefaults.milestoneStyle),
        legendPlacement: normalizeChoice(merged.legendPlacement, VALID_LEGEND_PLACEMENT, presetDefaults.legendPlacement),
        todayLineStyle: normalizeChoice(merged.todayLineStyle, VALID_TODAY_LINE_STYLE, presetDefaults.todayLineStyle),
        showOuterCard: normalizeBoolean(merged.showOuterCard, presetDefaults.showOuterCard),
        barShadow: normalizeBoolean(merged.barShadow, presetDefaults.barShadow),
        showProgressLabel: normalizeBoolean(merged.showProgressLabel, presetDefaults.showProgressLabel),
        colors: {
            chartBackground: normalizeColor(merged.colors.chartBackground, presetDefaults.colors.chartBackground),
            cardBackground: normalizeColor(merged.colors.cardBackground, presetDefaults.colors.cardBackground),
            accentColor: normalizeColor(merged.colors.accentColor, presetDefaults.colors.accentColor),
            todayLineColor: normalizeColor(merged.colors.todayLineColor, presetDefaults.colors.todayLineColor),
        },
    };
}

export function applyGanttDesignPreset(presetId, overrides = {}) {
    const safePresetId = normalizeChoice(presetId, VALID_DESIGN_PRESET, DEFAULT_GANTT_DESIGN.presetId);
    return normalizeGanttDesignSettings({
        ...getPresetSettings(safePresetId),
        ...overrides,
        presetId: safePresetId,
    });
}

const toLocalDateString = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const todayDateString = () => toLocalDateString(new Date());

const toDayTimestamp = (value) => {
    const dateValue = value instanceof Date ? toLocalDateString(value) : parseDateValue(value);
    if (!dateValue) return null;
    const parsed = Date.parse(`${dateValue}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
};

const dayDiff = (startMs, endMs) => Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));

export const createGanttTask = (overrides = {}) => {
    const today = todayDateString();
    return normalizeGanttTask({
        id: `gantt-${Date.now()}`,
        title: 'משימה חדשה',
        owner: '',
        category: 'כללי',
        status: 'planned',
        startDate: today,
        endDate: today,
        color: GANTT_COLOR_OPTIONS[0],
        details: '',
        dependsOn: [],
        milestones: [],
        ...overrides,
    }, 0);
};

export function parseDateValue(value) {
    const raw = toString(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const date = new Date(`${raw}T00:00:00`);
    if (Number.isNaN(date.getTime())) return null;
    return raw;
}

export function computeGanttProgress(taskLike, today = new Date()) {
    const start = toDayTimestamp(taskLike?.startDate);
    const end = toDayTimestamp(taskLike?.endDate);
    const todayMs = toDayTimestamp(today);

    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(todayMs) || end < start) return 0;
    if (todayMs < start) return 0;
    if (todayMs > end) return 100;
    if (start === end) return todayMs >= start ? 100 : 0;

    const elapsedDays = dayDiff(start, todayMs);
    const totalDays = dayDiff(start, end);
    if (totalDays <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
}

export function computeGanttTimeStatus(taskLike, today = new Date()) {
    const manualStatus = normalizeGanttStatus(taskLike?.status);
    if (manualStatus === 'completed') return 'completed';
    if (manualStatus === 'cancelled') return 'cancelled';

    const start = toDayTimestamp(taskLike?.startDate);
    const end = toDayTimestamp(taskLike?.endDate);
    const todayMs = toDayTimestamp(today);

    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(todayMs) || end < start) return 'invalidDate';
    if (todayMs < start) return 'upcoming';
    if (todayMs <= end) return 'active';
    return 'overdue';
}

export function normalizeGanttStatus(value) {
    const normalized = LEGACY_STATUS_MAP[value] || value;
    return VALID_STATUS.has(normalized) ? normalized : 'planned';
}

export function normalizeGanttMilestone(milestoneLike, index = 0) {
    const source = isObject(milestoneLike) ? milestoneLike : {};
    const date = parseDateValue(source.date);
    if (!date) return null;

    return {
        id: toId(source.id, `gantt-milestone-${index + 1}`),
        title: toString(source.title || source.name, '').trim() || `אבן דרך ${index + 1}`,
        date,
        order: index + 1,
        ...(toString(source.createdAt).trim() ? { createdAt: toString(source.createdAt).trim() } : {}),
        ...(toString(source.updatedAt).trim() ? { updatedAt: toString(source.updatedAt).trim() } : {}),
    };
}

export function normalizeGanttMilestones(milestonesLike) {
    if (!Array.isArray(milestonesLike)) return [];
    return milestonesLike
        .map((milestone, index) => normalizeGanttMilestone(milestone, index))
        .filter(Boolean)
        .sort((a, b) => {
            const dateCompare = a.date.localeCompare(b.date);
            if (dateCompare !== 0) return dateCompare;
            return a.title.localeCompare(b.title, 'he');
        })
        .map((milestone, index) => ({
            ...milestone,
            order: index + 1,
        }));
}

export function normalizeGanttTask(taskLike, index = 0) {
    const source = isObject(taskLike) ? taskLike : {};
    const fallbackDate = todayDateString();
    const startDate = parseDateValue(source.startDate) || fallbackDate;
    const endDateCandidate = parseDateValue(source.endDate) || startDate;
    const startMs = Date.parse(`${startDate}T00:00:00`);
    const endMs = Date.parse(`${endDateCandidate}T00:00:00`);
    const fallbackColor = GANTT_COLOR_OPTIONS[index % GANTT_COLOR_OPTIONS.length];
    const endDate = endMs >= startMs ? endDateCandidate : startDate;
    const sourceMilestones = Array.isArray(source.milestones) ? source.milestones : [];
    const legacyMilestones = source.milestone === true && sourceMilestones.length === 0
        ? [{ id: `${toId(source.id, `gantt-task-${index + 1}`)}-legacy-milestone`, title: 'אבן דרך', date: endDate }]
        : [];
    const milestones = normalizeGanttMilestones([...sourceMilestones, ...legacyMilestones]);

    const normalizedTask = {
        id: toId(source.id, `gantt-task-${index + 1}`),
        title: toString(source.title, '').trim() || `משימה ${index + 1}`,
        owner: toString(source.owner, '').trim(),
        category: toString(source.category, '').trim() || 'כללי',
        status: normalizeGanttStatus(source.status),
        startDate,
        endDate,
        color: normalizeColor(source.color, fallbackColor),
        details: toString(source.details, '').trim(),
        dependsOn: Array.isArray(source.dependsOn)
            ? source.dependsOn.map((item) => String(item).trim()).filter(Boolean)
            : [],
        milestones,
    };

    return {
        ...normalizedTask,
        progress: computeGanttProgress(normalizedTask),
    };
}

export function normalizeGanttCategory(categoryLike, index = 0) {
    const source = isObject(categoryLike) ? categoryLike : {};
    const name = toString(source.name || source.label || source.category, '').trim() || `תחום ${index + 1}`;
    return {
        id: toId(source.id, `gantt-category-${index + 1}`),
        name,
        color: normalizeColor(source.color, GANTT_COLOR_OPTIONS[index % GANTT_COLOR_OPTIONS.length]),
        order: normalizeOrder(source.order, index + 1),
    };
}

function normalizeGanttCategories(categoriesLike, items) {
    const byName = new Map();
    const addCategory = (category, index) => {
        const normalized = normalizeGanttCategory(category, index);
        const key = normalized.name.trim().toLowerCase();
        if (!key || byName.has(key)) return;
        byName.set(key, normalized);
    };

    if (Array.isArray(categoriesLike)) {
        categoriesLike.forEach(addCategory);
    }

    items.forEach((item, index) => {
        const key = item.category.trim().toLowerCase();
        if (!key || byName.has(key)) return;
        byName.set(key, {
            id: `gantt-category-derived-${index + 1}`,
            name: item.category,
            color: item.color || GANTT_COLOR_OPTIONS[index % GANTT_COLOR_OPTIONS.length],
            order: byName.size + 1,
        });
    });

    return [...byName.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
}

export function normalizeGanttData(dataLike) {
    const source = isObject(dataLike) ? dataLike : {};
    const settingsSource = isObject(source.settings) ? source.settings : {};
    const items = (Array.isArray(source.items) ? source.items : [])
        .map((item, index) => normalizeGanttTask(item, index));
    const pageTitle = toString(source.pageTitle, DEFAULT_GANTT_DATA.pageTitle).trim() || DEFAULT_GANTT_DATA.pageTitle;

    return {
        enabled: source.enabled === true,
        buttonLabel: toString(source.buttonLabel, '').trim() || pageTitle,
        pageTitle,
        description: toString(source.description, '').trim(),
        groupBy: VALID_GROUP_BY.has(source.groupBy) ? source.groupBy : DEFAULT_GANTT_DATA.groupBy,
        defaultView: VALID_VIEW.has(source.defaultView) ? source.defaultView : DEFAULT_GANTT_DATA.defaultView,
        showLegend: source.showLegend !== false,
        showToday: source.showToday !== false,
        settings: {
            ...settingsSource,
            design: normalizeGanttDesignSettings(settingsSource.design),
        },
        categories: normalizeGanttCategories(source.categories, items),
        items,
    };
}

export function cloneGanttData(dataLike) {
    return normalizeGanttData(JSON.parse(JSON.stringify(normalizeGanttData(dataLike))));
}
