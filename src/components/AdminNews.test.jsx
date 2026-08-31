import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminNews from './AdminNews';

const contextMocks = vi.hoisted(() => ({
    saveWidgetConfig: vi.fn(),
    widgetConfig: {
        news: [{ id: 'existing', text: 'מבזק קיים', isUrgent: false }],
        polls: [{ id: 'protected-poll', question: 'סקר שמור' }],
    },
}));

vi.mock('../context/WidgetContext', () => ({
    useWidget: () => contextMocks,
}));

vi.mock('./AdminWidgetAIAssistant', () => ({
    default: ({ onChange }) => (
        <button
            type="button"
            onClick={() => onChange([
                { id: 'existing', text: 'מבזק קיים', isUrgent: false },
                { id: 'generated', text: 'מבזק AI חדש', isUrgent: false },
            ])}
        >
            החל תוצאת AI
        </button>
    ),
}));

vi.mock('./WidgetDisplaySettingsPanel', () => ({ default: () => null }));
vi.mock('./DismissibleNotice', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => null,
    HelpLabel: ({ children }) => <span>{children}</span>,
    HelpTooltipButton: () => null,
}));

describe('AdminNews AI persistence', () => {
    beforeEach(() => {
        contextMocks.saveWidgetConfig.mockReset();
        contextMocks.saveWidgetConfig.mockResolvedValue(true);
    });

    afterEach(() => {
        cleanup();
    });

    it('persists only the News patch before exposing the applied AI state', async () => {
        render(<AdminNews />);

        fireEvent.click(screen.getByRole('button', { name: 'החל תוצאת AI' }));

        await waitFor(() => expect(contextMocks.saveWidgetConfig).toHaveBeenCalledWith({
            news: [
                { id: 'existing', text: 'מבזק קיים', isUrgent: false },
                { id: 'generated', text: 'מבזק AI חדש', isUrgent: false },
            ],
        }));
        expect(await screen.findByText('מבזק AI חדש')).toBeVisible();
    });

    it('does not expose the AI candidate when persistence fails', async () => {
        contextMocks.saveWidgetConfig.mockResolvedValue(false);
        render(<AdminNews />);

        fireEvent.click(screen.getByRole('button', { name: 'החל תוצאת AI' }));

        await waitFor(() => expect(contextMocks.saveWidgetConfig).toHaveBeenCalledOnce());
        expect(screen.queryByText('מבזק AI חדש')).not.toBeInTheDocument();
        expect(screen.getByText('מבזק קיים')).toBeVisible();
    });
});
