import { describe, expect, it } from 'vitest';
import {
    BACKUP_PACKAGE_KIND,
    createBackupManifest,
    createBackupPackage,
    deriveBackupFileRecordCount,
    normalizeImportedBackupPackage,
    packageToFileTextsMap,
    countBackupFileRecords,
    packageToBackupListItem,
    validateRestorePlan,
    verifyBackupManifest,
} from './backupPackage';
import { beginTxtBackup, finalizeTxtBackup } from './txtBackupPersistence';

describe('backupPackage', () => {
    it('creates a portable package with normalized text files', () => {
        const backupPackage = createBackupPackage({
            backup: { id: 'backup-1', name: 'Manual backup' },
            files: [{ name: 'bihs_master_config_v1.txt', text: '{"schemaVersion":"1.0.0"}' }],
            source: 'dev-local',
            exportedAt: '2026-05-20T10:00:00.000Z',
        });

        expect(backupPackage.kind).toBe(BACKUP_PACKAGE_KIND);
        expect(backupPackage.id).toBe('backup-1');
        expect(backupPackage.files).toHaveLength(1);
        expect(backupPackage.files[0].sizeBytes).toBeGreaterThan(0);
    });

    it('normalizes a raw config file as a master-config backup', () => {
        const backupPackage = normalizeImportedBackupPackage(
            { schemaVersion: '1.0.0', theme: { primaryColor: '#123456' } },
            { masterFileName: 'master.txt' },
        );

        expect(backupPackage.files[0].name).toBe('master.txt');
        expect(packageToFileTextsMap(backupPackage).has('master.txt')).toBe(true);
    });

    it('rejects package files without backup entries', () => {
        expect(() => normalizeImportedBackupPackage({ kind: BACKUP_PACKAGE_KIND, files: [] }))
            .toThrow('קובץ הגיבוי לא כולל קבצים לשחזור.');
    });

    it('derives schema-aware counts when legacy metadata is absent or stale', () => {
        const backupPackage = createBackupPackage({
            files: [
                { name: 'boom_data.txt', text: JSON.stringify({ items: [{ id: '1' }, { id: '2' }] }), recordCount: 0 },
                { name: 'events_data.txt', text: JSON.stringify({ events: [{ id: 'e1' }] }) },
            ],
        });
        const summary = packageToBackupListItem(backupPackage);

        expect(summary.files.map((file) => file.recordCount)).toEqual([2, 1]);
        expect(countBackupFileRecords('widgets_data.txt', {
            alerts: { items: [{ id: 'a' }] },
            polls: { items: [{ id: 'p1' }, { id: 'p2' }] },
        })).toBe(3);
    });

    it('preserves Image Gallery configuration through export and import', () => {
        const config = {
            schemaVersion: '1.0.0',
            imageGalleries: {
                schemaVersion: 1,
                items: [{
                    id: 'gallery-1',
                    title: 'Gallery',
                    active: true,
                    style: 'classic-carousel',
                    order: 0,
                    images: [{
                        id: 'image-1',
                        mediaRef: '/images/ImageGallery/photo.webp',
                        alt: 'Training photo',
                        caption: 'Morning training',
                        width: 1600,
                        height: 900,
                        media: { fileName: 'photo.webp', mimeType: 'image/webp', sizeBytes: 100 },
                    }],
                    display: {
                        magalStrips: {
                            rowCount: 2,
                            cardSizePx: 196,
                            gapPx: 16,
                            rows: [
                                { id: 'row-1', direction: 'left', durationSeconds: 33, angleDegrees: 3 },
                                { id: 'row-2', direction: 'right', durationSeconds: 41, angleDegrees: -3 },
                            ],
                        },
                    },
                }],
            },
        };
        const backup = normalizeImportedBackupPackage(config);
        const restored = JSON.parse(packageToFileTextsMap(backup).get('bihs_master_config_v1.txt'));

        expect(restored.imageGalleries.items[0].images[0]).toMatchObject({
            mediaRef: '/images/ImageGallery/photo.webp',
            alt: 'Training photo',
        });
        expect(restored.imageGalleries.items[0].display.magalStrips).toMatchObject({
            rowCount: 2,
            cardSizePx: 196,
            gapPx: 16,
        });
    });

    it('reports an unknown record count instead of turning unreadable payloads into zero', () => {
        expect(deriveBackupFileRecordCount('events_data.txt', undefined)).toBeNull();
        expect(deriveBackupFileRecordCount('events_data.txt', '{bad json')).toBeNull();
        expect(deriveBackupFileRecordCount('events_data.txt', 'null')).toBeNull();
        expect(deriveBackupFileRecordCount('events_data.txt', '{"unexpected":[]}')).toBeNull();
        expect(deriveBackupFileRecordCount('events_data.txt', '{"events":[]}')).toBe(0);
    });

    it('cannot complete a manifest with zero required files', () => {
        const manifest = createBackupManifest({ operationId: 'op-1', requiredFileNames: [] });
        expect(() => verifyBackupManifest(manifest, new Map())).toThrow(/קבצים נדרשים/);
    });

    it('marks a backup complete only after every required TXT payload reads back exactly', () => {
        const files = new Map([
            ['master.txt', '{"ok":true}'],
            ['events.txt', '[]'],
        ]);
        const manifest = createBackupManifest({
            operationId: 'op-1',
            requiredFileNames: [...files.keys()],
            fileTextsByName: files,
        });

        expect(manifest.status).toBe('pending');
        expect(verifyBackupManifest(manifest, files)).toMatchObject({
            status: 'complete',
            verifiedFileCount: 2,
        });
        expect(verifyBackupManifest(manifest, new Map([['master.txt', '{"ok":false}']]))).toMatchObject({
            status: 'partial',
        });
    });

    it('validates every selected payload and destination before any restore write is allowed', () => {
        expect(() => validateRestorePlan({
            selectedEntries: [
                { restoreUnitId: 'one', fileName: 'master.txt', canRestore: true },
                { restoreUnitId: 'two', fileName: 'unknown.txt', canRestore: true },
            ],
            fileTextsByName: new Map([
                ['master.txt', '{"ok":true}'],
                ['unknown.txt', '{bad'],
            ]),
            targetByFileName: { 'master.txt': '/site/master.txt' },
        })).toThrow(/unknown\.txt/);
    });

    it('round-trips a SharePoint TXT fixture through pending and complete manifests', async () => {
        const folder = '/sites/alpha/siteAssets/Backups/backup-1';
        const storage = new Map([
            [`${folder}/master.txt`, '{"schemaVersion":"1.0.0"}'],
            [`${folder}/events.txt`, '{"events":[]}'],
        ]);
        const writes = [];
        const expectedTextsByName = new Map([
            ['master.txt', '{"schemaVersion":"1.0.0"}'],
            ['events.txt', '{"events":[]}'],
        ]);
        const io = {
            readText: async (path) => storage.get(path),
            writeText: async (path, text) => {
                writes.push(JSON.parse(text).status);
                storage.set(path, text);
            },
        };
        const pendingManifest = await beginTxtBackup({
            backupFolderPath: folder,
            requiredFileNames: ['master.txt', 'events.txt'],
            expectedTextsByName,
            operationId: 'fixture-operation',
            ...io,
        });
        const manifest = await finalizeTxtBackup({
            backupFolderPath: folder,
            requiredFileNames: ['master.txt', 'events.txt'],
            expectedTextsByName,
            pendingManifest,
            ...io,
        });

        expect(writes).toEqual(['pending', 'complete']);
        expect(manifest).toMatchObject({
            operationId: 'fixture-operation',
            status: 'complete',
            verifiedFileCount: 2,
        });
    });

    it('classifies a SharePoint 409 manifest collision instead of accepting it', async () => {
        await expect(beginTxtBackup({
            backupFolderPath: '/sites/alpha/siteAssets/Backups/backup-1',
            requiredFileNames: ['master.txt'],
            readText: async () => '{}',
            expectedTextsByName: new Map([['master.txt', '{}']]),
            writeText: async () => {
                const error = new Error('SharePoint save failed (409): collision');
                error.status = 409;
                throw error;
            },
        })).rejects.toMatchObject({
            code: 'backup_path_conflict',
            category: 'collision',
            status: 409,
        });
    });
});
