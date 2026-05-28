import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
} from 'react';
import ConfigService from '../services/ConfigService';
import { ensureSharePointBootstrapFiles, overwriteSharePointBootstrapFiles } from '../services/SharePointBootstrapService';
import { DEFAULT_CONFIG_V1, validateAndNormalize } from '../config/AppSchema';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { confirmToast } from '../utils/confirmToast';
import { spLog } from '../utils/spAppLog';
import { isMongoStorageBackend, isSharePointReadonlyBackend } from '../services/storage/storageBackend';

const STATUS = {
    LOADING: 'loading',
    IDLE: 'idle',
    SAVING: 'saving',
    ERROR: 'error',
};
const MASTER_CONFIG_MOCK_KEY = import.meta.env.VITE_SP_MASTER_CONFIG_MOCK_KEY || 'bihs_master_config_v1';
const SKIP_LEGACY_MIGRATION_ONCE_KEY = 'bihs_skip_legacy_migration_once';
const MIGRATED_DEFAULTS_REPAIR_KEY = 'bihs_migrated_defaults_repair_v1';
const LEGACY_MOCK_STORAGE_KEYS = [
    SHAREPOINT_CONFIG.mockStorageKey,
    SHAREPOINT_CONFIG.navMockStorageKey,
    SHAREPOINT_CONFIG.usersMockStorageKey,
    SHAREPOINT_CONFIG.siteContentMockStorageKey,
    SHAREPOINT_CONFIG.themeMockStorageKey,
    SHAREPOINT_CONFIG.widgetsMockStorageKey,
    SHAREPOINT_CONFIG.externalLinksMockStorageKey,
    'bihs_border_targets',
].filter((key) => typeof key === 'string' && key.trim().length > 0);

const ConfigContext = createContext(null);

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneValue(value) {
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isObject(value)) {
        const next = {};
        Object.keys(value).forEach((key) => {
            next[key] = cloneValue(value[key]);
        });
        return next;
    }
    return value;
}

function normalizeConfigSafely(candidate) {
    try {
        return validateAndNormalize(isObject(candidate) ? candidate : DEFAULT_CONFIG_V1);
    } catch (error) {
        spLog.error('[ConfigProvider] Failed to normalize config candidate. Falling back to defaults.', error);
        return validateAndNormalize(DEFAULT_CONFIG_V1);
    }
}

function safeReadLocalStorageRaw(key) {
    try {
        return localStorage.getItem(key);
    } catch (error) {
        spLog.warn(`ConfigProvider: failed to read localStorage key "${key}"`, error);
        return null;
    }
}

function consumeSkipLegacyMigrationFlag() {
    try {
        const raw = localStorage.getItem(SKIP_LEGACY_MIGRATION_ONCE_KEY);
        if (!raw) return false;
        localStorage.removeItem(SKIP_LEGACY_MIGRATION_ONCE_KEY);
        return true;
    } catch (error) {
        spLog.warn('ConfigProvider: failed handling skip migration flag', error);
        return false;
    }
}

function markSkipLegacyMigrationFlag() {
    try {
        localStorage.setItem(SKIP_LEGACY_MIGRATION_ONCE_KEY, '1');
    } catch (error) {
        spLog.warn('ConfigProvider: failed setting skip migration flag', error);
    }
}

function hasMigratedDefaultsRepairRun() {
    try {
        return localStorage.getItem(MIGRATED_DEFAULTS_REPAIR_KEY) === '1';
    } catch (error) {
        spLog.warn('ConfigProvider: failed reading migrated defaults repair flag', error);
        return false;
    }
}

function markMigratedDefaultsRepairRun() {
    try {
        localStorage.setItem(MIGRATED_DEFAULTS_REPAIR_KEY, '1');
    } catch (error) {
        spLog.warn('ConfigProvider: failed setting migrated defaults repair flag', error);
    }
}

function clearLegacyMockStorageKeys() {
    LEGACY_MOCK_STORAGE_KEYS.forEach((key) => {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            spLog.warn(`ConfigProvider: failed removing legacy key "${key}"`, error);
        }
    });
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
            spLog.warn(`[ConfigProvider] Legacy key "${storageKey}" contains invalid JSON. Using null for this key.`, parseError);
            return { exists: true, value: null };
        }
    } catch (error) {
        spLog.warn(`[ConfigProvider] Failed reading legacy key "${storageKey}". Using null for this key.`, error);
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

function shouldRepairEmptyMigratedArray(currentItems, legacyStorageKey) {
    if (!Array.isArray(currentItems) || currentItems.length > 0) return false;

    const legacyValue = parseLegacyStorageValue(legacyStorageKey);
    return !Array.isArray(legacyValue.value);
}

function repairMigratedMockDefaults(config) {
    if (!SHAREPOINT_CONFIG.useMock) {
        return { config, repaired: false };
    }
    if (config?.meta?.migratedFromLegacy !== true) {
        return { config, repaired: false };
    }
    if (hasMigratedDefaultsRepairRun()) {
        return { config, repaired: false };
    }

    let repaired = false;
    let next = config;

    if (shouldRepairEmptyMigratedArray(config?.navigation?.items, SHAREPOINT_CONFIG.navMockStorageKey)) {
        next = {
            ...next,
            navigation: {
                ...next.navigation,
                items: cloneValue(DEFAULT_CONFIG_V1.navigation.items),
            },
        };
        repaired = true;
        spLog.warn('[ConfigProvider] Repaired empty migrated mock navigation from schema defaults.');
    }

    return { config: repaired ? normalizeConfigSafely(next) : config, repaired };
}

export const ConfigProvider = ({ children }) => {
    const [config, setConfig] = useState(() => normalizeConfigSafely(DEFAULT_CONFIG_V1));
    const [status, setStatus] = useState(STATUS.LOADING);
    const [error, setError] = useState(null);

    const isMountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const configRef = useRef(normalizeConfigSafely(DEFAULT_CONFIG_V1));
    const bootstrapAttemptedRef = useRef(false);
    const loadFailedRef = useRef(false);

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
            spLog.info('[ConfigProvider] Init started...');

            const masterRawBeforeLoad = safeReadLocalStorageRaw(MASTER_CONFIG_MOCK_KEY);
            const masterWasEmpty = !masterRawBeforeLoad || !masterRawBeforeLoad.trim();
            const skipLegacyMigration = SHAREPOINT_CONFIG.useMock && consumeSkipLegacyMigrationFlag();

            const loadEnvelope = await ConfigService.loadConfigEnvelope();
            resolvedConfig = normalizeConfigSafely(loadEnvelope.config);
            loadFailedRef.current = false;
            spLog.info(`[ConfigProvider] Loaded config from adapter (${loadEnvelope.source || 'unknown'}).`);
            const loadedLooksDefault = JSON.stringify(resolvedConfig) === JSON.stringify(normalizeConfigSafely(DEFAULT_CONFIG_V1));

            if (SHAREPOINT_CONFIG.useMock && !skipLegacyMigration && (masterWasEmpty || loadedLooksDefault)) {
                const legacySplitData = extractLegacyLocalData();
                if (legacySplitData) {
                    spLog.info('[ConfigProvider] Executing legacy migration...');
                    const migratedConfig = await ConfigService.loadConfig(legacySplitData);
                    const savedMigrated = await ConfigService.saveConfig(migratedConfig);
                    resolvedConfig = normalizeConfigSafely(savedMigrated ?? migratedConfig);
                }
            }

            resolvedConfig = normalizeConfigSafely(resolvedConfig);

            if (!SHAREPOINT_CONFIG.useMock && !isMongoStorageBackend() && !isSharePointReadonlyBackend() && !bootstrapAttemptedRef.current) {
                bootstrapAttemptedRef.current = true;
                try {
                    await ensureSharePointBootstrapFiles();
                } catch (bootstrapError) {
                    spLog.warn('[ConfigProvider] SharePoint bootstrap failed. Continuing init.', bootstrapError);
                }
            }

            const repairResult = repairMigratedMockDefaults(resolvedConfig);
            if (repairResult.repaired) {
                try {
                    const savedRepair = await ConfigService.saveConfig(repairResult.config);
                    resolvedConfig = normalizeConfigSafely(savedRepair ?? repairResult.config);
                    markMigratedDefaultsRepairRun();
                } catch (repairError) {
                    spLog.warn('[ConfigProvider] Failed to persist migrated mock defaults repair.', repairError);
                    resolvedConfig = repairResult.config;
                }
            }

            if (!isMountedRef.current || requestId !== requestIdRef.current) {
                return resolvedConfig;
            }
            configRef.current = resolvedConfig;
            setConfig(resolvedConfig);
            setError(null);
            return resolvedConfig;
        } catch (err) {
            const fatalLoad = ConfigService.adapter?.isLoadFailureFatal?.(err) || isMongoStorageBackend();
            loadFailedRef.current = fatalLoad;
            spLog.error(
                fatalLoad
                    ? '[ConfigProvider] Init failed. Blocking saves to avoid empty overwrite.'
                    : '[ConfigProvider] Init failed. Falling back to defaults.',
                err
            );
            resolvedConfig = fatalLoad ? configRef.current : normalizeConfigSafely(DEFAULT_CONFIG_V1);
            if (isMountedRef.current && requestId === requestIdRef.current) {
                if (!fatalLoad) {
                    configRef.current = resolvedConfig;
                    setConfig(resolvedConfig);
                }
                setError(err?.message || 'Failed to load configuration');
                if (fatalLoad) {
                    setStatus(STATUS.ERROR);
                }
            }
            return resolvedConfig;
        } finally {
            if (isMountedRef.current && requestId === requestIdRef.current) {
                setStatus(loadFailedRef.current ? STATUS.ERROR : STATUS.IDLE);
                spLog.info('[ConfigProvider] Init complete.');
            }
        }
    }, []);

    useEffect(() => {
        loadConfig();
    }, [loadConfig]);

    const updateConfig = useCallback((updater) => {
        if (typeof updater !== 'function') {
            spLog.error('ConfigProvider.updateConfig expected a function updater');
            return;
        }

        try {
            const prevConfig = configRef.current;
            const nextConfig = updater(prevConfig);
            const resolvedConfig = normalizeConfigSafely(nextConfig ?? prevConfig);
            configRef.current = resolvedConfig;
            setConfig(resolvedConfig);
        } catch (err) {
            spLog.error('ConfigProvider.updateConfig failed:', err);
            if (isMountedRef.current) {
                setStatus(STATUS.ERROR);
                setError(err?.message || 'Failed to update configuration');
            }
        }
    }, []);

    const saveNow = useCallback(async () => {
        if (loadFailedRef.current) {
            throw new Error('Cannot save because the initial data load failed. Reload after fixing the backend connection.');
        }

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

            if (SHAREPOINT_CONFIG.useMock) {
                markSkipLegacyMigrationFlag();
                clearLegacyMockStorageKeys();
            } else if (!isMongoStorageBackend()) {
                const summary = await overwriteSharePointBootstrapFiles();
                const failures = summary.filter((entry) => entry?.ok === false);
                if (failures.length > 0) {
                    spLog.warn('[ConfigProvider] Factory reset failed on some SharePoint legacy files.', failures);
                    throw new Error(`Factory reset failed to overwrite ${failures.length} SharePoint file(s).`);
                }
            }

            if (isMountedRef.current) {
                configRef.current = normalizedReset;
                setConfig(normalizedReset);
                setStatus(STATUS.IDLE);
            }

            window.location.reload();
            return true;
        } catch (err) {
            spLog.error('Factory reset failed', err);
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

    if (status === STATUS.ERROR && loadFailedRef.current) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#0c0d12] px-6 text-white">
                <div className="max-w-xl rounded-xl border border-red-400/40 bg-red-500/10 p-6 text-center shadow-2xl">
                    <h1 className="text-xl font-black">טעינת נתוני האתר נכשלה</h1>
                    <p className="mt-3 text-sm text-red-100">
                        {error || 'לא ניתן להתחבר לשכבת האחסון. שמירה נחסמה כדי למנוע דריסת נתונים ריקים.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => loadConfig()}
                        className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-50"
                    >
                        נסה שוב
                    </button>
                </div>
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
