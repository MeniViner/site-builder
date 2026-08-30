import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminCurrentWidgets from './AdminCurrentWidgets';
import AIService from '../services/AIService';
import { clearAdminAiHistoryStore } from '../hooks/useAdminAiHistory';

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
    saveWidgetConfig: vi.fn(),
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

vi.mock('../config/uiFeatures.config', () => ({
    UI_FEATURES: {
        showAiUi: true,
    },
    isWidgetAiButtonEnabled: (widgetKey) => ['news', 'polls'].includes(widgetKey),
}));

vi.mock('../config/ai.config', () => ({
    getSafeAiRuntimeConfig: () => ({ defaultModel: 'test-model' }),
    // Mirrors the production behaviour: outside a DEV AI runtime the badge is
    // just the model name.
    formatAiEngineLabel: (result) => String(result?.modelUsed || result?.model || ''),
}));

vi.mock('../services/AIService', () => ({
    default: {
        ask: vi.fn(),
        isEnabled: vi.fn(() => true),
    },
}));

vi.mock('./WidgetLivePreview', () => ({ default: () => <div>תצוגה מקדימה</div> }));
vi.mock('./WidgetDisplaySettingsPanel', () => ({ default: () => null }));
vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => <button type="button">עזרה</button>,
    HelpLabel: ({ as = 'label', children, ...props }) => React.createElement(as, props, children),
    HelpTooltipButton: () => null,
}));

describe('AdminCurrentWidgets AI history switching', () => {
    beforeEach(() => {
        mocks.widgetConfig = {
            activeWidgets: ['news', 'polls'],
            rotationInterval: 8,
            news: [{ id: 'n1', text: 'מבזק מקור', isUrgent: false }],
            polls: [{
                id: 'p1',
                question: 'סקר מקור',
                active: true,
                options: [{ id: 'o1', text: 'כן', votes: 1, voters: [] }],
            }],
        };
        mocks.saveWidgetConfig.mockImplementation(async (next) => {
            mocks.widgetConfig = next;
            return true;
        });
        vi.clearAllMocks();
    });

    afterEach(() => {
        cleanup();
        clearAdminAiHistoryStore();
    });

    it('preserves separate News and Polls histories while switching managers', async () => {
        AIService.ask
            .mockResolvedValueOnce({
                content: JSON.stringify({ items: [{ id: 'n2', text: 'מבזק AI', isUrgent: false }] }),
            })
            .mockResolvedValueOnce({
                content: JSON.stringify({
                    items: [{
                        id: 'p2',
                        question: 'סקר AI',
                        active: true,
                        options: [{ id: 'p2-o1', text: 'אפשרות', votes: 0 }],
                    }],
                }),
            });
        render(<AdminCurrentWidgets />);

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור מבזק' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(screen.getByText('מבזק AI')).toBeVisible());
        expect(screen.getByText('1/1')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: /סקרים ודעת קהל/ }));
        expect(await screen.findByText('ניהול סקרים')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור סקר בנושא שירות' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));
        await waitFor(() => expect(screen.getByText('סקר AI')).toBeVisible());
        expect(screen.getByText('1/1')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: /מבזקים ועדכונים/ }));
        expect(await screen.findByText('ניהול מבזקים ועדכונים')).toBeVisible();
        expect(screen.getByRole('button', { name: 'לפני AI' })).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: /סקרים ודעת קהל/ }));
        expect(await screen.findByText('ניהול סקרים')).toBeVisible();
        expect(screen.getByRole('button', { name: 'לפני AI' })).toBeVisible();
    });
});
