export const BACKUP_PACKAGE_KIND = 'bihs-backup-package';
export const BACKUP_PACKAGE_VERSION = '1.0.0';

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createId(prefix = 'backup') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function calculateTextSizeBytes(text) {
    const value = typeof text === 'string' ? text : '';
    if (typeof TextEncoder !== 'undefined') {
        return new TextEncoder().encode(value).length;
    }
    return value.length;
}

function normalizeFileEntry(file, index) {
    const source = isObject(file) ? file : {};
    const fallbackName = `backup-file-${index + 1}.txt`;
    const name = typeof source.name === 'string' && source.name.trim()
        ? source.name.trim()
        : fallbackName;
    const text = typeof source.text === 'string'
        ? source.text
        : JSON.stringify(source.text ?? '', null, 2);
    const sizeBytes = Number.isFinite(Number(source.sizeBytes))
        ? Number(source.sizeBytes)
        : calculateTextSizeBytes(text);

    return {
        name,
        label: typeof source.label === 'string' ? source.label : '',
        serverRelativeUrl: typeof source.serverRelativeUrl === 'string' ? source.serverRelativeUrl : '',
        targetServerRelativeUrl: typeof source.targetServerRelativeUrl === 'string' ? source.targetServerRelativeUrl : '',
        url: typeof source.url === 'string' ? source.url : '',
        timeCreated: typeof source.timeCreated === 'string' ? source.timeCreated : '',
        timeLastModified: typeof source.timeLastModified === 'string' ? source.timeLastModified : '',
        sizeBytes,
        text,
    };
}

export function createBackupPackage({
    backup = {},
    files = [],
    source = 'manual',
    exportedAt = new Date().toISOString(),
    meta = {},
} = {}) {
    const backupSource = isObject(backup) ? backup : {};
    const normalizedFiles = Array.isArray(files)
        ? files.map(normalizeFileEntry).filter((file) => file.name && typeof file.text === 'string')
        : [];
    const id = typeof backupSource.id === 'string' && backupSource.id.trim()
        ? backupSource.id.trim()
        : createId('backup');

    return {
        kind: BACKUP_PACKAGE_KIND,
        version: BACKUP_PACKAGE_VERSION,
        id,
        exportedAt,
        source,
        backup: {
            id,
            name: typeof backupSource.name === 'string' ? backupSource.name : '',
            serverRelativeUrl: typeof backupSource.serverRelativeUrl === 'string' ? backupSource.serverRelativeUrl : '',
            url: typeof backupSource.url === 'string' ? backupSource.url : '',
            timeCreated: typeof backupSource.timeCreated === 'string' ? backupSource.timeCreated : exportedAt,
            timeLastModified: typeof backupSource.timeLastModified === 'string' ? backupSource.timeLastModified : exportedAt,
        },
        files: normalizedFiles,
        meta: isObject(meta) ? meta : {},
    };
}

export function normalizeImportedBackupPackage(candidate, { masterFileName = 'bihs_master_config_v1.txt' } = {}) {
    if (!isObject(candidate)) {
        throw new Error('קובץ הגיבוי אינו מכיל JSON תקין של מערכת האתר.');
    }

    if (candidate.kind === BACKUP_PACKAGE_KIND || Array.isArray(candidate.files)) {
        const sourceFiles = Array.isArray(candidate.files) ? candidate.files : [];
        const normalized = createBackupPackage({
            backup: isObject(candidate.backup) ? {
                ...candidate.backup,
                id: typeof candidate.id === 'string' ? candidate.id : candidate.backup?.id,
            } : {
                id: typeof candidate.id === 'string' ? candidate.id : undefined,
            },
            files: sourceFiles,
            source: typeof candidate.source === 'string' ? candidate.source : 'imported-package',
            exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
            meta: isObject(candidate.meta) ? candidate.meta : {},
        });

        if (normalized.files.length === 0) {
            throw new Error('קובץ הגיבוי לא כולל קבצים לשחזור.');
        }

        return normalized;
    }

    return createBackupPackage({
        backup: {
            id: createId('imported-config'),
            name: 'imported-config',
        },
        files: [
            {
                name: masterFileName,
                text: JSON.stringify(candidate, null, 2),
            },
        ],
        source: 'imported-config',
        meta: {
            importedAsRawConfig: true,
        },
    });
}

export function packageToFileTextsMap(backupPackage) {
    const fileTextsByName = new Map();
    const files = Array.isArray(backupPackage?.files) ? backupPackage.files : [];
    files.forEach((file) => {
        if (file?.name && typeof file.text === 'string') {
            fileTextsByName.set(file.name, file.text);
        }
    });
    return fileTextsByName;
}

export function packageToBackupListItem(backupPackage, { idPrefix = 'backup-package' } = {}) {
    const files = Array.isArray(backupPackage?.files) ? backupPackage.files : [];
    const backup = isObject(backupPackage?.backup) ? backupPackage.backup : {};
    const id = backupPackage?.id || backup.id || createId('backup');
    const serverRelativeUrl = backup.serverRelativeUrl || `${idPrefix}:${id}`;
    const timeCreated = backup.timeCreated || backupPackage?.exportedAt || '';
    const timeLastModified = backup.timeLastModified || backupPackage?.exportedAt || '';

    return {
        id,
        name: backup.name || '',
        serverRelativeUrl,
        url: backup.url || '',
        timeCreated,
        timeLastModified,
        fileCount: files.length,
        totalSizeBytes: files.reduce((sum, file) => sum + (Number(file?.sizeBytes) || calculateTextSizeBytes(file?.text)), 0),
        files: files.map((file) => ({
            name: file.name,
            label: file.label || '',
            serverRelativeUrl: file.serverRelativeUrl || `${serverRelativeUrl}/${file.name}`,
            targetServerRelativeUrl: file.targetServerRelativeUrl || '',
            url: file.url || '',
            timeCreated: file.timeCreated || timeCreated,
            timeLastModified: file.timeLastModified || timeLastModified,
            sizeBytes: Number(file.sizeBytes) || calculateTextSizeBytes(file.text),
            text: file.text,
        })),
        backupPackage,
        source: backupPackage?.source || 'package',
    };
}

export function getBackupPackageFileName({ source = 'backup', exportedAt = new Date().toISOString() } = {}) {
    const safeSource = String(source || 'backup').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'backup';
    const safeTimestamp = String(exportedAt || new Date().toISOString())
        .replace(/[:.]/g, '-')
        .replace(/[^a-z0-9TZ_-]+/gi, '-')
        .slice(0, 19);
    return `bihs-${safeSource}-${safeTimestamp}.json`;
}
