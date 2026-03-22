import React, { createContext, useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useConfig } from './ConfigProvider';

export const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

const USER_MODE_KEY = 'bihs_user_display_mode';
const ADMIN_MODE_KEY = 'bihs_admin_display_mode';

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
            default: break;
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

function normalizeTintStrength(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 72;
    return Math.min(100, Math.max(0, Math.round(parsed)));
}

function toCssTintStrength(value) {
    const normalized = normalizeTintStrength(value);
    return Math.round(normalized * 1.8);
}

function applyDisplayMode(effectiveMode) {
    const root = document.documentElement;
    if (effectiveMode === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
}

function toLegacyTheme(config) {
    const theme = config?.theme || {};
    const layout = config?.layout || {};

    return {
        primaryColor: theme.primaryColor || '#0891b2',
        displayMode: theme.displayMode || 'dark',
        borderStyle: theme.borderStyle || 'cyber',
        useTintedBackground: theme.backgrounds?.tinted?.enabled ?? true,
        tintedBackgroundStrength: theme.backgrounds?.tinted?.strength ?? 72,
        borderTargets: theme.borderTargets || {},
        heroGrayscale: theme.backgrounds?.hero?.grayscale ?? false,
        heroPanelsBordered: layout.hero?.panelsBordered ?? true,
        commanderPanelBordered: layout.hero?.commanderPanelBordered ?? false,
        widgetPanelBordered: layout.hero?.widgetPanelBordered ?? layout.hero?.panelsBordered ?? true,
        showNavCategories: layout.navigation?.showCategories ?? false,
        regularLinksLayout: layout.navigation?.mode || 'sidebar-right',
        externalLinksLayout: layout.externalLinks?.mode || 'cards',
        externalLinksFixed: layout.externalLinks?.fixed ?? false,
        externalLinksBordered: layout.externalLinks?.bordered ?? true,
        externalLinksShowBackground: layout.externalLinks?.showBackground ?? true,
        widgetHeight: layout.hero?.widgetHeight || 'full',
        linksLayout: 'cards',
    };
}

function patchConfigFromLegacyTheme(prev, newTheme) {
    return {
        ...prev,
        theme: {
            ...prev.theme,
            primaryColor: newTheme?.primaryColor ?? prev.theme.primaryColor,
            displayMode: newTheme?.displayMode ?? prev.theme.displayMode,
            borderStyle: newTheme?.borderStyle ?? prev.theme.borderStyle,
            borderTargets: newTheme?.borderTargets ?? prev.theme.borderTargets,
            backgrounds: {
                ...prev.theme.backgrounds,
                tinted: {
                    ...prev.theme.backgrounds.tinted,
                    enabled: newTheme?.useTintedBackground ?? prev.theme.backgrounds.tinted.enabled,
                    strength: Number.isFinite(Number(newTheme?.tintedBackgroundStrength))
                        ? Number(newTheme.tintedBackgroundStrength)
                        : prev.theme.backgrounds.tinted.strength,
                },
                hero: {
                    ...prev.theme.backgrounds.hero,
                    grayscale: newTheme?.heroGrayscale ?? prev.theme.backgrounds.hero.grayscale,
                },
            },
        },
        layout: {
            ...prev.layout,
            navigation: {
                ...prev.layout.navigation,
                showCategories: newTheme?.showNavCategories ?? prev.layout.navigation.showCategories,
                mode: newTheme?.regularLinksLayout ?? prev.layout.navigation.mode,
            },
            hero: {
                ...prev.layout.hero,
                widgetHeight: newTheme?.widgetHeight ?? prev.layout.hero.widgetHeight,
                panelsBordered: newTheme?.heroPanelsBordered ?? prev.layout.hero.panelsBordered,
                commanderPanelBordered: newTheme?.commanderPanelBordered ?? prev.layout.hero.commanderPanelBordered,
                widgetPanelBordered: newTheme?.widgetPanelBordered ?? prev.layout.hero.widgetPanelBordered,
            },
            externalLinks: {
                ...prev.layout.externalLinks,
                mode: newTheme?.externalLinksLayout ?? prev.layout.externalLinks.mode,
                fixed: newTheme?.externalLinksFixed ?? prev.layout.externalLinks.fixed,
                bordered: newTheme?.externalLinksBordered ?? prev.layout.externalLinks.bordered,
                showBackground: newTheme?.externalLinksShowBackground ?? prev.layout.externalLinks.showBackground,
            },
        },
    };
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
    el.style.setProperty('--color-bg-tint-strength', String(toCssTintStrength(themeData.tintedBackgroundStrength)));
    const mode = themeData.displayMode === 'user-toggle' ? 'dark' : (themeData.displayMode || 'dark');
    if (mode === 'dark') {
        el.classList.add('dark');
    } else {
        el.classList.remove('dark');
    }
    el.dataset.tintedBg = themeData.useTintedBackground !== false ? 'true' : 'false';
}

export const ThemeProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();
    const [siteMode, setSiteMode] = useState('dark');
    const [adminMode, setAdminMode] = useState(() => resolveAdminMode());

    const location = useLocation();
    const isAdminRoute = useMemo(() => {
        const path = (location.pathname || '').toLowerCase();
        const hash = (location.hash || '').toLowerCase();
        const adminSegmentRegex = /(?:^|\/)admin(?:\/|$)/;
        return adminSegmentRegex.test(path) || adminSegmentRegex.test(hash.replace(/^#/, ''));
    }, [location.pathname, location.hash]);

    const mappedTheme = useMemo(() => toLegacyTheme(config), [config]);
    const borderTargets = config?.theme?.borderTargets || {};
    const effectiveMode = isAdminRoute ? adminMode : siteMode;
    const loading = status === 'loading' || status === 'saving';

    const applyThemeToDom = useCallback((mappedTheme) => {
        if (!mappedTheme) return;
        applyPrimaryColorVars(mappedTheme.primaryColor || '#dc2626');
        document.documentElement.style.setProperty('--color-bg-tint-strength', String(toCssTintStrength(mappedTheme.tintedBackgroundStrength)));
        document.documentElement.dataset.tintedBg = mappedTheme.useTintedBackground ? 'true' : 'false';
        const mode = resolveDisplayMode(mappedTheme.displayMode || 'dark');
        setSiteMode(mode);
    }, []);

    useEffect(() => {
        applyThemeToDom(mappedTheme);
    }, [mappedTheme, applyThemeToDom]);

    useEffect(() => {
        applyDisplayMode(effectiveMode);
    }, [effectiveMode]);

    const fetchTheme = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }, [reload]);

    const saveTheme = useCallback(async (newTheme) => {
        try {
            updateConfig((prev) => patchConfigFromLegacyTheme(prev, newTheme));
            await saveNow();
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }, [saveNow, updateConfig]);

    const setBorderTargets = useCallback((nextTargets) => {
        updateConfig((prev) => {
            const resolvedTargets = typeof nextTargets === 'function'
                ? nextTargets(prev.theme.borderTargets)
                : nextTargets;

            return {
                ...prev,
                theme: {
                    ...prev.theme,
                    borderTargets: {
                        ...prev.theme.borderTargets,
                        ...(resolvedTargets || {}),
                    },
                },
            };
        });
        saveNow().catch((err) => {
            console.error('ThemeContext: failed to persist borderTargets', err);
        });
    }, [saveNow, updateConfig]);

    const toggleUserMode = useCallback(() => {
        if (!mappedTheme || mappedTheme.displayMode !== 'user-toggle') return;
        const next = siteMode === 'dark' ? 'light' : 'dark';
        localStorage.setItem(USER_MODE_KEY, next);
        setSiteMode(next);
    }, [mappedTheme, siteMode]);

    const toggleAdminMode = useCallback(() => {
        setAdminMode((prevMode) => {
            const next = prevMode === 'dark' ? 'light' : 'dark';
            localStorage.setItem(ADMIN_MODE_KEY, next);
            return next;
        });
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                theme: mappedTheme,
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
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
};
