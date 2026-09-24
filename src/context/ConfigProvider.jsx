import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
} from 'react';
import ConfigService from '../services/ConfigService';
import { mergeConfigTexts, resolveConfigConflictTexts } from '../services/ConfigAdapter';
import { ensureSharePointBootstrapFiles, overwriteSharePointBootstrapFiles } from '../services/SharePointBootstrapService';
import { DEFAULT_CONFIG_V1, validateAndNormalize } from '../config/AppSchema';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { confirmToast } from '../utils/confirmToast';
import { spLog } from '../utils/spAppLog';
import { toast } from 'react-toastify';
import { isMongoStorageBackend, isSharePointReadonlyBackend } from '../services/storage/storageBackend';
import { isKasharDemoProfile } from '../demo-data/demoProfile';
import KasharDraftRecoveryPanel from '../components/KasharDraftRecoveryPanel';
import {
    assertAdminEditSessionFresh,
    approveAdminReload,
    clearAdminRecoveryDraft,
    completeAdminRecoveryRevalidation,
    getAdminExclusiveOperation,
    readAdminRecoveryDraft,
    registerAdminPersistenceController,
    isStaleAdminEditError,
} from '../utils/adminEditSession';

const STATUS = {
    LOADING: 'loading',
    IDLE: 'idle',
    SAVING: 'saving',
    ERROR: 'error',
};
const PERSISTENCE_STATUS = Object.freeze({
    CLEAN: 'clean',
    DIRTY: 'dirty',
    SAVING: 'saving',
    SAVED: 'saved',
    ERROR: 'error',
});
const createUnresolvedConflictError = () => Object.assign(
    new Error('הטיוטה נשמרה מקומית, אך יש שינויים חופפים מול השרת. יש לטעון מחדש ולבחור אילו שינויים להשאיר.'),
    {
        code: 'UNRESOLVED_CONFIG_CONFLICT',
        resolutionMessage: 'הטיוטה נשמרה מקומית. נדרש פתרון התנגשות לפני שמירה נוספת.',
    },
);
const MASTER_CONFIG_MOCK_KEY = import.meta.env.VITE_SP_MASTER_CONFIG_MOCK_KEY || 'bihs_master_config_v1';
const USE_LOCAL_MOCK_STORAGE = SHAREPOINT_CONFIG.useMockStorage === true;

function ConfigConflictDialog({ conflict, onChoose, onSave }) {
    if (!conflict) return null;
    const allResolved = conflict.conflicts.every((path) => conflict.resolutions[path]);
    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4" dir="rtl">
            <div role="dialog" aria-modal="true" aria-labelledby="config-conflict-title" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 text-right shadow-2xl dark:bg-[#1b1f2a]">
                <h2 id="config-conflict-title" className="text-xl font-black text-gray-900 dark:text-white">פתרון התנגשות שמירה</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                    גרסת השרת השתנתה במקביל. הטיוטה נשמרה; בחרו לכל הבדל אם להשאיר את העריכה המקומית או את גרסת השרת.
                </p>
                <ul className="mt-5 space-y-3">
                    {conflict.conflicts.map((path) => (
                        <li key={path} className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
                            <code dir="ltr" className="block overflow-x-auto text-xs text-gray-600 dark:text-gray-300">{path}</code>
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                {[
                                    ['local', 'השארת הטיוטה המקומית'],
                                    ['remote', 'קבלת גרסת השרת'],
                                ].map(([value, label]) => (
                                    <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-bold dark:border-white/10">
                                        <input
                                            type="radio"
                                            name={`conflict-${path}`}
                                            checked={conflict.resolutions[path] === value}
                                            onChange={() => onChoose(path, value)}
                                        />
                                        {label}
                                    </label>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
                {conflict.error ? <p role="alert" className="mt-4 text-sm font-bold text-red-600 dark:text-red-300">{conflict.error}</p> : null}
                <button
                    type="button"
                    onClick={onSave}
                    disabled={!allResolved || conflict.saving || !conflict.remoteEtag}
                    className="mt-5 min-h-11 w-full rounded-xl bg-primary px-5 font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {conflict.saving ? 'שומר הכרעה...' : 'שמירת ההכרעה מול הגרסה שנבדקה'}
                </button>
                {!conflict.remoteEtag ? (
                    <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">לגרסת השרת אין מזהה גרסה מאומת. יש לטעון מחדש לפני שמירה.</p>
                ) : null}
            </div>
        </div>
    );
}
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

function normalizeConfigStrict(candidate) {
    if (!isObject(candidate)) {
        throw new Error('Configuration mutation must produce an object.');
    }
    return validateAndNormalize(candidate);
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
    if (!USE_LOCAL_MOCK_STORAGE) {
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
    const [conflict, setConflict] = useState(null);
    const [persistence, setPersistence] = useState(() => ({
        status: PERSISTENCE_STATUS.CLEAN,
        revision: 0,
        persistedRevision: 0,
        dirty: false,
        saving: false,
        savedAt: null,
        error: null,
    }));

    const isMountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const configRef = useRef(normalizeConfigSafely(DEFAULT_CONFIG_V1));
    const acceptedConfigRef = useRef(normalizeConfigSafely(DEFAULT_CONFIG_V1));
    const bootstrapAttemptedRef = useRef(false);
    const loadFailedRef = useRef(false);
    const saveBlockedByConflictRef = useRef(false);
    const revisionRef = useRef(0);
    const persistedRevisionRef = useRef(0);
    const saveLoopPromiseRef = useRef(null);
    const saveWaitersRef = useRef([]);

    useEffect(() => {
        configRef.current = config;
    }, [config]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const loadConfig = useCallback(async ({ discardRecoveryDraft = false } = {}) => {
        const requestId = ++requestIdRef.current;
        if (isMountedRef.current) {
            setStatus(STATUS.LOADING);
            setError(null);
        }

        let resolvedConfig = normalizeConfigSafely(DEFAULT_CONFIG_V1);

        try {
            spLog.info('[ConfigProvider] Init started...');
            const isKasharProfile = isKasharDemoProfile();

            const masterRawBeforeLoad = isKasharProfile ? null : safeReadLocalStorageRaw(MASTER_CONFIG_MOCK_KEY);
            const masterWasEmpty = !masterRawBeforeLoad || !masterRawBeforeLoad.trim();
            const skipLegacyMigration = !isKasharProfile && USE_LOCAL_MOCK_STORAGE && consumeSkipLegacyMigrationFlag();

            const loadEnvelope = await ConfigService.loadConfigEnvelope();
            resolvedConfig = normalizeConfigStrict(loadEnvelope.config);
            loadFailedRef.current = false;
            if (loadEnvelope.notice) {
                toast.info(loadEnvelope.notice);
            }
            spLog.info(`[ConfigProvider] Loaded config from adapter (${loadEnvelope.source || 'unknown'}).`);
            const loadedLooksDefault = JSON.stringify(resolvedConfig) === JSON.stringify(normalizeConfigSafely(DEFAULT_CONFIG_V1));

            if (!isKasharProfile && USE_LOCAL_MOCK_STORAGE && !skipLegacyMigration && (masterWasEmpty || loadedLooksDefault)) {
                const legacySplitData = extractLegacyLocalData();
                if (legacySplitData) {
                    spLog.info('[ConfigProvider] Executing legacy migration...');
                    const migratedConfig = await ConfigService.loadConfig(legacySplitData);
                    const savedMigrated = await ConfigService.saveConfig(migratedConfig);
                    resolvedConfig = normalizeConfigStrict(savedMigrated ?? migratedConfig);
                }
            }

            resolvedConfig = normalizeConfigStrict(resolvedConfig);

            if (!isKasharProfile && !USE_LOCAL_MOCK_STORAGE && !isMongoStorageBackend() && !isSharePointReadonlyBackend() && !bootstrapAttemptedRef.current) {
                bootstrapAttemptedRef.current = true;
                try {
                    await ensureSharePointBootstrapFiles();
                } catch (bootstrapError) {
                    spLog.warn('[ConfigProvider] RUNTIME DATA OPERATION FAILURE: optional SharePoint seed check failed. Continuing init.', bootstrapError);
                }
            }

            const repairResult = isKasharProfile
                ? { config: resolvedConfig, repaired: false }
                : repairMigratedMockDefaults(resolvedConfig);
            if (repairResult.repaired) {
                try {
                    const savedRepair = await ConfigService.saveConfig(repairResult.config);
                    resolvedConfig = normalizeConfigStrict(savedRepair ?? repairResult.config);
                    markMigratedDefaultsRepairRun();
                } catch (repairError) {
                    spLog.warn('[ConfigProvider] Failed to persist migrated mock defaults repair.', repairError);
                    resolvedConfig = repairResult.config;
                }
            }

            if (!isMountedRef.current || requestId !== requestIdRef.current) {
                return resolvedConfig;
            }
            acceptedConfigRef.current = resolvedConfig;
            const recoveredEnvelope = discardRecoveryDraft
                ? null
                : readAdminRecoveryDraft('persistence:master-config');
            const recoveredDraft = recoveredEnvelope?.draft || recoveredEnvelope;
            const recoveredBaseline = recoveredEnvelope?.baseline || null;
            let normalizedDraft = recoveredDraft ? normalizeConfigStrict(recoveredDraft) : null;
            let recoveryConflict = false;
            let recoveryConflicts = [];
            if (normalizedDraft && recoveredBaseline) {
                const merged = mergeConfigTexts(
                    JSON.stringify(normalizeConfigStrict(recoveredBaseline)),
                    JSON.stringify(normalizedDraft),
                    JSON.stringify(resolvedConfig),
                );
                if (merged.ok) {
                    normalizedDraft = normalizeConfigStrict(JSON.parse(merged.text));
                } else {
                    recoveryConflict = true;
                    recoveryConflicts = merged.conflicts || ['$'];
                }
            }
            saveBlockedByConflictRef.current = recoveryConflict;
            if (recoveryConflict) {
                const versionState = ConfigService.getVersionState?.() || {};
                setConflict({
                    baseline: recoveredBaseline,
                    draft: normalizedDraft,
                    remote: resolvedConfig,
                    remoteEtag: versionState.accepted?.etag || null,
                    conflicts: recoveryConflicts,
                    resolutions: {},
                    saving: false,
                    error: '',
                });
            } else {
                setConflict(null);
            }
            const hasRecoveredDraft = Boolean(
                normalizedDraft
                && JSON.stringify(normalizedDraft) !== JSON.stringify(resolvedConfig),
            );
            const visibleConfig = hasRecoveredDraft ? normalizedDraft : resolvedConfig;
            configRef.current = visibleConfig;
            setConfig(visibleConfig);
            revisionRef.current = hasRecoveredDraft ? 1 : 0;
            persistedRevisionRef.current = 0;
            setPersistence({
                status: hasRecoveredDraft ? PERSISTENCE_STATUS.DIRTY : PERSISTENCE_STATUS.CLEAN,
                revision: hasRecoveredDraft ? 1 : 0,
                persistedRevision: 0,
                dirty: hasRecoveredDraft,
                saving: false,
                savedAt: null,
                error: recoveryConflict ? 'הטיוטה נשמרה, אך יש שינויים חופפים מול השרת.' : null,
            });
            if (discardRecoveryDraft || !hasRecoveredDraft) clearAdminRecoveryDraft('persistence:master-config');
            setError(recoveryConflict ? 'הטיוטה נשמרה. יש לבחור אילו שינויים להשאיר מול הגרסה העדכנית.' : null);
            return visibleConfig;
        } catch (err) {
            const fatalLoad = isKasharDemoProfile()
                || ConfigService.adapter?.isLoadFailureFatal?.(err)
                || isMongoStorageBackend();
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
                setPersistence((prev) => ({
                    ...prev,
                    status: PERSISTENCE_STATUS.ERROR,
                    saving: false,
                    error: err?.message || 'Failed to load configuration',
                }));
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
            assertAdminEditSessionFresh();
            const prevConfig = configRef.current;
            const prevSerialized = JSON.stringify(prevConfig);
            const nextConfig = updater(prevConfig);
            const resolvedConfig = normalizeConfigStrict(nextConfig ?? prevConfig);
            if (JSON.stringify(resolvedConfig) === prevSerialized) {
                return;
            }
            const nextRevision = revisionRef.current + 1;
            revisionRef.current = nextRevision;
            configRef.current = resolvedConfig;
            setConfig(resolvedConfig);
            setPersistence((prev) => ({
                ...prev,
                status: PERSISTENCE_STATUS.DIRTY,
                revision: nextRevision,
                persistedRevision: persistedRevisionRef.current,
                dirty: true,
                saving: Boolean(saveLoopPromiseRef.current),
                error: null,
            }));
        } catch (err) {
            spLog.error('ConfigProvider.updateConfig failed:', err);
            if (isMountedRef.current) {
                setStatus(STATUS.ERROR);
                setError(err?.message || 'Failed to update configuration');
            }
            if (isStaleAdminEditError(err)) throw err;
        }
    }, []);

    const settleSaveWaiters = useCallback((persistedRevision, value, errorValue = null) => {
        const pending = saveWaitersRef.current;
        const remaining = [];
        pending.forEach((waiter) => {
            if (errorValue || waiter.revision <= persistedRevision) {
                if (errorValue) waiter.reject(errorValue);
                else waiter.resolve(value);
            } else {
                remaining.push(waiter);
            }
        });
        saveWaitersRef.current = remaining;
    }, []);

    const ensureSaveLoop = useCallback(() => {
        if (saveLoopPromiseRef.current) return saveLoopPromiseRef.current;

        const loop = (async () => {
            while (persistedRevisionRef.current < revisionRef.current) {
                const savingRevision = revisionRef.current;
                const snapshot = configRef.current;
                if (isMountedRef.current) {
                    setStatus(STATUS.SAVING);
                    setError(null);
                    setPersistence((prev) => ({
                        ...prev,
                        status: PERSISTENCE_STATUS.SAVING,
                        revision: revisionRef.current,
                        persistedRevision: persistedRevisionRef.current,
                        dirty: true,
                        saving: true,
                        error: null,
                    }));
                }

                let normalizedSaved;
                try {
                    assertAdminEditSessionFresh({ recoveryOperation: getAdminExclusiveOperation() });
                    const saved = await ConfigService.saveConfig(snapshot);
                    normalizedSaved = normalizeConfigStrict(saved);
                } catch (err) {
                    if (err?.code === 'version_conflict' && err?.details?.accepted?.text && err?.details?.remote?.text) {
                        const accepted = normalizeConfigStrict(JSON.parse(err.details.accepted.text));
                        const remote = normalizeConfigStrict(JSON.parse(err.details.remote.text));
                        const merge = mergeConfigTexts(
                            JSON.stringify(accepted),
                            JSON.stringify(snapshot),
                            JSON.stringify(remote),
                        );
                        setConflict({
                            baseline: accepted,
                            draft: snapshot,
                            remote,
                            remoteEtag: err.details.remote.etag || null,
                            conflicts: merge.conflicts || ['$'],
                            resolutions: {},
                            saving: false,
                            error: '',
                        });
                        saveBlockedByConflictRef.current = true;
                    }
                    if (isMountedRef.current) {
                        setStatus(STATUS.ERROR);
                        setError(err?.resolutionMessage || err?.message || 'Failed to save configuration');
                        setPersistence((prev) => ({
                            ...prev,
                            status: PERSISTENCE_STATUS.ERROR,
                            revision: revisionRef.current,
                            persistedRevision: persistedRevisionRef.current,
                            dirty: true,
                            saving: false,
                            error: err?.resolutionMessage || err?.message || 'Failed to save configuration',
                        }));
                    }
                    settleSaveWaiters(persistedRevisionRef.current, null, err);
                    return;
                }

                persistedRevisionRef.current = savingRevision;
                acceptedConfigRef.current = normalizedSaved;
                if (persistedRevisionRef.current >= revisionRef.current) {
                    clearAdminRecoveryDraft('persistence:master-config');
                }
                if (revisionRef.current === savingRevision) {
                    configRef.current = normalizedSaved;
                    if (isMountedRef.current) setConfig(normalizedSaved);
                } else {
                    const rebased = mergeConfigTexts(
                        JSON.stringify(snapshot),
                        JSON.stringify(configRef.current),
                        JSON.stringify(normalizedSaved),
                    );
                    if (rebased.ok) {
                        const normalizedRebased = normalizeConfigStrict(JSON.parse(rebased.text));
                        configRef.current = normalizedRebased;
                        if (isMountedRef.current) setConfig(normalizedRebased);
                    } else {
                        const conflictError = createUnresolvedConflictError();
                        saveBlockedByConflictRef.current = true;
                        if (isMountedRef.current) {
                            setStatus(STATUS.ERROR);
                            setError(conflictError.message);
                            setPersistence({
                                status: PERSISTENCE_STATUS.ERROR,
                                revision: revisionRef.current,
                                persistedRevision: persistedRevisionRef.current,
                                dirty: true,
                                saving: false,
                                savedAt: null,
                                error: conflictError.resolutionMessage,
                            });
                        }
                        settleSaveWaiters(savingRevision, normalizedSaved);
                        settleSaveWaiters(persistedRevisionRef.current, null, conflictError);
                        return;
                    }
                }
                settleSaveWaiters(savingRevision, normalizedSaved);

                if (isMountedRef.current) {
                    const dirty = revisionRef.current > persistedRevisionRef.current;
                    setPersistence({
                        status: dirty ? PERSISTENCE_STATUS.SAVING : PERSISTENCE_STATUS.SAVED,
                        revision: revisionRef.current,
                        persistedRevision: persistedRevisionRef.current,
                        dirty,
                        saving: dirty,
                        savedAt: dirty ? null : new Date().toISOString(),
                        error: null,
                    });
                }
            }

            if (isMountedRef.current) setStatus(STATUS.IDLE);
        })();

        saveLoopPromiseRef.current = loop.finally(() => {
            saveLoopPromiseRef.current = null;
            if (
                saveWaitersRef.current.length > 0
                && persistedRevisionRef.current < revisionRef.current
            ) {
                ensureSaveLoop();
            }
        });
        saveLoopPromiseRef.current.catch(() => undefined);
        return saveLoopPromiseRef.current;
    }, [settleSaveWaiters]);

    const saveNow = useCallback(() => {
        if (saveBlockedByConflictRef.current) {
            return Promise.reject(createUnresolvedConflictError());
        }
        try {
            assertAdminEditSessionFresh();
        } catch (staleError) {
            return Promise.reject(staleError);
        }
        if (loadFailedRef.current) {
            return Promise.reject(new Error('Cannot save because the initial data load failed. Reload after fixing the backend connection.'));
        }

        const targetRevision = revisionRef.current;
        if (targetRevision <= persistedRevisionRef.current) {
            return Promise.resolve(configRef.current);
        }

        const waiter = new Promise((resolve, reject) => {
            saveWaitersRef.current.push({ revision: targetRevision, resolve, reject });
        });
        ensureSaveLoop();
        return waiter;
    }, [ensureSaveLoop]);

    const chooseConflictResolution = useCallback((path, choice) => {
        setConflict((current) => current ? {
            ...current,
            resolutions: { ...current.resolutions, [path]: choice },
            error: '',
        } : current);
    }, []);

    const saveConflictResolution = useCallback(async () => {
        if (!conflict || conflict.saving) return;
        const merged = resolveConfigConflictTexts(
            JSON.stringify(conflict.baseline),
            JSON.stringify(conflict.draft),
            JSON.stringify(conflict.remote),
            conflict.resolutions,
        );
        if (!merged.ok) {
            setConflict((current) => current ? {
                ...current,
                error: 'יש לבחור הכרעה לכל ההבדלים לפני השמירה.',
            } : current);
            return;
        }
        const resolved = normalizeConfigStrict(JSON.parse(merged.text));
        setConflict((current) => current ? { ...current, saving: true, error: '' } : current);
        try {
            const saved = normalizeConfigStrict(await ConfigService.saveResolvedConfig(resolved, conflict.remoteEtag));
            acceptedConfigRef.current = saved;
            configRef.current = saved;
            const nextRevision = revisionRef.current + 1;
            revisionRef.current = nextRevision;
            persistedRevisionRef.current = nextRevision;
            saveBlockedByConflictRef.current = false;
            setConfig(saved);
            setConflict(null);
            setError(null);
            setStatus(STATUS.IDLE);
            setPersistence({
                status: PERSISTENCE_STATUS.SAVED,
                revision: nextRevision,
                persistedRevision: nextRevision,
                dirty: false,
                saving: false,
                savedAt: new Date().toISOString(),
                error: null,
            });
            clearAdminRecoveryDraft('persistence:master-config');
        } catch (resolutionError) {
            if (
                resolutionError?.code === 'version_conflict'
                && resolutionError?.details?.remote?.text
            ) {
                const remote = normalizeConfigStrict(JSON.parse(resolutionError.details.remote.text));
                const refreshedMerge = mergeConfigTexts(
                    JSON.stringify(conflict.baseline),
                    JSON.stringify(conflict.draft),
                    JSON.stringify(remote),
                );
                setConflict({
                    ...conflict,
                    remote,
                    remoteEtag: resolutionError.details.remote.etag || null,
                    conflicts: refreshedMerge.conflicts || ['$'],
                    resolutions: {},
                    saving: false,
                    error: 'גרסת השרת השתנתה שוב. בדקו מחדש את ההבדלים.',
                });
                return;
            }
            setConflict((current) => current ? {
                ...current,
                saving: false,
                error: resolutionError?.resolutionMessage || 'שמירת ההכרעה נכשלה. הטיוטה נשמרה וניתן לנסות שוב.',
            } : current);
        }
    }, [conflict]);

    useEffect(() => registerAdminPersistenceController({
        id: 'master-config',
        getState: () => ({
            revision: revisionRef.current,
            persistedRevision: persistedRevisionRef.current,
            dirty: revisionRef.current > persistedRevisionRef.current,
            saving: Boolean(saveLoopPromiseRef.current),
        }),
        captureDraft: () => ({
            baseline: acceptedConfigRef.current,
            draft: configRef.current,
        }),
        flush: async () => {
            if (saveBlockedByConflictRef.current) {
                throw createUnresolvedConflictError();
            }
            if (persistedRevisionRef.current < revisionRef.current) {
                await ensureSaveLoop();
            } else if (saveLoopPromiseRef.current) {
                await saveLoopPromiseRef.current;
            }
            if (persistedRevisionRef.current < revisionRef.current) {
                throw new Error('שמירת ההגדרות טרם הושלמה.');
            }
            return configRef.current;
        },
    }), [ensureSaveLoop]);

    const reload = useCallback(async ({ discardLocal = false, completeRecovery = false } = {}) => {
        if (!discardLocal && revisionRef.current > persistedRevisionRef.current) {
            await saveNow();
        }
        const loaded = await loadConfig({ discardRecoveryDraft: discardLocal });
        if (!loadFailedRef.current && completeRecovery) completeAdminRecoveryRevalidation();
        return loaded;
    }, [loadConfig, saveNow]);

    const factoryReset = useCallback(async () => {
        if (isKasharDemoProfile()) {
            const message = 'Factory Reset is unavailable for Kashar. Use Reset Kashar demo data instead.';
            if (isMountedRef.current) {
                setError(message);
                setStatus(STATUS.ERROR);
            }
            return false;
        }

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
            const normalizedReset = normalizeConfigStrict(savedReset ?? resetConfig);

            if (USE_LOCAL_MOCK_STORAGE) {
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
                revisionRef.current = 0;
                persistedRevisionRef.current = 0;
                setConfig(normalizedReset);
                setStatus(STATUS.IDLE);
                setPersistence({
                    status: PERSISTENCE_STATUS.SAVED,
                    revision: 0,
                    persistedRevision: 0,
                    dirty: false,
                    saving: false,
                    savedAt: new Date().toISOString(),
                    error: null,
                });
            }

            approveAdminReload('factory-reset');
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

    const resetKasharDemoData = useCallback(async () => {
        if (!isKasharDemoProfile()) return false;

        const confirmed = await confirmToast({
            title: 'Reset Kashar demo data',
            message: 'This will replace all Kashar demo content, widgets, and Gantt data with the original fixture. This cannot be undone. Continue?',
            confirmText: 'Reset demo data',
            cancelText: 'Cancel',
            type: 'warning',
        });
        if (!confirmed) return false;

        if (isMountedRef.current) {
            setStatus(STATUS.SAVING);
            setError(null);
        }

        try {
            const resetConfig = await ConfigService.resetKasharDemoData();
            const normalizedReset = normalizeConfigStrict(resetConfig);

            configRef.current = normalizedReset;
            revisionRef.current = 0;
            persistedRevisionRef.current = 0;
            loadFailedRef.current = false;
            if (isMountedRef.current) {
                setConfig(normalizedReset);
                setStatus(STATUS.IDLE);
                setPersistence({
                    status: PERSISTENCE_STATUS.SAVED,
                    revision: 0,
                    persistedRevision: 0,
                    dirty: false,
                    saving: false,
                    savedAt: new Date().toISOString(),
                    error: null,
                });
            }

            approveAdminReload('kashar-reset');
            window.location.reload();
            return true;
        } catch (err) {
            spLog.error('Kashar demo reset failed', err);
            if (isMountedRef.current) {
                setError(err?.message || 'Kashar demo reset failed');
                setStatus(STATUS.ERROR);
                setPersistence((prev) => ({
                    ...prev,
                    status: PERSISTENCE_STATUS.ERROR,
                    saving: false,
                    error: err?.message || 'Kashar demo reset failed',
                }));
            }
            return false;
        }
    }, []);

    const exportKasharDemoData = useCallback(async () => {
        if (!isKasharDemoProfile()) return null;
        try {
            return await ConfigService.exportKasharDemoDraft();
        } catch (err) {
            spLog.error('Kashar demo export failed', err);
            if (isMountedRef.current) {
                setError(err?.message || 'Kashar demo export failed');
                setStatus(STATUS.ERROR);
            }
            return null;
        }
    }, []);

    const importKasharDemoData = useCallback(async (text) => {
        if (!isKasharDemoProfile()) return false;

        try {
            await ConfigService.validateKasharDemoDraftImport(text);
        } catch (err) {
            if (isMountedRef.current) {
                setError(err?.message || 'Kashar demo import validation failed');
                setStatus(STATUS.ERROR);
            }
            return false;
        }

        const confirmed = await confirmToast({
            title: 'Import Kashar demo data',
            message: 'This replaces the current local Kashar draft. A backup of the current draft will be kept. Continue?',
            confirmText: 'Import demo data',
            cancelText: 'Cancel',
            type: 'warning',
        });
        if (!confirmed) return false;

        if (isMountedRef.current) {
            setStatus(STATUS.SAVING);
            setError(null);
        }

        try {
            const importResult = await ConfigService.importKasharDemoDraft(text);
            const normalizedImported = normalizeConfigStrict(importResult.config);
            configRef.current = normalizedImported;
            revisionRef.current = 0;
            persistedRevisionRef.current = 0;
            loadFailedRef.current = false;
            if (isMountedRef.current) {
                setConfig(normalizedImported);
                setStatus(STATUS.IDLE);
            }
            if (importResult.warning) {
                toast.warn(importResult.warning);
            }
            approveAdminReload('kashar-import');
            window.location.reload();
            return true;
        } catch (err) {
            spLog.error('Kashar demo import failed', err);
            if (isMountedRef.current) {
                setError(err?.message || 'Kashar demo import failed');
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
                    {isKasharDemoProfile() && import.meta.env.DEV && (
                        <KasharDraftRecoveryPanel onRetry={loadConfig} />
                    )}
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
                resetKasharDemoData,
                exportKasharDemoData,
                importKasharDemoData,
                persistence,
                retrySave: saveNow,
            }}
        >
            {children}
            <ConfigConflictDialog
                conflict={conflict}
                onChoose={chooseConflictResolution}
                onSave={saveConflictResolution}
            />
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

export const useOptionalConfig = () => useContext(ConfigContext);


export const useThemeConfig = () => useConfig().config.theme;
export const useLayoutConfig = () => useConfig().config.layout;
export const useWidgetsConfig = () => useConfig().config.widgets;
export const useContentConfig = () => useConfig().config.content;
export const useNavigationConfig = () => useConfig().config.navigation;
export const useExternalLinksConfig = () => useConfig().config.externalLinks;

export { ConfigContext };
