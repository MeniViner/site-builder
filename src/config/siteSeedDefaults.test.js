import { describe, expect, it } from 'vitest';
import { SITE_BUILDER_DATA_SCHEMA_VERSION } from './siteBuilderContract';
import { buildCanonicalLegacySeedEntries, buildCanonicalLegacySeedTexts } from './siteSeedDefaults';

describe('site seed defaults', () => {
    it('builds the canonical Mongo and SharePoint seed defaults from one shared source', () => {
        const entries = buildCanonicalLegacySeedEntries({ today: new Date('2026-09-14T00:00:00.000Z') });

        expect(entries.map((entry) => entry.fileName)).toEqual([
            'bihs_master_config_v1.txt',
            'users_data.txt',
            'events_data.txt',
            'nav_data.txt',
            'site_content_data.txt',
            'theme_data.txt',
            'widgets_data.txt',
            'external_links_data.txt',
            'gantt_data.txt',
            'boom_data.txt',
        ]);
        expect(entries[0].data.schemaVersion).toBe(SITE_BUILDER_DATA_SCHEMA_VERSION);
        expect(entries.find((entry) => entry.key === 'users')?.data).toHaveLength(2);
        expect(entries.find((entry) => entry.key === 'events')?.data).toMatchObject({
            displayCount: 3,
            displayMode: 'default',
        });
        expect(entries.find((entry) => entry.key === 'events')?.data.events.length).toBeGreaterThan(0);
        expect(entries.find((entry) => entry.key === 'widgets')?.data.activeWidgets).toEqual([
            'events',
            'countdown',
            'polls',
        ]);
        expect(entries.find((entry) => entry.key === 'boom')?.data.items.length).toBeGreaterThan(0);
    });

    it('serializes shared defaults without mutating the canonical data objects', () => {
        const entries = buildCanonicalLegacySeedEntries();
        const texts = buildCanonicalLegacySeedTexts();

        expect(texts).toHaveLength(entries.length);
        expect(JSON.parse(texts[0].text)).toEqual(entries[0].data);
        expect(texts[0]).not.toHaveProperty('serverRelativeUrl');
    });
});
