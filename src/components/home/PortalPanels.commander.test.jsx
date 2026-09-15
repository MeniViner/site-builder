import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommanderPanel } from './PortalPanels';
import { RANK_GROUPS, getRankDefinition } from '../commanderRanks/rankCatalog';

const COMMANDER_RANKS = RANK_GROUPS.flatMap((group) => group.ranks);

describe('CommanderPanel image geometry', () => {
    it('renders persisted Commander scale and horizontal position', () => {
        render(
            <CommanderPanel
                commander={{
                    image: '/images/commander.png',
                    imageScale: 205,
                    imageOffsetX: -118,
                    imageOffsetY: 74,
                    roleLabel: 'מפקד',
                    sectionTitle: 'דבר המפקד',
                }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(screen.getByRole('img', { name: 'Commander' })).toHaveStyle({
            transform: 'translate(-118px, 74px) scale(2.05)',
        });
    });

    it('does not render an image shell when no Commander image is selected', () => {
        const { container } = render(
            <CommanderPanel
                commander={{ image: '', imageSource: 'none', roleLabel: 'מפקד', sectionTitle: 'דבר המפקד' }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(screen.queryByRole('img', { name: 'Commander' })).not.toBeInTheDocument();
        expect(container.querySelector('[data-commander-image]')).not.toBeInTheDocument();
    });

    it('renders a selected rank as an insignia without visible rank text', () => {
        const { container } = render(
            <CommanderPanel
                commander={{
                    imageSource: 'rank',
                    imageRank: 'אל"ם',
                    imageRankStyle: 'ceremonial',
                    roleLabel: 'מפקד',
                    sectionTitle: 'דבר המפקד',
                }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(screen.getByRole('img', { name: 'אלוף משנה, שלושה עלי קצונה' })).toBeInTheDocument();
        expect(container.querySelector('svg text')).not.toBeInTheDocument();
        expect(screen.queryByText('אל"ם')).not.toBeInTheDocument();
        expect(container.querySelector('[data-commander-image-backdrop]')).toBeInTheDocument();
    });

    it('allows the rank backdrop to be removed', () => {
        const { container } = render(
            <CommanderPanel
                commander={{ imageSource: 'rank', imageRank: 'סגן', imageRankBackdrop: false }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(container.querySelector('[data-commander-image-backdrop]')).not.toBeInTheDocument();
    });

    it('renders the persisted rank orientation without stretching the asset', () => {
        const { container } = render(
            <CommanderPanel
                commander={{ imageSource: 'rank', imageRank: 'סגן', imageRankOrientation: 'landscape' }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(container.querySelector('[data-rank-orientation]')).toHaveAttribute('data-rank-orientation', 'landscape');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
        expect(container.querySelector('[data-rank-asset]')).toHaveAttribute('data-rank-rotated', 'true');
    });

    it('renders persisted rank rotation and mirror settings', () => {
        const { container } = render(
            <CommanderPanel
                commander={{ imageSource: 'rank', imageRank: 'סגן', imageRankRotation: 180, imageRankMirrored: true }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(container.querySelector('[data-rank-rotation]')).toHaveAttribute('data-rank-rotation', '180');
        expect(container.querySelector('[data-rank-mirrored]')).toHaveAttribute('data-rank-mirrored', 'true');
    });

    it.each(COMMANDER_RANKS)('renders %s through the shared rank presentation', (rank) => {
        render(
            <CommanderPanel
                commander={{ imageSource: 'rank', imageRank: rank, imageRankStyle: 'field' }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(screen.getByRole('img', { name: getRankDefinition(rank).ariaLabel })).toBeInTheDocument();
    });
});
