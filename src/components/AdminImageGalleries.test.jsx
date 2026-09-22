import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AdminImageGalleries from './AdminImageGalleries';

vi.mock('../context/ImageGalleryContext', () => ({
    useImageGalleries: () => ({
        galleries: [],
        loading: false,
        error: null,
        saveGalleries: vi.fn(),
        saveGallery: vi.fn(),
        deleteGallery: vi.fn(),
    }),
}));

vi.mock('react-toastify', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

describe('AdminImageGalleries moving-strip style controls', () => {
    it('shows a recognizable moving-strip selector and configurable row controls', () => {
        const view = render(<AdminImageGalleries />);
        fireEvent.click(screen.getByRole('button', { name: 'יצירת גלריה ראשונה' }));

        const magalOption = screen.getByRole('button', { name: /רצועות בתנועה/ });
        expect(magalOption.querySelectorAll('.magal-style-miniature__row')).toHaveLength(2);
        fireEvent.click(magalOption);

        expect(screen.getByTestId('magal-settings')).toBeInTheDocument();
        expect(screen.getByLabelText('מספר שורות – רצועות בתנועה')).toHaveValue('2');
        expect(screen.getByLabelText('כיוון שורה 1')).toHaveValue('left');
        expect(screen.getByLabelText('כיוון שורה 2')).toHaveValue('right');
        expect(screen.getByLabelText('גודל כרטיסים – רצועות בתנועה')).toHaveValue(180);
        expect(screen.getByLabelText('מרווח כרטיסים – רצועות בתנועה')).toHaveValue(12);

        fireEvent.change(screen.getByLabelText('מספר שורות – רצועות בתנועה'), { target: { value: '3' } });
        expect(screen.getByLabelText('כיוון שורה 3')).toBeInTheDocument();
        expect(view.container.querySelector('.magal-style-miniature')).toBeInTheDocument();
    });

    it('adjusts row angle in .5 steps via +/- buttons with keyboard support, clamped to -12..12', () => {
        render(<AdminImageGalleries />);
        fireEvent.click(screen.getByRole('button', { name: 'יצירת גלריה ראשונה' }));
        fireEvent.click(screen.getByRole('button', { name: /רצועות בתנועה/ }));

        const angleInput = screen.getByLabelText('זווית שורה 1');
        const decreaseButton = screen.getByRole('button', { name: 'הקטן זווית שורה 1' });
        const increaseButton = screen.getByRole('button', { name: 'הגדל זווית שורה 1' });

        expect(angleInput).toHaveAttribute('step', '0.5');
        expect(angleInput).toHaveAttribute('min', '-12');
        expect(angleInput).toHaveAttribute('max', '12');

        const startValue = Number(angleInput.value);
        fireEvent.click(increaseButton);
        expect(Number(angleInput.value)).toBeCloseTo(startValue + 0.5);
        fireEvent.click(decreaseButton);
        fireEvent.click(decreaseButton);
        expect(Number(angleInput.value)).toBeCloseTo(startValue - 0.5);

        // Arrow-key presses on the angle field step by 0.5 and are clamped like the buttons.
        fireEvent.keyDown(angleInput, { key: 'ArrowUp' });
        expect(Number(angleInput.value)).toBeCloseTo(startValue);
        fireEvent.keyDown(angleInput, { key: 'ArrowDown' });
        expect(Number(angleInput.value)).toBeCloseTo(startValue - 0.5);

        // Typed values beyond the bounds are clamped.
        fireEvent.change(angleInput, { target: { value: '45' } });
        expect(Number(angleInput.value)).toBe(12);
        expect(increaseButton).toBeDisabled();
        expect(decreaseButton).not.toBeDisabled();

        fireEvent.change(angleInput, { target: { value: '-45' } });
        expect(Number(angleInput.value)).toBe(-12);
        expect(decreaseButton).toBeDisabled();
        expect(increaseButton).not.toBeDisabled();

        fireEvent.change(angleInput, { target: { value: '1.24' } });
        expect(Number(angleInput.value)).toBe(1);
        fireEvent.change(angleInput, { target: { value: '1.26' } });
        expect(Number(angleInput.value)).toBe(1.5);
    });
});
