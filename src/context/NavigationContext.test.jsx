import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationProvider, useNavigation } from './NavigationContext';

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

function Harness() {
    const { navItems, saveNavigation } = useNavigation();
    return (
        <div>
            <output data-testid="navigation">{JSON.stringify(navItems)}</output>
            <button
                type="button"
                onClick={() => saveNavigation((items) => items.map((item) => (
                    item.id === 'category-1' ? { ...item, label: 'שם חדש', title: 'שם חדש' } : item
                )))}
            >
                rename
            </button>
        </div>
    );
}

const targetBinding = {
    version: 1,
    mode: 'sharepoint-auto',
    targetKind: 'library',
    state: 'verified',
    serverRelativeUrl: '/sites/demo/content-library-123',
    listId: '{LIST-ID}',
    libraryTitle: 'תוכן',
    libraryRootServerRelativeUrl: '/sites/demo/content-library-123',
    provisionKey: 'category-1',
};

describe('NavigationContext SharePoint binding persistence', () => {
    beforeEach(() => {
        mocks.config = {
            navigation: {
                items: [{
                    id: 'category-1',
                    label: 'תוכן',
                    kind: 'folder',
                    icon: 'Folder',
                    iconUrl: '',
                    url: targetBinding.serverRelativeUrl,
                    targetBinding,
                    children: [],
                }],
            },
        };
        mocks.saveNow.mockReset().mockResolvedValue({});
        mocks.reload.mockReset().mockResolvedValue({});
        mocks.updateConfig.mockReset().mockImplementation((updater) => {
            mocks.config = updater(mocks.config);
        });
    });

    it('keeps binding metadata through edit, save, and provider remount', async () => {
        const view = render(<NavigationProvider><Harness /></NavigationProvider>);
        expect(JSON.parse(screen.getByTestId('navigation').textContent)[0].targetBinding).toEqual(targetBinding);

        fireEvent.click(screen.getByRole('button', { name: 'rename' }));
        await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledOnce(), { timeout: 1500 });
        expect(mocks.config.navigation.items[0]).toMatchObject({
            label: 'שם חדש',
            url: targetBinding.serverRelativeUrl,
            targetBinding,
        });

        view.unmount();
        render(<NavigationProvider><Harness /></NavigationProvider>);
        expect(JSON.parse(screen.getByTestId('navigation').textContent)[0]).toMatchObject({
            label: 'שם חדש',
            targetBinding,
        });
    });

    it('loads legacy URL nodes unchanged and without automatic provisioning metadata', () => {
        mocks.config = {
            navigation: {
                items: [{
                    id: 'legacy',
                    label: 'שרת קבצים',
                    kind: 'link',
                    icon: 'Link',
                    iconUrl: '',
                    url: 'smb://server/share',
                    children: [],
                }],
            },
        };

        render(<NavigationProvider><Harness /></NavigationProvider>);

        expect(JSON.parse(screen.getByTestId('navigation').textContent)[0]).toEqual({
            id: 'legacy',
            label: 'שרת קבצים',
            kind: 'link',
            icon: 'Link',
            iconUrl: '',
            url: expect.stringMatching(/^#\/file-explorer\?target=/),
            children: [],
        });
    });
});
