import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminCurrentWidgets from './AdminCurrentWidgets';

const mocks = vi.hoisted(() => ({
    widgetConfig: {
        activeWidgets: ['news', 'polls'],
        rotationInterval: 8,
        news: [{ id: 'n1', text: 'מבזק מקור', isUrgent: false }],
        polls: [{
            id: 'p1',
            question: 'סקר מקור',
            active: true,
            options: [{ id: 'o1', text: 'כן', votes: 1, voters: [] }],
        }],
    },
    saveWidgetConfig: vi.fn(async () => true),
    updateField: vi.fn(async () => true),
}));

vi.mock('../context/WidgetContext', () => ({
    useWidget: () => ({
        widgetConfig: mocks.widgetConfig,
        loading: false,
        error: '',
        saveWidgetConfig: mocks.saveWidgetConfig,
        updateField: mocks.updateField,
    }),
}));

vi.mock('./WidgetLivePreview', () => ({ default: () => <div>תצוגה מקדימה</div> }));
vi.mock('./WidgetDisplaySettingsPanel', () => ({ default: () => null }));
vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => <button type="button">עזרה</button>,
    HelpLabel: ({ as = 'label', children, ...props }) => React.createElement(as, props, children),
    HelpTooltipButton: () => null,
}));

describe('AdminCurrentWidgets AI launcher', () => {
    afterEach(cleanup);

    it('does not render upper AI launchers while switching widget managers', async () => {
        render(<AdminCurrentWidgets />);

        expect(screen.getByText('ניהול מבזקים ועדכונים')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /סקרים ודעת קהל/ }));
        expect(await screen.findByText('ניהול סקרים')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'AI' })).not.toBeInTheDocument();
    });
});
