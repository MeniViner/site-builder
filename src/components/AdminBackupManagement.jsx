import React, { useEffect, useMemo, useState } from 'react';
import {
    DatabaseBackup,
    FolderOpen,
    RefreshCw,
    Save,
    Trash2,
    HardDrive,
    Clock3,
    Files,
    ExternalLink,
    Loader2,
    AlertTriangle,
    RotateCcw,
    X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { confirmToast } from '../utils/confirmToast';
import {
    createBackup,
    deleteSharePointBackup,
    listSharePointBackupFiles,
    listSharePointBackups,
    readSharePointTextFile,
    upsertSharePointTextFile,
} from '../utils/sharepointUtils';
import { SHAREPOINT_PATHS } from '../config/sharepointPaths';
import { validateAndNormalize, migrateLegacyToV1 } from '../config/AppSchema';
import {
    closeBackupProgressToast,
    showBackupCompletedToast,
    showBackupFailedToast,
    updateBackupProgressToast,
} from '../utils/backupToast';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';

const MASTER_CONFIG_TARGET_URL = import.meta.env.VITE_SP_MASTER_CONFIG_FILE_URL || SHAREPOINT_PATHS.masterConfigFileServerRelativeUrl;
const MASTER_CONFIG_FILE_NAME = (MASTER_CONFIG_TARGET_URL || '').split('/').pop();
const RESTORE_TARGET_BY_FILE_NAME = {
    [MASTER_CONFIG_FILE_NAME]: MASTER_CONFIG_TARGET_URL,
    [String(SHAREPOINT_CONFIG.fileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.fileServerRelativeUrl,
    [String(SHAREPOINT_CONFIG.navFileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.navFileServerRelativeUrl,
    [String(SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl,
    [String(SHAREPOINT_CONFIG.themeFileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.themeFileServerRelativeUrl,
    [String(SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl,
    [String(SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl,
    [String(SHAREPOINT_CONFIG.usersFileServerRelativeUrl || '').split('/').pop()]: SHAREPOINT_CONFIG.usersFileServerRelativeUrl,
};

const BACKUP_FILE_LABELS = {
    [MASTER_CONFIG_FILE_NAME]: 'גיבוי מלא',
    [String(SHAREPOINT_CONFIG.fileServerRelativeUrl || '').split('/').pop()]: 'גיבוי אירועים',
    [String(SHAREPOINT_CONFIG.navFileServerRelativeUrl || '').split('/').pop()]: 'גיבוי ניווט',
    [String(SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl || '').split('/').pop()]: 'גיבוי הגדרות',
    [String(SHAREPOINT_CONFIG.themeFileServerRelativeUrl || '').split('/').pop()]: 'גיבוי עיצוב',
    [String(SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl || '').split('/').pop()]: 'גיבוי ווידג׳טים',
    [String(SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl || '').split('/').pop()]: 'גיבוי קישורים חיצוניים',
    [String(SHAREPOINT_CONFIG.usersFileServerRelativeUrl || '').split('/').pop()]: 'גיבוי מנהלים',
};

const formatBytes = (value) => {
    const size = Number(value);
    if (!Number.isFinite(size) || size <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    const normalized = size / (1024 ** exponent);
    return `${normalized >= 10 ? normalized.toFixed(0) : normalized.toFixed(1)} ${units[exponent]}`;
};

const formatDateTime = (value) => {
    const timestamp = Date.parse(String(value ?? ''));
    if (!Number.isFinite(timestamp)) return '—';
    return new Date(timestamp).toLocaleString('he-IL');
};

const getBackupDisplayName = (backup) => {
    const when = formatDateTime(backup?.timeLastModified || backup?.timeCreated);
    return when && when !== '—' ? `גיבוי מלא · ${when}` : 'גיבוי מלא';
};

const getBackupFileDisplayName = (fileName) => BACKUP_FILE_LABELS[fileName] || fileName || 'קובץ גיבוי';

const parseComparableTimestamp = (backup) => {
    const timestamp = Date.parse(String(backup?.timeLastModified ?? backup?.timeCreated ?? ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
};

const countOrgNodes = (nodes) => (Array.isArray(nodes)
    ? nodes.reduce((sum, node) => sum + 1 + countOrgNodes(node?.children), 0)
    : 0);

const parseBackupJson = (fileName, text) => {
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`הקובץ "${getBackupFileDisplayName(fileName)}" אינו JSON תקין.`);
    }
};

const buildPreviewFromBackupTexts = (fileTextsByName) => {
    if (fileTextsByName.has(MASTER_CONFIG_FILE_NAME)) {
        const parsed = parseBackupJson(MASTER_CONFIG_FILE_NAME, fileTextsByName.get(MASTER_CONFIG_FILE_NAME));
        return {
            source: 'master',
            config: validateAndNormalize(parsed),
        };
    }

    const getJsonForTarget = (targetUrl) => {
        const fileName = String(targetUrl || '').split('/').pop();
        if (!fileName || !fileTextsByName.has(fileName)) return undefined;
        return parseBackupJson(fileName, fileTextsByName.get(fileName));
    };

    const legacyData = {
        events: getJsonForTarget(SHAREPOINT_CONFIG.fileServerRelativeUrl),
        navigation: getJsonForTarget(SHAREPOINT_CONFIG.navFileServerRelativeUrl),
        siteContent: getJsonForTarget(SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl),
        theme: getJsonForTarget(SHAREPOINT_CONFIG.themeFileServerRelativeUrl),
        widgets: getJsonForTarget(SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl),
        externalLinks: getJsonForTarget(SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl),
        users: getJsonForTarget(SHAREPOINT_CONFIG.usersFileServerRelativeUrl),
    };

    const hasAnyLegacyData = Object.values(legacyData).some((value) => value !== undefined);
    if (!hasAnyLegacyData) {
        throw new Error('לא נמצאו בקבצי הגיבוי נתונים שניתן לשחזר.');
    }

    return {
        source: 'legacy',
        config: validateAndNormalize(migrateLegacyToV1(legacyData)),
    };
};

export default function AdminBackupManagement() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [backups, setBackups] = useState([]);
    const [baseFolderUrl, setBaseFolderUrl] = useState('');
    const [selectedBackupPath, setSelectedBackupPath] = useState('');
    const [selectedBackupFiles, setSelectedBackupFiles] = useState([]);
    const [filesLoading, setFilesLoading] = useState(false);
    const [deletingBackupPath, setDeletingBackupPath] = useState('');
    const [isCreatingBackup, setIsCreatingBackup] = useState(false);
    const [restoreModal, setRestoreModal] = useState(null);
    const [isRestoring, setIsRestoring] = useState(false);

    const selectedBackup = useMemo(
        () => backups.find((backup) => backup.serverRelativeUrl === selectedBackupPath) || null,
        [backups, selectedBackupPath],
    );

    const stats = useMemo(() => {
        const count = backups.length;
        const totalSizeBytes = backups.reduce((sum, backup) => sum + (Number(backup?.totalSizeBytes) || 0), 0);
        const totalFiles = backups.reduce((sum, backup) => sum + (Number(backup?.fileCount) || 0), 0);
        const latest = [...backups].sort((a, b) => parseComparableTimestamp(b) - parseComparableTimestamp(a))[0] || null;

        return {
            count,
            totalSizeBytes,
            totalFiles,
            latest,
        };
    }, [backups]);

    const loadBackups = async ({ preserveSelection = true } = {}) => {
        if (SHAREPOINT_CONFIG.useMock) {
            setError('ניהול גיבויים זמין רק בסביבת SharePoint אמיתית.');
            setBackups([]);
            setSelectedBackupPath('');
            setSelectedBackupFiles([]);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const response = await listSharePointBackups({ includeFiles: true });
            const nextBackups = Array.isArray(response?.backups) ? response.backups : [];
            setBackups(nextBackups);
            setBaseFolderUrl(response?.baseFolderUrl || '');

            if (nextBackups.length === 0) {
                setSelectedBackupPath('');
                setSelectedBackupFiles([]);
                return;
            }

            const previousSelectionExists = preserveSelection
                && nextBackups.some((item) => item.serverRelativeUrl === selectedBackupPath);
            const fallbackSelection = nextBackups[0]?.serverRelativeUrl || '';
            const nextSelection = previousSelectionExists ? selectedBackupPath : fallbackSelection;
            setSelectedBackupPath(nextSelection);

            const selectedFromRefresh = nextBackups.find((item) => item.serverRelativeUrl === nextSelection);
            setSelectedBackupFiles(Array.isArray(selectedFromRefresh?.files) ? selectedFromRefresh.files : []);
        } catch (loadError) {
            setError(loadError?.message || 'טעינת הגיבויים נכשלה.');
            setBackups([]);
            setSelectedBackupPath('');
            setSelectedBackupFiles([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadBackups({ preserveSelection: false });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadBackupFilesForBackup = async (backup) => {
        if (Array.isArray(backup.files) && backup.files.length > 0) {
            return backup.files;
        }

        const files = await listSharePointBackupFiles(backup.serverRelativeUrl);
        setBackups((prevBackups) => prevBackups.map((item) => (
            item.serverRelativeUrl === backup.serverRelativeUrl
                ? {
                    ...item,
                    files,
                    fileCount: files.length,
                    totalSizeBytes: files.reduce((sum, file) => sum + (Number(file?.sizeBytes) || 0), 0),
                }
                : item
        )));
        return files;
    };

    const openRestorePreview = async (backup, files) => {
        setRestoreModal({
            backup,
            files,
            loading: true,
            error: '',
            preview: null,
            fileTextsByName: new Map(),
        });

        try {
            const restorableFiles = files.filter((file) => RESTORE_TARGET_BY_FILE_NAME[file.name]);
            if (restorableFiles.length === 0) {
                throw new Error('לגיבוי הזה אין קבצים מוכרים לשחזור.');
            }

            const fileTextEntries = await Promise.all(restorableFiles.map(async (file) => [
                file.name,
                await readSharePointTextFile(file.serverRelativeUrl),
            ]));
            const fileTextsByName = new Map(fileTextEntries);
            const preview = buildPreviewFromBackupTexts(fileTextsByName);

            setRestoreModal({
                backup,
                files,
                loading: false,
                error: '',
                preview,
                fileTextsByName,
            });
        } catch (previewError) {
            setRestoreModal({
                backup,
                files,
                loading: false,
                error: previewError?.message || 'יצירת תצוגת השחזור נכשלה.',
                preview: null,
                fileTextsByName: new Map(),
            });
        }
    };

    const handleSelectBackup = async (backup) => {
        if (!backup?.serverRelativeUrl) return;
        setSelectedBackupPath(backup.serverRelativeUrl);

        setFilesLoading(true);
        try {
            const files = await loadBackupFilesForBackup(backup);
            setSelectedBackupFiles(files);
            await openRestorePreview({ ...backup, files }, files);
        } catch (filesError) {
            setSelectedBackupFiles([]);
            toast.error(filesError?.message || 'טעינת קבצי הגיבוי נכשלה.');
        } finally {
            setFilesLoading(false);
        }
    };

    const handleDeleteBackup = async (backup) => {
        if (!backup?.serverRelativeUrl) return;

        const confirmed = await confirmToast({
            title: 'מחיקת גיבוי',
            message: `האם למחוק את הגיבוי "${getBackupDisplayName(backup)}"?\nהפעולה אינה הפיכה.`,
            confirmText: 'מחק גיבוי',
            cancelText: 'ביטול',
            type: 'warning',
        });

        if (!confirmed) return;

        setDeletingBackupPath(backup.serverRelativeUrl);
        try {
            await deleteSharePointBackup(backup.serverRelativeUrl);
            toast.success('הגיבוי נמחק בהצלחה.');
            await loadBackups({ preserveSelection: true });
        } catch (deleteError) {
            toast.error(deleteError?.message || 'מחיקת הגיבוי נכשלה.');
        } finally {
            setDeletingBackupPath('');
        }
    };

    const openInExplorer = (sharePointUrl) => {
        const url = String(sharePointUrl ?? '').trim();
        if (!url) return;
        const explorerProtocolUrl = `ms-explorer:ofe|u|${url}`;
        try {
            window.location.href = explorerProtocolUrl;
        } catch {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCreateManualBackup = async () => {
        if (SHAREPOINT_CONFIG.useMock) {
            toast.info('גיבוי לא נתמך במצב פיתוח (Mock)');
            return;
        }

        const confirmed = await confirmToast({
            title: 'גיבוי מערכת',
            message: 'האם ליצור גיבוי של כלל הנתונים עכשיו?',
            confirmText: 'צור גיבוי',
            cancelText: 'ביטול',
        });
        if (!confirmed) return;

        const toastId = `backup:manual:${Date.now()}`;
        setIsCreatingBackup(true);
        const result = await createBackup({
            trigger: 'manual',
            onProgress: (progress) => {
                updateBackupProgressToast({
                    toastId,
                    title: 'גיבוי מערכת ידני',
                    message: progress?.message || 'מגבה נתונים...',
                    percent: progress?.percent ?? 0,
                });
            },
        });
        closeBackupProgressToast(toastId);
        setIsCreatingBackup(false);

        if (!result?.success) {
            showBackupFailedToast(result?.error || 'שגיאה ביצירת הגיבוי. אנא נסה שוב או בדוק את הלוגים.');
            return;
        }

        showBackupCompletedToast({
            title: 'גיבוי הושלם',
            copiedFiles: result.copiedFiles,
            skippedFiles: result.skippedFiles,
            failedFiles: result.failedFiles,
            backupFolderUrl: result.backupFolderUrl,
            autoCloseMs: 5000,
        });

        await loadBackups({ preserveSelection: false });
    };

    const handleRestoreSelectedBackup = async () => {
        if (!restoreModal?.preview || !restoreModal?.fileTextsByName) return;

        const confirmed = await confirmToast({
            title: 'שחזור מגיבוי',
            message: 'השחזור יחליף את נתוני האתר הנוכחיים בנתוני הגיבוי. לפני השחזור ייווצר גיבוי בטיחות של המצב הנוכחי. להמשיך?',
            confirmText: 'שחזור מהגיבוי הזה',
            cancelText: 'ביטול',
            type: 'warning',
        });
        if (!confirmed) return;

        setIsRestoring(true);
        try {
            const safetyBackup = await createBackup({ trigger: 'pre-restore' });
            if (!safetyBackup?.success) {
                throw new Error(safetyBackup?.error || 'יצירת גיבוי בטיחות לפני שחזור נכשלה.');
            }

            const normalizedConfig = validateAndNormalize(restoreModal.preview.config);
            await upsertSharePointTextFile({
                serverRelativeUrl: MASTER_CONFIG_TARGET_URL,
                text: JSON.stringify(normalizedConfig, null, 2),
                contentType: 'text/plain; charset=utf-8',
            });

            const writeEntries = [...restoreModal.fileTextsByName.entries()]
                .filter(([fileName]) => fileName !== MASTER_CONFIG_FILE_NAME && RESTORE_TARGET_BY_FILE_NAME[fileName]);

            for (const [fileName, text] of writeEntries) {
                parseBackupJson(fileName, text);
                await upsertSharePointTextFile({
                    serverRelativeUrl: RESTORE_TARGET_BY_FILE_NAME[fileName],
                    text,
                    contentType: 'text/plain; charset=utf-8',
                });
            }

            toast.success('השחזור הושלם. מומלץ לרענן את האתר כדי לראות את כל הנתונים המשוחזרים.');
            setRestoreModal(null);
            await loadBackups({ preserveSelection: true });
        } catch (restoreError) {
            toast.error(restoreError?.message || 'שחזור הגיבוי נכשל.');
            setRestoreModal((prev) => prev ? {
                ...prev,
                error: restoreError?.message || 'שחזור הגיבוי נכשל.',
            } : prev);
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div dir="rtl" className="min-h-full bg-gray-50 px-6 py-4 text-gray-900 dark:bg-[#12141a] dark:text-white sm:px-10 sm:py-5">
            <div className="mx-auto max-w-7xl space-y-4">
                <section className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-white/10 dark:bg-[#232733] sm:px-5 sm:py-3.5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3 sm:items-center">
                            <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary sm:mt-0">
                                <DatabaseBackup size={18} />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white sm:text-2xl">ניהול גיבויים</h1>
                                <p className="mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400 sm:text-sm sm:leading-relaxed">
                                    דשבורד גיבויים מרכזי: צפייה בגיבויים, גודל כולל, קבצים לכל גיבוי ומחיקה מאובטחת.
                                </p>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={handleCreateManualBackup}
                                disabled={isCreatingBackup}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-400/30 dark:text-blue-300 dark:hover:bg-blue-500/10 sm:text-sm"
                            >
                                {isCreatingBackup ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                {isCreatingBackup ? 'מגבה נתונים...' : 'גיבוי מערכת ידני'}
                            </button>
                            {baseFolderUrl && (
                                <button
                                    type="button"
                                    onClick={() => window.open(baseFolderUrl, '_blank', 'noopener,noreferrer')}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10 sm:text-sm"
                                >
                                    <FolderOpen size={15} />
                                    פתח תיקיית גיבויים
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => loadBackups({ preserveSelection: true })}
                                disabled={loading}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
                            >
                                {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                                רענון
                            </button>
                        </div>
                    </div>
                </section>

                {error && (
                    <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                        <span>{error}</span>
                    </div>
                )}

                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
                        <div className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">סה״כ גיבויים</div>
                        <div className="mt-3 text-3xl font-black text-gray-900 dark:text-white">{stats.count}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <HardDrive size={14} />
                            נפח כולל
                        </div>
                        <div className="mt-3 text-3xl font-black text-gray-900 dark:text-white">{formatBytes(stats.totalSizeBytes)}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <Files size={14} />
                            סה״כ קבצים
                        </div>
                        <div className="mt-3 text-3xl font-black text-gray-900 dark:text-white">{stats.totalFiles}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            <Clock3 size={14} />
                            גיבוי אחרון
                        </div>
                        <div className="mt-3 text-sm font-bold text-gray-900 dark:text-white">{formatDateTime(stats.latest?.timeLastModified || stats.latest?.timeCreated)}</div>
                    </div>
                </section>

                <section className="grid min-h-[420px] grid-cols-1 gap-4 xl:grid-cols-[1.15fr_1fr]">
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#232733]">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <h2 className="text-lg font-black text-gray-900 dark:text-white">רשימת גיבויים</h2>
                            <span className="text-xs text-gray-500 dark:text-gray-400">{backups.length} פריטים</span>
                        </div>
                        <div className="max-h-[560px] overflow-auto">
                            {loading ? (
                                <div className="flex h-52 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 size={18} className="ml-2 animate-spin" />
                                    טוען גיבויים...
                                </div>
                            ) : backups.length === 0 ? (
                                <div className="flex h-52 items-center justify-center px-6 text-sm text-gray-500 dark:text-gray-400">
                                    לא נמצאו גיבויים.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200 dark:divide-white/10">
                                    {backups.map((backup) => {
                                        const isSelected = backup.serverRelativeUrl === selectedBackupPath;
                                        const isDeleting = deletingBackupPath === backup.serverRelativeUrl;
                                        return (
                                            <div
                                                key={backup.serverRelativeUrl}
                                                className={`p-4 transition ${isSelected ? 'bg-primary/5 dark:bg-primary/15' : ''}`}
                                            >
                                                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectBackup(backup)}
                                                        className="text-right"
                                                    >
                                                        <div className="text-sm font-bold text-gray-900 dark:text-white">{getBackupDisplayName(backup)}</div>
                                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            {formatDateTime(backup.timeLastModified || backup.timeCreated)}
                                                        </div>
                                                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                            {backup.fileCount} קבצים · {formatBytes(backup.totalSizeBytes)}
                                                        </div>
                                                    </button>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => window.open(backup.url, '_blank', 'noopener,noreferrer')}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10"
                                                        >
                                                            <ExternalLink size={14} />
                                                            פתח בטאב חדש
                                                        </button>
                                                        {/* <button
                                                            type="button"
                                                            onClick={() => openInExplorer(backup.url)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-400/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                                                            title="פתיחה בסייר קבצים (תלוי תמיכה בדפדפן/מערכת)"
                                                        >
                                                            <FolderOpen size={14} />
                                                            פתח ב-Explorer
                                                        </button> */}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteBackup(backup)}
                                                            disabled={isDeleting}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
                                                        >
                                                            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                                            מחק
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#232733]">
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <h2 className="text-lg font-black text-gray-900 dark:text-white">קבצים בגיבוי</h2>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {selectedBackup ? getBackupDisplayName(selectedBackup) : 'לא נבחר גיבוי'}
                                </span>
                                {selectedBackup && (
                                    <button
                                        type="button"
                                        onClick={() => openRestorePreview(selectedBackup, selectedBackupFiles)}
                                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/10"
                                    >
                                        <RotateCcw size={14} />
                                        שחזור
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="max-h-[560px] overflow-auto">
                            {!selectedBackup ? (
                                <div className="flex h-52 items-center justify-center px-6 text-sm text-gray-500 dark:text-gray-400">
                                    בחר גיבוי כדי לראות את הקבצים.
                                </div>
                            ) : filesLoading ? (
                                <div className="flex h-52 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 size={18} className="ml-2 animate-spin" />
                                    טוען קבצים...
                                </div>
                            ) : selectedBackupFiles.length === 0 ? (
                                <div className="flex h-52 items-center justify-center px-6 text-sm text-gray-500 dark:text-gray-400">
                                    לא נמצאו קבצים בגיבוי זה.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-200 dark:divide-white/10">
                                    {selectedBackupFiles.map((file) => (
                                        <div key={file.serverRelativeUrl || file.name} className="flex items-center justify-between gap-3 p-4">
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-bold text-gray-900 dark:text-white">{getBackupFileDisplayName(file.name)}</div>
                                                <div className="mt-0.5 truncate text-[11px] text-gray-400 dark:text-gray-500" dir="ltr">{file.name || 'קובץ ללא שם'}</div>
                                                <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(file.timeLastModified || file.timeCreated)}</div>
                                            </div>
                                            <div className="flex shrink-0 items-center gap-2">
                                                <span className="text-xs text-gray-500 dark:text-gray-400">{formatBytes(file.sizeBytes)}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => window.open(file.url, '_blank', 'noopener,noreferrer')}
                                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/10"
                                                >
                                                    <ExternalLink size={14} />
                                                    צפייה
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </div>

            {restoreModal && (
                <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                    <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171b24]">
                        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <div>
                                <div className="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">תצוגה מקדימה לשחזור</div>
                                <h2 className="mt-1 text-2xl font-black text-gray-900 dark:text-white">
                                    {getBackupDisplayName(restoreModal.backup)}
                                </h2>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    השחזור יתבצע רק לאחר לחיצה על הכפתור בתחתית החלון.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setRestoreModal(null)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:text-gray-300"
                                aria-label="סגור חלון שחזור"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5">
                            {restoreModal.loading ? (
                                <div className="flex min-h-[320px] items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                                    <Loader2 size={22} className="ml-2 animate-spin text-primary" />
                                    בודק קבצי גיבוי ומכין תצוגה מקדימה...
                                </div>
                            ) : restoreModal.error ? (
                                <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                                        <span>{restoreModal.error}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                                        <div className="mb-4 flex items-center justify-between gap-3">
                                            <div>
                                                <h3 className="text-lg font-black text-gray-900 dark:text-white">נתונים אחרי שחזור</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    מקור: {restoreModal.preview?.source === 'master' ? 'קובץ תצורה מלא' : 'קבצי גיבוי ישנים שהומרו לתצורה מלאה'}
                                                </p>
                                            </div>
                                            <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                                {restoreModal.files.length} קבצים
                                            </span>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">שם האתר</div>
                                                <div className="mt-1 font-black text-gray-900 dark:text-white">{restoreModal.preview?.config?.content?.hero?.siteName || '-'}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">כותרת Hero</div>
                                                <div className="mt-1 font-black text-gray-900 dark:text-white">{restoreModal.preview?.config?.content?.hero?.title || '-'}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">צבע ראשי</div>
                                                <div className="mt-2 flex items-center gap-2 font-black text-gray-900 dark:text-white">
                                                    <span className="h-5 w-5 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: restoreModal.preview?.config?.theme?.primaryColor || '#0891b2' }} />
                                                    {restoreModal.preview?.config?.theme?.primaryColor || '-'}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">תצוגה</div>
                                                <div className="mt-1 font-black text-gray-900 dark:text-white">{restoreModal.preview?.config?.theme?.displayMode || '-'}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">פריטי ניווט</div>
                                                <div className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{restoreModal.preview?.config?.navigation?.items?.length || 0}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">צמתים בעץ מבנה</div>
                                                <div className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{countOrgNodes(restoreModal.preview?.config?.content?.orgChart?.nodes)}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">ווידג׳טים פעילים</div>
                                                <div className="mt-1 font-black text-gray-900 dark:text-white">{(restoreModal.preview?.config?.widgets?.active || []).join(', ') || '-'}</div>
                                            </div>
                                            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]">
                                                <div className="text-xs text-gray-500 dark:text-gray-400">קישורים חיצוניים</div>
                                                <div className="mt-1 text-2xl font-black text-gray-900 dark:text-white">{restoreModal.preview?.config?.externalLinks?.items?.length || 0}</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#232733]">
                                        <h3 className="text-lg font-black text-gray-900 dark:text-white">קבצים שישוחזרו</h3>
                                        <div className="mt-4 max-h-[420px] space-y-2 overflow-y-auto pr-1">
                                            {[...restoreModal.fileTextsByName.keys()].map((fileName) => (
                                                <div key={fileName} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-white/10 dark:bg-white/[0.04]">
                                                    <div className="text-sm font-bold text-gray-900 dark:text-white">{getBackupFileDisplayName(fileName)}</div>
                                                    <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400" dir="ltr">{fileName}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-5 py-4 dark:border-white/10">
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                לפני שחזור ייווצר גיבוי בטיחות של המצב הנוכחי.
                            </div>
                            <button
                                type="button"
                                onClick={handleRestoreSelectedBackup}
                                disabled={isRestoring || restoreModal.loading || Boolean(restoreModal.error) || !restoreModal.preview}
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-black text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {isRestoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                                שחזור מהגיבוי הזה
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
