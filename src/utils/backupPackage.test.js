import { describe, expect, it } from 'vitest';
import {
    BACKUP_PACKAGE_KIND,
    createBackupPackage,
    normalizeImportedBackupPackage,
    packageToFileTextsMap,
} from './backupPackage';

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
});
