import configAdapter from './ConfigAdapter';
import {
    DEFAULT_CONFIG_V1,
    migrateLegacyToV1,
    validateAndNormalize,
} from '../config/AppSchema';
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

class ConfigService {
    constructor(adapter = configAdapter) {
        this.adapter = adapter;
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
        const text = JSON.stringify(normalized, null, 2);
        await this.adapter.save(text);
        return normalized;
    }
}

export default new ConfigService();
