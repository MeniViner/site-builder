export const BOOM_STATUS_OPTIONS = Object.freeze([
    { value: 'planned', label: 'מתוכנן' },
    { value: 'active', label: 'בביצוע' },
    { value: 'blocked', label: 'חסום' },
    { value: 'onHold', label: 'בהמתנה' },
    { value: 'completed', label: 'הושלם' },
]);

export const BOOM_COLOR_OPTIONS = Object.freeze([
    '#2563eb',
    '#0891b2',
    '#0f766e',
    '#7c3aed',
    '#d97706',
    '#dc2626',
    '#475569',
]);

export const DEFAULT_BOOM_DATA = Object.freeze({
    enabled: false,
    buttonLabel: 'בום',
    pageTitle: 'BOOM - תמונת מצב',
    description: 'מערכת שליטה ובקרה למשימות, אחריות והתקדמות.',
    categories: [
        { id: 'boom-category-general', name: 'כללי', color: BOOM_COLOR_OPTIONS[0], order: 1 },
    ],
    items: [],
});

const VALID_STATUS = new Set(BOOM_STATUS_OPTIONS.map((option) => option.value));
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function integer(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function validDate(value, fallback) {
    const candidate = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return fallback;
    return Number.isFinite(Date.parse(`${candidate}T00:00:00`)) ? candidate : fallback;
}

function todayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function isValidBoomColor(value) {
    return HEX_COLOR_RE.test(text(value));
}

export function normalizeBoomStatus(value) {
    return VALID_STATUS.has(value) ? value : BOOM_STATUS_OPTIONS[0].value;
}

export function normalizeBoomTask(taskLike, index = 0) {
    const source = isObject(taskLike) ? taskLike : {};
    const startDate = validDate(source.startDate, '');
    const endCandidate = validDate(source.endDate ?? source.deadline, startDate);
    const endDate = !startDate || !endCandidate || Date.parse(`${endCandidate}T00:00:00`) >= Date.parse(`${startDate}T00:00:00`)
        ? endCandidate
        : startDate;

    return {
        id: text(source.id, `boom-task-${index + 1}`),
        title: text(source.title, `משימה ${index + 1}`),
        category: text(source.category ?? source.domain, 'כללי'),
        owner: text(source.owner ?? source.responsibleOwner),
        status: normalizeBoomStatus(source.status),
        startDate,
        endDate,
        progress: integer(source.progress, 0, 100, 0),
        details: text(source.details ?? source.description ?? source.notes),
        color: isValidBoomColor(source.color) ? source.color : BOOM_COLOR_OPTIONS[0],
        order: integer(source.order, 0, Number.MAX_SAFE_INTEGER, index + 1),
    };
}

function normalizeBoomCategories(categoriesLike, tasks) {
    const source = Array.isArray(categoriesLike) ? categoriesLike : [];
    const seen = new Set();
    const categories = [];

    source.forEach((categoryLike, index) => {
        const category = isObject(categoryLike) ? categoryLike : {};
        const name = text(category.name ?? category.label);
        const key = name.toLocaleLowerCase('he');
        if (!name || seen.has(key)) return;
        seen.add(key);
        categories.push({
            id: text(category.id, `boom-category-${index + 1}`),
            name,
            color: isValidBoomColor(category.color)
                ? category.color
                : BOOM_COLOR_OPTIONS[index % BOOM_COLOR_OPTIONS.length],
            order: integer(category.order, 0, Number.MAX_SAFE_INTEGER, index + 1),
        });
    });

    tasks.forEach((task) => {
        const key = task.category.toLocaleLowerCase('he');
        if (seen.has(key)) return;
        seen.add(key);
        categories.push({
            id: `boom-category-${categories.length + 1}`,
            name: task.category,
            color: task.color,
            order: categories.length + 1,
        });
    });

    if (categories.length === 0) {
        categories.push({ ...DEFAULT_BOOM_DATA.categories[0] });
    }

    return categories.sort((left, right) => left.order - right.order || left.name.localeCompare(right.name, 'he'));
}

export function normalizeBoomData(dataLike) {
    const source = isObject(dataLike) ? dataLike : {};
    const items = (Array.isArray(source.items) ? source.items : [])
        .map((item, index) => normalizeBoomTask(item, index))
        .sort((left, right) => left.order - right.order);
    const categories = normalizeBoomCategories(source.categories, items);
    const categoryByName = new Map(categories.map((category) => [category.name.toLocaleLowerCase('he'), category]));

    return {
        enabled: source.enabled === true,
        buttonLabel: text(source.buttonLabel, DEFAULT_BOOM_DATA.buttonLabel),
        pageTitle: text(source.pageTitle, DEFAULT_BOOM_DATA.pageTitle),
        description: text(source.description, DEFAULT_BOOM_DATA.description),
        categories,
        items: items.map((task) => {
            const category = categoryByName.get(task.category.toLocaleLowerCase('he'));
            return {
                ...task,
                category: category?.name || task.category,
                color: category?.color || task.color,
            };
        }),
    };
}

export function cloneBoomData(value = DEFAULT_BOOM_DATA) {
    return normalizeBoomData(JSON.parse(JSON.stringify(value)));
}

export function createBoomTask(overrides = {}) {
    const now = todayDateString();
    return normalizeBoomTask({
        id: `boom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: '',
        category: 'כללי',
        owner: '',
        status: 'planned',
        startDate: now,
        endDate: now,
        progress: 0,
        details: '',
        color: BOOM_COLOR_OPTIONS[0],
        order: Date.now(),
        ...overrides,
    });
}
