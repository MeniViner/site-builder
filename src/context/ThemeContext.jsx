import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import ThemeService from '../services/ThemeService';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const USER_MODE_KEY = 'bihs_user_display_mode';

function hexToHsl(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return [0, 72, 51];

    let r = parseInt(result[1], 16) / 255;
    let g = parseInt(result[2], 16) / 255;
    let b = parseInt(result[3], 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function applyPrimaryColorVars(hex) {
    const root = document.documentElement;
    const [h, s, l] = hexToHsl(hex);

    root.style.setProperty('--color-primary-h', String(h));
    root.style.setProperty('--color-primary-s', `${s}%`);
    root.style.setProperty('--color-primary-l', `${l}%`);
    root.style.setProperty('--color-primary', `${h} ${s}% ${l}%`);
    root.style.setProperty('--color-primary-hex', hex);

    root.style.setProperty('--color-primary-50',  `hsl(${h}, ${s}%, 95%)`);
    root.style.setProperty('--color-primary-100', `hsl(${h}, ${s}%, 90%)`);
    root.style.setProperty('--color-primary-200', `hsl(${h}, ${s}%, 80%)`);
    root.style.setProperty('--color-primary-300', `hsl(${h}, ${s}%, 65%)`);
    root.style.setProperty('--color-primary-400', `hsl(${h}, ${s}%, 55%)`);
    root.style.setProperty('--color-primary-500', `hsl(${h}, ${s}%, ${l}%)`);
    root.style.setProperty('--color-primary-600', `hsl(${h}, ${s}%, ${Math.max(l - 10, 10)}%)`);
    root.style.setProperty('--color-primary-700', `hsl(${h}, ${s}%, ${Math.max(l - 18, 8)}%)`);
    root.style.setProperty('--color-primary-800', `hsl(${h}, ${s}%, ${Math.max(l - 27, 6)}%)`);
    root.style.setProperty('--color-primary-900', `hsl(${h}, ${s}%, ${Math.max(l - 36, 4)}%)`);
    root.style.setProperty('--color-primary-950', `hsl(${h}, ${s}%, ${Math.max(l - 41, 3)}%)`);
}

function resolveDisplayMode(displayMode) {
    if (displayMode === 'dark' || displayMode === 'light') return displayMode;
    const stored = localStorage.getItem(USER_MODE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyDisplayMode(effectiveMode) {
    const root = document.documentElement;
    if (effectiveMode === 'dark') {
        root.classList.add('dark');
        root.style.setProperty('--surface-bg', '#0c0d12');
        root.style.setProperty('--surface-card', '#1a1c23');
        root.style.setProperty('--surface-elevated', '#232733');
        root.style.setProperty('--surface-text', '#ffffff');
        root.style.setProperty('--surface-text-muted', '#9ca3af');
    } else {
        root.classList.remove('dark');
        root.style.setProperty('--surface-bg', '#f5f5f5');
        root.style.setProperty('--surface-card', '#ffffff');
        root.style.setProperty('--surface-elevated', '#f0f0f0');
        root.style.setProperty('--surface-text', '#111827');
        root.style.setProperty('--surface-text-muted', '#6b7280');
    }
}

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [effectiveMode, setEffectiveMode] = useState('dark');

    const applyThemeToDom = useCallback((themeData) => {
        if (!themeData) return;
        applyPrimaryColorVars(themeData.primaryColor || '#dc2626');
        const mode = resolveDisplayMode(themeData.displayMode || 'dark');
        setEffectiveMode(mode);
        applyDisplayMode(mode);
    }, []);

    const fetchTheme = async () => {
        try {
            setLoading(true);
            const data = await ThemeService.getTheme();
            setTheme(data);
            applyThemeToDom(data);
            setError(null);
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const saveTheme = async (newTheme) => {
        try {
            setLoading(true);
            await ThemeService.saveTheme(newTheme);
            setTheme(newTheme);
            applyThemeToDom(newTheme);
            setError(null);
            return true;
        } catch (err) {
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const toggleUserMode = useCallback(() => {
        if (!theme || theme.displayMode !== 'user-toggle') return;
        const next = effectiveMode === 'dark' ? 'light' : 'dark';
        localStorage.setItem(USER_MODE_KEY, next);
        setEffectiveMode(next);
        applyDisplayMode(next);
    }, [theme, effectiveMode]);

    useEffect(() => {
        fetchTheme();
    }, []);

    useEffect(() => {
        if (theme) {
            applyThemeToDom(theme);
        }
    }, [theme, applyThemeToDom]);

    return (
        <ThemeContext.Provider value={{
            theme,
            loading,
            error,
            effectiveMode,
            saveTheme,
            fetchTheme,
            toggleUserMode,
        }}>
            {children}
        </ThemeContext.Provider>
    );
};
