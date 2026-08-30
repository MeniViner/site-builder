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
    reloadBoom: vi.fn(),
    reloadGantt: vi.fn(),
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

vi.mock('../context/BoomContext', () => ({
    useBoom: () => ({ reloadBoom: mocks.reloadBoom }),
}));

vi.mock('../context/GanttContext', () => ({
    useGantt: () => ({ reloadGantt: mocks.reloadGantt }),
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
        boomFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/boom_data.txt',
        usersFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/users_data.txt',
        mockStorageKey: 'events',
        navMockStorageKey: 'nav',
        siteContentMockStorageKey: 'content',
        themeMockStorageKey: 'theme',
        widgetsMockStorageKey: 'widgets',
        externalLinksMockStorageKey: 'links',
        ganttMockStorageKey: 'gantt',
        boomMockStorageKey: 'boom',
        usersMockStorageKey: 'users',
    },
}));

vi.mock('../config/sharepointPaths', () => ({
    SHAREPOINT_PATHS: {
        masterConfigFileServerRelativeUrl: '/sites/alpha/siteDB/siteAssets/bihs_master_config_v1.txt',
    },
}));

const expectedBackupFiles = [
    'bihs_master_config_v1.txt',
    'events_data.txt',
    'nav_data.txt',
    'site_content_data.txt',
    'theme_data.txt',
    'widgets_data.txt',
    'external_links_data.txt',
    'gantt_data.txt',
    'boom_data.txt',
    'users_data.txt',
];

const backupFileData = {
    'bihs_master_config_v1.txt': { schemaVersion: '1.0.0', meta: { appId: 'siteBuilder' } },
    'events_data.txt': { displayCount: 3, displayMode: 'default', events: [{ id: 'event-1', title: 'Event One' }] },
    'nav_data.txt': [],
    'site_content_data.txt': { hero: { title: 'Site title' } },
    'theme_data.txt': {},
    'widgets_data.txt': { activeWidget: ['events'] },
    'external_links_data.txt': [],
    'gantt_data.txt': { items: [], categories: [] },
    'boom_data.txt': { enabled: false, items: [], categories: [] },
    'users_data.txt': [{ id: 'admin-1', name: 'Admin One' }],
};

function recordCountForFile(fileName) {
    const data = backupFileData[fileName];
    if (Array.isArray(data)) return data.length;
    if (fileName === 'events_data.txt') return data.events.length;
    if (fileName === 'gantt_data.txt') return data.items.length;
    if (fileName === 'boom_data.txt') return data.items.length;
    if (data && typeof data === 'object') return Object.keys(data).length > 0 ? 1 : 0;
    return 0;
}

function statusForFile(fileName) {
    const data = backupFileData[fileName];
    if (Array.isArray(data)) return data.length > 0 ? 'hasData' : 'empty';
    if (data && typeof data === 'object') return Object.keys(data).length > 0 ? 'hasData' : 'empty';
    return 'missing';
}

const fullBackupFiles = expectedBackupFiles.map((fileName) => {
    const status = statusForFile(fileName);
    return {
        name: fileName,
        text: JSON.stringify(backupFileData[fileName], null, 2),
        status,
        restoreStatus: status,
        restoreAction: 'will_restore',
        willRestore: true,
        empty: status === 'empty',
        missing: false,
        invalid: false,
        recordCount: recordCountForFile(fileName),
        sizeBytes: JSON.stringify(backupFileData[fileName], null, 2).length,
    };
});

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
    files: fullBackupFiles,
    meta: {
        siteId: 'alpha',
        captureStrategy: 'server-full-site',
        expectedLegacyFiles: expectedBackupFiles,
        restoreEntries: fullBackupFiles.map((file) => ({
            fileName: file.name,
            status: file.status,
            restoreStatus: file.restoreStatus,
            restoreAction: file.restoreAction,
            willRestore: file.willRestore,
            empty: file.empty,
            missing: file.missing,
            invalid: file.invalid,
            recordCount: file.recordCount,
            sizeBytes: file.sizeBytes,
        })),
    },
};

const listBackup = {
    id: 'backup-one',
    name: 'backup-one',
    serverRelativeUrl: 'mongo-backup:backup-one',
    timeCreated: '2026-06-10T10:00:00.000Z',
    timeLastModified: '2026-06-10T10:00:00.000Z',
    fileCount: expectedBackupFiles.length,
    totalSizeBytes: 128,
    version: 1,
    storageBackend: 'mongo',
    files: fullBackupFiles.map((file) => {
        const summary = { ...file };
        delete summary.text;
        return summary;
    }),
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
        mocks.reload.mockResolvedValue(true);
        mocks.reloadBoom.mockResolvedValue(true);
        mocks.reloadGantt.mockResolvedValue(true);
        mockMongoList();
        mocks.backendApiClient.createBackup.mockResolvedValue({ ok: true, backup: listBackup });
        mocks.backendApiClient.getBackup.mockResolvedValue({ ok: true, backup: { ...listBackup, backupPackage } });
        mocks.backendApiClient.deleteBackup.mockResolvedValue({ ok: true, backup: { ...listBackup, deletedAt: '2026-06-10T11:00:00.000Z' } });
        mocks.backendApiClient.restoreBackup.mockResolvedValue({ ok: true, restoredFiles: 1 });
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
        expect(mocks.backendApiClient.createBackup.mock.calls[0][1].backupPackage.meta).toMatchObject({
            captureStrategy: 'server-full-site',
            expectedLegacyFiles: expectedBackupFiles,
        });
        await waitFor(() => expect(mocks.backendApiClient.listBackups).toHaveBeenCalledTimes(2));
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

    it('downloads Mongo backup JSON with all expected legacy entries', async () => {
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const RealBlob = globalThis.Blob;
        const blobPayloads = [];
        class CapturingBlob extends RealBlob {
            constructor(parts, options) {
                super(parts, options);
                blobPayloads.push(parts.join(''));
            }
        }
        vi.stubGlobal('Blob', CapturingBlob);
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /ייצוא גיבוי/ }));

        await waitFor(() => expect(mocks.backendApiClient.getBackup).toHaveBeenCalledWith('alpha', 'backup-one'));
        expect(clickSpy).toHaveBeenCalled();
        const exported = JSON.parse(blobPayloads[0]);
        expect(exported.files.map((file) => file.name)).toEqual(expectedBackupFiles);
        expect(exported.meta.restoreEntries).toHaveLength(expectedBackupFiles.length);
    });

    it('deletes Mongo backups through the backend and refreshes the list', async () => {
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /מחק/ }));

        await waitFor(() => expect(mocks.backendApiClient.deleteBackup).toHaveBeenCalledWith('alpha', 'backup-one', { expectedVersion: 1 }));
        await waitFor(() => expect(mocks.backendApiClient.listBackups).toHaveBeenCalledTimes(2));
    });

    it('restores Mongo backups through the backend and refreshes after reload', async () => {
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /בחר גיבוי מלא/ }));
        await waitFor(() => expect(mocks.backendApiClient.getBackup).toHaveBeenCalledWith('alpha', 'backup-one'));
        expectedBackupFiles.forEach((fileName) => {
            expect(screen.getAllByText(fileName).length).toBeGreaterThan(0);
        });

        fireEvent.click(await screen.findByRole('button', { name: /שחזור מהגיבוי הזה/ }));

        await waitFor(() => expect(mocks.backendApiClient.restoreBackup).toHaveBeenCalledWith('alpha', 'backup-one', expect.objectContaining({
            expectedBackupVersion: 1,
            selectedRestoreUnitIds: expect.arrayContaining([expect.stringMatching(/^ru-/)]),
        })));
        expect(mocks.reload).toHaveBeenCalled();
        expect(mocks.reloadBoom).toHaveBeenCalled();
        expect(mocks.reloadGantt).toHaveBeenCalled();
        await waitFor(() => expect(mocks.backendApiClient.listBackups).toHaveBeenCalledTimes(2));
    });

    it('selects and deselects restore items, and supports select-all and clear-all', async () => {
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /בחר גיבוי מלא/ }));
        const eventCheckboxes = await screen.findAllByRole('checkbox');
        expect(eventCheckboxes.length).toBeGreaterThan(0);

        fireEvent.click(screen.getByRole('button', { name: /נקה בחירה/ }));
        expect(screen.getByRole('button', { name: /שחזור מהגיבוי הזה/ })).toBeDisabled();
        expect(await screen.findByText(/יש לבחור לפחות פריט אחד/)).toBeInTheDocument();
        screen
            .getAllByRole('checkbox')
            .forEach((checkbox) => expect(checkbox).not.toBeChecked());

        fireEvent.click(screen.getByRole('button', { name: /סימון הכל/ }));
        const checkedAfterSelectAll = screen.getAllByRole('checkbox').filter((checkbox) => checkbox.disabled === false);
        expect(checkedAfterSelectAll).toHaveLength(checkedAfterSelectAll.filter((checkbox) => checkbox.checked).length);
        expect(screen.getByRole('button', { name: /שחזור מהגיבוי הזה/ })).not.toBeDisabled();
    });

    it('disables non-restorable restore entries and explains why', async () => {
        const invalidRestoreEntries = backupPackage.meta.restoreEntries.map((entry) => (entry.fileName === 'users_data.txt'
            ? {
                ...entry,
                restoreAction: 'skipped',
                willRestore: false,
                status: 'invalid',
                invalid: true,
            }
            : entry));
        const invalidBackupPackage = {
            ...backupPackage,
            meta: {
                ...backupPackage.meta,
                restoreEntries: invalidRestoreEntries,
            },
        };
        mocks.backendApiClient.getBackup.mockResolvedValueOnce({ ok: true, backup: { ...listBackup, backupPackage: invalidBackupPackage } });

        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /בחר גיבוי מלא/ }));
        const disabledCheckbox = await screen.findByRole('checkbox', { name: /גיבוי מנהלים/ });
        expect(disabledCheckbox).toBeDisabled();
        expect(screen.getByText(/הקובץ אינו תקין\./)).toBeInTheDocument();
    });

    it('warns when destructive selected entries are included', async () => {
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /בחר גיבוי מלא/ }));
        const restoreButton = await screen.findByRole('button', { name: /שחזור מהגיבוי הזה/ });
        fireEvent.click(restoreButton);

        await waitFor(() => expect(mocks.confirmToast).toHaveBeenCalled());
        expect(mocks.confirmToast.mock.calls[0][0].message).toContain('אזהרה: פריטים ריקים עשויים למחוק מידע קיים במהלך השחזור.');
    });

    it('posts only selected restore-unit IDs to the restore endpoint', async () => {
        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /בחר גיבוי מלא/ }));
        const navCheckbox = await screen.findByRole('checkbox', { name: /גיבוי ניווט/ });
        fireEvent.click(navCheckbox); // disable this item

        fireEvent.click(await screen.findByRole('button', { name: /שחזור מהגיבוי הזה/ }));
        await waitFor(() => expect(mocks.backendApiClient.restoreBackup).toHaveBeenCalled());

        const payload = mocks.backendApiClient.restoreBackup.mock.calls[0][2];
        const checked = screen.getAllByRole('checkbox').filter((checkbox) => checkbox.checked).length;
        expect(payload.selectedRestoreUnitIds).toHaveLength(checked);
        expect(payload.selectedRestoreUnitIds.every((item) => typeof item === 'string' && item.startsWith('ru-'))).toBe(true);
    });

    it('shows selective restore result summary after success', async () => {
        mocks.backendApiClient.restoreBackup.mockResolvedValueOnce({
            ok: true,
            restoreStatus: 'completed',
            selectedRestoreUnitIds: ['ru-one-events'],
            selectedItemCount: 1,
            restored: [{ fileName: 'events_data.txt', restoreUnitId: 'ru-one-events-data-events-event-one-events', outcome: 'restored' }],
            failed: [],
            notSelectedItems: [],
            restoredFiles: 1,
            restoredRecordCount: 1,
            selectedRecordCount: 1,
        });

        render(<AdminBackupManagement />);
        await screen.findByText('1 פריטים');

        fireEvent.click(screen.getByRole('button', { name: /בחר גיבוי מלא/ }));
        fireEvent.click(await screen.findByRole('button', { name: /נקה בחירה/ }));
        fireEvent.click(await screen.findByRole('checkbox', { name: /גיבוי אירועים/ }));
        fireEvent.click(await screen.findByRole('button', { name: /שחזור מהגיבוי הזה/ }));

        expect(await screen.findByText(/תוצאות השחזור/)).toBeInTheDocument();
        expect(screen.getByText(/שוחזרו: 1 · נכשלים: 0/)).toBeInTheDocument();
        expect(screen.getByText(/פריטים שנבחרו: 1/)).toBeInTheDocument();
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
