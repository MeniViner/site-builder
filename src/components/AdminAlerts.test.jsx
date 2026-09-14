import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

    it('renders the full console with live preview, draft publishing, delivery, and no widget controls', async () => {
        render(<AdminAlerts />);
        fireEvent.click(screen.getByRole('button', { name: 'התראה חדשה' }));

        expect(screen.getByRole('heading', { name: 'תצוגה בזמן אמת' })).toBeInTheDocument();
        expect(screen.queryByText('התראה דחופה')).not.toBeInTheDocument();
        expect(screen.queryByText(/זמן החלפה/)).not.toBeInTheDocument();

        fireEvent.change(screen.getByRole('textbox', { name: /כותרת/ }), {
            target: { value: 'עדכון בזמן אמת' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: 'תוכן ההתראה' }), {
            target: { value: 'התוכן מופיע מיד בפופאפ' },
        });
        fireEvent.change(screen.getByRole('textbox', { name: 'טקסט לכפתור פעולה' }), {
            target: { value: 'מעבר לטופס' },
        });

        expect(screen.getByRole('heading', { name: 'עדכון בזמן אמת' })).toBeInTheDocument();
        expect(screen.getAllByText('התוכן מופיע מיד בפופאפ')).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'מעבר לטופס' })).toBeDisabled();
        fireEvent.change(screen.getByRole('textbox', { name: 'כתובת הכפתור' }), {
            target: { value: 'https://example.com/form' },
        });
        expect(screen.getByRole('link', { name: 'מעבר לטופס' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'הצגה ותזמון' }));
        expect(screen.getByRole('radio', { name: /פופאפ בכניסה/ })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: /דרישת אישור קריאה/ })).toBeDisabled();
        expect(screen.getByText(/התזמון אופציונלי/)).toBeInTheDocument();
        expect(screen.getByText(/כבר הוגדר כפתור פעולה/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'מעבר לטופס' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'קראתי ואישרתי' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'שמירה כטיוטה' }));
        await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledOnce());
        expect(screen.getByRole('tab', { name: 'התראות שמורות' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('טיוטה')).toBeInTheDocument();
    });
});
