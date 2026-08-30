import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_V1 } from '../config/AppSchema';
import {
    ORG_CHART_EXPORT_FORMAT_VERSION,
    ORG_CHART_EXPORT_TYPE,
    createOrgChartExportEnvelope,
    parseOrgChartExport,
    serializeOrgChartExport,
} from './orgChartTransfer';

const sample = {
    ...DEFAULT_CONFIG_V1.content.orgChart,
    pageTitle: 'עץ בדיקה',
    nodes: [{
        id: 'root',
        name: 'נועה',
        rank: 'סרן',
        role: 'מפקדת',
        personalNumber: '1234567',
        imageUrl: '/images/noa.jpg',
        children: [],
    }],
};

describe('orgChartTransfer', () => {
    it('creates the versioned Site Builder export envelope', () => {
        const envelope = createOrgChartExportEnvelope(sample, {
            exportedAt: '2026-08-30T12:00:00.000Z',
            appVersion: '1.2.3',
        });
        expect(envelope).toMatchObject({
            type: ORG_CHART_EXPORT_TYPE,
            formatVersion: ORG_CHART_EXPORT_FORMAT_VERSION,
            exportedAt: '2026-08-30T12:00:00.000Z',
            appVersion: '1.2.3',
        });
    });

    it('round trips an exported normalized Org Chart', () => {
        const serialized = serializeOrgChartExport(sample, { exportedAt: '2026-08-30T12:00:00.000Z' });
        expect(parseOrgChartExport(serialized)).toEqual(createOrgChartExportEnvelope(sample, {
            exportedAt: '2026-08-30T12:00:00.000Z',
        }).orgChart);
    });

    it('rejects arbitrary JSON', () => {
        expect(() => parseOrgChartExport(JSON.stringify({ nodes: sample.nodes }))).toThrow(/אינו ייצוא רשמי/);
    });

    it('rejects unsupported versions', () => {
        const envelope = createOrgChartExportEnvelope(sample, { exportedAt: '2026-08-30T12:00:00.000Z' });
        expect(() => parseOrgChartExport({ ...envelope, formatVersion: 99 })).toThrow(/אינה נתמכת/);
    });

    it('rejects malformed Org Chart payloads', () => {
        const envelope = createOrgChartExportEnvelope(sample, { exportedAt: '2026-08-30T12:00:00.000Z' });
        expect(() => parseOrgChartExport({ ...envelope, orgChart: { nodes: 'invalid' } })).toThrow(/פגום/);
    });
});
