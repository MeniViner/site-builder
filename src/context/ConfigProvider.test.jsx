import React, { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigProvider, useConfig } from './ConfigProvider';
import {
    getAdminRecoveryStorageKey,
    beginAdminPersistenceSuspension,
    endAdminPersistenceSuspension,
    quiesceAdminPersistence,
    resetAdminEditSessionForTests,
    setAdminRecoveryScope,
} from '../utils/adminEditSession';

const mocks = vi.hoisted(() => ({
    loadConfigEnvelope: vi.fn(),
    saveConfig: vi.fn(),
    saveResolvedConfig: vi.fn(),
    ensureBootstrap: vi.fn(),
    overwriteBootstrap: vi.fn(),
    kashar: false,
}));

vi.mock('../services/ConfigService', () => ({
    default: {
        loadConfigEnvelope: mocks.loadConfigEnvelope,
        saveConfig: mocks.saveConfig,
        saveResolvedConfig: mocks.saveResolvedConfig,
        getVersionState: () => ({ accepted: null, observedRemote: null }),
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

vi.mock('../demo-data/demoProfile', () => ({
    isKasharDemoProfile: () => mocks.kashar,
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
        sessionStorage.clear();
        resetAdminEditSessionForTests();
        setAdminRecoveryScope({ backend: 'txt', target: '/sites/test/data', user: 'tester' });
        mocks.loadConfigEnvelope.mockReset().mockResolvedValue({
            source: 'test',
            config: {
                schemaVersion: '1.0.0',
                content: { hero: { title: 'initial' } },
            },
        });
        mocks.saveConfig.mockReset().mockImplementation(async (config) => config);
        mocks.saveResolvedConfig.mockReset().mockImplementation(async (config) => config);
        mocks.ensureBootstrap.mockReset().mockResolvedValue([]);
        mocks.overwriteBootstrap.mockReset().mockResolvedValue([]);
        mocks.kashar = false;
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

    it('rebases edits made during an in-flight write onto the verified saved response', async () => {
        const firstSave = deferred();
        mocks.saveConfig
            .mockImplementationOnce(() => firstSave.promise)
            .mockImplementationOnce(async (config) => config);
        await renderLoadedProvider();

        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'first'));
            providerApi.saveNow();
        });
        await waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(1));

        act(() => {
            providerApi.updateConfig((config) => ({
                ...config,
                content: {
                    ...config.content,
                    hero: { ...config.content.hero, subtitle: 'edit while saving' },
                },
            }));
            providerApi.saveNow();
        });

        const verifiedFirst = {
            ...mocks.saveConfig.mock.calls[0][0],
            content: {
                ...mocks.saveConfig.mock.calls[0][0].content,
                hero: {
                    ...mocks.saveConfig.mock.calls[0][0].content.hero,
                    logoUrl: '/remote-logo.svg',
                },
            },
        };
        await act(async () => {
            firstSave.resolve(verifiedFirst);
            await firstSave.promise;
        });
        await waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(2));

        expect(mocks.saveConfig.mock.calls[1][0].content.hero).toMatchObject({
            title: 'first',
            subtitle: 'edit while saving',
            logoUrl: '/remote-logo.svg',
        });
    });

    it('blocks a follow-up save when an in-flight edit overlaps the verified remote response', async () => {
        const firstSave = deferred();
        mocks.saveConfig.mockImplementationOnce(() => firstSave.promise);
        await renderLoadedProvider();

        let firstWaiter;
        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'first'));
            firstWaiter = providerApi.saveNow();
        });
        await waitFor(() => expect(mocks.saveConfig).toHaveBeenCalledTimes(1));

        let conflictingWaiter;
        act(() => {
            providerApi.updateConfig((config) => ({
                ...config,
                content: {
                    ...config.content,
                    hero: { ...config.content.hero, subtitle: 'local subtitle' },
                },
            }));
            conflictingWaiter = providerApi.saveNow();
        });
        const conflictingResult = conflictingWaiter.catch((error) => error);

        const verifiedRemote = {
            ...mocks.saveConfig.mock.calls[0][0],
            content: {
                ...mocks.saveConfig.mock.calls[0][0].content,
                hero: {
                    ...mocks.saveConfig.mock.calls[0][0].content.hero,
                    subtitle: 'remote subtitle',
                },
            },
        };
        await act(async () => {
            firstSave.resolve(verifiedRemote);
            await firstSave.promise;
        });

        await expect(firstWaiter).resolves.toMatchObject({
            content: { hero: { title: 'first' } },
        });
        await expect(conflictingResult).resolves.toMatchObject({
            code: 'UNRESOLVED_CONFIG_CONFLICT',
        });
        await waitFor(() => expect(providerApi.persistence.status).toBe('error'));
        expect(providerApi.config.content.hero.subtitle).toBe('local subtitle');
        expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
        await expect(providerApi.retrySave()).rejects.toMatchObject({
            code: 'UNRESOLVED_CONFIG_CONFLICT',
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

    it('shows a blocking error instead of falling back when Kashar draft storage cannot load', async () => {
        mocks.kashar = true;
        mocks.loadConfigEnvelope.mockRejectedValueOnce(new Error('Kashar draft storage is unavailable'));

        render(<ConfigProvider><Probe /></ConfigProvider>);

        expect(await screen.findByText('טעינת נתוני האתר נכשלה')).toBeInTheDocument();
        expect(screen.getByText('Kashar draft storage is unavailable')).toBeInTheDocument();
        expect(screen.getByText('Kashar draft recovery (development only)')).toBeInTheDocument();
        expect(mocks.saveConfig).not.toHaveBeenCalled();
    });

    it('does not initialize recovery controls in normal mode', async () => {
        await renderLoadedProvider();

        expect(screen.queryByText('Kashar draft recovery (development only)')).not.toBeInTheDocument();
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

    it('shows an operable Hebrew conflict workflow and saves the reviewed resolution conditionally', async () => {
        await renderLoadedProvider();
        const baseline = providerApi.config;
        const remote = withTitle(baseline, 'כותרת מהשרת');
        mocks.saveConfig.mockRejectedValueOnce(Object.assign(new Error('conflict'), {
            code: 'version_conflict',
            resolutionMessage: 'נדרשת הכרעה',
            details: {
                conflicts: ['$.content.hero.title'],
                accepted: { text: JSON.stringify(baseline), etag: '"v1"' },
                remote: { text: JSON.stringify(remote), etag: '"v2"' },
            },
        }));

        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'כותרת מקומית'));
        });
        await act(async () => {
            await expect(providerApi.saveNow()).rejects.toThrow();
        });

        expect(screen.getByRole('dialog', { name: 'פתרון התנגשות שמירה' })).toBeInTheDocument();
        expect(screen.getByText('$.content.hero.title')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('radio', { name: 'השארת הטיוטה המקומית' }));
        fireEvent.click(screen.getByRole('button', { name: 'שמירת ההכרעה מול הגרסה שנבדקה' }));

        await waitFor(() => expect(mocks.saveResolvedConfig).toHaveBeenCalledWith(
            expect.objectContaining({ content: expect.objectContaining({ hero: expect.objectContaining({ title: 'כותרת מקומית' }) }) }),
            '"v2"',
        ));
        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'פתרון התנגשות שמירה' })).not.toBeInTheDocument());
    });

    it('hydrates a recoverable local draft only after loading fresh server state', async () => {
        sessionStorage.setItem(getAdminRecoveryStorageKey(), JSON.stringify({
            version: 2,
            scope: { backend: 'txt', target: '/sites/test/data', user: 'tester' },
            participants: {
                'persistence:master-config': {
                    schemaVersion: '1.0.0',
                    content: { hero: { title: 'recovered draft' } },
                },
            },
        }));

        await renderLoadedProvider();

        expect(mocks.loadConfigEnvelope).toHaveBeenCalledOnce();
        expect(providerApi.config.content.hero.title).toBe('recovered draft');
        expect(providerApi.persistence).toMatchObject({
            revision: 1,
            persistedRevision: 0,
            dirty: true,
        });
    });

    it('blocks new mutations while allowing the registered persistence controller to quiesce', async () => {
        await renderLoadedProvider();
        act(() => {
            providerApi.updateConfig((config) => withTitle(config, 'queued before freeze'));
        });

        beginAdminPersistenceSuspension('restore');
        expect(() => providerApi.updateConfig((config) => withTitle(config, 'blocked'))).toThrow('מוקפאת');
        await act(async () => {
            await quiesceAdminPersistence();
        });

        expect(mocks.saveConfig).toHaveBeenCalledOnce();
        expect(providerApi.persistence).toMatchObject({ dirty: false, saving: false });
        endAdminPersistenceSuspension();
    });

    it('discards a recovery draft when an authoritative restore reload is requested', async () => {
        sessionStorage.setItem(getAdminRecoveryStorageKey(), JSON.stringify({
            version: 2,
            scope: { backend: 'txt', target: '/sites/test/data', user: 'tester' },
            participants: {
                'persistence:master-config': {
                    baseline: {
                        schemaVersion: '1.0.0',
                        content: { hero: { title: 'initial' } },
                    },
                    draft: {
                        schemaVersion: '1.0.0',
                        content: { hero: { title: 'stale local draft' } },
                    },
                },
            },
        }));
        await renderLoadedProvider();
        expect(providerApi.config.content.hero.title).toBe('stale local draft');

        await act(async () => {
            await providerApi.reload({ discardLocal: true });
        });

        expect(providerApi.config.content.hero.title).toBe('initial');
        expect(providerApi.persistence.dirty).toBe(false);
    });
});
