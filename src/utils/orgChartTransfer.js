import { z } from 'zod';
import { normalizeOrgChartInput } from '../context/OrgChartContext';

export const ORG_CHART_EXPORT_TYPE = 'site-builder-org-chart-export';
export const ORG_CHART_EXPORT_FORMAT_VERSION = 1;

const finiteNumber = z.number().finite();
const nodeSchema = z.lazy(() => z.object({
    id: z.string().trim().min(1),
    name: z.string(),
    rank: z.string(),
    role: z.string(),
    personalNumber: z.string(),
    imageUrl: z.string(),
    children: z.array(nodeSchema),
}).strict());

const orgChartSchema = z.object({
    enabled: z.boolean(),
    pageTitle: z.string(),
    layoutDirection: z.string(),
    cardStyle: z.string(),
    lineStyle: z.string(),
    avatarShape: z.string(),
    graph3d: z.record(z.string(), z.unknown()),
    flowCanvas: z.record(z.string(), z.unknown()),
    nodePositions: z.record(z.string(), z.object({ x: finiteNumber, y: finiteNumber }).strict()),
    nodes: z.array(nodeSchema),
}).strict();

const exportEnvelopeSchema = z.object({
    type: z.literal(ORG_CHART_EXPORT_TYPE),
    formatVersion: z.literal(ORG_CHART_EXPORT_FORMAT_VERSION),
    exportedAt: z.string().datetime(),
    appVersion: z.string().optional(),
    orgChart: orgChartSchema,
}).strict();

function assertUniqueNodeIds(nodes, seen = new Set()) {
    for (const node of nodes) {
        if (seen.has(node.id)) {
            throw new Error(`קובץ הייבוא מכיל מזהה צומת כפול: ${node.id}`);
        }
        seen.add(node.id);
        assertUniqueNodeIds(node.children, seen);
    }
}

export function createOrgChartExportEnvelope(orgChart, options = {}) {
    const normalized = normalizeOrgChartInput(orgChart);
    const envelope = {
        type: ORG_CHART_EXPORT_TYPE,
        formatVersion: ORG_CHART_EXPORT_FORMAT_VERSION,
        exportedAt: options.exportedAt || new Date().toISOString(),
        ...(options.appVersion ? { appVersion: String(options.appVersion) } : {}),
        orgChart: normalized,
    };
    return exportEnvelopeSchema.parse(envelope);
}

export function serializeOrgChartExport(orgChart, options = {}) {
    return JSON.stringify(createOrgChartExportEnvelope(orgChart, options), null, 2);
}

export function parseOrgChartExport(input) {
    let parsed;
    try {
        parsed = typeof input === 'string' ? JSON.parse(input) : input;
    } catch {
        throw new Error('קובץ ה-JSON אינו תקין.');
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('הקובץ אינו ייצוא תקין של Site Builder.');
    }
    if (parsed.type !== ORG_CHART_EXPORT_TYPE) {
        throw new Error('הקובץ אינו ייצוא רשמי של עץ מבנה מ-Site Builder.');
    }
    if (parsed.formatVersion !== ORG_CHART_EXPORT_FORMAT_VERSION) {
        throw new Error(`גרסת קובץ הייצוא אינה נתמכת: ${String(parsed.formatVersion ?? 'חסרה')}.`);
    }

    const result = exportEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error('מבנה קובץ הייצוא פגום או חסרים בו שדות נדרשים.');
    }
    assertUniqueNodeIds(result.data.orgChart.nodes);
    return normalizeOrgChartInput(result.data.orgChart);
}

export function createOrgChartExportFilename(date = new Date()) {
    const pad = (value) => String(value).padStart(2, '0');
    return `site-builder-org-chart-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.json`;
}
