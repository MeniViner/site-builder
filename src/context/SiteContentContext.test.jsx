import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteContentProvider, useSiteContent } from './SiteContentContext';
import {
    COMMANDER_IMAGE_OFFSET_X,
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
            <button
                type="button"
                onClick={() => saveSiteContent({
                    commander: {
                        ...siteContent.commander,
                        imageScale: 215,
                        imageOffsetX: -120,
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
    });

    it('preserves image scale and offset through save, reload-shaped remount, and field updates', async () => {
        mocks.config = createConfig({ imageScale: 148, imageOffsetX: -64 });
        const view = render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);

        expect(screen.getByTestId('commander-scale')).toHaveTextContent('148');
        expect(screen.getByTestId('commander-offset')).toHaveTextContent('-64');

        fireEvent.click(screen.getByRole('button', { name: 'save geometry' }));
        await waitFor(() => expect(mocks.saveNow).toHaveBeenCalledTimes(1));

        expect(mocks.config.content.commander).toMatchObject({
            imageScale: 215,
            imageOffsetX: -120,
        });

        view.unmount();
        render(<SiteContentProvider><SiteContentHarness /></SiteContentProvider>);
        expect(screen.getByTestId('commander-scale')).toHaveTextContent('215');
        expect(screen.getByTestId('commander-offset')).toHaveTextContent('-120');

        fireEvent.click(screen.getByRole('button', { name: 'update offset field' }));
        expect(mocks.config.content.commander).toMatchObject({
            imageScale: 215,
            imageOffsetX: 130,
        });
    });
});
