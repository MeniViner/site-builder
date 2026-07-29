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
});
