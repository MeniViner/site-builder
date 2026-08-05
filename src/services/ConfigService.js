import configAdapter from './ConfigAdapter';
import {
    DEFAULT_CONFIG_V1,
    migrateLegacyToV1,
    validateAndNormalize,
} from '../config/AppSchema';
import {
    KASHAR_DEMO_PROFILE,
    resolveDemoProfile,
} from '../demo-data/demoProfile';
import kasharDraftStore from './KasharDraftStore';
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
        draftStore = kasharDraftStore,
    } = {}) {
        this.adapter = adapter;
        this.resolveProfile = resolveProfile;
        this.draftStore = draftStore;
    }

    _withDefaults(config) {
        return deepMergeReplaceArrays(DEFAULT_CONFIG_V1, isObject(config) ? config : {});
    }

    migrateFromLegacySplitData(legacySplitData) {
        const migrated = migrateLegacyToV1(legacySplitData);
        const merged = this._withDefaults(migrated);
        return validateAndNormalize(merged);
    }

    _normalizeLoadedText(text) {
        const parsed = JSON.parse(text);

        if (isObject(parsed) && parsed.schemaVersion === '1.0.0') {
            return { config: validateAndNormalize(parsed), source: 'schema-v1' };
        }

        const migrated = migrateLegacyToV1(parsed);
        return {
            config: validateAndNormalize(this._withDefaults(migrated)),
            source: 'migrated-legacy',
        };
    }

    async _saveNormalizedConfig(config) {
        const text = JSON.stringify(config, null, 2);
        await this.adapter.save(text);
        return config;
    }

    async _loadKasharConfigEnvelope() {
        const { draft, source, notice = null } = await this.draftStore.loadOrSeed();
        return { config: validateAndNormalize(this._withDefaults(draft.configEnvelope)), source, notice };
    }

    async resetKasharDemoData() {
        if (this.resolveProfile() !== KASHAR_DEMO_PROFILE) {
            throw new Error('Reset Kashar demo data is available only in the Kashar demo profile.');
        }
        const draft = await this.draftStore.reset();
        return validateAndNormalize(this._withDefaults(draft.configEnvelope));
    }

    async validateKasharDemoDraftImport(text) {
        if (this.resolveProfile() !== KASHAR_DEMO_PROFILE) {
            throw new Error('Kashar demo import is available only in the Kashar demo profile.');
        }
        return this.draftStore.validateWorkspaceImport(text);
    }

    async exportKasharDemoDraft() {
        if (this.resolveProfile() !== KASHAR_DEMO_PROFILE) {
            throw new Error('Kashar demo export is available only in the Kashar demo profile.');
        }
        return this.draftStore.exportWorkspace();
    }

    async importKasharDemoDraft(text) {
        if (this.resolveProfile() !== KASHAR_DEMO_PROFILE) {
            throw new Error('Kashar demo import is available only in the Kashar demo profile.');
        }
        const result = await this.draftStore.importWorkspaceText(text);
        return {
            config: validateAndNormalize(this._withDefaults(result.draft.configEnvelope)),
            warning: result.warning,
        };
    }

    async loadConfigEnvelope(legacySplitData = null) {
        try {
            if (this.resolveProfile() === KASHAR_DEMO_PROFILE) {
                return this._loadKasharConfigEnvelope();
            }

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
            // Kashar has no secondary repository. Falling back to the normal
            // default config here would make an unavailable or corrupt local
            // draft look like a successful load and could overwrite it later.
            if (this.resolveProfile() === KASHAR_DEMO_PROFILE) {
                throw error;
            }
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
            return this.draftStore.saveConfig(normalized);
        }
        return this._saveNormalizedConfig(normalized);
    }
}

export default new ConfigService();
