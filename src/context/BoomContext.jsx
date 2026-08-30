/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import BoomService from '../services/BoomService';
import { DEFAULT_BOOM_DATA, normalizeBoomData } from '../utils/boomData';

const BoomContext = createContext(null);

export const BoomProvider = ({ children }) => {
    const [boom, setBoom] = useState(() => normalizeBoomData(DEFAULT_BOOM_DATA));
    const [loading, setLoading] = useState(true);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const saveChainRef = useRef(Promise.resolve());
    const pendingSaveCountRef = useRef(0);

    const reloadBoom = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const loaded = await BoomService.getBoom();
            setBoom(normalizeBoomData(loaded));
            setLoaded(true);
            return loaded;
        } catch (loadError) {
            setError(loadError?.message || 'Failed to load BOOM');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reloadBoom();
    }, [reloadBoom]);

    const updateBoom = useCallback((updater) => {
        setBoom((previous) => {
            const current = normalizeBoomData(previous);
            const next = typeof updater === 'function'
                ? updater(current)
                : { ...current, ...(updater || {}) };
            return normalizeBoomData(next);
        });
    }, []);

    const saveBoom = useCallback((payload = undefined) => {
        if (!loaded) {
            return Promise.reject(new Error('לא ניתן לשמור נתוני BOOM לפני שהטעינה הראשונית הושלמה בהצלחה.'));
        }
        const next = normalizeBoomData(payload === undefined ? boom : payload);
        pendingSaveCountRef.current += 1;
        setSaving(true);
        const operation = saveChainRef.current.then(async () => {
            setError(null);
            try {
                const saved = await BoomService.saveBoom(next);
                const normalized = normalizeBoomData(saved);
                setBoom(normalized);
                return normalized;
            } catch (saveError) {
                setError(saveError?.message || 'Failed to save BOOM');
                throw saveError;
            } finally {
                pendingSaveCountRef.current -= 1;
                if (pendingSaveCountRef.current === 0) setSaving(false);
            }
        });
        saveChainRef.current = operation.catch(() => undefined);
        return operation;
    }, [boom, loaded]);

    const value = useMemo(() => ({
        boom,
        loading,
        loaded,
        saving,
        error,
        updateBoom,
        saveBoom,
        reloadBoom,
    }), [boom, error, loaded, loading, reloadBoom, saveBoom, saving, updateBoom]);

    return <BoomContext.Provider value={value}>{children}</BoomContext.Provider>;
};

export const useBoom = () => {
    const context = useContext(BoomContext);
    if (!context) throw new Error('useBoom must be used within BoomProvider');
    return context;
};

export { BoomContext };
