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
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';

const inputClass = 'w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-2.5 text-sm text-theme outline-none focus:ring-2 focus:ring-primary/30';
const emptyForm = () => ({
    id: '',
    title: '',
    text: '',
    richContent: [],
    isUrgent: false,
    popupActive: false,
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
            createdAt: form.createdAt || timestamp,
            updatedAt: timestamp,
        });
        setList((current) => editingId === 'new'
            ? [...current, notification]
            : current.map((item) => item.id === editingId ? notification : item));
        closeEditor();
    };

    return (
        <div dir="rtl" className="min-h-screen p-8 font-heebo text-theme">
            <div className="space-y-6">
                <header className="flex items-start justify-between gap-4 border-b border-theme-subtle pb-4">
                    <div>
                        <h1 className="flex items-center gap-2 text-3xl font-black"><Bell className="text-primary" />התראות</h1>
                        <p className="mt-1 text-theme-muted">יצירת הודעות עשירות, ממוקדות ופופאפים למשתמשים.</p>
                    </div>
                    <button type="button" onClick={openNew} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white">
                        <Plus size={17} />התראה חדשה
                    </button>
                </header>

                <div className="flex items-center justify-between rounded-xl border border-theme-subtle bg-theme-card px-4 py-3 text-sm text-theme-muted">
                    <span>{list.length} התראות</span>
                    <span>{isSaving ? 'שומר...' : 'כל השינויים נשמרו'}</span>
                </div>

                {error && <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-500"><AlertTriangle size={17} />{error}</div>}

                {editingId !== null && (
                    <section className="space-y-5 rounded-3xl border border-theme-subtle bg-theme-card p-6 shadow-xl">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-black">{editingId === 'new' ? 'יצירת התראה' : 'עריכת התראה'}</h2>
                            <button type="button" onClick={closeEditor} aria-label="סגירה" className="rounded-lg p-2 hover:bg-theme-card-hover"><X size={18} /></button>
                        </div>
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-black text-theme-muted">כותרת</span>
                            <input className={inputClass} value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                        </label>
                        <div>
                            <span className="mb-1.5 block text-xs font-black text-theme-muted">תוכן עשיר ובטוח</span>
                            <SmartTextEditor
                                value={form.richContent}
                                plainText={form.text}
                                onChange={({ tokens, plainText }) => setForm((current) => ({ ...current, richContent: tokens, text: plainText }))}
                                placeholder="כתבו את תוכן ההתראה..."
                                editorClassName="min-h-40 rounded-2xl border border-theme-subtle bg-theme-elevated p-4"
                            />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex items-center gap-3 rounded-xl border border-theme-subtle p-4 font-bold">
                                <input type="checkbox" checked={form.isUrgent} onChange={(event) => setForm((current) => ({ ...current, isUrgent: event.target.checked }))} />
                                התראה דחופה
                            </label>
                            <label className="flex items-center gap-3 rounded-xl border border-theme-subtle p-4 font-bold">
                                <input type="checkbox" checked={form.popupActive} onChange={(event) => setForm((current) => ({ ...current, popupActive: event.target.checked }))} />
                                פופאפ פעיל
                            </label>
                        </div>
                        <div className="rounded-2xl border border-theme-subtle p-4">
                            <div className="mb-3 text-sm font-black">קהל יעד</div>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2"><input type="radio" checked={form.audience.type === 'all'} onChange={() => setForm((current) => ({ ...current, audience: { type: 'all', identities: [] }, linkedTarget: null }))} />כל המשתמשים</label>
                                <label className="flex items-center gap-2"><input type="radio" checked={form.audience.type === 'users'} onChange={() => setForm((current) => ({ ...current, audience: { type: 'users', identities: [] } }))} />משתמש מסוים</label>
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
                        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                            <div className="text-xs font-black text-primary">תצוגה מקדימה</div>
                            <h3 className="mt-2 text-lg font-black">{form.title || 'ללא כותרת'}</h3>
                            <SmartTextRenderer text={form.text} richText={form.richContent} className="mt-2 block whitespace-pre-wrap leading-7" fallback="תוכן ההתראה יוצג כאן" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={closeEditor} className="rounded-xl border border-theme-subtle px-5 py-2.5 font-bold">ביטול</button>
                            <button type="button" onClick={commitEdit} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-black text-white"><Check size={17} />שמירה</button>
                        </div>
                    </section>
                )}

                <div className="grid gap-4 xl:grid-cols-2">
                    {list.map((item) => (
                        <article key={item.id} className={`rounded-2xl border p-5 ${item.isUrgent ? 'border-red-500/30 bg-red-500/5' : 'border-theme-subtle bg-theme-card'}`}>
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap gap-2 text-[11px] font-black">
                                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">{item.audience.type === 'all' ? 'כל המשתמשים' : 'משתמש ממוקד'}</span>
                                        {item.popupActive && <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-violet-600">פופאפ פעיל</span>}
                                        {item.isUrgent && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-red-600">דחוף</span>}
                                    </div>
                                    <h3 className="mt-3 text-lg font-black">{item.title || 'ללא כותרת'}</h3>
                                    <SmartTextRenderer text={item.text} richText={item.richContent} className="mt-2 block whitespace-pre-wrap text-sm leading-6 text-theme-muted" />
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" onClick={() => openEdit(item)} aria-label="עריכה" className="rounded-lg p-2 hover:bg-theme-card-hover"><Pencil size={16} /></button>
                                    <button type="button" onClick={() => setList((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label="מחיקה" className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>

                <WidgetDisplaySettingsPanel widgetId="alerts" />
            </div>
        </div>
    );
}
