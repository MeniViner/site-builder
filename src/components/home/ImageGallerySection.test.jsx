import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImageGallerySection, { GalleryImage } from './ImageGallerySection';

const images = [
    { id: 'one', mediaRef: 'https://example.test/one.jpg', alt: 'תמונה ראשונה', caption: 'ראשונה', width: 1200, height: 800 },
    { id: 'two', mediaRef: 'https://example.test/two.jpg', alt: 'תמונה שנייה', caption: 'שנייה', width: 1200, height: 800 },
    { id: 'three', mediaRef: 'https://example.test/three.jpg', alt: 'תמונה שלישית', caption: 'שלישית', width: 1200, height: 800 },
];

function gallery(style = 'classic-carousel') {
    return { id: `gallery-${style}`, title: 'גלריית מבחן', description: 'תיאור', active: true, style, images };
}

function getCarousel() {
    return screen.getAllByRole('region', { name: 'גלריית מבחן' })
        .find((element) => element.getAttribute('aria-roledescription') === 'carousel');
}

describe('ImageGallerySection', () => {
    it('hides cleanly when there are no active galleries', () => {
        const view = render(<ImageGallerySection galleries={[]} />);
        expect(view.container).toBeEmptyDOMElement();
    });

    it('renders an active gallery and uses RTL keyboard direction for navigation', () => {
        render(<ImageGallerySection galleries={[gallery()]} direction="rtl" />);
        const carousel = getCarousel();

        expect(screen.getByRole('img', { name: 'תמונה ראשונה' })).toBeInTheDocument();
        fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
        expect(screen.getByRole('img', { name: 'תמונה שנייה' })).toBeInTheDocument();
        fireEvent.keyDown(carousel, { key: 'ArrowRight' });
        expect(screen.getByRole('img', { name: 'תמונה ראשונה' })).toBeInTheDocument();
    });

    it('uses LTR keyboard direction for navigation', () => {
        render(<ImageGallerySection galleries={[gallery()]} direction="ltr" />);
        const carousel = getCarousel();

        fireEvent.keyDown(carousel, { key: 'ArrowRight' });
        expect(screen.getByRole('img', { name: 'תמונה שנייה' })).toBeInTheDocument();
    });

    it.each(['center-carousel', 'coverflow', 'masonry'])('renders the %s variant', (style) => {
        render(<ImageGallerySection galleries={[gallery(style)]} direction="rtl" />);
        expect(screen.getByRole('heading', { name: 'גלריית מבחן' })).toBeInTheDocument();
    });

    it('opens an accessible viewer from the masonry variant and closes it with Escape', () => {
        render(<ImageGallerySection galleries={[gallery('masonry')]} direction="rtl" />);
        fireEvent.click(screen.getByRole('button', { name: 'הגדל תמונה: תמונה ראשונה' }));
        expect(screen.getByRole('dialog', { name: 'תמונה ראשונה' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows a clear fallback when a stored image reference fails to load', () => {
        render(<GalleryImage image={images[0]} alt={images[0].alt} />);
        fireEvent.error(screen.getByRole('img', { name: 'תמונה ראשונה' }));
        expect(screen.getByRole('img', { name: 'התמונה אינה זמינה' })).toBeInTheDocument();
    });
});
