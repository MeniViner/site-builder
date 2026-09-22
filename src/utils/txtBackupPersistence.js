import {
    createBackupManifest,
    createBackupOperationId,
    verifyBackupManifest,
} from './backupPackage';

export const TXT_BACKUP_MANIFEST_FILE_NAME = 'backup-manifest.txt';
export { createBackupOperationId };

export class TxtBackupPersistenceError extends Error {
    constructor(message, { code = 'txt_backup_failed', category = 'verification', status = 0 } = {}) {
        super(message);
        this.name = 'TxtBackupPersistenceError';
        this.code = code;
        this.category = category;
        this.status = status;
    }
}

export function classifyTxtBackupError(error) {
    const status = Number(error?.status || error?.response?.status || String(error?.message || '').match(/\((\d{3})\)/)?.[1] || 0);
    if (status === 409) {
        return new TxtBackupPersistenceError('נתיב הגיבוי תפוס או נעול ב-SharePoint.', {
            status,
            code: 'backup_path_conflict',
            category: 'collision',
        });
    }
    return error;
}

export async function beginTxtBackup({
    backupFolderPath,
    requiredFileNames,
    writeText,
    readText,
    expectedTextsByName,
    operationId = createBackupOperationId('txt-backup'),
} = {}) {
    const folderPath = String(backupFolderPath || '').replace(/\/+$/, '');
    const required = [...new Set((requiredFileNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
    if (!folderPath) throw new Error('חסר נתיב לתיקיית הגיבוי.');
    if (required.length === 0) throw new Error('לא ניתן ליצור גיבוי ללא קבצים נדרשים.');
    if (typeof writeText !== 'function' || typeof readText !== 'function') {
        throw new Error('חסר חיבור מלא ל-SharePoint לצורך יצירת מניפסט.');
    }

    const expectedSnapshot = expectedTextsByName instanceof Map
        ? expectedTextsByName
        : new Map(Object.entries(expectedTextsByName || {}));
    const pending = createBackupManifest({
        operationId,
        requiredFileNames: required,
        fileTextsByName: expectedSnapshot,
    });
    const manifestPath = `${folderPath}/${TXT_BACKUP_MANIFEST_FILE_NAME}`;
    const pendingText = JSON.stringify(pending, null, 2);
    try {
        await writeText(manifestPath, pendingText);
        const readBack = await readText(manifestPath);
        if (readBack !== pendingText) {
            throw new TxtBackupPersistenceError('אימות מניפסט הגיבוי הממתין נכשל.', {
                code: 'backup_manifest_mismatch',
            });
        }
        return pending;
    } catch (error) {
        throw classifyTxtBackupError(error);
    }
}

export async function finalizeTxtBackup({
    backupFolderPath,
    requiredFileNames,
    readText,
    writeText,
    expectedTextsByName,
    pendingManifest = null,
    forcePartial = false,
} = {}) {
    const folderPath = String(backupFolderPath || '').replace(/\/+$/, '');
    if (!folderPath) throw new Error('חסר נתיב לתיקיית הגיבוי.');
    if (typeof readText !== 'function' || typeof writeText !== 'function') {
        throw new Error('חסר חיבור מלא ל-SharePoint לצורך אימות הגיבוי.');
    }

    const required = [...new Set((requiredFileNames || []).map((name) => String(name || '').trim()).filter(Boolean))];
    if (required.length === 0) throw new Error('לא ניתן ליצור גיבוי ללא קבצים נדרשים.');

    try {
        if (!pendingManifest || pendingManifest.status !== 'pending') {
            throw new Error('חסר מניפסט ממתין שאומת לפני כתיבת קבצי הגיבוי.');
        }
        const expectedSnapshot = expectedTextsByName instanceof Map
            ? expectedTextsByName
            : new Map(Object.entries(expectedTextsByName || {}));
        const pending = pendingManifest;
        const manifestPath = `${folderPath}/${TXT_BACKUP_MANIFEST_FILE_NAME}`;

        const readBackEntries = await Promise.all(required.map(async (name) => {
            try {
                return [name, await readText(`${folderPath}/${name}`)];
            } catch (error) {
                if (Number(error?.status || 0) === 404) return [name, undefined];
                throw error;
            }
        }));
        const readBackTexts = new Map(readBackEntries);
        const fingerprintVerified = verifyBackupManifest(pending, readBackTexts);
        const exactFiles = fingerprintVerified.files.map((file) => ({
            ...file,
            verified: typeof expectedSnapshot.get(file.name) === 'string'
                && readBackTexts.get(file.name) === expectedSnapshot.get(file.name),
        }));
        const verifiedFileCount = exactFiles.filter((file) => file.verified).length;
        const verified = {
            ...fingerprintVerified,
            status: verifiedFileCount === required.length ? 'complete' : 'partial',
            verifiedFileCount,
            files: exactFiles,
        };
        const finalManifest = forcePartial && verified.status === 'complete'
            ? { ...verified, status: 'partial' }
            : verified;
        const finalText = JSON.stringify(finalManifest, null, 2);
        await writeText(manifestPath, finalText);
        const manifestReadBack = await readText(manifestPath);
        if (manifestReadBack !== finalText) {
            throw new TxtBackupPersistenceError('אימות מניפסט הגיבוי נכשל.', {
                code: 'backup_manifest_mismatch',
            });
        }
        return finalManifest;
    } catch (error) {
        throw classifyTxtBackupError(error);
    }
}
