import { useCallback, useSyncExternalStore } from 'react';

const historyBySurface = new Map();
const listenersBySurface = new Map();
let createdAtSequence = 0;

const EMPTY_HISTORY = Object.freeze({
    entries: Object.freeze([]),
    index: 0,
    visible: false,
});

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

function nextCreatedAt() {
    createdAtSequence += 1;
    return Date.now() + createdAtSequence;
}

function getHistory(surfaceKey) {
    return historyBySurface.get(surfaceKey) || EMPTY_HISTORY;
}

function notify(surfaceKey) {
    listenersBySurface.get(surfaceKey)?.forEach((listener) => listener());
}

function updateHistory(surfaceKey, updater) {
    const current = getHistory(surfaceKey);
    const next = updater(current);
    if (!next || next === current) return current;
    historyBySurface.set(surfaceKey, next);
    notify(surfaceKey);
    return next;
}

function subscribe(surfaceKey, listener) {
    const listeners = listenersBySurface.get(surfaceKey) || new Set();
    listeners.add(listener);
    listenersBySurface.set(surfaceKey, listeners);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) listenersBySurface.delete(surfaceKey);
    };
}

export function clearAdminAiHistoryStore() {
    const surfaceKeys = [...historyBySurface.keys()];
    historyBySurface.clear();
    surfaceKeys.forEach(notify);
}

export function useAdminAiHistory(surfaceKey, applySnapshot) {
    const subscribeToSurface = useCallback(
        (listener) => subscribe(surfaceKey, listener),
        [surfaceKey]
    );
    const getSurfaceHistory = useCallback(() => getHistory(surfaceKey), [surfaceKey]);
    const history = useSyncExternalStore(
        subscribeToSurface,
        getSurfaceHistory,
        getSurfaceHistory
    );

    const recordAndApply = useCallback(async (candidates, baseline, label = 'שינוי AI') => {
        const validCandidates = Array.isArray(candidates)
            ? candidates.filter((candidate) => candidate !== undefined && candidate !== null)
            : [];
        if (!validCandidates.length) return false;

        const result = applySnapshot?.(clone(validCandidates[0]));
        const resolved = result && typeof result.then === 'function' ? await result : result;
        if (resolved === false) throw new Error('שמירת שינוי ה-AI נכשלה');

        updateHistory(surfaceKey, (current) => {
            const currentEntry = current.entries[current.index];
            const continuesCurrentBranch = currentEntry
                && stableStringify(currentEntry.value) === stableStringify(baseline);
            const baseEntries = continuesCurrentBranch
                ? current.entries.slice(0, current.index + 1)
                : [{
                    value: clone(baseline),
                    label: 'לפני AI',
                    createdAt: nextCreatedAt(),
                }];
            const firstCandidateIndex = baseEntries.length;
            const entries = [
                ...baseEntries,
                ...validCandidates.map((candidate, index) => ({
                    value: clone(candidate),
                    label: validCandidates.length > 1 ? `חלופה ${index + 1}` : label,
                    createdAt: nextCreatedAt(),
                })),
            ];
            return { entries, index: firstCandidateIndex, visible: true };
        });
        return true;
    }, [applySnapshot, surfaceKey]);

    const applyIndex = useCallback(async (nextIndex) => {
        const current = getHistory(surfaceKey);
        if (!current.entries.length) return false;
        const safeIndex = Math.max(0, Math.min(Number(nextIndex) || 0, current.entries.length - 1));
        if (safeIndex === current.index) return true;

        const result = applySnapshot?.(clone(current.entries[safeIndex].value));
        const resolved = result && typeof result.then === 'function' ? await result : result;
        if (resolved === false) throw new Error('שמירת שינוי ה-AI נכשלה');

        updateHistory(surfaceKey, (latest) => ({
            ...latest,
            index: Math.max(0, Math.min(safeIndex, latest.entries.length - 1)),
        }));
        return true;
    }, [applySnapshot, surfaceKey]);

    const hide = useCallback(() => {
        updateHistory(surfaceKey, (current) => ({ ...current, visible: false }));
    }, [surfaceKey]);

    return {
        history,
        recordAndApply,
        applyIndex,
        hide,
    };
}
