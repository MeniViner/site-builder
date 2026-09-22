import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import RankInsignia from './RankInsignia';
import RankPresentation, { PRESENTATION_STYLES } from './RankPresentation';
import { RANK_CATALOG, RANK_GROUPS } from './rankCatalog';
import { resolveSiteImageUrl } from '../../utils/assetUrl';

describe('RANK_CATALOG', () => {
    it('maps every commander rank exactly once without academic ranks', () => {
        const groupedRanks = RANK_GROUPS.flatMap((group) => group.ranks);
        expect(new Set(groupedRanks)).toEqual(new Set(Object.keys(RANK_CATALOG)));
        expect(groupedRanks).not.toContain('קמ"א');
        expect(groupedRanks).not.toContain('קא"ב');
    });

    it('renders Turai with no fabricated insignia', () => {
        const { container } = render(<RankInsignia rank="טוראי" />);
        expect(container.querySelector('[data-empty-insignia="true"]')).toBeInTheDocument();
        expect(container.querySelector('[data-mark]')).not.toBeInTheDocument();
    });

    it.each(Object.entries(RANK_CATALOG).filter(([, definition]) => definition.asset))('renders %s from its dedicated reference asset', (rank, definition) => {
        const { container } = render(<RankInsignia rank={rank} />);
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('href', resolveSiteImageUrl(`/images/idf-ranks/${definition.asset}`));
    });

    it('maps every military insignia to a unique asset', () => {
        const assets = Object.values(RANK_CATALOG).map((definition) => definition.asset).filter(Boolean);
        expect(assets).toHaveLength(17);
        expect(new Set(assets)).toHaveLength(17);
    });

    it('renders civilian employees with a non-military identity mark', () => {
        const { container } = render(<RankInsignia rank={'אזרח עובד צה"ל'} />);
        expect(container.querySelector('[data-mark="civilian-identity"]')).toBeInTheDocument();
        expect(container.querySelector('[data-mark="officer-bar"], [data-mark="officer-leaf"], [data-mark="star"], [data-mark="crossed-sword-branch"]')).not.toBeInTheDocument();
    });

    it('keeps native orientations unchanged and rotates only toward the requested orientation', () => {
        const { container, rerender } = render(<RankInsignia rank="סגן" orientation="portrait" />);
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('data-rank-rotated', 'false');
        expect(container.querySelector('[data-rank-orientation]')).toHaveAttribute('data-rank-orientation', 'portrait');

        rerender(<RankInsignia rank="סגן" orientation="landscape" />);
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('data-rank-rotated', 'true');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('transform', 'rotate(90 120 48)');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('width', '96');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('height', '240');

        rerender(<RankInsignia rank={'רב"ט'} orientation="portrait" />);
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('data-rank-rotated', 'true');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('width', '96');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('height', '38.4');
    });

    it('combines quarter-turn rotation and mirror without changing image aspect handling', () => {
        const { container } = render(<RankInsignia rank="סגן" orientation="portrait" rotation={90} mirrored />);
        expect(container.querySelector('[data-rank-rotation]')).toHaveAttribute('data-rank-rotation', '90');
        expect(container.querySelector('[data-rank-mirrored]')).toHaveAttribute('data-rank-mirrored', 'true');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('transform', 'rotate(90 120 48)');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
        expect(container.querySelector('[data-rank-mirror-transform]')).toHaveAttribute('transform', 'translate(240 0) scale(-1 1)');
    });
});

describe('RankPresentation', () => {
    it.each(Object.entries(PRESENTATION_STYLES))('applies an optional preset background to the %s presentation without changing insignia colors', (styleId, colors) => {
        const { container } = render(
            <RankPresentation rank="סגן" styleId={styleId} backgroundColor="#dc2626" />
        );

        expect(container.querySelector('[data-rank-presentation-surface]'))
            .toHaveAttribute('fill', '#dc2626');
        expect(container.querySelector('svg[data-rank]')).toHaveStyle({
            color: colors.insignia,
        });
    });

    it('preserves the existing style surface when no optional background is selected', () => {
        const { container } = render(<RankPresentation rank="סגן" styleId="formal" />);

        expect(container.querySelector('[data-rank-presentation-surface]'))
            .toHaveAttribute('fill', PRESENTATION_STYLES.formal.surface);
    });

    it('keeps the minimal presentation undecorated when applying a preset background', () => {
        const { container } = render(
            <RankPresentation rank="סגן" styleId="minimal" backgroundColor="#dc2626" />
        );

        expect(container.querySelector('svg > g[aria-hidden="true"] path')).not.toBeInTheDocument();
    });

    it.each(Object.keys(PRESENTATION_STYLES))('keeps rank identity unchanged in %s mode', (styleId) => {
        const { container } = render(<RankPresentation rank={'סמ"ר'} styleId={styleId} />);
        expect(container.querySelector('[data-rank-style]')).toHaveAttribute('data-rank-style', styleId);
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('href', resolveSiteImageUrl('/images/idf-ranks/samar.png'));
    });
});

describe('rank asset resolution through resolveSiteImageUrl', () => {
    afterEach(() => {
        vi.doUnmock('../../utils/assetUrl');
        vi.resetModules();
    });

    it('routes every rank asset href through resolveSiteImageUrl for a nested deployment base, never a bare imagesRoot path', async () => {
        const NESTED_DEPLOYMENT_BASE = '/sites/example-org/SiteAssets/nested-app';
        vi.resetModules();
        vi.doMock('../../utils/assetUrl', () => ({
            resolveSiteImageUrl: vi.fn((value) => `${NESTED_DEPLOYMENT_BASE}${value}`),
        }));

        const { default: NestedRankInsignia } = await import('./RankInsignia');
        const { resolveSiteImageUrl: mockedResolveSiteImageUrl } = await import('../../utils/assetUrl');

        const assetEntries = Object.entries(RANK_CATALOG).filter(([, definition]) => definition.asset);
        // Artifact coverage: every rank asset in the catalog must be exercised.
        expect(assetEntries).toHaveLength(17);

        assetEntries.forEach(([rank, definition]) => {
            const { container, unmount } = render(<NestedRankInsignia rank={rank} />);
            const expectedHref = `${NESTED_DEPLOYMENT_BASE}/images/idf-ranks/${definition.asset}`;
            expect(mockedResolveSiteImageUrl).toHaveBeenCalledWith(`/images/idf-ranks/${definition.asset}`);
            expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('href', expectedHref);
            expect(container.querySelector('[data-rank-asset]')).not.toHaveAttribute('href', `/images/idf-ranks/${definition.asset}`);
            unmount();
        });

        expect(mockedResolveSiteImageUrl).not.toHaveBeenCalledWith(expect.stringContaining('imagesRoot'));
    });
});