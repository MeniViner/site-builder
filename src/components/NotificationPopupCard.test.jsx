import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import NotificationPopupCard from './NotificationPopupCard';

describe('NotificationPopupCard actions', () => {
    it('requires acknowledgement before an acknowledgement-gated popup can close', () => {
        const onClose = vi.fn();
        render(
            <NotificationPopupCard
                item={{
                    title: 'נדרש אישור',
                    text: 'יש לקרוא ולאשר.',
                    requiresAcknowledgement: true,
                }}
                onClose={onClose}
            />
        );

        expect(screen.getByRole('button', { name: 'סגירת התראה' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'קראתי ואישרתי' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('renders only sanitized CTA links supplied by normalized notification data', () => {
        render(
            <NotificationPopupCard
                item={{
                    title: 'פעולה',
                    text: 'עברו לטופס.',
                    ctaLabel: 'פתיחת טופס',
                    ctaUrl: 'https://example.com/form',
                }}
                onClose={() => {}}
            />
        );

        expect(screen.getByRole('link', { name: 'פתיחת טופס' })).toHaveAttribute('href', 'https://example.com/form');
    });

    it('requires the action button before a popup with a CTA can close', () => {
        const onClose = vi.fn();
        render(
            <NotificationPopupCard
                item={{
                    title: 'פעולה עם אישור',
                    text: 'יש לבצע פעולה.',
                    ctaLabel: 'מעבר לטופס',
                    ctaUrl: 'https://example.com/action',
                    requiresAcknowledgement: true,
                }}
                onClose={onClose}
            />
        );

        expect(screen.getByRole('link', { name: 'מעבר לטופס' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'קראתי ואישרתי' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'סגירת התראה' })).toBeDisabled();
        fireEvent.click(screen.getByRole('link', { name: 'מעבר לטופס' }));
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('shows a disabled action button in preview while its URL is still being entered', () => {
        render(
            <NotificationPopupCard
                item={{ title: 'תצוגה', text: 'תוכן', ctaLabel: 'כפתור בפופאפ', ctaUrl: '' }}
                onClose={() => {}}
                preview
            />
        );

        expect(screen.getByRole('button', { name: 'כפתור בפופאפ' })).toBeDisabled();
    });
});
