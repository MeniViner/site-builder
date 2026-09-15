import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    ArrowLeft,
    Bell,
    CalendarClock,
    Check,
    FileText,
    Pencil,
    Plus,
    Search,
    Send,
    Trash2,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useConfig } from '../context/ConfigProvider';
import {
    getNotificationEffectiveStatus,
    normalizeNotification,
    normalizeNotifications,
} from '../utils/notificationData';
import { sanitizeSmartHref, smartTextTokensToPlainText } from '../utils/smartText';
import SmartTextEditor from './SmartTextEditor';
import NotificationAudienceTargets from './NotificationAudienceTargets';
import NotificationPopupCard from './NotificationPopupCard';

const inputClass = 'min-h-11 w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-2.5 text-sm text-theme outline-none transition-[border-color,box-shadow] focus:border-primary/50 focus:ring-2 focus:ring-primary/20';
const tabClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-[background-color,color,box-shadow,transform] active:scale-[0.96]';
const statusLabels = {
    published: 'מוצגת',
    draft: 'טיוטה',
    scheduled: 'מתוזמנת',
    ended: 'הסתיימה',
};
const statusClasses = {
    published: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    draft: 'bg-gray-500/10 text-theme-muted',
    scheduled: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    ended: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
};
const makeId = () => globalThis.crypto?.randomUUID?.() || `notification-${Date.now()}`;
const emptyForm = () => ({
    id: '',
    title: '',
    text: '',
    richContent: [],
    isUrgent: false,
    popupActive: true,
    displayMode: 'popup',
    status: 'draft',
    startsAt: '',
    endsAt: '',
    ctaLabel: '',
    ctaUrl: '',
    requiresAcknowledgement: false,
    audience: { type: 'all', identities: [] },
    source: 'admin',
    sourceEntityId: '',
    eventKey: '',
    createdAt: '',
    updatedAt: '',
});

function createTargetedAudience(targets) {
    const identities = [...new Set(targets.flatMap((target) => Array.isArray(target.identities) ? target.identities : []))];
    return { type: 'users', identities, ...(targets.length > 0 ? { targets } : {}) };
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    return Number.isFinite(date.getTime())
        ? date.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
        : '—';
}

function displayWindowLabel(item) {
    if (!item.startsAt && !item.endsAt) return 'ללא הגבלה';
    if (item.startsAt && item.endsAt) return `${formatDate(item.startsAt)} – ${formatDate(item.endsAt)}`;
    return item.startsAt ? `מ־${formatDate(item.startsAt)}` : `עד ${formatDate(item.endsAt)}`;
}

function formSnapshot(form) {
    return JSON.stringify({
        ...normalizeNotification(form),
        ctaUrlDraft: form.ctaUrl,
    });
}

export default function AdminAlerts() {
    const { config, updateConfig, saveNow, error } = useConfig();
    const [list, setList] = useState([]);
    const [alertsEnabled, setAlertsEnabled] = useState(true);
    const [activeTab, setActiveTab] = useState('list');
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [baseline, setBaseline] = useState('');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const [isSaving, setIsSaving] = useState(false);
    const [discardAction, setDiscardAction] = useState(null);
    const lastSavedRef = useRef('');
    const rootRef = useRef(null);
    const dirtyRef = useRef(false);

    useEffect(() => {
        const alertsBranch = config?.widgets?.data?.alerts;
        const serverItems = normalizeNotifications(alertsBranch?.items);
        const snapshot = JSON.stringify(serverItems);
        setAlertsEnabled(alertsBranch?.enabled !== false);
        setList(serverItems);
        lastSavedRef.current = snapshot;
    }, [config?.widgets?.data?.alerts]);

    const isDirty = Boolean(editingId && formSnapshot(form) !== baseline);
    const bodyLength = smartTextTokensToPlainText(form.richContent).trim().length || form.text.trim().length;
    const datesInvalid = Boolean(form.startsAt && form.endsAt && form.endsAt < form.startsAt);
    const hasActionButton = Boolean(form.ctaLabel.trim());

    useEffect(() => {
        dirtyRef.current = isDirty;
    }, [isDirty]);

    useEffect(() => {
        const handleBeforeUnload = (event) => {
            if (!dirtyRef.current) return;
            event.preventDefault();
            event.returnValue = '';
        };
        const handleExternalNavigation = (event) => {
            if (!dirtyRef.current || rootRef.current?.contains(event.target)) return;
            const interactive = event.target.closest?.('a,button');
            if (!interactive) return;
            event.preventDefault();
            event.stopPropagation();
            setDiscardAction(() => () => {
                dirtyRef.current = false;
                interactive.click();
            });
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('click', handleExternalNavigation, true);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('click', handleExternalNavigation, true);
        };
    }, []);

    const persistNotifications = useCallback(async (nextList, nextEnabled = alertsEnabled) => {
        setIsSaving(true);
        try {
            updateConfig((current) => ({
                ...current,
                widgets: {
                    ...current.widgets,
                    data: {
                        ...current.widgets?.data,
                        alerts: { ...current.widgets?.data?.alerts, enabled: nextEnabled, items: nextList },
                    },
                },
            }));
            await saveNow();
            lastSavedRef.current = JSON.stringify(nextList);
            setList(nextList);
            setAlertsEnabled(nextEnabled);
        } finally {
            setIsSaving(false);
        }
    }, [alertsEnabled, saveNow, updateConfig]);

    const toggleAlerts = async () => {
        const nextEnabled = !alertsEnabled;
        try {
            await persistNotifications(list, nextEnabled);
            toast.success(nextEnabled ? 'מרכז ההתראות הופעל' : 'מרכז ההתראות כובה');
        } catch (saveError) {
            toast.error(saveError?.message || 'שמירת הגדרת ההתראות נכשלה.');
        }
    };

    const visibleItems = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase('he');
        return list.filter((item) => {
            if (filter !== 'all' && item.status !== filter) return false;
            if (!normalizedQuery) return true;
            return `${item.title} ${item.text}`.toLocaleLowerCase('he').includes(normalizedQuery);
        });
    }, [filter, list, query]);

    const selectForm = (nextForm, id, tab = 'content') => {
        const normalized = { ...emptyForm(), ...nextForm };
        setForm(normalized);
        setBaseline(formSnapshot(normalized));
        setEditingId(id);
        setActiveTab(tab);
    };

    const requestDiscard = (action) => {
        if (!isDirty) {
            action();
            return;
        }
        setDiscardAction(() => action);
    };

    const discardChangesAndContinue = () => {
        const action = discardAction;
        setDiscardAction(null);
        dirtyRef.current = false;
        action?.();
    };

    const openNew = () => {
        requestDiscard(() => selectForm({ ...emptyForm(), id: makeId() }, 'new'));
    };

    const openEdit = (item) => {
        requestDiscard(() => selectForm(normalizeNotification(item), item.id));
    };

    const goToTab = (tab) => {
        if (tab === 'list') {
            requestDiscard(() => {
                setActiveTab('list');
                setEditingId(null);
                setForm(emptyForm());
                setBaseline('');
            });
            return;
        }
        setActiveTab(tab);
    };

    const resetEditorToList = () => {
        setActiveTab('list');
        setEditingId(null);
        setForm(emptyForm());
        setBaseline('');
    };

    const commitEdit = async (status) => {
        if (!form.text.trim()) {
            setActiveTab('content');
            toast.error('יש להזין תוכן להתראה.');
            return;
        }
        if (bodyLength > 280) {
            setActiveTab('content');
            toast.error('תוכן ההתראה מוגבל ל־280 תווים.');
            return;
        }
        if (datesInvalid) {
            setActiveTab('delivery');
            toast.error('תאריך הסיום לא יכול להיות לפני תאריך ההתחלה.');
            return;
        }
        if (form.audience.type === 'users' && form.audience.identities.length === 0) {
            setActiveTab('delivery');
            toast.error('יש לאמת משתמש יעד לפני שמירת ההתראה.');
            return;
        }
        const safeCtaUrl = sanitizeSmartHref(form.ctaUrl);
        if ((form.ctaLabel && !safeCtaUrl) || (form.ctaUrl && !form.ctaLabel)) {
            setActiveTab('content');
            toast.error('יש להזין גם טקסט וגם כתובת תקינה לכפתור הפעולה.');
            return;
        }

        const timestamp = new Date().toISOString();
        const notification = normalizeNotification({
            ...form,
            status,
            isUrgent: false,
            ctaUrl: safeCtaUrl,
            popupActive: form.displayMode === 'popup',
            createdAt: form.createdAt || timestamp,
            updatedAt: timestamp,
        });
        const nextList = editingId === 'new'
            ? [notification, ...list]
            : list.map((item) => item.id === editingId ? notification : item);
        try {
            await persistNotifications(nextList);
            resetEditorToList();
            toast.success(status === 'published' ? 'ההתראה פורסמה' : 'ההתראה נשמרה כטיוטה');
        } catch (saveError) {
            toast.error(saveError?.message || 'שמירת ההתראה נכשלה.');
        }
    };

    const deleteItem = async (item) => {
        if (!window.confirm(`למחוק את ההתראה "${item.title || 'ללא כותרת'}"?`)) return;
        if (editingId === 'new') {
            resetEditorToList();
            toast.success('הטיוטה בוטלה');
            return;
        }
        const nextList = list.filter((candidate) => candidate.id !== item.id);
        try {
            await persistNotifications(nextList);
            if (editingId === item.id) resetEditorToList();
            toast.success('ההתראה נמחקה');
        } catch (saveError) {
            toast.error(saveError?.message || 'מחיקת ההתראה נכשלה.');
        }
    };

    const previewItem = normalizeNotification({
        ...form,
        isUrgent: false,
        popupActive: form.displayMode === 'popup',
    });

    return (
        <div ref={rootRef} dir="rtl" className="min-h-screen bg-gray-50 p-5 font-heebo text-theme dark:bg-[#1e212b] sm:p-8">
            <div className="mx-auto max-w-[1500px]">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="flex items-center gap-2 text-balance text-3xl font-black">התראות</h1>
                        <p className="mt-1 text-pretty text-sm text-theme-muted">ניהול ההודעות שמוצגות למשתמשים בכניסה למערכת.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
                        <div className="text-left">
                            <div className="text-sm font-black">דף ההתראות באתר</div>
                            <div className={`mt-0.5 text-xs font-bold ${alertsEnabled ? 'text-emerald-600 dark:text-emerald-300' : 'text-theme-muted'}`}>
                                {alertsEnabled ? 'פעיל ומוצג באתר' : 'לא פעיל ולא מוצג באתר'}
                            </div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={alertsEnabled}
                            aria-label="הפעלת דף ההתראות באתר"
                            disabled={isSaving}
                            onClick={toggleAlerts}
                            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-60 ${alertsEnabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                        >
                            <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-[right] ${alertsEnabled ? 'right-6' : 'right-1'}`} />
                        </button>
                        {isSaving && <span className="text-sm font-bold text-theme-muted">שומר...</span>}
                        {isDirty && <span className="inline-flex items-center gap-2 text-sm font-bold text-amber-600"><i className="h-2 w-2 rounded-full bg-current" />שינויים שלא נשמרו</span>}
                    </div>
                </header>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-theme-subtle pb-5">
                    <div className="flex flex-wrap gap-2" role="tablist" aria-label="מקטעי מסך ההתראות">
                        {[
                            { id: 'list', label: 'התראות שמורות', icon: Bell },
                            { id: 'content', label: 'תוכן ההתראה', icon: FileText },
                            { id: 'delivery', label: 'הצגה ותזמון', icon: CalendarClock },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            const disabled = tab.id !== 'list' && !editingId;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={activeTab === tab.id}
                                    disabled={disabled}
                                    onClick={() => goToTab(tab.id)}
                                    className={`${tabClass} ${activeTab === tab.id
                                        ? 'bg-primary text-white shadow-sm'
                                        : 'bg-theme-card text-theme shadow-[0_0_0_1px_rgba(15,23,42,0.09)] hover:bg-theme-card-hover dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]'} disabled:cursor-not-allowed disabled:opacity-40`}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                    {activeTab !== 'list' && editingId && (
                        <button
                            type="button"
                            onClick={() => deleteItem(form)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-black text-red-600 shadow-[0_0_0_1px_rgba(220,38,38,0.25)] transition-[background-color,transform] hover:bg-red-500/10 active:scale-[0.96]"
                        >
                            <Trash2 size={16} />
                            מחיקת ההתראה
                        </button>
                    )}
                </div>

                {error && (
                    <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-500">
                        <AlertTriangle size={17} />
                        {error}
                    </div>
                )}

                {activeTab === 'list' && (
                    <section className="mt-6 overflow-hidden rounded-2xl bg-theme-card shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_10px_30px_-24px_rgba(15,23,42,0.35)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-theme-subtle p-5">
                            <div className="flex flex-1 flex-wrap items-center gap-3">
                                <label className="relative min-w-[250px] flex-1 sm:max-w-sm">
                                    <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                                    <input
                                        type="search"
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="חיפוש לפי כותרת או תוכן"
                                        aria-label="חיפוש בהתראות"
                                        className={`${inputClass} pr-10`}
                                    />
                                </label>
                                <div className="inline-flex rounded-xl bg-theme-elevated p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                                    {[
                                        { id: 'all', label: 'הכל' },
                                        { id: 'published', label: 'מפורסמות' },
                                        { id: 'draft', label: 'טיוטות' },
                                    ].map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            onClick={() => setFilter(option.id)}
                                            aria-pressed={filter === option.id}
                                            className={`min-h-9 rounded-lg px-3 text-sm font-bold transition-[background-color,color,box-shadow] ${filter === option.id ? 'bg-theme-card text-primary shadow-sm' : 'text-theme-muted hover:text-theme'}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={openNew}
                                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary pl-4 pr-3.5 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"
                            >
                                <Plus size={16} />
                                התראה חדשה
                            </button>
                        </div>

                        {visibleItems.length === 0 ? (
                            <div className="p-12 text-center">
                                <Bell size={34} className="mx-auto text-theme-muted/50" />
                                <h2 className="mt-3 text-lg font-black">{list.length === 0 ? 'אין עדיין התראות' : 'אין תוצאות לסינון'}</h2>
                                <p className="mt-1 text-sm text-theme-muted">{list.length === 0 ? 'כל התראה שתיצרו תופיע כאן לעריכה, פרסום או מחיקה.' : 'נסו מונח חיפוש אחר או בחרו ״הכל״.'}</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[850px] border-collapse text-right">
                                    <thead className="bg-theme-elevated text-xs font-black text-theme-muted">
                                        <tr>
                                            <th className="px-5 py-3">מצב</th>
                                            <th className="px-5 py-3">כותרת</th>
                                            <th className="px-5 py-3">אופן הצגה</th>
                                            <th className="px-5 py-3">חלון תצוגה</th>
                                            <th className="px-5 py-3">עודכן</th>
                                            <th className="px-5 py-3"><span className="sr-only">פעולות</span></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-theme-subtle">
                                        {visibleItems.map((item) => {
                                            const effectiveStatus = getNotificationEffectiveStatus(item);
                                            return (
                                                <tr key={item.id} className="transition-colors hover:bg-theme-card-hover">
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${statusClasses[effectiveStatus]}`}>
                                                            {statusLabels[effectiveStatus]}
                                                        </span>
                                                    </td>
                                                    <td className="max-w-md px-5 py-4">
                                                        <div className="truncate font-black">{item.title || 'ללא כותרת'}</div>
                                                        <div className="mt-1 line-clamp-1 text-xs text-theme-muted">{item.text || '—'}</div>
                                                    </td>
                                                    <td className="px-5 py-4 text-sm text-theme-muted">{item.popupActive ? 'פופאפ' : 'מרכז התראות'}</td>
                                                    <td dir="ltr" className="px-5 py-4 text-right text-sm tabular-nums text-theme-muted">{displayWindowLabel(item)}</td>
                                                    <td className="px-5 py-4 text-sm tabular-nums text-theme-muted">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('he-IL') : '—'}</td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex justify-end gap-1">
                                                            <button type="button" onClick={() => openEdit(item)} aria-label={`עריכת ${item.title}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-theme-muted transition-[background-color,color,transform] hover:bg-primary/10 hover:text-primary active:scale-[0.96]"><Pencil size={16} /></button>
                                                            <button type="button" onClick={() => deleteItem(item)} aria-label={`מחיקת ${item.title}`} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-theme-muted transition-[background-color,color,transform] hover:bg-red-500/10 hover:text-red-600 active:scale-[0.96]"><Trash2 size={16} /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}

                {activeTab !== 'list' && editingId && (
                    <section className="mt-6 grid items-start gap-8 xl:grid-cols-[minmax(360px,0.92fr)_minmax(0,1.08fr)]">
                        <div className="overflow-hidden rounded-2xl bg-theme-card shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_10px_30px_-24px_rgba(15,23,42,0.35)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09)] xl:col-start-1">
                            <div className="flex items-start gap-3 border-b border-theme-subtle p-5">
                                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    {activeTab === 'content' ? <FileText size={19} /> : <Send size={19} />}
                                </span>
                                <div>
                                    <h2 className="text-lg font-black">{activeTab === 'content' ? 'תוכן ההתראה' : 'הצגה ותזמון'}</h2>
                                    <p className="mt-1 text-sm text-theme-muted">{activeTab === 'content' ? 'הכותרת והגוף שיוצגו למשתמש.' : 'למי, איך ומתי ההתראה מוצגת.'}</p>
                                </div>
                            </div>

                            <div className="space-y-5 p-5">
                                {activeTab === 'content' ? (
                                    <>
                                        <label className="block">
                                            <span className="mb-1.5 flex items-center justify-between text-sm font-black">
                                                כותרת
                                                <span className="text-xs font-medium tabular-nums text-theme-muted">{form.title.length}/60</span>
                                            </span>
                                            <input
                                                className={inputClass}
                                                value={form.title}
                                                maxLength={60}
                                                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                                                placeholder="למשל: ביקורת כושר רבעונית"
                                            />
                                        </label>
                                        <div>
                                            <span className="mb-1.5 flex items-center justify-between text-sm font-black">
                                                תוכן ההתראה
                                                <span className={`text-xs font-medium tabular-nums ${bodyLength > 280 ? 'text-red-600' : 'text-theme-muted'}`}>{bodyLength}/280</span>
                                            </span>
                                            <SmartTextEditor
                                                value={form.richContent}
                                                plainText={form.text}
                                                onChange={({ tokens, plainText }) => setForm((current) => ({ ...current, richContent: tokens, text: plainText }))}
                                                placeholder="גוף ההודעה שתוצג למשתמש"
                                                editorClassName="min-h-40 rounded-2xl border border-theme-subtle bg-theme-elevated p-4"
                                            />
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label>
                                                <span className="mb-1.5 block text-sm font-black">טקסט לכפתור פעולה</span>
                                                <input
                                                    className={inputClass}
                                                    value={form.ctaLabel}
                                                    onChange={(event) => {
                                                        const ctaLabel = event.target.value;
                                                        setForm((current) => ({
                                                            ...current,
                                                            ctaLabel,
                                                            ...(ctaLabel.trim() ? { requiresAcknowledgement: false } : {}),
                                                        }));
                                                    }}
                                                    placeholder="אופציונלי"
                                                />
                                            </label>
                                            <label>
                                                <span className="mb-1.5 block text-sm font-black">כתובת הכפתור</span>
                                                <input dir="ltr" className={`${inputClass} text-left`} value={form.ctaUrl} onChange={(event) => setForm((current) => ({ ...current, ctaUrl: event.target.value }))} placeholder="https://" />
                                            </label>
                                            <p className="sm:col-span-2 text-pretty text-xs leading-5 text-theme-muted">
                                                הוספת טקסט וכתובת מפעילה כפתור פעולה. כשהוא מופיע בפופאפ, המשתמש חייב ללחוץ עליו כדי לסגור את ההתראה.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <div className="mb-2 text-sm font-black">אופן הצגה</div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                                {[
                                                    { id: 'popup', title: 'פופאפ בכניסה', description: 'נפתח אוטומטית עד שהמשתמש סוגר או מאשר.' },
                                                    { id: 'center', title: 'מרכז ההתראות בלבד', description: 'מופיע בפעמון ובהיסטוריה ללא פתיחה אוטומטית.' },
                                                ].map((mode) => (
                                                    <label key={mode.id} className={`cursor-pointer rounded-2xl p-4 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1)] ${form.displayMode === mode.id ? 'bg-primary/5 text-primary shadow-[inset_0_0_0_2px_hsl(var(--color-primary)/0.45)]' : 'bg-theme-elevated'}`}>
                                                        <span className="flex items-center gap-2 font-black"><input type="radio" checked={form.displayMode === mode.id} onChange={() => setForm((current) => ({ ...current, displayMode: mode.id, popupActive: mode.id === 'popup' }))} />{mode.title}</span>
                                                        <span className="mt-2 block text-pretty text-xs leading-5 text-theme-muted">{mode.description}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <label>
                                                <span className="mb-1.5 block text-sm font-black">מתאריך</span>
                                                <input type="date" className={inputClass} value={form.startsAt} onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))} />
                                            </label>
                                            <label>
                                                <span className="mb-1.5 block text-sm font-black">עד תאריך</span>
                                                <input type="date" className={`${inputClass} ${datesInvalid ? 'border-red-500' : ''}`} value={form.endsAt} onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))} />
                                            </label>
                                        </div>
                                        <p className="text-pretty text-xs leading-5 text-theme-muted">
                                            התזמון אופציונלי. אם שני התאריכים נשארים ריקים, ההתראה תוצג ללא הגבלת זמן. אפשר להגדיר רק תאריך התחלה או רק תאריך סיום.
                                        </p>
                                        {datesInvalid && <p className="text-sm font-bold text-red-600">תאריך הסיום לא יכול להיות לפני תאריך ההתחלה.</p>}
                                        <label className={`flex min-h-14 items-center justify-between gap-4 rounded-2xl px-4 py-3 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] ${hasActionButton ? 'cursor-not-allowed bg-gray-200/70 text-gray-500 dark:bg-white/[0.04] dark:text-gray-500' : 'bg-theme-elevated'}`}>
                                            <div>
                                                <div className="text-sm font-black">דרישת אישור קריאה</div>
                                                <p className="mt-0.5 text-pretty text-xs text-theme-muted">
                                                    {hasActionButton
                                                        ? 'כבר הוגדר כפתור פעולה. הפופאפ ייסגר רק בלחיצה על הכפתור, ולכן הוא מחליף את ״קראתי ואישרתי״.'
                                                        : 'המשתמש יידרש ללחוץ ״קראתי ואישרתי״ לפני סגירת הפופאפ.'}
                                                </p>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={form.requiresAcknowledgement}
                                                disabled={hasActionButton}
                                                onChange={(event) => setForm((current) => ({ ...current, requiresAcknowledgement: event.target.checked }))}
                                                className="h-5 w-5 accent-primary disabled:cursor-not-allowed disabled:opacity-45"
                                            />
                                        </label>
                                        <div className="rounded-2xl border border-theme-subtle p-4">
                                            <div className="mb-3 text-sm font-black">קהל יעד</div>
                                            <div className="flex flex-wrap gap-4">
                                                <label className="flex min-h-10 items-center gap-2"><input type="radio" checked={form.audience.type === 'all'} onChange={() => setForm((current) => ({ ...current, audience: { type: 'all', identities: [] } }))} />כל המשתמשים</label>
                                                <label className="flex min-h-10 items-center gap-2"><input type="radio" checked={form.audience.type === 'users'} onChange={() => setForm((current) => ({ ...current, audience: { type: 'users', identities: [] } }))} />משתמשים מסוימים או קבוצה</label>
                                            </div>
                                            {form.audience.type === 'users' && (
                                                <div className="mt-4">
                                                    <NotificationAudienceTargets
                                                        selectedTargets={form.audience.targets || []}
                                                        onSelectedTargetsChange={(targets) => setForm((current) => ({
                                                            ...current,
                                                            audience: createTargetedAudience(targets),
                                                        }))}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 border-t border-theme-subtle bg-theme-elevated p-4">
                                {activeTab === 'content' ? (
                                    <button type="button" onClick={() => setActiveTab('delivery')} disabled={!form.text.trim() || bodyLength > 280} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"><ArrowLeft size={16} />המשך להצגה ותזמון</button>
                                ) : (
                                    <>
                                        <button type="button" onClick={() => commitEdit('published')} disabled={!form.text.trim() || bodyLength > 280 || isSaving} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45"><Send size={16} />פרסום ההתראה</button>
                                        <button type="button" onClick={() => commitEdit('draft')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-theme-card px-4 text-sm font-black shadow-[0_0_0_1px_rgba(15,23,42,0.1)] transition-[background-color,transform] hover:bg-theme-card-hover active:scale-[0.96] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"><Check size={16} />שמירה כטיוטה</button>
                                    </>
                                )}
                            </div>
                        </div>

                        <aside className="xl:sticky xl:top-6 xl:col-start-2">
                            <div className="mb-3 flex items-center justify-between px-1">
                                <div>
                                    <h2 className="text-sm font-black">תצוגה בזמן אמת</h2>
                                    <p className="mt-0.5 text-xs text-theme-muted">כך בדיוק ייראה הפופאפ למשתמש.</p>
                                </div>
                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-600">LIVE</span>
                            </div>
                            <div className="relative min-h-[390px] overflow-hidden rounded-[30px] bg-[radial-gradient(circle_at_top_right,hsl(var(--color-primary)/0.2),transparent_45%),linear-gradient(145deg,rgba(226,232,240,0.92),rgba(203,213,225,0.88))] p-6 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] dark:bg-[radial-gradient(circle_at_top_right,hsl(var(--color-primary)/0.24),transparent_45%),linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.96))] sm:p-8">
                                <div className="pointer-events-none absolute inset-0 bg-slate-950/15 backdrop-blur-[1px]" />
                                <div className="relative flex min-h-[326px] items-center">
                                    {form.displayMode === 'popup' ? (
                                        <NotificationPopupCard item={previewItem} onClose={() => {}} preview />
                                    ) : (
                                        <div className="w-full overflow-hidden rounded-2xl bg-theme-card shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_18px_45px_-24px_rgba(15,23,42,0.4)]">
                                            <div className="border-b border-theme-subtle px-4 py-3 text-sm font-black">מרכז ההתראות</div>
                                            <div className="flex gap-3 p-4">
                                                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                                                <div><div className="font-black">{previewItem.title || 'כותרת ההתראה'}</div><div className="mt-1 text-sm text-theme-muted">{previewItem.text || 'גוף ההודעה יוצג כאן.'}</div></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="mt-3 text-pretty text-sm text-theme-muted">{form.displayMode === 'popup' ? 'הפופאפ יתעדכן עם כל הקלדה.' : 'ההתראה לא תקפוץ ותמתין במרכז ההתראות של המשתמש.'}</p>
                        </aside>
                    </section>
                )}
            </div>

            {discardAction ? (
                <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDiscardAction(null)}>
                    <div className="w-full max-w-md rounded-xl border border-theme-subtle bg-theme-card p-5 text-right shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="discard-changes-title">
                        <div className="flex items-start gap-3">
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-300"><AlertTriangle size={19} /></span>
                            <div>
                                <h2 id="discard-changes-title" className="text-lg font-black text-theme">שינויים שלא נשמרו</h2>
                                <p className="mt-1 text-sm leading-6 text-theme-muted">העריכה הנוכחית תימחק אם תעברו למסך אחר. אפשר להישאר ולסיים את ההגדרות.</p>
                            </div>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                            <button type="button" onClick={() => setDiscardAction(null)} className="min-h-10 flex-1 rounded-xl border border-theme-subtle bg-theme-elevated px-4 text-sm font-black text-theme transition hover:bg-theme-card-hover">המשך בעריכה</button>
                            <button type="button" onClick={discardChangesAndContinue} className="min-h-10 flex-1 rounded-xl bg-red-600 px-4 text-sm font-black text-white transition hover:bg-red-700">מעבר ללא שמירה</button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
