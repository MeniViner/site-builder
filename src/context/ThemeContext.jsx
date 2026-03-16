import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import ThemeService from '../services/ThemeService';
import { DEFAULT_BORDER_TARGETS, normalizeBorderTargets } from '../utils/borderStyles';

export const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const USER_MODE_KEY = 'bihs_user_display_mode';
const ADMIN_MODE_KEY = 'bihs_admin_display_mode';
const BORDER_TARGETS_KEY = 'bihs_border_targets';

function resolveBorderTargets() {
    try {
        const saved = localStorage.getItem(BORDER_TARGETS_KEY);
        return saved ? normalizeBorderTargets(JSON.parse(saved)) : { ...DEFAULT_BORDER_TARGETS };
    } catch (error) {
        console.error('Failed to read border targets from localStorage:', error);
        return { ...DEFAULT_BORDER_TARGETS };
    }
}

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

    root.style.setProperty('--color-primary-50', `hsl(${h}, ${s}%, 95%)`);
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

function resolveAdminMode() {
    const stored = localStorage.getItem(ADMIN_MODE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return 'dark';
}

function applyDisplayMode(effectiveMode) {
    const root = document.documentElement;
    if (effectiveMode === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    // Surface tokens are handled by CSS cascade via data-tinted-bg + .dark selectors
}

/** Apply theme (primary color + display mode + tinted background mode) to a container element for scoped preview. */
export function applyThemeToElement(el, themeData) {
    if (!el || !themeData) return;
    const hex = themeData.primaryColor || '#dc2626';
    const [h, s, l] = hexToHsl(hex);
    el.style.setProperty('--color-primary-h', String(h));
    el.style.setProperty('--color-primary-s', `${s}%`);
    el.style.setProperty('--color-primary-l', `${l}%`);
    el.style.setProperty('--color-primary', `${h} ${s}% ${l}%`);
    el.style.setProperty('--color-primary-hex', hex);
    el.style.setProperty('--color-primary-50', `hsl(${h}, ${s}%, 95%)`);
    el.style.setProperty('--color-primary-100', `hsl(${h}, ${s}%, 90%)`);
    el.style.setProperty('--color-primary-200', `hsl(${h}, ${s}%, 80%)`);
    el.style.setProperty('--color-primary-300', `hsl(${h}, ${s}%, 65%)`);
    el.style.setProperty('--color-primary-400', `hsl(${h}, ${s}%, 55%)`);
    el.style.setProperty('--color-primary-500', `hsl(${h}, ${s}%, ${l}%)`);
    el.style.setProperty('--color-primary-600', `hsl(${h}, ${s}%, ${Math.max(l - 10, 10)}%)`);
    el.style.setProperty('--color-primary-700', `hsl(${h}, ${s}%, ${Math.max(l - 18, 8)}%)`);
    el.style.setProperty('--color-primary-800', `hsl(${h}, ${s}%, ${Math.max(l - 27, 6)}%)`);
    el.style.setProperty('--color-primary-900', `hsl(${h}, ${s}%, ${Math.max(l - 36, 4)}%)`);
    el.style.setProperty('--color-primary-950', `hsl(${h}, ${s}%, ${Math.max(l - 41, 3)}%)`);
    const mode = themeData.displayMode === 'user-toggle' ? 'dark' : (themeData.displayMode || 'dark');
    if (mode === 'dark') {
        el.classList.add('dark');
    } else {
        el.classList.remove('dark');
    }
    el.dataset.tintedBg = themeData.useTintedBackground !== false ? 'true' : 'false';
}

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [siteMode, setSiteMode] = useState('dark');
    const [adminMode, setAdminMode] = useState(() => resolveAdminMode());
    const [borderTargets, setBorderTargets] = useState(() => resolveBorderTargets());
    const location = useLocation();
    const isAdminRoute = useMemo(() => {
        const path = (location.pathname || '').toLowerCase();
        const hash = (location.hash || '').toLowerCase();
        const adminSegmentRegex = /(?:^|\/)admin(?:\/|$)/;
        return adminSegmentRegex.test(path) || adminSegmentRegex.test(hash.replace(/^#/, ''));
    }, [location.pathname, location.hash]);
    const effectiveMode = isAdminRoute ? adminMode : siteMode;

    const applyThemeToDom = useCallback((themeData) => {
        if (!themeData) return;
        applyPrimaryColorVars(themeData.primaryColor || '#dc2626');
        document.documentElement.dataset.tintedBg = themeData.useTintedBackground !== false ? 'true' : 'false';
        const mode = resolveDisplayMode(themeData.displayMode || 'dark');
        setSiteMode(mode);
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
        const next = siteMode === 'dark' ? 'light' : 'dark';
        localStorage.setItem(USER_MODE_KEY, next);
        setSiteMode(next);
    }, [theme, siteMode]);

    const toggleAdminMode = useCallback(() => {
        setAdminMode(prevMode => {
            const next = prevMode === 'dark' ? 'light' : 'dark';
            localStorage.setItem(ADMIN_MODE_KEY, next);
            return next;
        });
    }, []);

    useEffect(() => {
        fetchTheme();
    }, []);

    useEffect(() => {
        if (theme) {
            applyThemeToDom(theme);
        }
    }, [theme, applyThemeToDom]);

    useEffect(() => {
        applyDisplayMode(effectiveMode);
    }, [effectiveMode]);

    useEffect(() => {
        try {
            localStorage.setItem(BORDER_TARGETS_KEY, JSON.stringify(borderTargets));
        } catch (error) {
            console.error('Failed to save border targets to localStorage:', error);
        }
    }, [borderTargets]);

    return (
        <ThemeContext.Provider value={{
            theme,
            loading,
            error,
            siteMode,
            adminMode,
            isAdminRoute,
            effectiveMode,
            saveTheme,
            fetchTheme,
            toggleUserMode,
            toggleAdminMode,
            borderTargets,
            setBorderTargets,
        }}>
            {children}
        </ThemeContext.Provider>
    );
};
