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
                    roleLabel: 'מפקד',
                    sectionTitle: 'דבר המפקד',
                }}
                messages={[]}
                borderStyle="standard"
            />
        );

        expect(screen.getByRole('img', { name: 'Commander' })).toHaveStyle({
            transform: 'translateX(-118px) scale(2.05)',
        });
    });
});
