import React, { useState, useEffect, useRef } from 'react';
import { useWidget } from '../context/WidgetContext';
import { Bell, Plus, Trash2, Pencil, X, Check } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';

const inputCls = 'w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide';

const EMPTY_ALERT = { id: '', title: '', text: '', isUrgent: false };

export default function AdminAlerts() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_ALERT);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = widgetConfig?.alerts ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [widgetConfig]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, alerts: list });
            setIsSaving(false);
            if (success) lastSavedRef.current = JSON.stringify(list);
            else setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
        }, 1200);
        return () => clearTimeout(t);
    }, [list, widgetConfig]);

    const openNew = () => { setForm({ ...EMPTY_ALERT, id: crypto.randomUUID() }); setEditingId('new'); };
    const openEdit = (item) => { setForm({ ...item }); setEditingId(item.id); };
    const cancelEdit = () => { setEditingId(null); setForm(EMPTY_ALERT); };

    const commitEdit = () => {
        if (!form.text.trim()) return;
        setList(prev => editingId === 'new' ? [...prev, form] : prev.map(a => a.id === editingId ? form : a));
        cancelEdit();
    };

    const deleteItem = (id) => {
        setList(prev => prev.filter(a => a.id !== id));
        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <Bell size={28} className="text-amber-500" />
                        ניהול לוח הודעות
                    </h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">ניהול ההודעות השוטפות והקריטיות המוצגות בווידגט</p>
                </div>
                {isSaving && <span className="text-sm text-gray-500 dark:text-gray-400">שומר...</span>}
            </div>

            {saveMessage?.type === 'error' && (
                <div className="mb-6 p-4 rounded-lg flex items-center gap-3 bg-red-50 dark:bg-red-900/50 border border-red-500">
                    <span className="text-red-700 dark:text-red-200">{saveMessage.text}</span>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} הודעות ברשימה</p>
                <button onClick={openNew} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow">
                    <Plus size={16} />הוסף הודעה
                </button>
            </div>

            {/* Inline form */}
            {editingId !== null && (
                <div className="bg-white dark:bg-[#232733] border border-amber-500/30 rounded-2xl p-6 shadow-lg space-y-4 mb-6">
                    <h3 className="text-base font-bold text-amber-500">{editingId === 'new' ? 'הוספת הודעה חדשה' : 'עריכת הודעה'}</h3>
                    <div>
                        <label className={labelCls}>כותרת (אופציונלי)</label>
                        <input
                            className={inputCls}
                            placeholder="כותרת קצרה להודעה..."
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className={labelCls}>תוכן ההודעה</label>
                        <textarea
                            rows={3}
                            className={`${inputCls} resize-none`}
                            placeholder="כתוב את תוכן ההודעה כאן..."
                            value={form.text}
                            onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
                        />
                    </div>
                    {/* Urgent toggle */}
                    <label className="flex items-center gap-3 cursor-pointer select-none w-fit">
                        <div
                            onClick={() => setForm(f => ({ ...f, isUrgent: !f.isUrgent }))}
                            className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${form.isUrgent ? 'bg-red-500' : 'bg-gray-300 dark:bg-white/20'}`}
                        >
                            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${form.isUrgent ? 'left-5' : 'left-0.5'}`} />
                        </div>
                        <span className={`text-sm font-semibold ${form.isUrgent ? 'text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            {form.isUrgent ? '🔴 הודעה קריטית' : 'רגילה'}
                        </span>
                    </label>
                    <div className="flex gap-3 pt-2">
                        <button onClick={commitEdit} disabled={!form.text.trim()} className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-bold transition">
                            <Check size={15} />{editingId === 'new' ? 'הוסף' : 'עדכן'}
                        </button>
                        <button onClick={cancelEdit} className="flex items-center gap-2 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/15 text-gray-700 dark:text-gray-300 px-5 py-2 rounded-lg text-sm font-bold transition">
                            <X size={15} />ביטול
                        </button>
                    </div>
                </div>
            )}

            {/* Empty state */}
            {list.length === 0 && editingId === null && (
                <div className="py-20 text-center text-gray-400 dark:text-gray-600 border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl">
                    <Bell size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">אין הודעות פעילות. לחץ "הוסף הודעה" כדי להזין הודעה למערכת.</p>
                </div>
            )}

            {/* List */}
            <div className="space-y-2">
                {list.map(item => (
                    <div
                        key={item.id}
                        className={`flex items-start gap-3 p-4 rounded-xl border transition ${editingId === item.id ? 'border-amber-500/40 bg-amber-500/5' : 'bg-white dark:bg-[#232733] border-gray-200 dark:border-white/8'}`}
                    >
                        <span className="shrink-0 mt-1.5">
                            {item.isUrgent
                                ? <span className="block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                                : <span className="block w-2.5 h-2.5 rounded-full bg-amber-400" />
                            }
                        </span>
                        <div className={`flex-1 min-w-0 ${item.isUrgent ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                            {item.title && <div className="text-sm font-bold mb-0.5">{item.title}</div>}
                            <p className="text-sm leading-relaxed">{item.text}</p>
                        </div>
                        {item.isUrgent && (
                            <span className="shrink-0 text-[10px] font-black text-red-400 border border-red-400/30 bg-red-500/10 px-2 py-0.5 rounded-full uppercase">קריטי</span>
                        )}
                        <div className="flex gap-1 shrink-0">
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-blue-400 transition"><Pencil size={14} /></button>
                            <button onClick={() => deleteItem(item.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-400 transition"><Trash2 size={14} /></button>
                        </div>
                    </div>
                ))}
            </div>

            <WidgetDisplaySettingsPanel
                widgetKey="alerts"
                title="הגדרות הצגה דינמיות לווידג׳ט "
            />
        </div>
    );
}
