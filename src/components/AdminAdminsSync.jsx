import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Shield, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import {
    addSiteCollectionAdminByPersonalNumber,
    getCurrentSharePointUser,
    listSiteCollectionAdmins,
    normalizePersonalNumberInput,
    removeSiteCollectionAdmin,
} from '../services/sharePointSiteCollectionAdminsService';
import {
    listAssociatedOwnersGroupUsers,
    removeUserFromAssociatedOwnersGroup,
} from '../services/sharePointOwnersGroupService';
import { addUserToAssociatedOwnersGroup } from '../services/sharePointOwnersService';
import { normalizeAdminRecord } from '../services/adminSourcesSyncService';
import { listTxtAdmins, syncSiteCollectionAdminsToTxtAdmins } from '../services/txtAdminsService';

const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

const defaultPermissionSource = {
    loading: false,
    rows: [],
    error: '',
    updatedAt: null,
    extra: {},
};

const getAdminKey = (admin, index = 0) => {
    const normalized = normalizeAdminRecord(admin, index);
    const login = normalizeText(normalized.loginName);
    if (login) return `login:${login}`;
    const personalNumber = normalizeText(normalized.personalNumber);
    if (personalNumber) return `pn:${personalNumber}`;
    const email = normalizeText(normalized.email);
    if (email) return `mail:${email}`;
    const name = normalizeText(normalized.name);
    if (name) return `name:${name}`;
    return `idx:${index}`;
};

const formatDateTime = (dateValue) => {
    if (!dateValue) return '-';
    try {
        return new Date(dateValue).toLocaleString('he-IL');
    } catch {
        return String(dateValue);
    }
};

const getSharePointPersonLabel = (row, fallback = 'משתמש') =>
    String(row?.Title || row?.Email || row?.LoginName || fallback).trim();

function AdminList({ title, subtitle, admins, icon }) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {React.createElement(icon, { size: 20 })}
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
                    </div>
                </div>
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                    {admins.length}
                </span>
            </div>

            {admins.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                    לא נמצאו מנהלים להצגה.
                </div>
            ) : (
                <div className="space-y-2">
                    {admins.map((admin, index) => {
                        const normalized = normalizeAdminRecord(admin, index);
                        const titleLine = normalized.name || normalized.email || normalized.loginName || `מנהל ${index + 1}`;
                        return (
                            <div key={`${getAdminKey(normalized, index)}-${index}`} className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/[0.04]">
                                <div className="font-bold text-gray-900 dark:text-white">{titleLine}</div>
                                <div className="mt-1 grid gap-1 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                                    <span className="truncate">מייל: {normalized.email || '-'}</span>
                                    <span className="truncate">מספר אישי: {normalized.personalNumber || '-'}</span>
                                    <span className="truncate sm:col-span-2">Login: {normalized.loginName || '-'}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function PermissionManagementCard({
    title,
    subtitle,
    icon,
    source,
    inputId,
    inputValue,
    inputPlaceholder,
    onInputChange,
    onAdd,
    onRefresh,
    addBusy,
    actionBusy,
    emptyMessage,
    children,
    meta,
}) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        {React.createElement(icon, { size: 20 })}
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white">{title}</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                        {source.rows.length}
                    </span>
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={source.loading || actionBusy}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                    >
                        {source.loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        רענן
                    </button>
                </div>
            </div>

            <form onSubmit={onAdd} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label htmlFor={inputId} className="flex-1">
                    <span className="mb-1 block text-xs font-bold text-gray-600 dark:text-gray-300">מספר אישי או מייל</span>
                    <input
                        id={inputId}
                        type="text"
                        value={inputValue}
                        onChange={(event) => onInputChange(event.target.value)}
                        placeholder={inputPlaceholder}
                        disabled={addBusy || actionBusy}
                        dir="ltr"
                        className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-left text-sm font-medium text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15 disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-white/10"
                    />
                </label>
                <button
                    type="submit"
                    disabled={addBusy || actionBusy}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                >
                    {addBusy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                    הוסף
                </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>עודכן: <span className="font-bold text-gray-700 dark:text-gray-300">{formatDateTime(source.updatedAt)}</span></span>
                {meta}
            </div>

            <div className="mt-4">
                {source.loading && (
                    <div className="flex min-h-28 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
                        <Loader2 className="animate-spin text-primary" size={26} />
                    </div>
                )}
                {!source.loading && source.error && (
                    <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100">
                        {source.error}
                    </div>
                )}
                {!source.loading && !source.error && source.rows.length === 0 && (
                    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:border-white/10 dark:bg-white/5 dark:text-gray-400">
                        {emptyMessage}
                    </div>
                )}
                {!source.loading && source.rows.length > 0 && children}
            </div>
        </section>
    );
}

function SharePointPeopleTable({ rows, sourceLabel, onRemove, busyPrefix, actionBusyKey }) {
    return (
        <div className="overflow-auto rounded-xl border border-gray-200 shadow-sm dark:border-white/10">
            <table className="w-full min-w-[820px] text-sm">
                <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/5">
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">שם</th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">מייל</th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">LoginName</th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">מזהה</th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">Admin</th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">מקור</th>
                        <th className="px-4 py-3 text-right text-xs font-black uppercase tracking-wide text-gray-600 dark:text-gray-300">פעולות</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-white/10">
                    {rows.map((row, index) => {
                        const rowId = Number(row?.Id || 0);
                        const busyKey = `${busyPrefix}-${rowId || index}`;
                        const isBusy = actionBusyKey === busyKey;
                        return (
                            <tr key={`${sourceLabel}-${rowId || row?.LoginName || index}`} className="transition hover:bg-gray-50 dark:hover:bg-white/[0.04]">
                                <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{row?.Title || '-'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400" dir="ltr">{row?.Email || '-'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400" dir="ltr">{row?.LoginName || '-'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400" dir="ltr">{row?.Id || '-'}</td>
                                <td className="px-4 py-3">
                                    {row?.IsSiteAdmin ? (
                                        <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">כן</span>
                                    ) : (
                                        <span className="text-gray-400">-</span>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-bold text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                                        {sourceLabel}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <button
                                        type="button"
                                        onClick={() => onRemove(row, busyKey)}
                                        disabled={Boolean(actionBusyKey) || !rowId}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                                    >
                                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                        הסר
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export default function AdminAdminsSync() {
    const [sharePointAdmins, setSharePointAdmins] = useState([]);
    const [siteAdmins, setSiteAdmins] = useState([]);
    const [siteCollectionAdminsSource, setSiteCollectionAdminsSource] = useState(defaultPermissionSource);
    const [ownersSource, setOwnersSource] = useState(defaultPermissionSource);
    const [currentUser, setCurrentUser] = useState(null);
    const [siteAdminInput, setSiteAdminInput] = useState('');
    const [ownerInput, setOwnerInput] = useState('');
    const [actionBusyKey, setActionBusyKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const refreshSiteCollectionAdmins = useCallback(async () => {
        setSiteCollectionAdminsSource((prev) => ({ ...prev, loading: true, error: '' }));
        const logs = [];
        try {
            const rows = await listSiteCollectionAdmins(logs);
            const safeRows = Array.isArray(rows) ? rows : [];
            setSharePointAdmins(safeRows.map((item, index) => normalizeAdminRecord(item, index)));
            setSiteCollectionAdminsSource({
                loading: false,
                rows: safeRows,
                error: '',
                updatedAt: new Date().toISOString(),
                extra: {},
            });
            return safeRows;
        } catch (err) {
            setSiteCollectionAdminsSource((prev) => ({
                ...prev,
                loading: false,
                error: err?.message || 'טעינת מנהלי אוסף אתרים נכשלה.',
            }));
            return [];
        }
    }, []);

    const refreshCurrentSiteAdmins = useCallback(async () => {
        const logs = [];
        try {
            const rows = await listTxtAdmins(logs);
            setSiteAdmins(Array.isArray(rows) ? rows.map((item, index) => normalizeAdminRecord(item, index)) : []);
        } catch (err) {
            setSiteAdmins([]);
            setError(err?.message || 'טעינת מנהלי האתר הנוכחיים נכשלה.');
        }
    }, []);

    const refreshOwners = useCallback(async () => {
        setOwnersSource((prev) => ({ ...prev, loading: true, error: '' }));
        const logs = [];
        try {
            const result = await listAssociatedOwnersGroupUsers(logs);
            if (!result?.ok) {
                setOwnersSource((prev) => ({
                    ...prev,
                    loading: false,
                    error: result?.userMessage || 'טעינת בעלי האתר נכשלה.',
                    extra: {},
                }));
                return [];
            }

            const rows = Array.isArray(result.users) ? result.users : [];
            setOwnersSource({
                loading: false,
                rows,
                error: '',
                updatedAt: new Date().toISOString(),
                extra: {
                    ownersGroupId: result.ownersGroupId,
                    ownersGroupTitle: result.ownersGroupTitle,
                },
            });
            return rows;
        } catch (err) {
            setOwnersSource((prev) => ({
                ...prev,
                loading: false,
                error: err?.message || 'טעינת בעלי האתר נכשלה.',
            }));
            return [];
        }
    }, []);

    const refreshCurrentUser = useCallback(async () => {
        try {
            const user = await getCurrentSharePointUser([]);
            setCurrentUser(user || null);
        } catch {
            setCurrentUser(null);
        }
    }, []);

    const loadAdmins = useCallback(async () => {
        setLoading(true);
        setError('');
        await Promise.all([
            refreshSiteCollectionAdmins(),
            refreshCurrentSiteAdmins(),
            refreshOwners(),
            refreshCurrentUser(),
        ]);
        setLoading(false);
    }, [refreshCurrentSiteAdmins, refreshCurrentUser, refreshOwners, refreshSiteCollectionAdmins]);

    useEffect(() => {
        loadAdmins();
    }, [loadAdmins]);

    const missingFromSite = useMemo(() => {
        const siteKeys = new Set(siteAdmins.map((admin, index) => getAdminKey(admin, index)));
        return sharePointAdmins.filter((admin, index) => !siteKeys.has(getAdminKey(admin, index)));
    }, [sharePointAdmins, siteAdmins]);

    const isSynced = sharePointAdmins.length > 0 && missingFromSite.length === 0;

    const handleSync = async () => {
        setSyncing(true);
        setError('');
        setMessage('');
        try {
            const result = await syncSiteCollectionAdminsToTxtAdmins([]);
            await loadAdmins();
            setMessage(result?.changed ? 'הסנכרון הושלם ורשימת מנהלי האתר עודכנה.' : 'הסנכרון אושר. לא נדרשו שינויים.');
        } catch (err) {
            setError(err?.message || 'סנכרון המנהלים נכשל.');
        } finally {
            setSyncing(false);
        }
    };

    const validateInput = (value) => {
        const normalized = normalizePersonalNumberInput(value);
        if (!normalized.ok) {
            setMessage('');
            setError(normalized.message);
            return null;
        }
        return normalized;
    };

    const handleAddSiteCollectionAdmin = async (event) => {
        event.preventDefault();
        const normalized = validateInput(siteAdminInput);
        if (!normalized) return;

        setActionBusyKey('add-site-admin');
        setError('');
        setMessage('');
        try {
            const result = await addSiteCollectionAdminByPersonalNumber(normalized.normalizedInput, []);
            if (!result?.ok) {
                setError(result?.userMessage || 'הוספת מנהל אוסף אתרים נכשלה.');
            } else {
                setSiteAdminInput('');
                setMessage('המשתמש נוסף למנהלי אוסף אתרים.');
            }
        } catch (err) {
            setError(err?.message || 'הוספת מנהל אוסף אתרים נכשלה.');
        } finally {
            await Promise.all([refreshSiteCollectionAdmins(), refreshCurrentUser()]);
            setActionBusyKey('');
        }
    };

    const handleAddOwner = async (event) => {
        event.preventDefault();
        const normalized = validateInput(ownerInput);
        if (!normalized) return;

        setActionBusyKey('add-owner');
        setError('');
        setMessage('');
        try {
            const result = await addUserToAssociatedOwnersGroup(normalized.email);
            if (!result?.ok) {
                setError(result?.userMessage || 'הוספת בעל אתר נכשלה.');
            } else {
                setOwnerInput('');
                setMessage(result.status === 'already-owner' ? 'המשתמש כבר קיים בבעלי האתר.' : 'המשתמש נוסף לבעלי האתר.');
            }
        } catch (err) {
            setError(err?.message || 'הוספת בעל אתר נכשלה.');
        } finally {
            await refreshOwners();
            setActionBusyKey('');
        }
    };

    const handleRemoveSiteCollectionAdmin = async (row, busyKey) => {
        const userId = Number(row?.Id || 0);
        if (!userId) return;

        setError('');
        setMessage('');
        const currentUserId = Number(currentUser?.Id || 0);
        if (currentUserId && currentUserId === userId) {
            setError('לא ניתן להסיר את עצמך ממנהלי אוסף אתרים.');
            return;
        }
        if ((siteCollectionAdminsSource.rows || []).length <= 1) {
            setError('לא ניתן להסיר את מנהל אוסף האתרים האחרון.');
            return;
        }
        if (!window.confirm(`האם להסיר את ${getSharePointPersonLabel(row)} ממנהלי אוסף אתרים?`)) return;

        setActionBusyKey(busyKey);
        try {
            const result = await removeSiteCollectionAdmin(userId, []);
            if (!result?.ok) {
                setError(result?.userMessage || 'הסרת מנהל אוסף אתרים נכשלה.');
            } else {
                setMessage('המשתמש הוסר ממנהלי אוסף אתרים.');
            }
        } catch (err) {
            setError(err?.message || 'הסרת מנהל אוסף אתרים נכשלה.');
        } finally {
            await Promise.all([refreshSiteCollectionAdmins(), refreshCurrentUser()]);
            setActionBusyKey('');
        }
    };

    const handleRemoveOwner = async (row, busyKey) => {
        const userId = Number(row?.Id || 0);
        if (!userId) return;

        setError('');
        setMessage('');
        if (!window.confirm(`האם להסיר את ${getSharePointPersonLabel(row)} מבעלי האתר?`)) return;

        setActionBusyKey(busyKey);
        try {
            const result = await removeUserFromAssociatedOwnersGroup(userId, []);
            if (!result?.ok) {
                setError(result?.userMessage || 'הסרת המשתמש מבעלי האתר נכשלה.');
            } else {
                setMessage('המשתמש הוסר מבעלי האתר.');
            }
        } catch (err) {
            setError(err?.message || 'הסרת המשתמש מבעלי האתר נכשלה.');
        } finally {
            await refreshOwners();
            setActionBusyKey('');
        }
    };

    const actionBusy = syncing || Boolean(actionBusyKey);

    return (
        <div dir="rtl" className="min-h-full bg-gray-50 p-6 font-heebo text-gray-900 dark:bg-[#12141a] dark:text-white sm:p-8">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-primary/25">
                                <ShieldCheck size={22} />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-gray-900 dark:text-white">סנכרון מנהלים</h1>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                    בדיקה פשוטה בין מנהלי SharePoint לבין מנהלי האתר הנוכחיים.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={loadAdmins}
                            disabled={loading || syncing || Boolean(actionBusyKey)}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            רענון
                        </button>
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={loading || syncing || Boolean(actionBusyKey)}
                            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                        >
                            {syncing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                            אשר סנכרון
                        </button>
                    </div>
                </div>

                {(message || error) && (
                    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${
                        error
                            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100'
                    }`}>
                        <div className="flex items-start gap-2">
                            {error ? <AlertTriangle className="mt-0.5 shrink-0" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={18} />}
                            <span className="text-sm font-semibold">{error || message}</span>
                        </div>
                    </div>
                )}

                <div className={`rounded-2xl border px-4 py-3 shadow-sm ${
                    isSynced
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100'
                }`}>
                    <div className="flex items-start gap-2">
                        {isSynced ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <AlertTriangle className="mt-0.5 shrink-0" size={18} />}
                        <div className="text-sm font-semibold">
                            {loading
                                ? 'בודק סטטוס סנכרון...'
                                : isSynced
                                    ? 'כל מנהלי SharePoint קיימים גם ברשימת מנהלי האתר.'
                                    : `נמצאו ${missingFromSite.length} מנהלי SharePoint שעדיין אינם מופיעים ברשימת מנהלי האתר.`}
                        </div>
                    </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                    <PermissionManagementCard
                        title="מנהלי אוסף אתרים"
                        subtitle="SharePoint Site Collection Admins"
                        icon={Shield}
                        source={siteCollectionAdminsSource}
                        inputId="site-collection-admin-input"
                        inputValue={siteAdminInput}
                        inputPlaceholder="s1234567"
                        onInputChange={setSiteAdminInput}
                        onAdd={handleAddSiteCollectionAdmin}
                        onRefresh={refreshSiteCollectionAdmins}
                        addBusy={actionBusyKey === 'add-site-admin'}
                        actionBusy={actionBusy}
                        emptyMessage="אין מנהלי אוסף אתרים להצגה."
                    >
                        <SharePointPeopleTable
                            rows={siteCollectionAdminsSource.rows}
                            sourceLabel="Site Admin"
                            onRemove={handleRemoveSiteCollectionAdmin}
                            busyPrefix="remove-site-admin"
                            actionBusyKey={actionBusyKey}
                        />
                    </PermissionManagementCard>

                    <PermissionManagementCard
                        title="בעלי האתר"
                        subtitle="SharePoint Owners Group"
                        icon={Users}
                        source={ownersSource}
                        inputId="site-owner-input"
                        inputValue={ownerInput}
                        inputPlaceholder="s1234567"
                        onInputChange={setOwnerInput}
                        onAdd={handleAddOwner}
                        onRefresh={refreshOwners}
                        addBusy={actionBusyKey === 'add-owner'}
                        actionBusy={actionBusy}
                        emptyMessage="אין משתמשים בקבוצת בעלי האתר."
                        meta={(
                            <>
                                <span>קבוצה: <span className="font-bold text-gray-700 dark:text-gray-300">{ownersSource.extra?.ownersGroupTitle || '-'}</span></span>
                                <span>מזהה: <span className="font-bold text-gray-700 dark:text-gray-300">{ownersSource.extra?.ownersGroupId || '-'}</span></span>
                            </>
                        )}
                    >
                        <SharePointPeopleTable
                            rows={ownersSource.rows}
                            sourceLabel="Owners"
                            onRemove={handleRemoveOwner}
                            busyPrefix="remove-owner"
                            actionBusyKey={actionBusyKey}
                        />
                    </PermissionManagementCard>
                </div>

                {loading ? (
                    <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#232733]">
                        <Loader2 className="animate-spin text-primary" size={30} />
                    </div>
                ) : (
                    <div className="grid gap-6 lg:grid-cols-2">
                        <AdminList
                            title="מנהלי SharePoint"
                            subtitle="מנהלי אוסף האתר כפי שנקראו מ-SharePoint"
                            admins={sharePointAdmins}
                            icon={ShieldCheck}
                        />
                        <AdminList
                            title="מנהלי האתר הנוכחיים"
                            subtitle="רשימת המנהלים שמורה בקובץ המשתמשים של האתר"
                            admins={siteAdmins}
                            icon={Users}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
