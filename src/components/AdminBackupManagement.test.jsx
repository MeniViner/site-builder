import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminBackupManagement from './AdminBackupManagement';

const mocks = vi.hoisted(() => ({
    backendApiClient: {
        listBackups: vi.fn(),
        createBackup: vi.fn(),
        getBackup: vi.fn(),
        deleteBackup: vi.fn(),
        restoreBackup: vi.fn(),
    },
    confirmToast: vi.fn(),
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
    },
    reload: vi.fn(),
    storageState: {
        mongo: true,
        readonly: false,
    },
    sharePointConfig: {
        useMock: false,
    },
}));

vi.mock('../services/storage/backendApiClient', () => ({
    default: mocks.backendApiClient,
}));

vi.mock('../services/storage/storageBackend', () => ({
    STORAGE_BACKENDS: {
        MONGO: 'mongo',
        SHAREPOINT_READONLY: 'sharepoint-readonly',
        LOCAL_DEV: 'local-dev',
    },
    getStorageBackend: () => (mocks.storageState.mongo ? 'mongo' : (mocks.sharePointConfig.useMock ? 'local-dev' : 'sharepoint-readonly')),
    getSiteId: () => 'alpha',
    getBackendApiBaseUrl: () => 'http://127.0.0.1:3001',
    requireBackendApiBaseUrl: () => 'http://127.0.0.1:3001',
    isMongoStorageBackend: () => mocks.storageState.mongo,
    isSharePointReadonlyBackend: () => mocks.storageState.readonly,
    isLocalDevStorageBackend: () => !mocks.storageState.mongo && mocks.sharePointConfig.useMock,
    isStrictPersistentBackend: () => mocks.storageState.mongo,
}));

vi.mock('../context/ConfigProvider', () => ({
    useConfig: () => ({
        config: { schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } },
        reload: mocks.reload,
    }),
}));

vi.mock('../utils/confirmToast', () => ({
    confirmToast: mocks.confirmToast,
}));

vi.mock('react-toastify', () => ({
    toast: mocks.toast,
}));

vi.mock('./BackupSiteLivePreview', () => ({
    default: () => <div data-testid="backup-preview" />,
}));

vi.mock('../utils/sharepointUtils', () => ({
    createBackup: vi.fn(),
    deleteSharePointBackup: vi.fn(),
    listSharePointBackupFiles: vi.fn(),
    listSharePointBackups: vi.fn(),
    readSharePointTextFile: vi.fn(),
    upsertSharePointTextFile: vi.fn(),
}));

vi.mock('../config/sharepoint.config', () => ({
    SHAREPOINT_CONFIG: {
        get useMock() {
            return mocks.sharePointConfig.useMock;
        },
        fileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/events_data.txt',
        navFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/nav_data.txt',
        siteContentFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/site_content_data.txt',
        themeFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/theme_data.txt',
        widgetsFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/widgets_data.txt',
        externalLinksFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/external_links_data.txt',
        ganttFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/gantt_data.txt',
        usersFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/users_data.txt',
        mockStorageKey: 'events',
        navMockStorageKey: 'nav',
        siteContentMockStorageKey: 'content',
        themeMockStorageKey: 'theme',
        widgetsMockStorageKey: 'widgets',
        externalLinksMockStorageKey: 'links',
        ganttMockStorageKey: 'gantt',
        usersMockStorageKey: 'users',
    },
}));

vi.mock('../config/sharepointPaths', () => ({
    SHAREPOINT_PATHS: {
        masterConfigFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/bihs_master_config_v1.txt',
    },
}));

const backupPackage = {
    kind: 'bihs-backup-package',
    version: '1.0.0',
    id: 'backup-one',
    exportedAt: '2026-06-10T10:00:00.000Z',
    source: 'admin-backup-management',
    backup: {
        id: 'backup-one',
        name: 'backup-one',
        timeCreated: '2026-06-10T10:00:00.000Z',
        timeLastModified: '2026-06-10T10:00:00.000Z',
    },
    files: [
        {
            name: 'bihs_master_config_v1.txt',
            text: JSON.stringify({ schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } }),
        },
    ],
    meta: { siteId: 'alpha' },
};

const listBackup = {
    id: 'backup-one',
    name: 'backup-one',
    serverRelativeUrl: 'mongo-backup:backup-one',
    timeCreated: '2026-06-10T10:00:00.000Z',
    timeLastModified: '2026-06-10T10:00:00.000Z',
    fileCount: 1,
    totalSizeBytes: 128,
    version: 1,
    storageBackend: 'mongo',
};

function mockMongoList(backups = [listBackup]) {
    mocks.backendApiClient.listBackups.mockResolvedValue({ ok: true, backups });
}

describe('AdminBackupManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        mocks.storageState.mongo = true;
        mocks.storageState.readonly = false;
        mocks.sharePointConfig.useMock = false;
        mocks.confirmToast.mockResolvedValue(true);
        mockMongoList();
        mocks.backendApiClient.createBackup.mockResolvedValue({ ok: true, backup: listBackup });
        mocks.backendApiClient.getBackup.mockResolvedValue({ ok: true, backup: { ...listBackup, backupPackage } });
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:backup'),
            revokeObjectURL: vi.fn(),
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('loads Mongo backups from the backend API', async () => {
        render(<AdminBackupManagement />);

        expect(await screen.findByText('1 פריטים')).toBeInTheDocument();
        expect(screen.getByText(/גיבויים נשמרים ב-Mongo/)).toBeInTheDocument();
        expect(mocks.backendApiClient.listBackups).toHaveBeenCalledWith('alpha');
    });

    it('creates Mongo backups through the backend and does not write localStorage', async () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /גיבוי מערכת ידני/ }));

        await waitFor(() => expect(mocks.backendApiClient.createBackup).toHaveBeenCalled());
        expect(mocks.backendApiClient.createBackup.mock.calls[0][0]).toBe('alpha');
        expect(mocks.backendApiClient.createBackup.mock.calls[0][1].backupPackage.source).toBe('admin-backup-management');
        expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('shows Mongo backup creation errors', async () => {
        mocks.backendApiClient.createBackup.mockRejectedValueOnce(new Error('Mongo write failed'));
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /גיבוי מערכת ידני/ }));

        expect(await screen.findByText('Mongo write failed')).toBeInTheDocument();
        expect(mocks.toast.error).toHaveBeenCalledWith('Mongo write failed');
    });

    it('downloads Mongo backups by fetching the full backup package', async () => {
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /ייצוא גיבוי/ }));

        await waitFor(() => expect(mocks.backendApiClient.getBackup).toHaveBeenCalledWith('alpha', 'backup-one'));
        expect(clickSpy).toHaveBeenCalled();
    });

    it('keeps localStorage backup listing for non-Mongo mock mode', async () => {
        mocks.storageState.mongo = false;
        mocks.sharePointConfig.useMock = true;
        localStorage.setItem('bihs_dev_backup_packages_v1', JSON.stringify([backupPackage]));

        render(<AdminBackupManagement />);

        expect(await screen.findByText('1 פריטים')).toBeInTheDocument();
        expect(mocks.backendApiClient.listBackups).not.toHaveBeenCalled();
    });
});
