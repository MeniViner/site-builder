import { describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
    decodeKasharDraft,
    KASHAR_DRAFT_FORMAT,
    KASHAR_DRAFT_STORAGE_KEY,
    KasharDraftStore,
} from './KasharDraftStore';
import { kasharAssetStore } from './KasharAssetStore';
import {
    cloneKasharDemoData,
    cloneKasharDemoGanttData,
    createKasharDemoWidgetConfig,
} from '../demo-data/kasharDemoData';

class MemoryStorage {
    constructor() {
        this.values = new Map();
        this.failWrites = false;
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        if (this.failWrites) throw new Error('quota exceeded');
        this.values.set(key, String(value));
    }

    removeItem(key) {
        if (this.failWrites) throw new Error('remove failed');
        this.values.delete(key);
    }

    get length() {
        return this.values.size;
    }

    key(index) {
        return [...this.values.keys()][index] || null;
    }
}

function createStore(storage) {
    return new KasharDraftStore({
        storage,
        now: () => '2026-08-04T10:00:00.000Z',
    });
}

function legacyDraft({ discriminator = false, metadata = 'current' } = {}) {
    const configEnvelope = cloneKasharDemoData();
    configEnvelope.content.hero.title = 'טיוטה ותיקה עם עריכות';
    configEnvelope.externalLinks.items[0].title = 'קישור מנוהל ותיק';
    configEnvelope.content.orgChart.nodes[0].name = 'עץ ארגוני ותיק';
    configEnvelope.imageGalleries.items[0].title = 'גלריה ותיקה';
    const draft = {
        [metadata === 'legacy' ? 'profile' : 'demoProfile']: 'kashar',
        [metadata === 'legacy' ? 'seedVersion' : 'demoSeedVersion']: 1,
        seededAt: '2026-08-03T10:00:00.000Z',
        configEnvelope,
        gantt: {
            ...cloneKasharDemoGanttData(),
            items: [{ ...cloneKasharDemoGanttData().items[0], title: 'משימת גאנט ותיקה' }],
        },
        sharedWidgetConfig: {
            ...createKasharDemoWidgetConfig(),
            polls: [{ id: 'legacy-poll', question: 'סקר ותיק', options: [], active: true }],
        },
    };
    if (discriminator) draft.draftFormat = 'site-builder:kashar-draft';
    return draft;
}

function activeRecord(storage) {
    return JSON.parse(storage.getItem(KASHAR_DRAFT_STORAGE_KEY));
}

function imageFile() {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    return {
        name: 'kashar-logo.png',
        type: 'image/png',
        size: bytes.byteLength,
        arrayBuffer: async () => bytes.buffer.slice(0),
    };
}

function backupEntries(storage, reason) {
    return [...storage.values.entries()].filter(([key]) => key.includes(`:backup:${reason}:`));
}

describe('KasharDraftStore', () => {
    it('seeds a complete fixture draft once and keeps the fixture immutable', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const originalFixture = cloneKasharDemoData();

        const { draft, source } = await store.loadOrSeed();

        expect(source).toBe('kashar-draft-seeded');
        expect(draft).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            demoProfile: 'kashar',
            demoSeedVersion: 1,
            demoSchemaVersion: 1,
            revision: 1,
            configEnvelope: cloneKasharDemoData(),
        });
        expect(JSON.parse(storage.getItem(KASHAR_DRAFT_STORAGE_KEY))).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            demoProfile: 'kashar',
            configEnvelope: cloneKasharDemoData(),
        });
        expect(storage.getItem(KASHAR_DRAFT_STORAGE_KEY).length).toBeLessThan(5 * 1024 * 1024);

        draft.configEnvelope.content.hero.title = 'טיוטה בלבד';
        expect(cloneKasharDemoData()).toEqual(originalFixture);
    });

    it('returns the persisted draft and preserves every editable Kashar branch after reload', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const config = await store.getConfig();
        config.content.hero.title = 'כותרת שנשמרה';
        config.navigation.items[0].label = 'ניווט שנשמר';
        config.widgets.data.news.items = [{ id: 'news-edited', text: 'ווידג׳ט שנשמר', isUrgent: false }];
        config.externalLinks.items = [{ id: 'managed-link', title: 'קישור מנוהל שנשמר', url: 'https://example.test', visual: { type: 'none' }, order: 0 }];
        config.content.orgChart.nodes[0].name = 'עץ ארגוני שנשמר';
        config.imageGalleries.items[0].title = 'גלריה שנשמרה';
        await store.saveConfig(config);

        const gantt = await store.getGantt();
        gantt.items[0].title = 'משימת גאנט שנשמרה';
        await store.saveGantt(gantt);
        await store.saveSharedWidgetConfig({
            activeWidgets: ['polls'],
            polls: [{ id: 'poll-edited', question: 'סקר שנשמר', options: [], active: true }],
        });

        const reloaded = createStore(storage);
        const secondLoad = await reloaded.loadOrSeed();
        const persistedConfig = secondLoad.draft.configEnvelope;

        expect(secondLoad.source).toBe('kashar-draft');
        expect(persistedConfig.content.hero.title).toBe('כותרת שנשמרה');
        expect(persistedConfig.navigation.items[0].label).toBe('ניווט שנשמר');
        expect(persistedConfig.widgets.data.news.items[0].text).toBe('ווידג׳ט שנשמר');
        expect(persistedConfig.externalLinks.items[0].title).toBe('קישור מנוהל שנשמר');
        expect(persistedConfig.content.orgChart.nodes[0].name).toBe('עץ ארגוני שנשמר');
        expect(persistedConfig.imageGalleries.items[0].title).toBe('גלריה שנשמרה');
        expect(secondLoad.draft.gantt.items[0].title).toBe('משימת גאנט שנשמרה');
        expect(secondLoad.draft.sharedWidgetConfig.polls[0].question).toBe('סקר שנשמר');
        expect(secondLoad.draft.revision).toBe(4);
    });

    it('does not overwrite persisted edits when the seed-content version changes', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const draft = await store.getDraft();
        draft.demoSeedVersion = 2;
        draft.configEnvelope.content.hero.title = 'עריכה עם גרסת seed קודמת';
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, JSON.stringify(draft));

        await expect(createStore(storage).loadOrSeed()).resolves.toMatchObject({
            source: 'kashar-draft',
            draft: {
                demoSeedVersion: 2,
                configEnvelope: { content: { hero: { title: 'עריכה עם גרסת seed קודמת' } } },
            },
        });
    });

    it('loads a current canonical draft without modifying it', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const seeded = await store.getDraft();
        seeded.configEnvelope.content.hero.title = 'טיוטה קנונית קיימת';
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, JSON.stringify(seeded));
        const before = storage.getItem(KASHAR_DRAFT_STORAGE_KEY);

        await expect(createStore(storage).loadOrSeed()).resolves.toMatchObject({
            source: 'kashar-draft',
            draft: { configEnvelope: { content: { hero: { title: 'טיוטה קנונית קיימת' } } } },
        });
        expect(storage.getItem(KASHAR_DRAFT_STORAGE_KEY)).toBe(before);
    });

    it('migrates a previous wrapper without a discriminator and preserves every edited branch', async () => {
        const storage = new MemoryStorage();
        const legacy = legacyDraft();
        const raw = JSON.stringify(legacy);
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, raw);

        const loaded = await createStore(storage).loadOrSeed();

        expect(loaded).toMatchObject({ source: 'kashar-draft-migrated', notice: expect.any(String) });
        expect(loaded.draft.configEnvelope.content.hero.title).toBe('טיוטה ותיקה עם עריכות');
        expect(loaded.draft.configEnvelope.externalLinks.items[0].title).toBe('קישור מנוהל ותיק');
        expect(loaded.draft.configEnvelope.content.orgChart.nodes[0].name).toBe('עץ ארגוני ותיק');
        expect(loaded.draft.configEnvelope.imageGalleries.items[0].title).toBe('גלריה ותיקה');
        expect(loaded.draft.gantt.items[0].title).toBe('משימת גאנט ותיקה');
        expect(loaded.draft.sharedWidgetConfig.polls[0].question).toBe('סקר ותיק');
        expect(activeRecord(storage)).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            migration: { from: 'previous_wrapper_without_discriminator' },
        });
        expect(backupEntries(storage, 'migration')).toEqual([expect.arrayContaining([expect.any(String), raw])]);
    });

    it('recognizes safely identifiable older metadata names without accepting an arbitrary profile', () => {
        expect(decodeKasharDraft(JSON.stringify(legacyDraft({ metadata: 'legacy' })))).toMatchObject({
            classification: 'migrated',
            reason: 'previous_wrapper_with_legacy_metadata',
        });
        const unrelated = legacyDraft({ metadata: 'legacy' });
        unrelated.profile = 'another-site';
        expect(decodeKasharDraft(JSON.stringify(unrelated))).toMatchObject({ classification: 'invalid', reason: 'wrong_demo_profile' });
    });

    it('migrates a positively recognized raw Kashar config envelope', async () => {
        const storage = new MemoryStorage();
        const rawConfig = cloneKasharDemoData();
        rawConfig.content.hero.title = 'מעטפת קאשאר גולמית';
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, JSON.stringify(rawConfig));

        await expect(createStore(storage).loadOrSeed()).resolves.toMatchObject({
            source: 'kashar-draft-migrated',
            draft: { configEnvelope: { content: { hero: { title: 'מעטפת קאשאר גולמית' } } } },
        });
        expect(activeRecord(storage).migration).toMatchObject({ from: 'raw_kashar_config_envelope' });
    });

    it('migrates a double-serialized recognized legacy draft', async () => {
        const storage = new MemoryStorage();
        const raw = JSON.stringify(JSON.stringify(legacyDraft({ discriminator: true })));
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, raw);

        await expect(createStore(storage).loadOrSeed()).resolves.toMatchObject({
            source: 'kashar-draft-migrated',
            draft: { configEnvelope: { content: { hero: { title: 'טיוטה ותיקה עם עריכות' } } } },
        });
        expect(backupEntries(storage, 'migration')[0][1]).toBe(raw);
    });

    it('accepts a downloaded recovery diagnostic through the same decoder', async () => {
        const storage = new MemoryStorage();
        const raw = JSON.stringify(legacyDraft());
        const diagnostic = JSON.stringify({
            kind: 'site-builder-kashar-draft-diagnostic',
            capturedAt: '2026-08-04T10:00:00.000Z',
            raw,
        });

        await createStore(storage).importDraftText(diagnostic);

        expect(activeRecord(storage)).toMatchObject({
            format: KASHAR_DRAFT_FORMAT,
            configEnvelope: { content: { hero: { title: 'טיוטה ותיקה עם עריכות' } } },
        });
    });

    it('classifies unrelated and corrupt JSON as invalid without accepting generic envelopes', () => {
        expect(decodeKasharDraft(JSON.stringify({ demoProfile: 'another-site' }))).toMatchObject({
            classification: 'invalid',
            reason: 'wrong_demo_profile',
        });
        expect(decodeKasharDraft('{not-json')).toMatchObject({ classification: 'invalid', reason: 'invalid_json' });
        expect(decodeKasharDraft(JSON.stringify({ configEnvelope: { schemaVersion: '1.0.0', content: { hero: { title: 'Generic' } } } }))).toMatchObject({
            classification: 'invalid',
        });
    });

    it('fills a missing optional field without replacing an edited field', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const draft = await store.getDraft();
        draft.configEnvelope.content.hero.title = 'כותרת משתמש שנשמרה';
        delete draft.configEnvelope.content.hero.description;
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, JSON.stringify(draft));

        const restored = await createStore(storage).getConfig();

        expect(restored.content.hero.title).toBe('כותרת משתמש שנשמרה');
        expect(restored.content.hero.description).toEqual(expect.any(String));
    });

    it('resets only the local Kashar draft back to the current fixture', async () => {
        const storage = new MemoryStorage();
        const otherSiteKey = 'site-builder:site:alpha:draft:v1';
        const otherSiteDraft = JSON.stringify({ title: 'Unrelated Site Builder site' });
        storage.setItem(otherSiteKey, otherSiteDraft);
        const store = createStore(storage);
        const config = await store.getConfig();
        config.content.hero.title = 'עריכה למחיקה';
        await store.saveConfig(config);

        const reset = await store.reset();

        expect(reset.configEnvelope).toEqual(cloneKasharDemoData());
        expect(reset.revision).toBe(3);
        expect([...storage.values.keys()].some((key) => key.includes(':backup:pre-reset:'))).toBe(true);
        expect(storage.getItem(otherSiteKey)).toBe(otherSiteDraft);
    });

    it('writes the same canonical wrapper for config, Gantt, widget, and poll save paths', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const config = await store.getConfig();
        config.navigation.items[0].label = 'ניווט דרך מעטפת';
        await store.saveConfig(config);
        expect(activeRecord(storage)).toMatchObject({ format: KASHAR_DRAFT_FORMAT, configEnvelope: config });

        const gantt = await store.getGantt();
        gantt.items[0].title = 'גאנט דרך מעטפת';
        await store.saveGantt(gantt);
        expect(activeRecord(storage).format).toBe(KASHAR_DRAFT_FORMAT);
        expect(activeRecord(storage).gantt.items[0].title).toBe('גאנט דרך מעטפת');

        await store.saveSharedWidgetConfig({
            activeWidgets: ['polls'],
            polls: [{ id: 'poll-only', question: 'סקר דרך מעטפת', options: [], active: true }],
        });
        const afterPoll = activeRecord(storage);
        expect(afterPoll.format).toBe(KASHAR_DRAFT_FORMAT);
        expect(afterPoll.configEnvelope.navigation.items[0].label).toBe('ניווט דרך מעטפת');
        expect(afterPoll.gantt.items[0].title).toBe('גאנט דרך מעטפת');
        expect(afterPoll.sharedWidgetConfig.polls[0].question).toBe('סקר דרך מעטפת');
    });

    it('serializes overlapping writes and retains the newest complete revision', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const first = await store.getConfig();
        const latest = await store.getConfig();
        first.content.hero.title = 'עריכה ישנה';
        latest.content.hero.title = 'עריכה חדשה';

        await Promise.all([store.saveConfig(first), store.saveConfig(latest)]);

        expect(activeRecord(storage)).toMatchObject({
            revision: 3,
            configEnvelope: { content: { hero: { title: 'עריכה חדשה' } } },
        });
    });

    it('exports a complete snapshot and validates an import before replacing the current draft', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const config = await store.getConfig();
        config.content.hero.title = 'טיוטה לייצוא';
        await store.saveConfig(config);
        const exported = await store.exportDraft();

        const current = await store.getConfig();
        current.content.hero.title = 'טיוטה נוכחית';
        await store.saveConfig(current);
        const beforeInvalidImport = storage.getItem(KASHAR_DRAFT_STORAGE_KEY);

        await expect(store.importDraftText(JSON.stringify({ demoProfile: 'another-site' }))).rejects.toMatchObject({
            code: 'invalid_import',
        });
        expect(storage.getItem(KASHAR_DRAFT_STORAGE_KEY)).toBe(beforeInvalidImport);

        await store.importDraftText(JSON.stringify(exported));
        await expect(createStore(storage).getConfig()).resolves.toMatchObject({
            content: { hero: { title: 'טיוטה לייצוא' } },
        });
        expect([...storage.values.keys()].some((key) => key.includes(':backup:pre-import:'))).toBe(true);
    });

    it('exports, imports, and resets referenced user-uploaded assets without changing the fixture paths', async () => {
        vi.stubGlobal('indexedDB', new IDBFactory());
        const originalReadDimensions = kasharAssetStore.readDimensions;
        kasharAssetStore.readDimensions = async () => ({ width: 640, height: 480 });
        try {
            const storage = new MemoryStorage();
            const store = createStore(storage);
            const uploaded = await kasharAssetStore.put(imageFile(), { category: 'Logo' });
            const edited = await store.getConfig();
            edited.content.hero.logoUrl = uploaded.reference;
            edited.content.hero.title = 'טיוטה עם סמל שהועלה';
            await store.saveConfig(edited);

            const workspace = await store.exportWorkspace();
            expect(workspace).toMatchObject({
                format: 'site-builder-kashar-workspace-export',
                demoProfile: 'kashar',
                assets: [expect.objectContaining({
                    id: uploaded.id,
                    reference: uploaded.reference,
                    binaryBase64: expect.any(String),
                })],
            });

            const changed = await store.getConfig();
            changed.content.hero.title = 'עריכה לאחר הייצוא';
            await store.saveConfig(changed);
            await store.importWorkspaceText(JSON.stringify(workspace));
            await expect(store.getConfig()).resolves.toMatchObject({
                content: { hero: { title: 'טיוטה עם סמל שהועלה', logoUrl: uploaded.reference } },
            });
            await expect(kasharAssetStore.exists(uploaded.reference)).resolves.toBe(true);

            const reset = await store.reset();
            expect(reset.configEnvelope).toEqual(cloneKasharDemoData());
            await expect(kasharAssetStore.exists(uploaded.reference)).resolves.toBe(false);
        } finally {
            kasharAssetStore.revokeAllObjectUrls();
            kasharAssetStore.readDimensions = originalReadDimensions;
            vi.unstubAllGlobals();
        }
    });

    it('preserves malformed drafts in a recovery backup rather than silently reseeding', async () => {
        const storage = new MemoryStorage();
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, '{not-json');

        await expect(createStore(storage).loadOrSeed()).rejects.toMatchObject({
            code: 'invalid_stored_draft',
        });
        expect(storage.getItem(KASHAR_DRAFT_STORAGE_KEY)).toBe('{not-json');
        expect([...storage.values.keys()].some((key) => key.includes(':backup:invalid:'))).toBe(true);
    });

    it('deduplicates invalid backups across repeated load attempts and keeps them through reset', async () => {
        const storage = new MemoryStorage();
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, '{not-json');
        const store = createStore(storage);

        await expect(store.loadOrSeed()).rejects.toMatchObject({ code: 'invalid_stored_draft' });
        await expect(store.loadOrSeed()).rejects.toMatchObject({ code: 'invalid_stored_draft' });
        const invalidBeforeReset = backupEntries(storage, 'invalid');
        expect(invalidBeforeReset).toHaveLength(1);

        await store.reset();

        expect(backupEntries(storage, 'invalid')).toEqual(invalidBeforeReset);
        expect(activeRecord(storage).format).toBe(KASHAR_DRAFT_FORMAT);
    });

    it('provides redacted metadata for every namespaced recovery record without exposing raw values', async () => {
        const storage = new MemoryStorage();
        storage.setItem(KASHAR_DRAFT_STORAGE_KEY, '{not-json');
        const store = createStore(storage);
        await expect(store.loadOrSeed()).rejects.toMatchObject({ code: 'invalid_stored_draft' });

        const inspection = await store.inspect();

        expect(inspection.records).toEqual(expect.arrayContaining([
            expect.objectContaining({
                key: KASHAR_DRAFT_STORAGE_KEY,
                byteSize: 9,
                jsonParseResult: 'invalid',
                topLevelType: null,
                topLevelKeys: [],
                classification: 'invalid',
            }),
        ]));
        expect(inspection.records.some((record) => Object.hasOwn(record, 'raw'))).toBe(false);
    });

    it('surfaces a failed write and keeps the previous valid draft intact', async () => {
        const storage = new MemoryStorage();
        const store = createStore(storage);
        const config = await store.getConfig();
        const before = storage.getItem(KASHAR_DRAFT_STORAGE_KEY);
        config.content.hero.title = 'כתיבה שתיכשל';
        storage.failWrites = true;

        await expect(store.saveConfig(config)).rejects.toMatchObject({ code: 'write_failed' });
        storage.failWrites = false;
        expect(storage.getItem(KASHAR_DRAFT_STORAGE_KEY)).toBe(before);
        await expect(store.getConfig()).resolves.not.toMatchObject({
            content: { hero: { title: 'כתיבה שתיכשל' } },
        });
    });
});
