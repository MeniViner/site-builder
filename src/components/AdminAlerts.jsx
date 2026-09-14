import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bell, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useConfig } from '../context/ConfigProvider';
import {
    getStableUserIdentities,
    normalizeNotification,
    normalizeNotifications,
} from '../utils/notificationData';
import SmartTextEditor from './SmartTextEditor';
import SmartTextRenderer from './SmartTextRenderer';
import VerifiedIdentityField from './VerifiedIdentityField';
import NotificationPopupCard from './NotificationPopupCard';

const inputClass = 'w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-2.5 text-sm text-theme outline-none transition-[border-color,box-shadow] focus:border-primary/50 focus:ring-2 focus:ring-primary/20';
const emptyForm = () => ({
    id: '',
    title: '',
    text: '',
    richContent: [],
    isUrgent: false,
    popupActive: true,
    audience: { type: 'all', identities: [] },
    source: 'admin',
    sourceEntityId: '',
    eventKey: '',
    createdAt: '',
    updatedAt: '',
    targetIdentityInput: '',
    linkedTarget: null,
});
const makeId = () => globalThis.crypto?.randomUUID?.() || `notification-${Date.now()}`;

export default function AdminAlerts() {
    const { config, updateConfig, saveNow, error } = useConfig();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const lastSavedRef = useRef('');

    useEffect(() => {
        const serverItems = normalizeNotifications(config?.widgets?.data?.alerts?.items);
        const snapshot = JSON.stringify(serverItems);
        setList(serverItems);
        lastSavedRef.current = snapshot;
    }, [config?.widgets?.data?.alerts?.items]);

    useEffect(() => {
        const snapshot = JSON.stringify(list);
        if (snapshot === lastSavedRef.current) return undefined;
        const timer = window.setTimeout(async () => {
            setIsSaving(true);
            try {
                updateConfig((current) => ({
                    ...current,
                    widgets: {
                        ...current.widgets,
                        data: {
                            ...current.widgets?.data,
                            alerts: { ...current.widgets?.data?.alerts, items: list },
                        },
                    },
                }));
                await saveNow();
                lastSavedRef.current = snapshot;
            } catch (saveError) {
                toast.error(saveError?.message || 'שמירת ההתראות נכשלה');
            } finally {
                setIsSaving(false);
            }
        }, 800);
        return () => window.clearTimeout(timer);
    }, [list, saveNow, updateConfig]);

    const openNew = () => {
        setForm({ ...emptyForm(), id: makeId() });
        setEditingId('new');
    };

    const openEdit = (item) => {
        setForm({
            ...emptyForm(),
            ...normalizeNotification(item),
            targetIdentityInput: '',
            linkedTarget: null,
        });
        setEditingId(item.id);
    };

    const closeEditor = () => {
        setEditingId(null);
        setForm(emptyForm());
    };

    const commitEdit = () => {
        if (!form.text.trim()) {
            toast.error('יש להזין תוכן להתראה.');
            return;
        }
        if (form.audience.type === 'users' && form.audience.identities.length === 0) {
            toast.error('יש לאמת משתמש יעד לפני שמירת ההתראה.');
            return;
        }
        const timestamp = new Date().toISOString();
        const notification = normalizeNotification({
            ...form,
            isUrgent: false,
            createdAt: form.createdAt || timestamp,
            updatedAt: timestamp,
        });
        setList((current) => editingId === 'new'
            ? [...current, notification]
            : current.map((item) => item.id === editingId ? notification : item));
        closeEditor();
    };

    const previewItem = normalizeNotification({
        ...form,
        isUrgent: false,
        source: form.source || 'admin',
    });

    return (
        <div dir="rtl" className="min-h-screen p-5 font-heebo text-theme sm:p-8">
            <div className="space-y-6">
                <header className="flex items-start justify-between gap-4 border-b border-theme-subtle pb-4">
                    <div>
                        <h1 className="flex items-center gap-2 text-balance text-3xl font-black">
                            <Bell className="text-primary" />
                            התראות
                        </h1>
                        <p className="mt-1 text-pretty text-theme-muted">יצירת פופאפים שיוצגו למשתמשים בכניסה הראשונה.</p>
                    </div>
                    <button
                        type="button"
                        onClick={openNew}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary pl-4 pr-3.5 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"
                    >
                        <Plus size={17} />
                        התראה חדשה
                    </button>
                </header>

                <div className="flex items-center justify-between rounded-2xl bg-theme-card px-4 py-3 text-sm text-theme-muted shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_8px_rgba(15,23,42,0.04)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                    <span className="tabular-nums">{list.length} התראות</span>
                    <span>{isSaving ? 'שומר...' : 'כל השינויים נשמרו'}</span>
                </div>

                {error && (
                    <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-500">
                        <AlertTriangle size={17} />
                        {error}
                    </div>
                )}

                {editingId !== null && (
                    <section className="grid items-start gap-6 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.1fr)]">
                        <div className="space-y-5 rounded-[28px] bg-theme-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_18px_50px_-28px_rgba(15,23,42,0.4)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09)] sm:p-6 xl:col-start-1 xl:row-start-1">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-balance text-lg font-black">{editingId === 'new' ? 'יצירת התראה' : 'עריכת התראה'}</h2>
                                    <p className="mt-1 text-pretty text-xs text-theme-muted">הקלידו מימין וצפו בפופאפ האמיתי משמאל.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={closeEditor}
                                    aria-label="סגירת העורך"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-theme-muted transition-[background-color,color,transform] hover:bg-theme-card-hover hover:text-theme active:scale-[0.96]"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <label className="block">
                                <span className="mb-1.5 block text-xs font-black text-theme-muted">כותרת</span>
                                <input
                                    className={inputClass}
                                    value={form.title}
                                    onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                                    placeholder="כותרת קצרה וברורה"
                                />
                            </label>

                            <div>
                                <span className="mb-1.5 block text-xs font-black text-theme-muted">תוכן ההתראה</span>
                                <SmartTextEditor
                                    value={form.richContent}
                                    plainText={form.text}
                                    onChange={({ tokens, plainText }) => setForm((current) => ({ ...current, richContent: tokens, text: plainText }))}
                                    placeholder="כתבו את תוכן ההתראה..."
                                    editorClassName="min-h-40 rounded-2xl border border-theme-subtle bg-theme-elevated p-4"
                                />
                            </div>

                            <label className="flex min-h-14 items-center justify-between gap-4 rounded-2xl bg-primary/5 px-4 py-3 shadow-[inset_0_0_0_1px_hsl(var(--color-primary)/0.16)]">
                                <div>
                                    <div className="text-sm font-black">הצגה אוטומטית כפופאפ</div>
                                    <p className="mt-0.5 text-pretty text-xs text-theme-muted">בהפעלה, ההתראה תיפתח אוטומטית למשתמש שלא קרא אותה.</p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={form.popupActive}
                                    onChange={(event) => setForm((current) => ({ ...current, popupActive: event.target.checked }))}
                                    className="h-5 w-5 shrink-0 accent-primary"
                                />
                            </label>

                            <div className="rounded-2xl border border-theme-subtle p-4">
                                <div className="mb-3 text-sm font-black">קהל יעד</div>
                                <div className="flex flex-wrap gap-4">
                                    <label className="flex min-h-10 items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={form.audience.type === 'all'}
                                            onChange={() => setForm((current) => ({
                                                ...current,
                                                audience: { type: 'all', identities: [] },
                                                linkedTarget: null,
                                            }))}
                                        />
                                        כל המשתמשים
                                    </label>
                                    <label className="flex min-h-10 items-center gap-2">
                                        <input
                                            type="radio"
                                            checked={form.audience.type === 'users'}
                                            onChange={() => setForm((current) => ({
                                                ...current,
                                                audience: { type: 'users', identities: [] },
                                            }))}
                                        />
                                        משתמש מסוים
                                    </label>
                                </div>
                                {form.audience.type === 'users' && (
                                    <div className="mt-4">
                                        <VerifiedIdentityField
                                            identityInput={form.targetIdentityInput}
                                            linkedUser={form.linkedTarget}
                                            onIdentityChange={(targetIdentityInput) => setForm((current) => ({ ...current, targetIdentityInput }))}
                                            onLinkedUserChange={(linkedTarget) => setForm((current) => ({
                                                ...current,
                                                linkedTarget,
                                                audience: {
                                                    type: 'users',
                                                    identities: linkedTarget ? getStableUserIdentities(linkedTarget) : [],
                                                },
                                            }))}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-2 border-t border-theme-subtle pt-5">
                                <button
                                    type="button"
                                    onClick={closeEditor}
                                    className="min-h-11 rounded-xl px-5 font-bold shadow-[0_0_0_1px_rgba(15,23,42,0.1)] transition-[background-color,transform] hover:bg-theme-card-hover active:scale-[0.96] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
                                >
                                    ביטול
                                </button>
                                <button
                                    type="button"
                                    onClick={commitEdit}
                                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary pl-5 pr-[18px] font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"
                                >
                                    <Check size={17} />
                                    שמירת ההתראה
                                </button>
                            </div>
                        </div>

                        <aside className="xl:sticky xl:top-6 xl:col-start-2 xl:row-start-1">
                            <div className="mb-3 flex items-center justify-between px-1">
                                <div>
                                    <h2 className="text-sm font-black">תצוגה בזמן אמת</h2>
                                    <p className="mt-0.5 text-xs text-theme-muted">כך בדיוק ייראה הפופאפ למשתמש.</p>
                                </div>
                                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-black text-emerald-600">חי</span>
                            </div>
                            <div className="relative overflow-hidden rounded-[36px] bg-[radial-gradient(circle_at_top_right,hsl(var(--color-primary)/0.24),transparent_45%),linear-gradient(145deg,rgba(15,23,42,0.92),rgba(30,41,59,0.96))] p-6 shadow-[0_28px_80px_-36px_rgba(15,23,42,0.8)] sm:p-8">
                                <div className="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[1px]" />
                                <div className="relative">
                                    <NotificationPopupCard
                                        item={previewItem}
                                        onClose={() => {}}
                                        preview
                                    />
                                </div>
                            </div>
                        </aside>
                    </section>
                )}

                <section>
                    <div className="mb-3">
                        <h2 className="text-lg font-black">התראות שנשמרו</h2>
                        <p className="mt-1 text-sm text-theme-muted">עריכה או מחיקה של פופאפים קיימים.</p>
                    </div>
                    {list.length === 0 ? (
                        <div className="rounded-3xl bg-theme-card p-10 text-center text-theme-muted shadow-[0_0_0_1px_rgba(15,23,42,0.06)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                            עדיין לא נוצרו התראות.
                        </div>
                    ) : (
                        <div className="grid gap-4 xl:grid-cols-2">
                            {list.map((item) => (
                                <article
                                    key={item.id}
                                    className="rounded-2xl bg-theme-card p-5 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_2px_8px_rgba(15,23,42,0.04)] transition-[box-shadow,transform] hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgba(15,23,42,0.09),0_12px_30px_-22px_rgba(15,23,42,0.35)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                                                    {item.audience.type === 'all' ? 'כל המשתמשים' : 'משתמש ממוקד'}
                                                </span>
                                                <span className={`rounded-full px-2.5 py-1 ${item.popupActive ? 'bg-emerald-500/10 text-emerald-600' : 'bg-gray-500/10 text-theme-muted'}`}>
                                                    {item.popupActive ? 'פופאפ אוטומטי' : 'בהיסטוריה בלבד'}
                                                </span>
                                            </div>
                                            <h3 className="mt-3 text-balance text-lg font-black">{item.title || 'ללא כותרת'}</h3>
                                            <SmartTextRenderer
                                                text={item.text}
                                                richText={item.richContent}
                                                className="mt-2 line-clamp-3 block whitespace-pre-wrap text-pretty text-sm leading-6 text-theme-muted"
                                            />
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => openEdit(item)}
                                                aria-label="עריכה"
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition-[background-color,color,transform] hover:bg-theme-card-hover active:scale-[0.96]"
                                            >
                                                <Pencil size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setList((current) => current.filter((candidate) => candidate.id !== item.id))}
                                                aria-label="מחיקה"
                                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-red-500 transition-[background-color,transform] hover:bg-red-500/10 active:scale-[0.96]"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
