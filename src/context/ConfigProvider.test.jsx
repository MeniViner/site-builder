import React, { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider, useConfig } from './ConfigProvider';

const mocks = vi.hoisted(() => ({
    loadConfigEnvelope: vi.fn(),
    saveConfig: vi.fn(),
    ensureBootstrap: vi.fn(),
    overwriteBootstrap: vi.fn(),
}));

vi.mock('../services/ConfigService', () => ({
    default: {
        loadConfigEnvelope: mocks.loadConfigEnvelope,
        saveConfig: mocks.saveConfig,
        loadConfig: vi.fn(),
        adapter: { isLoadFailureFatal: () => false },
    },
}));

vi.mock('../services/SharePointBootstrapService', () => ({
    ensureSharePointBootstrapFiles: mocks.ensureBootstrap,
    overwriteSharePointBootstrapFiles: mocks.overwriteBootstrap,
}));

vi.mock('../services/storage/storageBackend', () => ({
    isMongoStorageBackend: () => false,
    isSharePointReadonlyBackend: () => false,
}));

vi.mock('../config/sharepoint.config', () => ({
    SHAREPOINT_CONFIG: {
        useMock: false,
        mockStorageKey: 'test_master',
        navMockStorageKey: 'test_nav',
        usersMockStorageKey: 'test_users',
        siteContentMockStorageKey: 'test_content',
        themeMockStorageKey: 'test_theme',
        widgetsMockStorageKey: 'test_widgets',
        externalLinksMockStorageKey: 'test_external_links',
    },
}));

let providerApi = null;

function Probe() {
    const api = useConfig();
    useEffect(() => {
        providerApi = api;
    }, [api]);
    return (
        <div
            data-testid="provider-state"
            data-title={api.config?.content?.hero?.title || ''}
            data-status={api.persistence.status}
            data-revision={api.persistence.revision}
            data-persisted-revision={api.persistence.persistedRevision}
            data-dirty={String(api.persistence.dirty)}
        />
    );
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

async function renderLoadedProvider() {
    render(<ConfigProvider><Probe /></ConfigProvider>);
    await waitFor(() => expect(providerApi?.status).toBe('idle'));
}

function withTitle(config, title) {
    return {
        ...config,
        content: {
            ...config.content,
            hero: {
                ...config.content.hero,
                title,
            },
        },
    };
}

describe('ConfigProvider persistence queue', () => {
    beforeEach(() => {
        providerApi = null;
        localStorage.clear();
        mocks.loadConfigEnvelope.mockReset().mockResolvedValue({
            source: 'test',
            config: {
                schemaVersion: '1.0.0',
                content: { hero: { title: 'initial' } },
            },
        });
        mocks.saveConfig.mockReset().mockImplementation(async (config) => config);
        mocks.ensureBootstrap.mockReset().mockResolvedValue([]);
        mocks.overwriteBootstrap.mockReset().mockResolvedValue([]);
    });

    it('serializes rapid saves and never lets a stale completion replace newer state', async () => {
        const firstSave = deferred();
        mocks.saveConfig
            .mockImplementationOnce(() => firstSave.promise)
            .mockImplementationOnce(async (config) => config);
        await renderLoadedProvider();

        let firstWaiter;
        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'first'));
            firstWaiter = providerApi.saveNow();
        });
        await waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(1));

        let secondWaiter;
        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'latest'));
            secondWaiter = providerApi.saveNow();
        });
        expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
        expect(providerApi.config.content.hero.title).toBe('latest');

        await act(async () => {
            firstSave.resolve(mocks.saveConfig.mock.calls[0][0]);
            await firstSave.promise;
        });
        await waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(2));
        expect(providerApi.config.content.hero.title).toBe('latest');

        await act(async () => {
            await Promise.all([firstWaiter, secondWaiter]);
        });
        expect(mocks.saveConfig.mock.calls[1][0].content.hero.title).toBe('latest');
        expect(providerApi.persistence).toMatchObject({
            revision: 2,
            persistedRevision: 2,
            dirty: false,
            saving: false,
            status: 'saved',
        });
    });

    it('keeps failed state dirty and succeeds when retrySave is called', async () => {
        mocks.saveConfig
            .mockRejectedValueOnce(new Error('TXT write failed'))
            .mockImplementationOnce(async (config) => config);
        await renderLoadedProvider();

        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'retry me'));
        });
        await expect(providerApi.saveNow()).rejects.toThrow('TXT write failed');
        await waitFor(() => expect(providerApi.persistence.status).toBe('error'));
        expect(providerApi.persistence).toMatchObject({
            revision: 1,
            persistedRevision: 0,
            dirty: true,
            saving: false,
        });

        await act(async () => {
            await providerApi.retrySave();
        });
        expect(mocks.saveConfig).toHaveBeenCalledTimes(2);
        expect(providerApi.persistence).toMatchObject({
            revision: 1,
            persistedRevision: 1,
            dirty: false,
            saving: false,
            status: 'saved',
        });
    });

    it('starts a new loop when a save is requested from the previous save completion', async () => {
        await renderLoadedProvider();

        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'first'));
        });
        await act(async () => {
            await providerApi.saveNow().then(async () => {
                providerApi.updateConfig((config) => withTitle(config, 'second'));
                await providerApi.saveNow();
            });
        });

        expect(mocks.saveConfig).toHaveBeenCalledTimes(2);
        expect(mocks.saveConfig.mock.calls[1][0].content.hero.title).toBe('second');
        expect(providerApi.persistence).toMatchObject({
            revision: 2,
            persistedRevision: 2,
            dirty: false,
        });
    });

    it('does not create phantom revisions for equivalent normalized state', async () => {
        await renderLoadedProvider();

        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'persist once'));
        });
        await act(async () => {
            await providerApi.saveNow();
        });
        expect(providerApi.persistence).toMatchObject({
            revision: 1,
            persistedRevision: 1,
            dirty: false,
        });

        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'persist once'));
        });
        expect(providerApi.persistence).toMatchObject({
            revision: 1,
            persistedRevision: 1,
            dirty: false,
        });
        expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid mutation without replacing the loaded config with defaults', async () => {
        await renderLoadedProvider();

        act(() => {
            providerApi.updateConfig(() => 'invalid');
        });

        expect(providerApi.config.content.hero.title).toBe('initial');
        expect(providerApi.persistence).toMatchObject({
            revision: 0,
            persistedRevision: 0,
            dirty: false,
        });
        expect(mocks.saveConfig).not.toHaveBeenCalled();
    });
});
