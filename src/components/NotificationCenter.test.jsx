import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import NotificationCenter from './NotificationCenter';

describe('NotificationCenter unread state', () => {
    const items = [
        { id: 'first', title: 'ראשונה', text: 'תוכן ראשון', popupActive: true },
        { id: 'second', title: 'שנייה', text: 'תוכן שני', popupActive: true },
    ];
    const currentUser = { sharePointUserId: 17 };

    beforeEach(() => {
        localStorage.clear();
    });

    it('opens the first unread popup and immediately decrements the badge when X is clicked', () => {
        render(<NotificationCenter items={items} currentUser={currentUser} />);

        expect(screen.getByText('ראשונה')).toBeInTheDocument();
        const notificationButton = screen.getByRole('button', { name: 'מרכז ההתראות' });
        const closeButton = screen.getByRole('button', { name: 'סגירת התראה' });
        expect(within(notificationButton).getByText('2')).toBeInTheDocument();
        expect(closeButton.closest('.fixed.inset-0')).toHaveClass('z-[10000]');

        fireEvent.click(closeButton);

        expect(screen.queryByText('ראשונה')).not.toBeInTheDocument();
        expect(screen.getByText('שנייה')).toBeInTheDocument();
        expect(within(notificationButton).getByText('1')).toBeInTheDocument();
    });

    it('keeps read state local and does not show the same popup after remount', () => {
        const view = render(<NotificationCenter items={items} currentUser={currentUser} />);
        fireEvent.click(screen.getByRole('button', { name: 'סגירת התראה' }));
        view.unmount();

        render(<NotificationCenter items={items} currentUser={currentUser} />);

        expect(screen.queryByText('ראשונה')).not.toBeInTheDocument();
        expect(screen.getByText('שנייה')).toBeInTheDocument();
    });

    it('does not render the notification icon or popup when disabled', () => {
        render(<NotificationCenter enabled={false} items={items} currentUser={currentUser} />);

        expect(screen.queryByRole('button', { name: 'מרכז ההתראות' })).not.toBeInTheDocument();
        expect(screen.queryByText('ראשונה')).not.toBeInTheDocument();
    });
});
