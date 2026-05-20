import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { listSiteCollectionAdmins } from '../services/sharePointSiteCollectionAdminsService';
import { normalizeAdminRecord } from '../services/adminSourcesSyncService';
import { listTxtAdmins, syncSiteCollectionAdminsToTxtAdmins } from '../services/txtAdminsService';

const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

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

function AdminList({ title, subtitle, admins, icon: Icon }) {
    return (
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
            <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon size={20} />
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

export default function AdminAdminsSync() {
    const [sharePointAdmins, setSharePointAdmins] = useState([]);
    const [siteAdmins, setSiteAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const loadAdmins = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const logs = [];
            const [sharePointRows, siteRows] = await Promise.all([
                listSiteCollectionAdmins(logs),
                listTxtAdmins(logs),
            ]);
            setSharePointAdmins(Array.isArray(sharePointRows) ? sharePointRows.map((item, index) => normalizeAdminRecord(item, index)) : []);
            setSiteAdmins(Array.isArray(siteRows) ? siteRows.map((item, index) => normalizeAdminRecord(item, index)) : []);
        } catch (err) {
            setError(err?.message || 'טעינת רשימות המנהלים נכשלה.');
        } finally {
            setLoading(false);
        }
    }, []);

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
                            disabled={loading || syncing}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                        >
                            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                            רענון
                        </button>
                        <button
                            type="button"
                            onClick={handleSync}
                            disabled={loading || syncing}
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
