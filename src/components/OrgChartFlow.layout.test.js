import { describe, expect, it } from 'vitest';
import { buildCenteredTreePositions, buildCompactTreePositions } from './OrgChartFlow';

function wideTree() {
    return [{
        id: 'root',
        children: Array.from({ length: 10 }, (_, index) => ({
            id: `child-${index}`,
            children: Array.from({ length: 4 }, (__, childIndex) => ({
                id: `leaf-${index}-${childIndex}`,
                children: [],
            })),
        })),
    }];
}

const width = (positions) => {
    const xs = Object.values(positions).map((position) => position.x);
    return Math.max(...xs) - Math.min(...xs);
};

describe('compact Org Chart layout', () => {
    it('keeps every node while substantially reducing horizontal width', () => {
        const tree = wideTree();
        const centered = buildCenteredTreePositions(tree);
        const compact = buildCompactTreePositions(tree);
        expect(Object.keys(compact)).toHaveLength(Object.keys(centered).length);
        expect(width(compact)).toBeLessThan(width(centered) / 2);
        expect(new Set(Object.values(compact).map(({ x, y }) => `${x}:${y}`)).size)
            .toBe(Object.keys(compact).length);
    });
});
