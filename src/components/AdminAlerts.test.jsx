import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAlerts from './AdminAlerts';
import AdminEditSessionGuard from './AdminEditSessionGuard';
import { resetAdminEditSessionForTests } from '../utils/adminEditSession';

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
        resetAdminEditSessionForTests();
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
        expect(screen.queryByRole('button', { name: 'פרסום ההתראה' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'המשך להצגה ותזמון' }));
        expect(screen.getByRole('radio', { name: /פופאפ בכניסה/ })).toBeChecked();
        expect(screen.getByRole('button', { name: 'פרסום ההתראה' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: /דרישת אישור קריאה/ })).toBeDisabled();
        expect(screen.getByText(/התזמון אופציונלי/)).toBeInTheDocument();
        expect(screen.getByText(/הפופאפ ייסגר רק בלחיצה על הכפתור/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'מעבר לטופס' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'קראתי ואישרתי' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'שמירה כטיוטה' }));
        await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledOnce());
        expect(screen.getByRole('tab', { name: 'התראות שמורות' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('טיוטה')).toBeInTheDocument();
    });

    it('uses a styled dialog before discarding alert edits', () => {
        render(<AdminAlerts />);
        fireEvent.click(screen.getByRole('button', { name: 'התראה חדשה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'תוכן ההתראה' }), {
            target: { value: 'טיוטה שלא נשמרה' },
        });

        fireEvent.click(screen.getByRole('tab', { name: 'התראות שמורות' }));
        expect(screen.getByRole('dialog', { name: 'שינויים שלא נשמרו' })).toBeInTheDocument();
        expect(screen.getByText(/העריכה הנוכחית תימחק/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'המשך בעריכה' }));
        expect(screen.queryByRole('dialog', { name: 'שינויים שלא נשמרו' })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: 'התראות שמורות' }));
        fireEvent.click(screen.getByRole('button', { name: 'מעבר ללא שמירה' }));
        expect(screen.getByRole('tab', { name: 'התראות שמורות' })).toHaveAttribute('aria-selected', 'true');
    });

    it('persists the global notification icon setting', async () => {
        render(<AdminAlerts />);

        fireEvent.click(screen.getByRole('switch', { name: 'הפעלת דף ההתראות באתר' }));

        await waitFor(() => expect(mocks.updateConfig).toHaveBeenCalled());
        const update = mocks.updateConfig.mock.calls.at(-1)[0];
        const nextConfig = update(mocks.config);
        expect(nextConfig.widgets.data.alerts.enabled).toBe(false);
    });

    it('routes outside navigation and beforeunload through the shared dirty-editor coordinator', () => {
        render(
            <>
                <AdminEditSessionGuard />
                <AdminAlerts />
                <button type="button">ניווט חיצוני</button>
            </>,
        );
        fireEvent.click(screen.getByRole('button', { name: 'התראה חדשה' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'תוכן ההתראה' }), {
            target: { value: 'טיוטה שלא נשמרה' },
        });

        const unloadEvent = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(unloadEvent);
        expect(unloadEvent.defaultPrevented).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'ניווט חיצוני' }));
        expect(screen.getByRole('dialog', { name: 'שינויים שלא נשמרו' })).toBeInTheDocument();
    });
});
