import React, { useState, useEffect, useRef } from 'react';
import { Bell, Plus, Trash2, Pencil, X, Check, AlertTriangle } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import { useConfig } from '../context/ConfigProvider';
import { spLog } from '../utils/spAppLog';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';

const inputCls = 'w-full bg-theme-elevated border border-theme-subtle rounded-lg px-4 py-2.5 text-sm text-theme placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition';
const labelCls = 'block text-xs font-semibold text-theme-muted mb-1.5 uppercase tracking-wide';

const EMPTY_ALERT = { id: '', title: '', text: '', isUrgent: false };

const makeId = () => crypto.randomUUID?.() || Date.now().toString();

export default function AdminAlerts() {
    const { config, updateConfig, saveNow, error } = useConfig();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_ALERT);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = config?.widgets?.data?.alerts?.items ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [config?.widgets?.data?.alerts?.items]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;

        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            try {
                updateConfig((prev) => ({
                    ...prev,
                    widgets: {
                        ...(prev?.widgets || {}),
                        data: {
                            ...(prev?.widgets?.data || {}),
                            alerts: {
                                ...(prev?.widgets?.data?.alerts || {}),
                                items: list,
                            },
                        },
                    },
                }));
                await saveNow();
                lastSavedRef.current = JSON.stringify(list);
            } catch (saveError) {
                spLog.error('AdminAlerts: failed to save alerts.', saveError);
                setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
            } finally {
                setIsSaving(false);
            }
        }, 1200);

        return () => clearTimeout(t);
    }, [list, saveNow, updateConfig]);

    const openNew = () => {
        setForm({ ...EMPTY_ALERT, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (item) => {
        setForm({ ...item });
        setEditingId(item.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_ALERT);
    };

    const commitEdit = () => {
        if (!form.text.trim()) return;
        setList((prev) => (
            editingId === 'new'
                ? [...prev, form]
                : prev.map((alertItem) => (alertItem.id === editingId ? form : alertItem))
        ));
        cancelEdit();
    };

    const deleteItem = (id) => {
        setList((prev) => prev.filter((alertItem) => alertItem.id !== id));
        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen text-theme font-heebo p-8">
            <div className="space-y-6">
                <div className="border-b border-theme-subtle pb-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-theme flex items-center gap-2">
                                <Bell className="text-amber-500" />
                                ניהול לוח הודעות
                            </h1>
                            <p className="text-theme-muted">ניהול הודעות שוטפות וקריטיות המוצגות בווידגט ההתראות.</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <AdminPageHelpButton pageId="alerts" />
                            <button onClick={openNew} className="h-10 inline-flex items-center bg-amber-500 hover:bg-amber-600 text-white px-4 rounded-lg text-sm font-bold transition">
                                <span className="inline-flex items-center gap-2">
                                    <Plus size={16} />
                                    הוסף הודעה
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4 bg-theme-card px-4 py-2.5 rounded-lg border border-theme-subtle">
                    <p className="text-sm text-theme-muted">{list.length} הודעות ברשימה</p>
                    <div className="text-sm text-theme-muted">
                        {isSaving ? 'שומר...' : 'מוכן לעריכה'}
                    </div>
                </div>

                {(saveMessage?.type === 'error' || error) && (
                    <div className="p-4 rounded-lg flex items-center gap-3 bg-red-500/10 border border-red-500/40 text-red-500">
                        <AlertTriangle size={16} className="shrink-0" />
                        <span>{saveMessage?.text || error}</span>
                    </div>
                )}

                {editingId !== null && (
                    <div className="bg-theme-card border border-theme-subtle rounded-2xl p-6 shadow-lg space-y-4">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-amber-500">{editingId === 'new' ? 'הוספת הודעה חדשה' : 'עריכת הודעה'}</h3>
                            <HelpTooltipButton
                                title="עריכת הודעה"
                                description="כאן ממלאים את התוכן שיופיע בווידג׳ט ההתראות."
                                items={[
                                    'כותרת היא לא חובה, אבל היא עוזרת להבליט נושא.',
                                    'תוכן ההודעה הוא החלק החשוב באמת, ולכן כדאי לכתוב אותו בקצרה ובבהירות.',
                                ]}
                            />
                        </div>
                        <div>
                            <HelpLabel
                                as="span"
                                className={labelCls}
                                helpTitle="כותרת"
                                helpDescription="שדה קצר לבחירת כותרת להודעה. אפשר להשאיר ריק אם אין צורך."
                            >
                                כותרת (אופציונלי)
                            </HelpLabel>
                            <input
                                className={inputCls}
                                placeholder="כותרת קצרה להודעה..."
                                value={form.title}
                                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                            />
                        </div>
                        <div>
                            <HelpLabel
                                as="span"
                                className={labelCls}
                                helpTitle="תוכן ההודעה"
                                helpDescription="זה הטקסט שהמשתמשים יקראו. עדיף לכתוב משפט אחד ברור או שתי שורות קצרות."
                            >
                                תוכן ההודעה
                            </HelpLabel>
                            <textarea
                                rows={3}
                                className={`${inputCls} resize-none`}
                                placeholder="כתוב את תוכן ההודעה כאן..."
                                value={form.text}
                                onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))}
                            />
                        </div>
                        <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                            <div
                                onClick={() => setForm((prev) => ({ ...prev, isUrgent: !prev.isUrgent }))}
                                className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${form.isUrgent ? 'bg-red-500' : 'bg-theme-elevated border border-theme-subtle'}`}
                            >
                                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${form.isUrgent ? 'left-5' : 'left-0.5'}`} />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-sm font-semibold ${form.isUrgent ? 'text-red-500' : 'text-theme-muted'}`}>
                                    {form.isUrgent ? 'הודעה קריטית' : 'הודעה רגילה'}
                                </span>
                                <HelpTooltipButton
                                    title="סוג ההודעה"
                                    description="הודעה רגילה מתאימה לעדכון שוטף. הודעה קריטית מתאימה למשהו שחייב למשוך תשומת לב מיידית."
                                />
                            </div>
                        </label>
                        <div className="flex gap-3 pt-2">
                            <button onClick={commitEdit} disabled={!form.text.trim()} className="h-10 inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 rounded-lg text-sm font-bold transition">
                                <Check size={15} />
                                {editingId === 'new' ? 'הוסף' : 'עדכן'}
                            </button>
                            <button onClick={cancelEdit} className="h-10 inline-flex items-center gap-2 bg-theme-elevated hover:bg-theme-card-hover border border-theme-subtle text-theme px-5 rounded-lg text-sm font-bold transition">
                                <X size={15} />
                                ביטול
                            </button>
                        </div>
                    </div>
                )}

                {list.length === 0 && editingId === null ? (
                    <div className="py-20 text-center text-theme-muted border-2 border-dashed border-theme-subtle rounded-2xl bg-theme-card">
                        <Bell size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">אין הודעות פעילות. לחץ "הוסף הודעה" כדי להתחיל.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {list.map((item) => (
                            <div
                                key={item.id}
                                className={`flex items-start gap-3 p-4 rounded-xl border transition ${editingId === item.id ? 'border-amber-500/40 bg-amber-500/10' : 'bg-theme-card border-theme-subtle'}`}
                            >
                                <span className="shrink-0 mt-1.5">
                                    {item.isUrgent
                                        ? <span className="block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                        : <span className="block w-2.5 h-2.5 rounded-full bg-amber-400" />
                                    }
                                </span>
                                <div className={`flex-1 min-w-0 ${item.isUrgent ? 'font-semibold text-theme' : 'text-theme-muted'}`}>
                                    {item.title && <div className="text-sm font-bold mb-0.5 text-theme">{item.title}</div>}
                                    <p className="text-sm leading-relaxed">{item.text}</p>
                                </div>
                                {item.isUrgent && (
                                    <span className="shrink-0 text-[10px] font-black text-red-500 border border-red-500/30 bg-red-500/10 px-2 py-0.5 rounded-full uppercase">קריטי</span>
                                )}
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={() => openEdit(item)} className="p-1.5 rounded-md hover:bg-theme-card-hover text-theme-muted hover:text-blue-500 transition"><Pencil size={14} /></button>
                                    <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-theme-muted hover:text-red-500 transition"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <WidgetDisplaySettingsPanel widgetId="alerts" />
            </div>
        </div>
    );
}
