import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG_V1 } from '../config/AppSchema';
import {
    createOrgChartDraftFromExtraction,
    validateOrgChartAiFile,
} from './orgChartAiImport';

describe('orgChartAiImport', () => {
    it('accepts supported files and rejects unsupported or oversized files', () => {
        expect(() => validateOrgChartAiFile(new File(['x'], 'tree.xlsx', {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }))).not.toThrow();
        expect(() => validateOrgChartAiFile(new File(['x'], 'tree.exe'))).toThrow(/אינו נתמך/);
        expect(() => validateOrgChartAiFile({ name: 'tree.pdf', size: 21 * 1024 * 1024 }, 20)).toThrow(/גדול/);
    });

    it('replaces nodes while preserving every current visual setting', () => {
        const current = {
            ...DEFAULT_CONFIG_V1.content.orgChart,
            enabled: true,
            pageTitle: 'המבנה שלי',
            layoutDirection: '3d-graph',
            nodePositions: { old: { x: 12, y: 34 } },
        };
        const next = createOrgChartDraftFromExtraction(current, {
            nodes: [{
                id: 'new-root',
                name: 'אגף',
                rank: '',
                role: '',
                personalNumber: '',
                imageUrl: '',
                children: [],
                unexpected: 'removed',
            }],
        });
        expect(next.nodes).toEqual([{
            id: 'new-root',
            name: 'אגף',
            rank: '',
            role: '',
            personalNumber: '',
            imageUrl: '',
            children: [],
        }]);
        expect(next).toMatchObject({
            enabled: true,
            pageTitle: 'המבנה שלי',
            layoutDirection: '3d-graph',
            nodePositions: { old: { x: 12, y: 34 } },
        });
    });

    it('rejects duplicate IDs without mutating the source draft', () => {
        const current = structuredClone(DEFAULT_CONFIG_V1.content.orgChart);
        const before = structuredClone(current);
        expect(() => createOrgChartDraftFromExtraction(current, {
            nodes: [
                { id: 'same', children: [] },
                { id: 'same', children: [] },
            ],
        })).toThrow(/כפולים/);
        expect(current).toEqual(before);
    });
});
