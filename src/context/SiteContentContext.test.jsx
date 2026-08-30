import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteContentProvider, useSiteContent } from './SiteContentContext';
import {
    COMMANDER_BUILTIN_AVATARS,
    COMMANDER_IMAGE_OFFSET_X,
    COMMANDER_IMAGE_OFFSET_Y,
    COMMANDER_IMAGE_SCALE,
} from '../utils/commanderImage';

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

function SiteContentHarness() {
    const { siteContent, saveSiteContent, updateField } = useSiteContent();

    return (
        <div>
            <output data-testid="commander-scale">{siteContent.commander.imageScale}</output>
            <output data-testid="commander-offset">{siteContent.commander.imageOffsetX}</output>
            <output data-testid="commander-offset-y">{siteContent.commander.imageOffsetY}</output>
            <output data-testid="commander-source">{siteContent.commander.imageSource}</output>
            <output data-testid="commander-image">{siteContent.commander.image}</output>
            <button
                type="button"
                onClick={() => saveSiteContent({
                    commander: {
                        ...siteContent.commander,
                        imageScale: 215,
                        imageOffsetX: -120,
                        imageOffsetY: 88,
                        imageSource: 'builtin',
                        imageAvatar: 'teal',
                    },
                })}
            >
                save geometry
            </button>
            <button
                type="button"
                onClick={() => updateField('commander.imageOffsetX', 130)}
            >
                update offset field
            </button>
            <button
                type="button"
                onClick={() => saveSiteContent({
                    commander: {
                        ...siteContent.commander,
                        imageSource: 'none',
                        image: '',
                        imageUrl: '',
                    },
                })}
            >
                remove commander image
            </button>
            <button
                type="button"
                onClick={() => updateField('commander.image', '/uploads/direct-field.jpg')}
            >
                update custom image field
            </button>
        </div>
    );
}

function createConfig(commander = {}) {
    return {
        content: {
            hero: {},
            commander: {
                imageUrl: '/images/commander.png',
                sectionTitle: 'דבר המפקד',
                roleLabel: 'מפקד',
                decorativeElement: 'line-diamond-line',
                messages: [],
                ...commander,
            },
            overlayImage: {},
        },
    };
}

describe('SiteContentContext Commander geometry persistence', () => {
    beforeEach(() => {
        mocks.config = createConfig();
        mocks.saveNow.mockReset().mockResolvedValue({});
        mocks.reload.mockReset().mockResolvedValue({});
        mocks.updateConfig.mockReset().mockImplementation((updater) => {
            mocks.config = updater(mocks.config);
        });
    });

    it('supplies canonical defaults for legacy content without geometry', () => {
        render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);

        expect(screen.getByTestId('commander-scale')).toHaveTextContent(
            String(COMMANDER_IMAGE_SCALE.defaultValue)
        );
        expect(screen.getByTestId('commander-offset')).toHaveTextContent(
            String(COMMANDER_IMAGE_OFFSET_X.defaultValue)
        );
        expect(screen.getByTestId('commander-offset-y')).toHaveTextContent(
            String(COMMANDER_IMAGE_OFFSET_Y.defaultValue)
        );
    });

    it('preserves image scale and offset through save, reload-shaped remount, and field updates', async () => {
        mocks.config = createConfig({
            imageScale: 148,
            imageOffsetX: -64,
            imageOffsetY: 42,
            imageSource: 'custom',
            customImageUrl: '/uploads/commander.jpg',
            imageUrl: '/uploads/commander.jpg',
        });
        const view = render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);

        expect(screen.getByTestId('commander-scale')).toHaveTextContent('148');
        expect(screen.getByTestId('commander-offset')).toHaveTextContent('-64');
        expect(screen.getByTestId('commander-offset-y')).toHaveTextContent('42');
        expect(screen.getByTestId('commander-source')).toHaveTextContent('custom');

        fireEvent.click(screen.getByRole('button', { name: 'save geometry' }));
        await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledTimes(1));

        expect(mocks.config.content.commander).toMatchObject({
            imageScale: 215,
            imageOffsetX: -120,
            imageOffsetY: 88,
            imageSource: 'builtin',
            imageAvatar: 'teal',
            imageUrl: COMMANDER_BUILTIN_AVATARS.find((avatar) => avatar.id === 'teal').path,
        });

        view.unmount();
        render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);
        expect(screen.getByTestId('commander-scale')).toHaveTextContent('215');
        expect(screen.getByTestId('commander-offset')).toHaveTextContent('-120');
        expect(screen.getByTestId('commander-offset-y')).toHaveTextContent('88');
        expect(screen.getByTestId('commander-source')).toHaveTextContent('builtin');
        expect(screen.getByTestId('commander-image')).toHaveTextContent('commander-teal.svg');

        fireEvent.click(screen.getByRole('button', { name: 'update offset field' }));
        expect(mocks.config.content.commander).toMatchObject({
            imageScale: 215,
            imageOffsetX: 130,
        });
    });

    it('round-trips no-image and direct legacy custom-image updates', async () => {
        const view = render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);

        fireEvent.click(screen.getByRole('button', { name: 'remove commander image' }));
        await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledOnce());
        expect(mocks.config.content.commander).toMatchObject({
            imageSource: 'none',
            imageUrl: '',
        });

        fireEvent.click(screen.getByRole('button', { name: 'update custom image field' }));
        expect(mocks.config.content.commander).toMatchObject({
            imageSource: 'custom',
            customImageUrl: '/uploads/direct-field.jpg',
            imageUrl: '/uploads/direct-field.jpg',
        });

        view.unmount();
        render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);
        expect(screen.getByTestId('commander-source')).toHaveTextContent('custom');
        expect(screen.getByTestId('commander-image')).toHaveTextContent('/uploads/direct-field.jpg');
    });
});
