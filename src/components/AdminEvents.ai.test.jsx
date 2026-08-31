import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminEvents from './AdminEvents';

vi.mock('../context/EventsContext', () => ({
    useEvents: () => ({
        events: [{ id: 'original', date: '2026-08-31', title: 'אירוע מקורי', subtitle: '', color: 'gray' }],
        displayCount: 1,
        displayMode: 'default',
        intervalMs: 6000,
        loading: false,
        error: '',
        saveEvents: vi.fn(async () => true),
    }),
}));

vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => <button type="button">עזרה</button>,
    HelpLabel: ({ as = 'label', children, ...props }) => React.createElement(as, props, children),
    HelpTooltipButton: () => null,
}));

describe('AdminEvents AI launcher', () => {
    afterEach(cleanup);

    it('does not render the removed upper AI launcher', () => {
        render(<AdminEvents inHub />);
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
        expect(screen.getByText('אירוע מקורי')).toBeVisible();
    });
});
