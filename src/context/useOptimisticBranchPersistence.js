import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_SAVE_DELAY_MS = 300;

export function useOptimisticBranchPersistence({
    sourceValue,
    normalizeValue,
    patchConfig,
    updateConfig,
    saveNow,
    saveDelayMs = DEFAULT_SAVE_DELAY_MS,
}) {
    const initialValue = normalizeValue(sourceValue);
    const [optimisticValue, setOptimisticValue] = useState(initialValue);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [saveError, setSaveError] = useState(null);

    const mountedRef = useRef(true);
    const latestValueRef = useRef(initialValue);
    const latestRevisionRef = useRef(0);
    const persistedRevisionRef = useRef(0);
    const scheduledRevisionRef = useRef(0);
    const timerRef = useRef(null);
    const saveChainRef = useRef(Promise.resolve());
    const waitersRef = useRef([]);
    const dirtyRef = useRef(false);
    const enqueueCurrentSaveRef = useRef(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
            waitersRef.current.splice(0).forEach(({ resolve }) => resolve(false));
        };
    }, []);

    useEffect(() => {
        if (dirtyRef.current) return;
        const normalized = normalizeValue(sourceValue);
        latestValueRef.current = normalized;
        setOptimisticValue(normalized);
    }, [normalizeValue, sourceValue]);

    const resolveWaitersThrough = useCallback((revision, ok) => {
        const pending = [];
        waitersRef.current.forEach((waiter) => {
            if (waiter.revision <= revision) waiter.resolve(ok);
            else pending.push(waiter);
        });
        waitersRef.current = pending;
    }, []);

    const createWaiter = useCallback((revision) => new Promise((resolve) => {
        if (revision <= persistedRevisionRef.current) {
            resolve(true);
            return;
        }
        waitersRef.current.push({ revision, resolve });
    }), []);

    const scheduleSave = useCallback((delay = saveDelayMs) => {
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            enqueueCurrentSaveRef.current?.();
        }, Math.max(0, delay));
    }, [saveDelayMs]);

    const enqueueCurrentSave = useCallback(() => {
        const revision = latestRevisionRef.current;
        if (!dirtyRef.current || revision <= scheduledRevisionRef.current) return;

        scheduledRevisionRef.current = revision;

        const task = saveChainRef.current
            .catch(() => undefined)
            .then(async () => {
                if (mountedRef.current) setSaving(true);

                try {
                    await saveNow();
                    persistedRevisionRef.current = Math.max(persistedRevisionRef.current, revision);
                    resolveWaitersThrough(revision, true);

                    const hasNewerMutation = latestRevisionRef.current > revision;

                    if (hasNewerMutation) {
                        if (scheduledRevisionRef.current < latestRevisionRef.current) scheduleSave(0);
                    } else {
                        dirtyRef.current = false;
                        if (mountedRef.current) {
                            setDirty(false);
                            setSaveError(null);
                        }
                    }
                } catch (error) {
                    resolveWaitersThrough(revision, false);
                    dirtyRef.current = true;
                    if (mountedRef.current) {
                        setDirty(true);
                        setSaveError(error instanceof Error ? error : new Error(String(error)));
                    }

                    if (latestRevisionRef.current > revision && scheduledRevisionRef.current < latestRevisionRef.current) {
                        scheduleSave(0);
                    }
                } finally {
                    if (mountedRef.current) setSaving(false);
                }
            });

        saveChainRef.current = task;
    }, [resolveWaitersThrough, saveNow, scheduleSave]);

    enqueueCurrentSaveRef.current = enqueueCurrentSave;

    const commit = useCallback((nextValueOrUpdater) => {
        const current = latestValueRef.current;
        const candidate = typeof nextValueOrUpdater === 'function'
            ? nextValueOrUpdater(current)
            : nextValueOrUpdater;
        const normalized = normalizeValue(candidate);
        const revision = latestRevisionRef.current + 1;

        latestRevisionRef.current = revision;
        latestValueRef.current = normalized;
        dirtyRef.current = true;
        setOptimisticValue(normalized);
        setDirty(true);
        setSaveError(null);
        updateConfig((prev) => patchConfig(prev, normalized));
        scheduleSave();

        return createWaiter(revision);
    }, [createWaiter, normalizeValue, patchConfig, scheduleSave, updateConfig]);

    const flush = useCallback(() => {
        if (!dirtyRef.current) return Promise.resolve(true);
        const revision = latestRevisionRef.current;
        const waiter = createWaiter(revision);
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        enqueueCurrentSave();
        return waiter;
    }, [createWaiter, enqueueCurrentSave]);

    const retry = useCallback(() => {
        scheduledRevisionRef.current = Math.min(scheduledRevisionRef.current, latestRevisionRef.current - 1);
        setSaveError(null);
        return flush();
    }, [flush]);

    return {
        value: optimisticValue,
        commit,
        flush,
        retry,
        saving,
        dirty,
        saveError,
        saveStatus: saveError ? 'failed' : (saving ? 'saving' : (dirty ? 'pending' : 'saved')),
    };
}

export default useOptimisticBranchPersistence;
