import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Check, Pencil, Plus, ScrollText, Trash2, X } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import { useWidget } from '../context/WidgetContext';

const panelCls = 'bg-themeBg-card bg-white dark:bg-[#232733] text-themeText-primary text-gray-900 dark:text-white border border-gray-200 dark:border-white/10';
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-[#1a1d24] dark:text-white';

const EMPTY_ITEM = { id: '', quote: '', author: '', role: '' };
const makeId = () => crypto.randomUUID?.() || Date.now().toString();

export default function AdminHeritage() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_ITEM);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = widgetConfig?.heritage ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [widgetConfig]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, heritage: list });
            setIsSaving(false);
            if (success) lastSavedRef.current = JSON.stringify(list);
            else setSaveMessage({ type: 'error', text: 'שמירת המורשת נכשלה. נסה שוב.' });
        }, 1200);
        return () => clearTimeout(t);
    }, [list, widgetConfig]);

    const openNew = () => {
        setForm({ ...EMPTY_ITEM, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (item) => {
        setForm({ ...item });
        setEditingId(item.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_ITEM);
    };

    const commitEdit = () => {
        if (!form.quote.trim() || !form.author.trim()) return;
        setList((prev) => (
            editingId === 'new'
                ? [...prev, form]
                : prev.map((item) => (item.id === editingId ? form : item))
        ));
        cancelEdit();
    };

    const deleteItem = (id) => {
        setList((prev) => prev.filter((item) => item.id !== id));
        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen p-8 font-heebo text-gray-900 dark:text-white">
            <div className="mb-8 border-b border-gray-300 pb-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="flex items-center gap-3 text-3xl font-black">
                            <ScrollText size={28} className="text-indigo-400" />
                            ניהול מורשת וציטוטים
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">מסרי השראה, מורשת קרב וציטוטים מייצגים.</p>
                    </div>
                    <button onClick={openNew} className="h-10 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-bold text-white transition hover:bg-indigo-700 shrink-0">
                        <Plus size={16} />
                        הוסף ציטוט
                    </button>
                </div>
            </div>

            {saveMessage?.type === 'error' && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500 bg-red-50 p-4 text-red-700 dark:bg-red-900/30 dark:text-red-200">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>{saveMessage.text}</span>
                </div>
            )}

            <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#232733] px-4 py-2.5">
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} ציטוטים מוגדרים</p>
                <span className="text-sm text-gray-500 dark:text-gray-400">{isSaving ? 'שומר...' : 'מוכן לעריכה'}</span>
            </div>

            {editingId !== null && (
                <div className={`${panelCls} mb-6 rounded-2xl p-6 shadow-lg`}>
                    <h3 className="mb-4 text-base font-bold text-indigo-400">{editingId === 'new' ? 'הוספת פריט מורשת' : 'עריכת פריט מורשת'}</h3>
                    <div className="space-y-4">
                        <textarea className={`${inputCls} min-h-[120px] resize-none`} placeholder="הציטוט או המסר" value={form.quote} onChange={(e) => setForm((prev) => ({ ...prev, quote: e.target.value }))} />
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <input className={inputCls} placeholder="מחבר / דובר" value={form.author} onChange={(e) => setForm((prev) => ({ ...prev, author: e.target.value }))} />
                            <input className={inputCls} placeholder="תפקיד / שיוך" value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))} />
                        </div>
                    </div>
                    <div className="mt-4 flex gap-3">
                        <button onClick={commitEdit} className="h-10 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 text-sm font-bold text-white transition hover:bg-indigo-700">
                            <Check size={16} />
                            {editingId === 'new' ? 'הוסף' : 'עדכן'}
                        </button>
                        <button onClick={cancelEdit} className="h-10 inline-flex items-center gap-2 rounded-lg bg-gray-200 px-5 text-sm font-bold text-gray-700 transition hover:bg-gray-300 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15">
                            <X size={16} />
                            ביטול
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {list.map((item) => (
                    <div key={item.id} className={`${panelCls} rounded-2xl p-5 shadow-sm`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-base leading-7 text-gray-800 dark:text-gray-100">&quot;{item.quote}&quot;</p>
                                <div className="mt-3 text-sm font-bold text-indigo-400">{item.author}</div>
                                {item.role && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{item.role}</div>}
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(item)} className="rounded-md p-2 text-gray-400 transition hover:bg-indigo-500/10 hover:text-indigo-400"><Pencil size={15} /></button>
                                <button onClick={() => deleteItem(item.id)} className="rounded-md p-2 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <WidgetDisplaySettingsPanel widgetKey="heritage" title="הגדרות הצגה דינמיות לווידג׳ט " />
        </div>
    );
}
