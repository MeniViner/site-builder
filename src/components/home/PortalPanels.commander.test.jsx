import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CommanderPanel } from './PortalPanels';

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
});
