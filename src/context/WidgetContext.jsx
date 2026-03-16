import React, { createContext, useState, useEffect, useContext } from 'react';
import WidgetService, { createDefaultWidgetConfig } from '../services/WidgetService';

export const WidgetContext = createContext();

export const useWidget = () => useContext(WidgetContext);

export const WidgetProvider = ({ children }) => {
    const [widgetConfig, setWidgetConfig] = useState(() => createDefaultWidgetConfig());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchWidgetConfig = async () => {
        try {
            setLoading(true);
            const data = await WidgetService.getWidgetConfig();
            setWidgetConfig(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveWidgetConfig = async (newConfig) => {
        try {
            setLoading(true);
            await WidgetService.saveWidgetConfig(newConfig);
            setWidgetConfig(newConfig);
            setError(null);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWidgetConfig();
    }, []);

    return (
        <WidgetContext.Provider value={{ widgetConfig, loading, error, saveWidgetConfig, fetchWidgetConfig }}>
            {children}
        </WidgetContext.Provider>
    );
};
