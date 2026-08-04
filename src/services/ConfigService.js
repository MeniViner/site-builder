import configAdapter from './ConfigAdapter';
import {
    DEFAULT_CONFIG_V1,
    migrateLegacyToV1,
    validateAndNormalize,
} from '../config/AppSchema';
import { resolveDemoProfile, KASHAR_DEMO_PROFILE } from '../demo-data/demoProfile';
import { spLog } from '../utils/spAppLog';

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
    if (Array.isArray(value)) {
        return value.map(deepClone);
    }
    if (isObject(value)) {
        const next = {};
        Object.keys(value).forEach((key) => {
            next[key] = deepClone(value[key]);
        });
        return next;
    }
    return value;
}

function deepMergeReplaceArrays(baseValue, overrideValue) {
    if (overrideValue === undefined) {
        return deepClone(baseValue);
    }

    if (Array.isArray(baseValue) || Array.isArray(overrideValue)) {
        return Array.isArray(overrideValue) ? overrideValue.map(deepClone) : deepClone(overrideValue);
    }

    if (isObject(baseValue) && isObject(overrideValue)) {
        const result = {};
        const keys = new Set([...Object.keys(baseValue), ...Object.keys(overrideValue)]);

        keys.forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(overrideValue, key)) {
                result[key] = deepMergeReplaceArrays(baseValue[key], overrideValue[key]);
            } else {
                result[key] = deepClone(baseValue[key]);
            }
        });

        return result;
    }

    return deepClone(overrideValue);
}

export class ConfigService {
    constructor(adapter = configAdapter, {
        resolveProfile = resolveDemoProfile,
        loadKasharDemoConfig = async () => {
            const { cloneKasharDemoData } = await import('../demo-data/kasharDemoData');
            return cloneKasharDemoData();
        },
    } = {}) {
        this.adapter = adapter;
        this.resolveProfile = resolveProfile;
        this.loadKasharDemoConfig = loadKasharDemoConfig;
    }

    _withDefaults(config) {
        return deepMergeReplaceArrays(DEFAULT_CONFIG_V1, isObject(config) ? config : {});
    }

    migrateFromLegacySplitData(legacySplitData) {
        const migrated = migrateLegacyToV1(legacySplitData);
        const merged = this._withDefaults(migrated);
        return validateAndNormalize(merged);
    }

    async loadConfigEnvelope(legacySplitData = null) {
        if (this.resolveProfile() === KASHAR_DEMO_PROFILE) {
            const demoConfig = await this.loadKasharDemoConfig();
            return {
                config: validateAndNormalize(demoConfig),
                source: 'demo:kashar',
            };
        }

        try {
            if (isObject(legacySplitData)) {
                return {
                    config: this.migrateFromLegacySplitData(legacySplitData),
                    source: 'legacy-split-data',
                };
            }

            const loaded = await this.adapter.load();
            const text = typeof loaded?.text === 'string' ? loaded.text : null;

            if (text === null || text.trim() === '') {
                const defaults = validateAndNormalize(DEFAULT_CONFIG_V1);
                return { config: defaults, source: 'missing-or-empty' };
            }

            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (parseError) {
                if (this.adapter?.isStrictPersistence?.() || this.adapter?.isLoadFailureFatal?.(parseError)) {
                    throw parseError;
                }
                spLog.error('ConfigService: failed to parse master config JSON, falling back to defaults.', parseError);
                const defaults = validateAndNormalize(DEFAULT_CONFIG_V1);
                return { config: defaults, source: 'invalid-json', error: parseError };
            }

            if (isObject(parsed) && parsed.schemaVersion === '1.0.0') {
                return { config: validateAndNormalize(parsed), source: 'schema-v1' };
            }

            const migrated = migrateLegacyToV1(parsed);
            const merged = this._withDefaults(migrated);
            return { config: validateAndNormalize(merged), source: 'migrated-legacy' };
        } catch (error) {
            if (this.adapter?.isLoadFailureFatal?.(error)) {
                throw error;
            }
            spLog.error('ConfigService: load failed, returning defaults.', error);
            return {
                config: validateAndNormalize(DEFAULT_CONFIG_V1),
                source: 'load-error',
                error,
            };
        }
    }

    async loadConfig(legacySplitData = null) {
        const envelope = await this.loadConfigEnvelope(legacySplitData);
        return envelope.config;
    }

    async saveConfig(config) {
        const normalized = validateAndNormalize(this._withDefaults(config));
        if (this.resolveProfile() === KASHAR_DEMO_PROFILE) {
            // ConfigProvider keeps this normalized value in memory. It must never
            // be written to the configured Mongo, TXT, or local-storage backend.
            return normalized;
        }
        const text = JSON.stringify(normalized, null, 2);
        await this.adapter.save(text);
        return normalized;
    }
}

export default new ConfigService();
