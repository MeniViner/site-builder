import React, { StrictMode, useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationProvider, useNavigation } from './NavigationContext';
import { ExternalLinksProvider, useExternalLinks } from './ExternalLinksContext';

const mocks = vi.hoisted(() => ({
    config: null,
    saveNow: vi.fn(),
    reload: vi.fn(),
    updateConfig: vi.fn(),
}));

vi.mock('./ConfigProvider', () => ({
    useConfig: () => ({
        config: mocks.config,
        status: 'idle',
        error: null,
        updateConfig: mocks.updateConfig,
        saveNow: mocks.saveNow,
        reload: mocks.reload,
    }),
}));

function NavigationAdminControl() {
    const { saveNavigation } = useNavigation();
    return (
        <button
            type="button"
            onClick={() => saveNavigation((items) => [
                ...items,
                { id: 'new-folder', kind: 'folder', label: 'New folder', url: '', children: [] },
            ])}
        >
            add navigation
        </button>
    );
}

function NavigationStateView() {
    const { navItems, saveStatus, error } = useNavigation();
    return (
        <div>
            <span>{navItems.map((item) => item.label).join(',')}</span>
            <span data-testid="nav-status">{saveStatus}</span>
            {error && <span>{error}</span>}
        </div>
    );
}

function NavigationRouteHarness() {
    const [showAdmin, setShowAdmin] = useState(true);
    return (
        <NavigationProvider>
            <button type="button" onClick={() => setShowAdmin(false)}>leave admin</button>
            {showAdmin && <NavigationAdminControl />}
            <NavigationStateView />
        </NavigationProvider>
    );
}

function NavigationCrudControl() {
    const { saveNavigation } = useNavigation();
    return (
        <>
            <button
                type="button"
                onClick={() => {
                    saveNavigation((items) => [...items, { id: 'folder-a', kind: 'folder', label: 'Folder A', children: [] }]);
                    saveNavigation((items) => [...items, { id: 'folder-b', kind: 'folder', label: 'Folder B', children: [] }]);
                    saveNavigation((items) => [...items, { id: 'folder-c', kind: 'folder', label: 'Folder C', children: [] }]);
                }}
            >
                add three folders
            </button>
            <button
                type="button"
                onClick={() => saveNavigation((items) => items.map((item) => (
                    item.id === 'folder-b' ? { ...item, label: 'Folder B edited' } : item
                )))}
            >
                edit folder b
            </button>
            <button
                type="button"
                onClick={() => saveNavigation((items) => items.filter((item) => item.id !== 'folder-a'))}
            >
                delete folder a
            </button>
        </>
    );
}

function NavigationCrudHarness() {
    return (
        <NavigationProvider>
            <NavigationCrudControl />
            <NavigationStateView />
        </NavigationProvider>
    );
}

function ExternalLinksAdminControl() {
    const { saveExternalLinks } = useExternalLinks();
    return (
        <button
            type="button"
            onClick={() => saveExternalLinks((links) => [
                ...links,
                { id: 'network-card', title: 'Network card', url: 'smb://fileserver/public' },
            ])}
        >
            add external link
        </button>
    );
}

function ExternalLinksStateView() {
    const { externalLinks, saveStatus, error } = useExternalLinks();
    return (
        <div>
            <span>{externalLinks.map((item) => item.title).join(',')}</span>
            <output data-testid="external-links">{JSON.stringify(externalLinks)}</output>
            <span data-testid="external-status">{saveStatus}</span>
            {error && <span>{error}</span>}
        </div>
    );
}

function ExternalLinksRouteHarness() {
    const [showAdmin, setShowAdmin] = useState(true);
    return (
        <ExternalLinksProvider>
            <button type="button" onClick={() => setShowAdmin(false)}>leave external admin</button>
            {showAdmin && <ExternalLinksAdminControl />}
            <ExternalLinksStateView />
        </ExternalLinksProvider>
    );
}

function ExternalLinksImageControl() {
    const { saveExternalLinks } = useExternalLinks();
    return (
        <button
            type="button"
            onClick={() => saveExternalLinks([{
                id: 'portal-image',
                title: 'פורטל',
                url: 'https://portal.example',
                icon: '',
                iconUrl: '/sites/test-site/siteDB/images/ExternalLinks/badge.png',
            }])}
        >
            save external image
        </button>
    );
}

function ExternalLinksImageHarness() {
    return (
        <ExternalLinksProvider>
            <ExternalLinksImageControl />
            <ExternalLinksStateView />
        </ExternalLinksProvider>
    );
}

describe('provider-owned optimistic persistence', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.config = {
            navigation: { items: [] },
            externalLinks: { items: [] },
        };
        mocks.saveNow.mockReset().mockResolvedValue({});
        mocks.reload.mockReset().mockResolvedValue({});
        mocks.updateConfig.mockReset().mockImplementation((updater) => {
            mocks.config = updater(mocks.config);
        });
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it('updates shared navigation immediately and persists after the admin route unmounts', async () => {
        render(<StrictMode><NavigationRouteHarness /></StrictMode>);

        fireEvent.click(screen.getByRole('button', { name: 'add navigation' }));
        expect(screen.getByText('New folder')).toBeInTheDocument();
        expect(screen.getByTestId('nav-status')).toHaveTextContent('pending');
        expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
        expect(mocks.saveNow).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'leave admin' }));
        expect(screen.queryByRole('button', { name: 'add navigation' })).not.toBeInTheDocument();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(350);
        });

        expect(mocks.saveNow).toHaveBeenCalledTimes(1);
        expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
        expect(screen.getByText('New folder')).toBeInTheDocument();
        expect(screen.getByTestId('nav-status')).toHaveTextContent('saved');
    });

    it('keeps a failed navigation mutation visible and exposes failed state', async () => {
        mocks.saveNow.mockRejectedValueOnce(new Error('TXT write failed'));
        render(<NavigationRouteHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'add navigation' }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(350);
        });

        expect(screen.getByText('New folder')).toBeInTheDocument();
        expect(screen.getByText('TXT write failed')).toBeInTheDocument();
        expect(screen.getByTestId('nav-status')).toHaveTextContent('failed');
        expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
    });

    it('coalesces rapid add/edit/delete mutations, preserves order, and reloads the final state', async () => {
        const view = render(<NavigationCrudHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'add three folders' }));
        expect(screen.getByText('Folder A,Folder B,Folder C')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'edit folder b' }));
        expect(screen.getByText('Folder A,Folder B edited,Folder C')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'delete folder a' }));
        expect(screen.getByText('Folder B edited,Folder C')).toBeInTheDocument();
        expect(mocks.saveNow).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(350);
        });

        expect(mocks.saveNow).toHaveBeenCalledTimes(1);
        expect(mocks.updateConfig).toHaveBeenCalledTimes(5);
        expect(mocks.config.navigation.items.map((item) => item.label)).toEqual(['Folder B edited', 'Folder C']);

        view.unmount();
        render(<NavigationCrudHarness />);
        expect(screen.getByText('Folder B edited,Folder C')).toBeInTheDocument();
    });

    it('updates shared external cards immediately and persists after admin unmount', async () => {
        render(<ExternalLinksRouteHarness />);

        fireEvent.click(screen.getByRole('button', { name: 'add external link' }));
        expect(screen.getByText('Network card')).toBeInTheDocument();
        expect(screen.getByTestId('external-status')).toHaveTextContent('pending');
        expect(mocks.updateConfig).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'leave external admin' }));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(350);
        });

        expect(mocks.saveNow).toHaveBeenCalledTimes(1);
        expect(mocks.updateConfig).toHaveBeenCalledTimes(1);
        expect(screen.getByText('Network card')).toBeInTheDocument();
        expect(screen.getByTestId('external-status')).toHaveTextContent('saved');
    });

    it('round-trips a canonical SharePoint external-link image through the V1 visual contract', () => {
        mocks.config = {
            navigation: { items: [] },
            externalLinks: {
                items: [{
                    id: 'portal-image',
                    title: 'פורטל',
                    url: 'https://portal.example',
                    visual: {
                        type: 'image',
                        imageUrl: '/sites/test-site/siteDB/images/ExternalLinks/badge.png',
                    },
                    order: 0,
                }],
            },
        };
        const view = render(<ExternalLinksImageHarness />);

        expect(JSON.parse(screen.getByTestId('external-links').textContent)[0]).toMatchObject({
            icon: '',
            iconUrl: '/sites/test-site/siteDB/images/ExternalLinks/badge.png',
        });

        fireEvent.click(screen.getByRole('button', { name: 'save external image' }));
        expect(mocks.config.externalLinks.items[0]).toMatchObject({
            visual: {
                type: 'image',
                imageUrl: '/sites/test-site/siteDB/images/ExternalLinks/badge.png',
            },
        });

        view.unmount();
        render(<ExternalLinksImageHarness />);
        expect(JSON.parse(screen.getByTestId('external-links').textContent)[0]).toMatchObject({
            iconUrl: '/sites/test-site/siteDB/images/ExternalLinks/badge.png',
        });
    });
});
