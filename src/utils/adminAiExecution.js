import { parseJsonFromModel } from './aiJson';
import {
    applyAdminAiActionSemantics,
    extractAdminAiCandidates,
    normalizeAdminAiCandidate,
} from './adminAiCapabilities';

export const ADMIN_AI_EXECUTION_MODES = Object.freeze({
    MUTATING: 'mutating',
    ANALYSIS: 'analysis',
});

export const ADMIN_AI_EXECUTION_OUTCOMES = Object.freeze({
    APPLIED: 'applied',
    ANALYSIS: 'analysis',
    NO_CHANGE: 'no-change',
    ERROR: 'error',
});

const LIST_SURFACE_LABELS = Object.freeze({
    events: 'אירועים',
    alerts: 'הודעות',
    news: 'ידיעות',
    outstanding: 'מצטיינים',
    phonebook: 'אנשי קשר',
    shuttles: 'היסעים',
    polls: 'סקרים',
    celebrations: 'אירועים חגיגיים',
    heritage: 'מסרי מורשת',
    tips: 'טיפים',
    'external-links': 'קישורים חיצוניים',
    galleries: 'גלריות',
});

const LIST_SURFACES = new Set(Object.keys(LIST_SURFACE_LABELS));

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalize(value, options = {}) {
    if (Array.isArray(value)) {
        const normalized = value.map((item) => canonicalize(item, options));
        if (options.sortCollections) {
            return normalized.sort((left, right) => {
                const leftKey = String(left?.id || left?.name || left?.title || left?.question || '');
                const rightKey = String(right?.id || right?.name || right?.title || right?.question || '');
                return leftKey.localeCompare(rightKey, 'he');
            });
        }
        return normalized;
    }
    if (!isObject(value)) {
        if (options.normalizeWhitespace && typeof value === 'string') {
            return value.trim().replace(/\s+/g, ' ');
        }
        return value;
    }
    return Object.keys(value)
        .sort()
        .reduce((result, key) => {
            if (options.omitPollMetadata && ['votes', 'voters'].includes(key)) return result;
            result[key] = canonicalize(value[key], options);
            return result;
        }, {});
}

function meaningfulSnapshot(surfaceKey, value) {
    if (surfaceKey === 'polls') {
        return canonicalize(value, { omitPollMetadata: true });
    }
    if (surfaceKey === 'info') {
        return canonicalize({
            hero: {
                siteName: value?.hero?.siteName || '',
                title: value?.hero?.title || '',
                subtitle: value?.hero?.subtitle || '',
                description: value?.hero?.description || '',
            },
            commander: {
                sectionTitle: value?.commander?.sectionTitle || '',
                roleLabel: value?.commander?.roleLabel || '',
                messages: (value?.commander?.messages || []).map((message) => ({
                    id: message?.id || '',
                    text: message?.text || '',
                    signature: message?.signature || '',
                })),
            },
        }, { normalizeWhitespace: true });
    }
    if (surfaceKey === 'boom' || surfaceKey === 'gantt') {
        const snapshot = clone(value) || {};
        if (Array.isArray(snapshot.items)) {
            snapshot.items = canonicalize(snapshot.items, { sortCollections: true });
        }
        if (Array.isArray(snapshot.categories)) {
            snapshot.categories = canonicalize(snapshot.categories, { sortCollections: true });
        }
        return canonicalize(snapshot);
    }
    return canonicalize(value);
}

export function didAdminAiApplyChange(before, after, surfaceKey = '') {
    return JSON.stringify(meaningfulSnapshot(surfaceKey, before))
        !== JSON.stringify(meaningfulSnapshot(surfaceKey, after));
}

function collectionForSurface(surfaceKey, value) {
    if (surfaceKey === 'events') return value?.events || [];
    if (surfaceKey === 'countdown') return value?.items || [];
    if (LIST_SURFACES.has(surfaceKey)) return Array.isArray(value) ? value : [];
    return [];
}

function itemKey(item, index) {
    return String(
        item?.id
        || item?.title
        || item?.name
        || item?.question
        || item?.destination
        || item?.number
        || index
    );
}

function diffCollection(beforeItems, afterItems, surfaceKey = '') {
    const before = Array.isArray(beforeItems) ? beforeItems : [];
    const after = Array.isArray(afterItems) ? afterItems : [];
    const beforeByKey = new Map(before.map((item, index) => [itemKey(item, index), item]));
    const afterByKey = new Map(after.map((item, index) => [itemKey(item, index), item]));
    let added = 0;
    let removed = 0;
    let updated = 0;

    afterByKey.forEach((item, key) => {
        if (!beforeByKey.has(key)) {
            added += 1;
        } else if (didAdminAiApplyChange(beforeByKey.get(key), item, surfaceKey)) {
            updated += 1;
        }
    });
    beforeByKey.forEach((_item, key) => {
        if (!afterByKey.has(key)) removed += 1;
    });
    return { added, removed, updated };
}

function pushCollectionSummary(summary, diff, label) {
    if (diff.added) summary.push(`נוספו ${diff.added} ${label}`);
    if (diff.updated) summary.push(`עודכנו ${diff.updated} ${label}`);
    if (diff.removed) summary.push(`הוסרו ${diff.removed} ${label}`);
}

function flattenNavigation(items) {
    return (Array.isArray(items) ? items : []).flatMap((category) => [
        category,
        ...(Array.isArray(category?.children) ? category.children.flatMap((child) => [
            child,
            ...(Array.isArray(child?.subLinks) ? child.subLinks : []),
        ]) : []),
    ]);
}

function flattenOrgChart(nodes) {
    return (Array.isArray(nodes) ? nodes : []).flatMap((node) => [
        node,
        ...flattenOrgChart(node?.children),
    ]);
}

function changedObjectFieldCount(before, after) {
    const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
    return [...keys].filter((key) => didAdminAiApplyChange(before?.[key], after?.[key])).length;
}

export function buildAdminAiChangeSummary(before, after, surfaceKey, actionId = '') {
    if (!didAdminAiApplyChange(before, after, surfaceKey)) return [];
    const summary = [];

    if (surfaceKey === 'info') {
        const heroFields = changedObjectFieldCount(before?.hero, after?.hero);
        const commanderFields = changedObjectFieldCount(
            { ...before?.commander, messages: undefined },
            { ...after?.commander, messages: undefined }
        );
        const messages = diffCollection(before?.commander?.messages, after?.commander?.messages);
        if (heroFields) summary.push(`עודכנו ${heroFields} שדות באזור הפתיחה`);
        if (commanderFields) summary.push(`עודכנו ${commanderFields} שדות בדבר המפקד`);
        pushCollectionSummary(summary, messages, 'הודעות מפקד');
    } else if (surfaceKey === 'links') {
        pushCollectionSummary(summary, diffCollection(before, after), 'קטגוריות ניווט');
        const links = diffCollection(flattenNavigation(before), flattenNavigation(after));
        if (links.updated) summary.push(`עודכנו ${links.updated} פריטי ניווט`);
    } else if (surfaceKey === 'widgets') {
        const beforeActive = new Set(before?.activeWidgets || []);
        const afterActive = new Set(after?.activeWidgets || []);
        const activated = [...afterActive].filter((item) => !beforeActive.has(item)).length;
        const deactivated = [...beforeActive].filter((item) => !afterActive.has(item)).length;
        if (activated) summary.push(`הופעלו ${activated} ווידג׳טים`);
        if (deactivated) summary.push(`הוסרו ${deactivated} ווידג׳טים פעילים`);
    } else if (surfaceKey === 'current-widgets') {
        const changedWidgets = Object.keys(after || {}).filter((key) => (
            key !== 'activeWidgets' && didAdminAiApplyChange(before?.[key], after?.[key], key)
        ));
        if (changedWidgets.length) summary.push(`עודכן תוכן ב-${changedWidgets.length} ווידג׳טים`);
    } else if (surfaceKey === 'theme') {
        const changedFields = changedObjectFieldCount(before, after);
        if (changedFields) summary.push(`עודכנו ${changedFields} הגדרות עיצוב`);
    } else if (surfaceKey === 'gantt' || surfaceKey === 'boom') {
        const taskLabel = surfaceKey === 'boom' ? 'משימות BOOM' : 'משימות Gantt';
        const taskDiff = diffCollection(before?.items, after?.items, surfaceKey);
        const categoryDiff = diffCollection(before?.categories, after?.categories);
        pushCollectionSummary(summary, taskDiff, taskLabel);
        pushCollectionSummary(summary, categoryDiff, 'קטגוריות');
        const beforeItems = new Map((before?.items || []).map((item, index) => [itemKey(item, index), item]));
        const statusChanges = (after?.items || []).filter((item, index) => {
            const previous = beforeItems.get(itemKey(item, index));
            return previous && previous.status !== item.status;
        }).length;
        const dateChanges = (after?.items || []).filter((item, index) => {
            const previous = beforeItems.get(itemKey(item, index));
            return previous && (previous.startDate !== item.startDate || previous.endDate !== item.endDate);
        }).length;
        if (statusChanges) summary.push(`שונו סטטוסים ב-${statusChanges} משימות`);
        if (dateChanges) summary.push(`שונו תאריכים ב-${dateChanges} משימות`);
    } else if (surfaceKey === 'org-chart') {
        pushCollectionSummary(
            summary,
            diffCollection(flattenOrgChart(before?.nodes), flattenOrgChart(after?.nodes)),
            'צמתים בעץ המבנה'
        );
    } else if (surfaceKey === 'galleries') {
        pushCollectionSummary(summary, diffCollection(before, after), 'גלריות');
        const beforeImages = (before || []).flatMap((gallery) => gallery?.images || []);
        const afterImages = (after || []).flatMap((gallery) => gallery?.images || []);
        const imageDiff = diffCollection(beforeImages, afterImages);
        if (imageDiff.updated) summary.push(`עודכנו ${imageDiff.updated} תיאורי תמונות`);
    } else if (surfaceKey === 'countdown' || LIST_SURFACES.has(surfaceKey)) {
        const label = surfaceKey === 'countdown' ? 'יעדי ספירה' : LIST_SURFACE_LABELS[surfaceKey];
        pushCollectionSummary(
            summary,
            diffCollection(
                collectionForSurface(surfaceKey, before),
                collectionForSurface(surfaceKey, after),
                surfaceKey
            ),
            label
        );
    }

    if (!summary.length) {
        summary.push(actionId ? `הוחל שינוי: ${actionId}` : 'התוכן עודכן בפועל');
    }
    return summary;
}

function hasKnownThemeField(payload) {
    const source = payload?.theme || payload?.themePatch || payload;
    const fields = [
        'primaryColor', 'displayMode', 'borderStyle', 'regularLinksLayout',
        'externalLinksLayout', 'widgetHeight', 'useTintedBackground',
        'tintedBackgroundStrength', 'heroGrayscale', 'heroGlassEffect',
        'heroGlassStrength', 'topNavGlassEffect', 'topNavGlassStrength',
        'showNavCategories', 'externalLinksFixed', 'externalLinksBordered',
        'externalLinksShowBackground',
    ];
    return isObject(source) && fields.some((field) => Object.prototype.hasOwnProperty.call(source, field));
}

export function validateAdminAiPayload(surfaceKey, payload, baseline) {
    if (!isObject(payload)) {
        return { valid: false, reason: 'הפלט אינו אובייקט JSON לפי סכימת המסך.' };
    }

    let valid = false;
    let collection = null;
    let baselineCollection = null;
    if (surfaceKey === 'info') {
        valid = isObject(payload.hero) || isObject(payload.commander) || isObject(payload.content);
    } else if (surfaceKey === 'links') {
        valid = Array.isArray(payload.navItems);
        collection = payload.navItems;
        baselineCollection = baseline;
    } else if (surfaceKey === 'events') {
        valid = Array.isArray(payload.events);
        collection = payload.events;
        baselineCollection = baseline?.events;
    } else if (surfaceKey === 'widgets') {
        valid = Array.isArray(payload.activeWidgets);
        collection = payload.activeWidgets;
        baselineCollection = baseline?.activeWidgets;
    } else if (surfaceKey === 'current-widgets') {
        valid = isObject(payload.updates);
    } else if (surfaceKey === 'theme') {
        valid = hasKnownThemeField(payload);
    } else if (surfaceKey === 'gantt' || surfaceKey === 'boom') {
        const source = payload[surfaceKey] || payload;
        valid = isObject(source) && [
            'items', 'categories', 'design', 'enabled', 'buttonLabel', 'pageTitle',
            'description', 'groupBy', 'defaultView', 'showLegend', 'showToday',
        ].some((field) => Object.prototype.hasOwnProperty.call(source, field));
        collection = Array.isArray(source.items) ? source.items : null;
        baselineCollection = baseline?.items;
    } else if (surfaceKey === 'org-chart') {
        const source = payload.orgChart || payload;
        valid = isObject(source) && Array.isArray(source.nodes);
        collection = source.nodes;
        baselineCollection = baseline?.nodes;
    } else if (surfaceKey === 'countdown') {
        const source = payload.countdown || payload;
        valid = isObject(source) && Array.isArray(source.items);
        collection = source.items;
        baselineCollection = baseline?.items;
    } else if (LIST_SURFACES.has(surfaceKey)) {
        valid = Array.isArray(payload.items);
        collection = payload.items;
        baselineCollection = baseline;
    }

    if (!valid) {
        return { valid: false, reason: 'חסרים שדות חובה או שמבנה ה-JSON אינו תואם לסכימת המסך.' };
    }
    if (Array.isArray(collection) && collection.length === 0 && Array.isArray(baselineCollection) && baselineCollection.length > 0) {
        return { valid: false, reason: 'הפלט החזיר רשימה ריקה שאינה שינוי תקף לפעולה שנבחרה.' };
    }
    return { valid: true, reason: '' };
}

function hasUsableNormalizedCandidate(surfaceKey, candidate) {
    if (surfaceKey === 'links' || surfaceKey === 'org-chart') {
        const items = surfaceKey === 'links' ? candidate : candidate?.nodes;
        return Array.isArray(items) && items.length > 0;
    }
    if (surfaceKey === 'events') {
        return Array.isArray(candidate?.events) && candidate.events.length > 0;
    }
    if (surfaceKey === 'countdown') {
        return Array.isArray(candidate?.items) && candidate.items.length > 0;
    }
    if (LIST_SURFACES.has(surfaceKey)) {
        return Array.isArray(candidate) && candidate.length > 0;
    }
    return true;
}

export function createAdminAiExecutionResult(overrides = {}) {
    return {
        mode: overrides.mode || ADMIN_AI_EXECUTION_MODES.MUTATING,
        outcome: overrides.outcome || ADMIN_AI_EXECUTION_OUTCOMES.ERROR,
        rawResponseText: String(overrides.rawResponseText || ''),
        parsedPayload: overrides.parsedPayload ?? null,
        normalizedCandidates: Array.isArray(overrides.normalizedCandidates)
            ? clone(overrides.normalizedCandidates)
            : [],
        appliedSnapshot: overrides.appliedSnapshot === undefined ? null : clone(overrides.appliedSnapshot),
        changed: overrides.changed === true,
        appliedChangeSummary: Array.isArray(overrides.appliedChangeSummary)
            ? [...overrides.appliedChangeSummary]
            : null,
        userMessage: overrides.userMessage || null,
        historyEntryCreated: overrides.historyEntryCreated === true,
        persistenceTriggered: overrides.persistenceTriggered === true,
        errorCode: overrides.errorCode || null,
    };
}

export function createAdminAiNoChangeResult({
    rawResponseText = '',
    parsedPayload = null,
    normalizedCandidates = [],
    errorCode = 'NO_CHANGE',
    reason = 'לא זוהה שינוי שניתן להחיל.',
} = {}) {
    return createAdminAiExecutionResult({
        mode: ADMIN_AI_EXECUTION_MODES.MUTATING,
        outcome: ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE,
        rawResponseText,
        parsedPayload,
        normalizedCandidates,
        userMessage: `לא הוחל שינוי בפועל. ${reason} תשובת ה-AI מוצגת למטה.`,
        errorCode,
    });
}

export function createAdminAiAppliedResult({
    rawResponseText = '',
    parsedPayload = null,
    normalizedCandidates = [],
    appliedSnapshot,
    appliedChangeSummary = [],
    historyEntryCreated = true,
    persistenceTriggered = true,
} = {}) {
    return createAdminAiExecutionResult({
        mode: ADMIN_AI_EXECUTION_MODES.MUTATING,
        outcome: ADMIN_AI_EXECUTION_OUTCOMES.APPLIED,
        rawResponseText,
        parsedPayload,
        normalizedCandidates,
        appliedSnapshot,
        changed: true,
        appliedChangeSummary,
        historyEntryCreated,
        persistenceTriggered,
    });
}

export function createAdminAiErrorResult(error, options = {}) {
    return createAdminAiExecutionResult({
        mode: options.mode,
        outcome: ADMIN_AI_EXECUTION_OUTCOMES.ERROR,
        rawResponseText: options.rawResponseText,
        userMessage: error?.message || 'פעולת AI נכשלה.',
        errorCode: error?.code || options.errorCode || 'AI_EXECUTION_FAILED',
    });
}

export function isAdminAiExecutionResult(value) {
    return isObject(value)
        && Object.values(ADMIN_AI_EXECUTION_MODES).includes(value.mode)
        && Object.values(ADMIN_AI_EXECUTION_OUTCOMES).includes(value.outcome);
}

export function normalizeAdminAiApplyResult(result, options = {}) {
    if (isAdminAiExecutionResult(result)) return result;
    return createAdminAiNoChangeResult({
        rawResponseText: options.rawResponseText,
        parsedPayload: options.parsedPayload,
        errorCode: 'APPLY_NOT_VERIFIED',
        reason: 'מסלול ההחלה לא אישר שינוי ושמירה בפועל.',
    });
}

export async function executeAdminAiResponse({
    mode,
    rawResponseText,
    surfaceKey,
    actionId,
    instruction = '',
    baseline,
    applyCandidates,
}) {
    const rawText = String(rawResponseText || '').trim();
    if (mode === ADMIN_AI_EXECUTION_MODES.ANALYSIS) {
        return createAdminAiExecutionResult({
            mode,
            outcome: ADMIN_AI_EXECUTION_OUTCOMES.ANALYSIS,
            rawResponseText: rawText,
            userMessage: 'תוצאה: נותח בלבד',
        });
    }
    if (!rawText) {
        return createAdminAiNoChangeResult({
            errorCode: 'EMPTY_RESPONSE',
            reason: 'המודל לא החזיר תוכן.',
        });
    }

    let parsedPayload;
    try {
        parsedPayload = parseJsonFromModel(rawText);
    } catch {
        return createAdminAiNoChangeResult({
            rawResponseText: rawText,
            errorCode: 'INVALID_JSON',
            reason: 'תשובת המודל אינה JSON תקין.',
        });
    }

    const normalizedCandidates = [];
    let invalidReason = '';
    let hadValidPayload = false;
    for (const payload of extractAdminAiCandidates(parsedPayload)) {
        const validation = validateAdminAiPayload(surfaceKey, payload, baseline);
        if (!validation.valid) {
            invalidReason ||= validation.reason;
            continue;
        }
        hadValidPayload = true;
        try {
            const normalized = normalizeAdminAiCandidate(surfaceKey, payload, baseline, {
                instruction,
                actionId,
            });
            const candidate = applyAdminAiActionSemantics(
                surfaceKey,
                actionId,
                baseline,
                normalized
            );
            if (
                candidate !== undefined
                && candidate !== null
                && hasUsableNormalizedCandidate(surfaceKey, candidate)
                && didAdminAiApplyChange(baseline, candidate, surfaceKey)
                && !normalizedCandidates.some((entry) => !didAdminAiApplyChange(entry, candidate, surfaceKey))
            ) {
                normalizedCandidates.push(candidate);
            }
        } catch (error) {
            invalidReason ||= error?.message || 'נרמול התוצאה נכשל.';
        }
    }

    if (!normalizedCandidates.length) {
        return createAdminAiNoChangeResult({
            rawResponseText: rawText,
            parsedPayload,
            errorCode: hadValidPayload ? 'NO_MEANINGFUL_DIFF' : 'INVALID_PAYLOAD',
            reason: hadValidPayload
                ? 'התוצאה המנורמלת זהה לנתונים הקיימים.'
                : invalidReason || 'לא התקבל מבנה נתונים שניתן להחיל.',
        });
    }

    const summaries = normalizedCandidates.map((candidate) => (
        buildAdminAiChangeSummary(baseline, candidate, surfaceKey, actionId)
    ));
    if (typeof applyCandidates !== 'function') {
        return createAdminAiNoChangeResult({
            rawResponseText: rawText,
            parsedPayload,
            normalizedCandidates,
            errorCode: 'APPLY_HANDLER_MISSING',
            reason: 'לא הוגדר מסלול החלה מאומת למסך.',
        });
    }

    let applyResult;
    try {
        applyResult = await applyCandidates({
            baseline: clone(baseline),
            candidates: clone(normalizedCandidates),
            summaries: clone(summaries),
        });
    } catch (error) {
        return createAdminAiErrorResult(error, {
            mode,
            rawResponseText: rawText,
            errorCode: 'APPLY_FAILED',
        });
    }

    if (
        applyResult?.changed !== true
        || applyResult?.persistenceTriggered !== true
        || applyResult?.historyEntryCreated !== true
    ) {
        return createAdminAiNoChangeResult({
            rawResponseText: rawText,
            parsedPayload,
            normalizedCandidates,
            errorCode: 'APPLY_NOT_VERIFIED',
            reason: 'מסלול ההחלה לא אישר שינוי, שמירה והיסטוריה בפועל.',
        });
    }

    return createAdminAiAppliedResult({
        rawResponseText: rawText,
        parsedPayload,
        normalizedCandidates,
        appliedSnapshot: applyResult.appliedSnapshot ?? normalizedCandidates[0],
        appliedChangeSummary: applyResult.appliedChangeSummary || summaries[0],
        historyEntryCreated: true,
        persistenceTriggered: true,
    });
}
