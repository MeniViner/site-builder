/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import GanttService from '../services/GanttService';
import { DEFAULT_GANTT_DATA, normalizeGanttData } from '../utils/ganttData';

const GanttContext = createContext(null);

export const GanttProvider = ({ children }) => {
    const [gantt, setGantt] = useState(() => normalizeGanttData(DEFAULT_GANTT_DATA));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const reloadGantt = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const loaded = await GanttService.getGantt();
            setGantt(normalizeGanttData(loaded));
            return loaded;
        } catch (loadError) {
            setError(loadError?.message || 'Failed to load gantt');
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        reloadGantt();
    }, [reloadGantt]);

    const updateGantt = useCallback((updater) => {
        setGantt((prev) => {
            const current = normalizeGanttData(prev);
            const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
            return normalizeGanttData(next);
        });
    }, []);

    const saveGantt = useCallback(async (payload = undefined) => {
        setSaving(true);
        setError(null);
        try {
            const next = normalizeGanttData(payload === undefined ? gantt : payload);
            const saved = await GanttService.saveGantt(next);
            setGantt(normalizeGanttData(saved));
            return normalizeGanttData(saved);
        } catch (saveError) {
            setError(saveError?.message || 'Failed to save gantt');
            throw saveError;
        } finally {
            setSaving(false);
        }
    }, [gantt]);

    const value = useMemo(() => ({
        gantt,
        loading,
        saving,
        error,
        updateGantt,
        saveGantt,
        reloadGantt,
    }), [error, gantt, loading, reloadGantt, saveGantt, saving, updateGantt]);

    return (
        <GanttContext.Provider value={value}>
            {children}
        </GanttContext.Provider>
    );
};

export const useGantt = () => {
    const context = useContext(GanttContext);
    if (!context) {
        throw new Error('useGantt must be used within GanttProvider');
    }
    return context;
};

export { GanttContext };
