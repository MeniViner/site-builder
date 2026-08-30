import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Home } from './App';

const featureState = vi.hoisted(() => ({
    boomEnabled: false,
}));

vi.mock('./components/home/NavigationBar', () => ({
    default: ({ utilityLinks = [] }) => (
        <nav>
            Navigation
            {utilityLinks.map((link) => <span key={link.id}>{link.label}</span>)}
        </nav>
    ),
}));
vi.mock('./components/home/HeroSection', () => ({ default: () => <section>Hero</section> }));
vi.mock('./components/home/CategorySection', () => ({ default: () => <section>Category</section> }));
vi.mock('./components/home/OverlayImageElement', () => ({ default: () => null }));
vi.mock('./components/home/PortalPanels', () => ({
    CommanderPanel: () => <section>Commander</section>,
    WidgetSection: () => <section>Widget</section>,
}));
vi.mock('./components/RightSidebarNav', () => ({ default: () => <aside data-testid="right-sidebar-rail">Rail</aside> }));
vi.mock('./components/home/ImageGallerySection', () => ({
    default: () => <section data-testid="image-gallery-section" data-layout="normal-flow">Gallery</section>,
}));
vi.mock('./context/NavigationContext', () => ({
    useNavigation: () => ({ navItems: [], loading: false }),
}));
vi.mock('./context/AuthContext', () => ({
    useAuth: () => ({ currentUser: { displayName: 'Tester' }, isAdmin: true, loading: false }),
}));
vi.mock('./context/SiteContentContext', () => ({
    useSiteContent: () => ({
        siteContent: {
            hero: { title: '', subtitle: '', description: '', backgroundImages: [] },
            commander: { image: '', sectionTitle: '', roleLabel: '', messages: [] },
        },
    }),
}));
vi.mock('./context/ThemeContext', () => ({
    useTheme: () => ({
        theme: {
            regularLinksLayout: 'sidebar-right',
            externalLinksLayout: 'cards',
            externalLinksFixed: false,
        },
        effectiveMode: 'light',
        toggleUserMode: vi.fn(),
        borderTargets: {},
    }),
}));
vi.mock('./context/ExternalLinksContext', () => ({
    useExternalLinks: () => ({ externalLinks: [] }),
}));
vi.mock('./context/OrgChartContext', () => ({
    useOrgChart: () => ({ orgChart: { enabled: false } }),
}));
vi.mock('./context/GanttContext', () => ({
    useGantt: () => ({ gantt: { enabled: false } }),
}));
vi.mock('./context/BoomContext', () => ({
    useBoom: () => ({ boom: { enabled: featureState.boomEnabled, buttonLabel: 'מרכז BOOM' } }),
}));
vi.mock('./context/ImageGalleryContext', () => ({
    useImageGalleries: () => ({ activeGalleries: [{ id: 'gallery' }] }),
}));

describe('homepage Image Gallery placement', () => {
    beforeEach(() => {
        featureState.boomEnabled = false;
    });

    it('keeps the gallery in the usable normal-flow wrapper immediately before the real footer', () => {
        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>,
        );

        const usableContent = screen.getByTestId('homepage-usable-content');
        const gallery = screen.getByTestId('image-gallery-section');
        const footer = screen.getByTestId('site-footer');
        const rail = screen.getByTestId('right-sidebar-rail');

        expect(usableContent).toHaveClass('homepage-usable-content--right-rail');
        expect(usableContent).toContainElement(gallery);
        expect(usableContent).toContainElement(footer);
        expect(usableContent).not.toContainElement(rail);
        expect(gallery.nextElementSibling).toBe(footer);
        expect(gallery).toHaveAttribute('data-layout', 'normal-flow');
    });

    it('adds BOOM to the existing utility-navigation mechanism only when enabled', () => {
        featureState.boomEnabled = true;
        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>,
        );

        expect(screen.getByText('מרכז BOOM')).toBeInTheDocument();
    });
});
