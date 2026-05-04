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
} from 'lucide-react';
import { toast } from 'react-toastify';
import { confirmToast } from '../utils/confirmToast';
import {
    createBackup,
    deleteSharePointBackup,
    listSharePointBackupFiles,
    listSharePointBackups,
} from '../utils/sharepointUtils';
import {
    closeBackupProgressToast,
    showBackupCompletedToast,
    showBackupFailedToast,
    updateBackupProgressToast,
} from '../utils/backupToast';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';

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

const parseComparableTimestamp = (backup) => {
    const timestamp = Date.parse(String(backup?.timeLastModified ?? backup?.timeCreated ?? ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
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

    const handleSelectBackup = async (backup) => {
        if (!backup?.serverRelativeUrl) return;
        setSelectedBackupPath(backup.serverRelativeUrl);

        if (Array.isArray(backup.files) && backup.files.length > 0) {
            setSelectedBackupFiles(backup.files);
            return;
        }

        setFilesLoading(true);
        try {
            const files = await listSharePointBackupFiles(backup.serverRelativeUrl);
            setSelectedBackupFiles(files);
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
            message: `האם למחוק את הגיבוי "${backup.name}"?\nהפעולה אינה הפיכה.`,
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
                                                        <div className="text-sm font-bold text-gray-900 dark:text-white">{backup.name}</div>
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
                                                            פתח
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openInExplorer(backup.url)}
                                                            className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50 dark:border-indigo-400/30 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                                                            title="פתיחה בסייר קבצים (תלוי תמיכה בדפדפן/מערכת)"
                                                        >
                                                            <FolderOpen size={14} />
                                                            פתח ב-Explorer
                                                        </button>
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
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {selectedBackup ? selectedBackup.name : 'לא נבחר גיבוי'}
                            </span>
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
                                                <div className="truncate text-sm font-bold text-gray-900 dark:text-white">{file.name || 'קובץ ללא שם'}</div>
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
        </div>
    );
}
