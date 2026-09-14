import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAlerts from './AdminAlerts';

const mocks = vi.hoisted(() => ({
    config: { widgets: { data: { alerts: { items: [] } } } },
    updateConfig: vi.fn(),
    saveNow: vi.fn(),
}));

vi.mock('../context/ConfigProvider', () => ({
    useConfig: () => ({
        config: mocks.config,
        updateConfig: mocks.updateConfig,
        saveNow: mocks.saveNow,
        error: null,
    }),
}));

vi.mock('./VerifiedIdentityField', () => ({
    default: () => <div>identity field</div>,
}));

vi.mock('./SmartTextEditor', () => ({
    default: ({ plainText, onChange }) => (
        <textarea
            aria-label="תוכן ההתראה"
            value={plainText}
            onChange={(event) => onChange({ tokens: [], plainText: event.target.value })}
        />
    ),
}));

describe('AdminAlerts popup composer', () => {
    beforeEach(() => {
        mocks.updateConfig.mockReset();
        mocks.saveNow.mockReset().mockResolvedValue(true);
    });

    it('renders a live popup preview and excludes widget urgency and rotation controls', () => {
        render(<AdminAlerts />);
        fireEvent.click(screen.getByRole('button', { name: 'התראה חדשה' }));

        expect(screen.getByRole('heading', { name: 'תצוגה בזמן אמת' })).toBeInTheDocument();
        expect(screen.queryByText('התראה דחופה')).not.toBeInTheDocument();
        expect(screen.queryByText(/זמן החלפה/)).not.toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /הצגה אוטומטית כפופאפ/ })).toBeChecked();

        fireEvent.change(screen.getByRole('textbox', { name: 'כותרת' }), {
            target: { value: 'עדכון בזמן אמת' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: 'תוכן ההתראה' }), {
            target: { value: 'התוכן מופיע מיד בפופאפ' },
        });

        expect(screen.getByRole('heading', { name: 'עדכון בזמן אמת' })).toBeInTheDocument();
        expect(screen.getAllByText('התוכן מופיע מיד בפופאפ')).toHaveLength(2);
    });
});
