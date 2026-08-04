import { describe, expect, it } from 'vitest';
import { validateAndNormalize } from '../config/AppSchema';
import {
    cloneKasharDemoData,
    createKasharDemoWidgetConfig,
    kasharDemoData,
} from './kasharDemoData';

function collectNavigationIds(nodes, target = []) {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        target.push(node.id);
        collectNavigationIds(node.children, target);
    });
    return target;
}

describe('Kashar demo data', () => {
    it('conforms to the existing master-config schema without normalization changes', () => {
        expect(validateAndNormalize(kasharDemoData)).toEqual(kasharDemoData);
        expect(kasharDemoData.content.hero).toMatchObject({
            siteName: 'פורטל קשר״ר',
            title: 'מחברים בין אנשים, ידע ויכולת מבצעית',
        });
    });

    it('keeps navigation IDs and widget relationships internally consistent', () => {
        const navigationIds = collectNavigationIds(kasharDemoData.navigation.items);
        expect(new Set(navigationIds).size).toBe(navigationIds.length);
        expect(kasharDemoData.navigation.items.map((item) => item.label)).toEqual([
            'ראשי',
            'מרכז הידע',
            'הכשרות וכשירות',
            'שירותים ובקשות',
            'עדכונים',
            'אודות',
        ]);

        const countdownIds = new Set(kasharDemoData.widgets.data.countdown.items.map((item) => item.id));
        const activeCountdownId = kasharDemoData.widgets.data.countdown.activeItemId;
        expect(activeCountdownId === null || countdownIds.has(activeCountdownId)).toBe(true);

        const pollIds = new Set(kasharDemoData.widgets.data.polls.items.map((item) => item.id));
        const activePollId = kasharDemoData.widgets.data.polls.activePollId;
        expect(activePollId === null || pollIds.has(activePollId)).toBe(true);
    });

    it('returns safe clones and exposes a compatible local legacy-widget response', () => {
        const first = cloneKasharDemoData();
        first.content.hero.title = 'changed only in memory';
        first.navigation.items[0].label = 'changed only in memory';

        expect(kasharDemoData.content.hero.title).toBe('מחברים בין אנשים, ידע ויכולת מבצעית');
        expect(kasharDemoData.navigation.items[0].label).toBe('ראשי');

        expect(createKasharDemoWidgetConfig()).toMatchObject({
            activeWidgets: ['news', 'events', 'tips'],
            polls: [],
            news: kasharDemoData.widgets.data.news.items,
        });
    });
});
