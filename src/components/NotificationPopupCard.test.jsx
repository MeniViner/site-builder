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
});
