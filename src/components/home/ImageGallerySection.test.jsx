import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImageGallerySection, {
    GalleryImage,
    ImageGalleryRenderer,
} from './ImageGallerySection';
import {
    buildMagalStripLoopItems,
    MAGAL_STRIP_MINIMUM_ITEMS_PER_GROUP,
    MAGAL_STRIP_REPEAT_GROUP_COUNT,
} from '../../utils/imageGallery';

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
    afterEach(() => {
        vi.unstubAllGlobals();
    });

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

    it('renders Magal strips as two opposing rows with four seamless repeat groups each', () => {
        render(<ImageGallerySection galleries={[gallery('magal-strips')]} direction="rtl" />);

        const rows = screen.getAllByTestId('magal-row');
        const groups = screen.getAllByTestId('magal-repeat-group');
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.dataset.direction)).toEqual(['left', 'right']);
        expect(groups).toHaveLength(2 * MAGAL_STRIP_REPEAT_GROUP_COUNT);
        rows.forEach((row) => {
            expect(row.querySelectorAll('[data-testid="magal-repeat-group"]')).toHaveLength(MAGAL_STRIP_REPEAT_GROUP_COUNT);
        });
        expect(groups[0].querySelectorAll('.magal-strips__card').length)
            .toBeGreaterThanOrEqual(MAGAL_STRIP_MINIMUM_ITEMS_PER_GROUP);
        expect(groups[1]).toHaveAttribute('aria-hidden', 'true');
        expect(screen.getByTestId('image-gallery-section')).toHaveAttribute('dir', 'rtl');
    });

    it('builds a wide enough identical loop group even when a gallery has few images', () => {
        const rowOne = buildMagalStripLoopItems(images, 0);
        const rowTwo = buildMagalStripLoopItems(images, 1);

        expect(rowOne).toHaveLength(MAGAL_STRIP_MINIMUM_ITEMS_PER_GROUP);
        expect(rowOne.slice(0, images.length).map((item) => item.image.id)).toEqual(['one', 'two', 'three']);
        expect(rowTwo.slice(0, images.length).map((item) => item.image.id)).toEqual(['two', 'three', 'one']);
    });

    it('pauses Magal movement in admin preview and under reduced-motion preference', () => {
        const view = render(<ImageGalleryRenderer gallery={gallery('magal-strips')} direction="rtl" preview />);
        expect(screen.getByTestId('magal-strips')).toHaveClass('magal-strips--preview');
        view.unmount();

        vi.stubGlobal('matchMedia', vi.fn(() => ({
            matches: true,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        })));
        render(<ImageGalleryRenderer gallery={gallery('magal-strips')} direction="rtl" />);
        expect(screen.getByTestId('magal-strips')).toHaveAttribute('data-reduced-motion', 'true');
        expect(screen.getByTestId('magal-strips')).toHaveClass('magal-strips--reduced-motion');
    });

    it('keeps every gallery frame centered in normal document flow', () => {
        render(<ImageGallerySection galleries={[gallery('coverflow')]} direction="rtl" />);
        const frame = screen.getByTestId('gallery-frame-gallery-coverflow');

        expect(frame).toHaveAttribute('data-layout', 'normal-flow');
        expect(frame.className).not.toMatch(/\b(?:fixed|absolute|sticky)\b/);
        expect(screen.getByRole('heading', { name: 'גלריית מבחן' }).parentElement)
            .toHaveClass('text-center');
        expect(screen.getByText('תיאור')).toBeInTheDocument();
    });

    it('removes hidden heading content and spacing while retaining an accessible gallery name', () => {
        render(
            <ImageGallerySection
                galleries={[{
                    ...gallery(),
                    display: {
                        showTitle: false,
                        showDescription: false,
                        titleAlignment: 'right',
                    },
                }]}
                direction="rtl"
            />,
        );

        const frame = screen.getByTestId('gallery-frame-gallery-classic-carousel');
        expect(screen.queryByRole('heading', { name: 'גלריית מבחן' })).not.toBeInTheDocument();
        expect(screen.queryByText('תיאור')).not.toBeInTheDocument();
        expect(screen.queryByTestId('gallery-heading-gallery-classic-carousel')).not.toBeInTheDocument();
        expect(frame).toHaveAttribute('aria-label', 'גלריית מבחן');
        expect(frame).not.toHaveAttribute('aria-labelledby');
    });

    it('supports a right-aligned description when the visible title is disabled', () => {
        render(
            <ImageGallerySection
                galleries={[{
                    ...gallery('magal-strips'),
                    display: {
                        showTitle: false,
                        showDescription: true,
                        titleAlignment: 'right',
                    },
                }]}
                direction="rtl"
            />,
        );

        const frame = screen.getByTestId('gallery-frame-gallery-magal-strips');
        const headingBlock = screen.getByTestId('gallery-heading-gallery-magal-strips');
        expect(screen.queryByRole('heading', { name: 'גלריית מבחן' })).not.toBeInTheDocument();
        expect(screen.getByText('תיאור')).toBeInTheDocument();
        expect(headingBlock).toHaveClass('ml-auto', 'text-right');
        expect(frame).toHaveAttribute('aria-label', 'גלריית מבחן');
    });
});
