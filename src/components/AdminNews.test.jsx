import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminNews from './AdminNews';

const contextMocks = vi.hoisted(() => ({
    saveWidgetConfig: vi.fn(async () => true),
    widgetConfig: {
        news: [{ id: 'existing', text: 'מבזק קיים', isUrgent: false }],
    },
}));

vi.mock('../context/WidgetContext', () => ({
    useWidget: () => contextMocks,
}));

vi.mock('./WidgetDisplaySettingsPanel', () => ({ default: () => null }));
vi.mock('./DismissibleNotice', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => null,
    HelpLabel: ({ children }) => <span>{children}</span>,
    HelpTooltipButton: () => null,
}));

describe('AdminNews AI launcher', () => {
    afterEach(cleanup);

    it('does not render the removed upper AI launcher', () => {
        render(<AdminNews />);
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
        expect(screen.getByText('מבזק קיים')).toBeVisible();
    });
});
