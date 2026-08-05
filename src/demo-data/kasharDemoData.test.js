import { describe, expect, it } from 'vitest';
import { validateAndNormalize } from '../config/AppSchema';
import { ICON_CATEGORIES } from '../utils/iconsData';
import { normalizeGanttData } from '../utils/ganttData';
import {
    cloneKasharDemoData,
    cloneKasharDemoGanttData,
    createKasharDemoWidgetConfig,
    kasharDemoData,
    kasharDemoGanttData,
    kasharFinalData,
} from './kasharDemoData';

function collectNavigation(nodes, target = []) {
    (Array.isArray(nodes) ? nodes : []).forEach((node) => {
        target.push(node);
        collectNavigation(node.children, target);
    });
    return target;
}

describe('Kashar demo data', () => {
    it('conforms to the existing master-config schema without normalization changes', () => {
        expect(validateAndNormalize(kasharDemoData)).toEqual(kasharDemoData);
        expect(kasharDemoData.content.hero).toMatchObject({
            siteName: 'קשר״ר וחטיבת ההפעלה',
            title: 'מחברים בין אנשים, ידע ויכולת מבצעית',
            subtitle: 'פורטל הידע, הניהול והשירותים',
        });
        expect(kasharFinalData.organization.shortName).toBe('קשר״ר');
    });

    it('contains the complete, valid three-level navigation and the synthetic network-folder target', () => {
        const navigation = kasharDemoData.navigation.items;
        const allItems = collectNavigation(navigation);
        const rawItems = collectNavigation(kasharFinalData.navigation);
        const approvedIcons = new Set(ICON_CATEGORIES.flatMap((category) => category.icons));

        expect(navigation.map((item) => item.label)).toEqual(['מטה וניהול', 'הפעלת כוח', 'בניין כוח ומקצועיות']);
        expect(navigation.every((root) => root.children.length === 3)).toBe(true);
        expect(navigation.flatMap((root) => root.children).map((section) => section.children.length)).toEqual([
            4, 3, 3, 3, 3, 3, 3, 3, 3,
        ]);
        expect(new Set(allItems.map((item) => item.id)).size).toBe(allItems.length);
        expect(allItems.every((item) => approvedIcons.has(item.icon))).toBe(true);

        const rawNetworkFolder = rawItems.find((item) => item.id === 'kashar-knowledge-repository');
        expect(rawNetworkFolder).toMatchObject({
            kind: 'network-folder',
            label: 'מאגר תו״ל, הדרכה וידע מקצועי',
            url: '\\\\KASHAR-DEMO\\Shared\\Professional-Knowledge',
        });
        expect(allItems.find((item) => item.id === 'kashar-knowledge-repository')).toMatchObject({ kind: 'link' });
    });

    it('enables the supported org tree, galleries, and safe presentation widgets', () => {
        const { orgChart } = kasharDemoData.content;
        expect(orgChart).toMatchObject({ enabled: true, layoutDirection: 'flow-canvas', cardStyle: 'horizontal' });
        expect(orgChart.nodes[0].children).toHaveLength(4);
        expect(orgChart.nodes[0].children.flatMap((branch) => branch.children)).toHaveLength(8);
        expect(orgChart.nodes[0].children.every((branch) => branch.children.length === 2)).toBe(true);
        expect(orgChart.nodes[0].personalNumber).toBe('');

        expect(kasharDemoData.imageGalleries.items).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'kashar-gallery-highlights', style: 'classic-carousel', active: true }),
            expect.objectContaining({ id: 'kashar-gallery-magal', style: 'magal-strips', active: true }),
        ]));
        expect(kasharDemoData.imageGalleries.items.find((item) => item.id === 'kashar-gallery-magal').images).toHaveLength(9);
        expect(kasharDemoData.widgets.active).toEqual(['news', 'events', 'heritage']);
        expect(kasharDemoData.content.commander).toMatchObject({
            sectionTitle: 'תא״ל עומר כהן',
            roleLabel: 'קצין הקשר והתקשוב הראשי וראש חטיבת ההפעלה',
            imageUrl: '',
        });
    });

    it('keeps the specialist Gantt payload normalized, linked, and synthetic', () => {
        const gantt = cloneKasharDemoGanttData();
        const itemIds = new Set(gantt.items.map((item) => item.id));

        expect(normalizeGanttData(kasharDemoGanttData)).toEqual(kasharDemoGanttData);
        expect(gantt).toMatchObject({ enabled: true, defaultView: 'quarter', groupBy: 'category' });
        expect(gantt.items).toHaveLength(7);
        expect(gantt.items.every((item) => item.startDate <= item.endDate)).toBe(true);
        expect(gantt.items.some((item) => item.milestones.length > 0)).toBe(true);
        expect(gantt.items.some((item) => item.dependsOn.length > 0)).toBe(true);
        expect(gantt.items.flatMap((item) => item.dependsOn).every((dependency) => itemIds.has(dependency))).toBe(true);
        expect(gantt.items.map((item) => item.status)).toEqual(expect.arrayContaining(['completed', 'planned', 'onHold']));
    });

    it('returns safe clones and exposes a compatible local legacy-widget response', () => {
        const first = cloneKasharDemoData();
        first.content.hero.title = 'changed only in memory';
        first.navigation.items[0].label = 'changed only in memory';

        expect(kasharDemoData.content.hero.title).toBe('מחברים בין אנשים, ידע ויכולת מבצעית');
        expect(kasharDemoData.navigation.items[0].label).toBe('מטה וניהול');
        expect(createKasharDemoWidgetConfig()).toMatchObject({
            activeWidgets: ['news', 'events', 'heritage'],
            polls: [],
            news: kasharDemoData.widgets.data.news.items,
        });
    });
});
