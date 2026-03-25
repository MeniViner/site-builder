import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
} from 'react';
import ConfigService from '../services/ConfigService';
import { ensureSharePointBootstrapFiles } from '../services/SharePointBootstrapService';
import { DEFAULT_CONFIG_V1, validateAndNormalize } from '../config/AppSchema';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { confirmToast } from '../utils/confirmToast';

const STATUS = {
    LOADING: 'loading',
    IDLE: 'idle',
    SAVING: 'saving',
    ERROR: 'error',
};
const MASTER_CONFIG_MOCK_KEY = import.meta.env.VITE_SP_MASTER_CONFIG_MOCK_KEY || 'bihs_master_config_v1';

const ConfigContext = createContext(null);

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeConfigSafely(candidate) {
    try {
        return validateAndNormalize(isObject(candidate) ? candidate : DEFAULT_CONFIG_V1);
    } catch (error) {
        console.error('[ConfigProvider] Failed to normalize config candidate. Falling back to defaults.', error);
        return validateAndNormalize(DEFAULT_CONFIG_V1);
    }
}

function safeReadLocalStorageRaw(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        console.warn(`ConfigProvider: failed to read localStorage key "${key}"`, error);
        return null;
    }
}

function parseLegacyStorageValue(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw === null) {
            return { exists: false, value: null };
        }

        try {
            return { exists: true, value: JSON.parse(raw) };
        } catch (parseError) {
            console.warn(`[ConfigProvider] Legacy key "${storageKey}" contains invalid JSON. Using null for this key.`, parseError);
            return { exists: true, value: null };
        }
    } catch (error) {
        console.warn(`[ConfigProvider] Failed reading legacy key "${storageKey}". Using null for this key.`, error);
        return { exists: false, value: null };
    }
}

function extractLegacyLocalData() {
    const legacy = {};
    let hasAnyData = false;

    const mappings = [
        ['theme', 'bihs_theme_data'],
        ['widgets', 'bihs_widgets_data'],
        ['events', 'bihs_events_data'],
        ['content', 'bihs_site_content_data'],
        ['nav', 'bihs_nav_data'],
        ['externalLinks', 'bihs_external_links_data'],
        ['borderTargets', 'bihs_border_targets'],
    ];

    mappings.forEach(([targetKey, storageKey]) => {
        const { exists, value } = parseLegacyStorageValue(storageKey);
        if (!exists) return;
        hasAnyData = true;
        legacy[targetKey] = value;
    });

    return hasAnyData ? legacy : null;
}

export const ConfigProvider = ({ children }) => {
    const [config, setConfig] = useState(() => normalizeConfigSafely(DEFAULT_CONFIG_V1));
    const [status, setStatus] = useState(STATUS.LOADING);
    const [error, setError] = useState(null);

    const isMountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const configRef = useRef(normalizeConfigSafely(DEFAULT_CONFIG_V1));
    const bootstrapAttemptedRef = useRef(false);

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadConfig = useCallback(async () => {
        const requestId = ++requestIdRef.current;
        if (isMountedRef.current) {
            setStatus(STATUS.LOADING);
            setError(null);
        }

        let resolvedConfig = normalizeConfigSafely(DEFAULT_CONFIG_V1);

        try {
            console.log('[ConfigProvider] Init started...');

            if (!SHAREPOINT_CONFIG.useMock && !bootstrapAttemptedRef.current) {
                bootstrapAttemptedRef.current = true;
                try {
                    await ensureSharePointBootstrapFiles();
                } catch (bootstrapError) {
                    console.warn('[ConfigProvider] SharePoint bootstrap failed. Continuing init.', bootstrapError);
                }
            }

            const masterRawBeforeLoad = safeReadLocalStorageRaw(MASTER_CONFIG_MOCK_KEY);
            const masterWasEmpty = !masterRawBeforeLoad || !masterRawBeforeLoad.trim();

            resolvedConfig = normalizeConfigSafely(await ConfigService.loadConfig());
            console.log('[ConfigProvider] Loaded config from adapter...');
            const loadedLooksDefault = JSON.stringify(resolvedConfig) === JSON.stringify(normalizeConfigSafely(DEFAULT_CONFIG_V1));

            if (SHAREPOINT_CONFIG.useMock && (masterWasEmpty || loadedLooksDefault)) {
                const legacySplitData = extractLegacyLocalData();
                if (legacySplitData) {
                    console.log('[ConfigProvider] Executing legacy migration...');
                    const migratedConfig = await ConfigService.loadConfig(legacySplitData);
                    const savedMigrated = await ConfigService.saveConfig(migratedConfig);
                    resolvedConfig = normalizeConfigSafely(savedMigrated ?? migratedConfig);
                }
            }

            resolvedConfig = normalizeConfigSafely(resolvedConfig);

            if (!isMountedRef.current || requestId !== requestIdRef.current) {
                return resolvedConfig;
            }
            configRef.current = resolvedConfig;
            setConfig(resolvedConfig);
            setError(null);
            return resolvedConfig;
        } catch (err) {
            console.error('[ConfigProvider] Init failed. Falling back to defaults.', err);
            resolvedConfig = normalizeConfigSafely(DEFAULT_CONFIG_V1);
            if (isMountedRef.current && requestId === requestIdRef.current) {
                configRef.current = resolvedConfig;
                setConfig(resolvedConfig);
                setError(err?.message || 'Failed to load configuration');
            }
            return resolvedConfig;
        } finally {
            if (isMountedRef.current && requestId === requestIdRef.current) {
                setStatus(STATUS.IDLE);
                console.log('[ConfigProvider] Init complete.');
            }
        }
    }, []);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const updateConfig = useCallback((updater) => {
        if (typeof updater !== 'function') {
            console.error('ConfigProvider.updateConfig expected a function updater');
            return;
        }

        try {
            const prevConfig = configRef.current;
            const nextConfig = updater(prevConfig);
            const resolvedConfig = normalizeConfigSafely(nextConfig ?? prevConfig);
            configRef.current = resolvedConfig;
            setConfig(resolvedConfig);
        } catch (err) {
            console.error('ConfigProvider.updateConfig failed:', err);
            if (isMountedRef.current) {
                setStatus(STATUS.ERROR);
                setError(err?.message || 'Failed to update configuration');
            }
        }
    }, []);

    const saveNow = useCallback(async () => {
        if (isMountedRef.current) {
            setStatus(STATUS.SAVING);
            setError(null);
        }

        try {
            const saved = await ConfigService.saveConfig(configRef.current);
            const normalizedSaved = normalizeConfigSafely(saved);
            if (!isMountedRef.current) return normalizedSaved;
            configRef.current = normalizedSaved;
            setConfig(normalizedSaved);
            setStatus(STATUS.IDLE);
            return normalizedSaved;
        } catch (err) {
            if (isMountedRef.current) {
                setStatus(STATUS.ERROR);
                setError(err?.message || 'Failed to save configuration');
            }
            throw err;
        }
    }, []);

    const reload = useCallback(async () => {
        return loadConfig();
    }, [loadConfig]);

    const factoryReset = useCallback(async () => {
        const confirmed = await confirmToast({
            title: 'איפוס מערכת (Factory Reset)',
            message: 'אזהרה: פעולה זו תמחק את כל נתוני האתר ותחזיר אותו למצב ברירת מחדל.\nהאם להמשיך?',
            confirmText: 'אפס מערכת',
            cancelText: 'ביטול',
            type: 'warning',
        });
        if (!confirmed) return false;

        if (isMountedRef.current) {
            setStatus(STATUS.SAVING);
            setError(null);
        }

        try {
            const resetConfig = validateAndNormalize(DEFAULT_CONFIG_V1);
            const savedReset = await ConfigService.saveConfig(resetConfig);
            const normalizedReset = normalizeConfigSafely(savedReset ?? resetConfig);

            if (isMountedRef.current) {
                configRef.current = normalizedReset;
                setConfig(normalizedReset);
                setStatus(STATUS.IDLE);
            }

            window.location.reload();
            return true;
        } catch (err) {
            console.error('Factory reset failed', err);
            if (isMountedRef.current) {
                setError(err?.message || 'Factory reset failed');
                setStatus(STATUS.ERROR);
            }
            return false;
        }
    }, []);

    if (status === STATUS.LOADING) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0c0d12]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <ConfigContext.Provider
            value={{
                config,
                status,
                error,
                updateConfig,
                saveNow,
                reload,
                factoryReset,
            }}
        >
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfig = () => {
    const context = useContext(ConfigContext);
    if (!context) {
        throw new Error('useConfig must be used within ConfigProvider');
    }
    return context;
};

export const useThemeConfig = () => useConfig().config.theme;
export const useLayoutConfig = () => useConfig().config.layout;
export const useWidgetsConfig = () => useConfig().config.widgets;
export const useContentConfig = () => useConfig().config.content;
export const useNavigationConfig = () => useConfig().config.navigation;
export const useExternalLinksConfig = () => useConfig().config.externalLinks;

export { ConfigContext };
