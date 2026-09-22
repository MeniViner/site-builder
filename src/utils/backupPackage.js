export const BACKUP_PACKAGE_KIND = 'bihs-backup-package';
export const BACKUP_PACKAGE_VERSION = '1.0.0';

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const fileBaseName = (value) => String(value || '').replace(/\\/g, '/').split('/').pop()?.toLowerCase() || '';

export function countBackupFileRecords(fileName, data) {
    const name = fileBaseName(fileName);
    if (name === 'users_data.txt' || name === 'nav_data.txt' || name === 'external_links_data.txt') {
        return Array.isArray(data) ? data.length : (Array.isArray(data?.items) ? data.items.length : 0);
    }
    if (name === 'events_data.txt') {
        return Array.isArray(data) ? data.length : (Array.isArray(data?.events) ? data.events.length : 0);
    }
    if (name === 'boom_data.txt') {
        return Array.isArray(data?.items) ? data.items.length : 0;
    }
    if (name === 'gantt_data.txt') {
        return Array.isArray(data?.tasks) ? data.tasks.length : (Array.isArray(data?.items) ? data.items.length : 0);
    }
    if (name === 'widgets_data.txt') {
        const branches = isObject(data?.data) ? data.data : data;
        if (!isObject(branches)) return 0;
        return Object.values(branches).reduce((sum, branch) => (
            sum + (Array.isArray(branch?.items) ? branch.items.length : (Array.isArray(branch) ? branch.length : 0))
        ), 0) || (Object.keys(branches).length > 0 ? 1 : 0);
    }
    if (name === 'bihs_master_config_v1.txt') {
        if (!isObject(data)) return 0;
        const collections = [
            data.navigation?.items,
            data.widgets?.data?.alerts?.items,
            data.widgets?.data?.events?.items,
            data.externalLinks?.items,
            data.imageGalleries?.items,
        ];
        return Math.max(1, collections.reduce((sum, value) => sum + (Array.isArray(value) ? value.length : 0), 0));
    }
    if (name === 'site_content_data.txt' || name === 'theme_data.txt') {
        return isObject(data) && Object.keys(data).length > 0 ? 1 : 0;
    }
    if (Array.isArray(data)) return data.length;
    return isObject(data) && Object.keys(data).length > 0 ? 1 : 0;
}

export function deriveBackupFileRecordCount(fileName, textValue, fallback = null) {
    try {
        const data = typeof textValue === 'string' ? JSON.parse(textValue) : textValue;
        return countBackupFileRecords(fileName, data);
    } catch {
        return fallback !== null && fallback !== undefined && Number.isFinite(Number(fallback))
            ? Number(fallback)
            : null;
    }
}

function createId(prefix = 'backup') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function textFingerprint(text) {
    const value = String(text ?? '');
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${calculateTextSizeBytes(value)}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createBackupOperationId(prefix = 'backup') {
    return createId(prefix);
}

export function createBackupManifest({
    operationId = createBackupOperationId(),
    requiredFileNames = [],
    fileTextsByName = new Map(),
    createdAt = new Date().toISOString(),
} = {}) {
    const required = [...new Set(
        (Array.isArray(requiredFileNames) ? requiredFileNames : [])
            .map((name) => String(name || '').trim())
            .filter(Boolean),
    )];
    const files = required.map((name) => {
        const text = fileTextsByName instanceof Map ? fileTextsByName.get(name) : fileTextsByName?.[name];
        return {
            name,
            required: true,
            fingerprint: typeof text === 'string' ? textFingerprint(text) : null,
        };
    });
    return {
        kind: 'bihs-txt-backup-manifest',
        version: 1,
        operationId,
        status: 'pending',
        createdAt,
        requiredFileCount: required.length,
        verifiedFileCount: 0,
        files,
    };
}

export function verifyBackupManifest(manifest, readBackTextsByName) {
    const files = Array.isArray(manifest?.files) ? manifest.files : [];
    const required = files.filter((file) => file?.required);
    if (required.length === 0) {
        throw new Error('לא ניתן להשלים גיבוי ללא קבצים נדרשים.');
    }

    const results = required.map((file) => {
        const text = readBackTextsByName instanceof Map
            ? readBackTextsByName.get(file.name)
            : readBackTextsByName?.[file.name];
        const verified = typeof text === 'string'
            && typeof file.fingerprint === 'string'
            && textFingerprint(text) === file.fingerprint;
        return { ...file, verified };
    });
    const verifiedFileCount = results.filter((file) => file.verified).length;
    return {
        ...manifest,
        status: verifiedFileCount === required.length ? 'complete' : 'partial',
        verifiedAt: new Date().toISOString(),
        verifiedFileCount,
        files: results,
    };
}

export function validateRestorePlan({
    selectedEntries = [],
    fileTextsByName = new Map(),
    targetByFileName = {},
} = {}) {
    if (!Array.isArray(selectedEntries) || selectedEntries.length === 0) {
        throw new Error('יש לבחור לפחות פריט אחד לשחזור.');
    }

    const ids = new Set();
    return selectedEntries.map((entry) => {
        const id = String(entry?.restoreUnitId || '').trim();
        const fileName = String(entry?.fileName || entry?.name || '').trim();
        if (!id || ids.has(id)) throw new Error(`מזהה שחזור חסר או כפול עבור ${fileName || 'פריט לא ידוע'}.`);
        ids.add(id);
        if (entry?.canRestore !== true) throw new Error(`הפריט ${fileName} אינו זמין לשחזור.`);
        const target = String(targetByFileName[fileName] || '').trim();
        if (!target) throw new Error(`לא נמצא יעד שחזור עבור ${fileName}.`);
        const text = fileTextsByName instanceof Map
            ? fileTextsByName.get(fileName)
            : fileTextsByName?.[fileName];
        if (typeof text !== 'string') throw new Error(`לא נמצא תוכן לשחזור עבור ${fileName}.`);
        try {
            JSON.parse(text);
        } catch {
            throw new Error(`הקובץ ${fileName} אינו JSON תקין.`);
        }
        return { ...entry, restoreUnitId: id, fileName, target, text };
    });
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

    const normalized = {
        name,
        label: typeof source.label === 'string' ? source.label : '',
        serverRelativeUrl: typeof source.serverRelativeUrl === 'string' ? source.serverRelativeUrl : '',
        targetServerRelativeUrl: typeof source.targetServerRelativeUrl === 'string' ? source.targetServerRelativeUrl : '',
        url: typeof source.url === 'string' ? source.url : '',
        timeCreated: typeof source.timeCreated === 'string' ? source.timeCreated : '',
        timeLastModified: typeof source.timeLastModified === 'string' ? source.timeLastModified : '',
        sizeBytes,
        text,
        recordCount: deriveBackupFileRecordCount(name, text, source.recordCount),
    };

    [
        'scope',
        'entityId',
        'mappingKey',
        'status',
        'restoreStatus',
        'restoreAction',
        'source',
        'hash',
    ].forEach((key) => {
        if (typeof source[key] === 'string') normalized[key] = source[key];
    });

    [
        'willRestore',
        'empty',
        'missing',
        'invalid',
    ].forEach((key) => {
        if (typeof source[key] === 'boolean') normalized[key] = source[key];
    });

    [
        'documentCount',
        'version',
    ].forEach((key) => {
        if (Number.isFinite(Number(source[key]))) normalized[key] = Number(source[key]);
    });

    return normalized;
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
            scope: file.scope || '',
            entityId: file.entityId || '',
            mappingKey: file.mappingKey || '',
            status: file.status || '',
            restoreStatus: file.restoreStatus || file.status || '',
            restoreAction: file.restoreAction || '',
            willRestore: file.willRestore,
            empty: file.empty,
            missing: file.missing,
            invalid: file.invalid,
            recordCount: file.recordCount,
            documentCount: file.documentCount,
            version: file.version,
            hash: file.hash || '',
            source: file.source || '',
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
