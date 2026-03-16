import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Check, Lightbulb, Pencil, Plus, Trash2, X } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import { useWidget } from '../context/WidgetContext';

const panelCls = 'bg-themeBg-card bg-white dark:bg-[#232733] text-themeText-primary text-gray-900 dark:text-white border border-gray-200 dark:border-white/10';
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-yellow-400 focus:ring-2 focus:ring-yellow-500/20 dark:border-white/10 dark:bg-[#1a1d24] dark:text-white';

const EMPTY_ITEM = { id: '', title: '', text: '' };
const makeId = () => crypto.randomUUID?.() || Date.now().toString();

export default function AdminTips() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_ITEM);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = widgetConfig?.tips ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [widgetConfig]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, tips: list });
            setIsSaving(false);
            if (success) lastSavedRef.current = JSON.stringify(list);
            else setSaveMessage({ type: 'error', text: 'שמירת הטיפים נכשלה. נסה שוב.' });
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
        if (!form.title.trim() || !form.text.trim()) return;
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
        <div dir="rtl" className="min-h-screen bg-gray-100 p-8 font-heebo text-gray-900 dark:bg-[#1e212b] dark:text-white">
            <div className="mb-8 flex items-center justify-between border-b border-gray-300 pb-4 dark:border-white/10">
                <div>
                    <h1 className="flex items-center gap-3 text-3xl font-black">
                        <Lightbulb size={28} className="text-yellow-500" />
                        ניהול טיפ השבוע
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">טיפים, נהלים ותזכורות קצרות להצגה במחזוריות.</p>
                </div>
                {isSaving && <span className="text-sm text-gray-500 dark:text-gray-400">שומר...</span>}
            </div>

            {saveMessage?.type === 'error' && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500 bg-red-50 p-4 text-red-700 dark:bg-red-900/30 dark:text-red-200">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>{saveMessage.text}</span>
                </div>
            )}

            <div className="mb-6 flex items-center justify-between">
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} טיפים מוגדרים</p>
                <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-yellow-600">
                    <Plus size={16} />
                    הוסף טיפ
                </button>
            </div>

            {editingId !== null && (
                <div className={`${panelCls} mb-6 rounded-2xl p-6 shadow-lg`}>
                    <h3 className="mb-4 text-base font-bold text-yellow-500">{editingId === 'new' ? 'הוספת טיפ' : 'עריכת טיפ'}</h3>
                    <div className="space-y-4">
                        <input className={inputCls} placeholder="כותרת הטיפ" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
                        <textarea className={`${inputCls} min-h-[120px] resize-none`} placeholder="תוכן הטיפ" value={form.text} onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))} />
                    </div>
                    <div className="mt-4 flex gap-3">
                        <button onClick={commitEdit} className="flex items-center gap-2 rounded-lg bg-yellow-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-yellow-600">
                            <Check size={16} />
                            {editingId === 'new' ? 'הוסף' : 'עדכן'}
                        </button>
                        <button onClick={cancelEdit} className="flex items-center gap-2 rounded-lg bg-gray-200 px-5 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-300 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15">
                            <X size={16} />
                            ביטול
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {list.map((item) => (
                    <div key={item.id} className={`${panelCls} rounded-2xl p-5 shadow-sm`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="text-lg font-bold">{item.title}</div>
                                <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-300">{item.text}</p>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(item)} className="rounded-md p-2 text-gray-400 transition hover:bg-yellow-500/10 hover:text-yellow-500"><Pencil size={15} /></button>
                                <button onClick={() => deleteItem(item.id)} className="rounded-md p-2 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <WidgetDisplaySettingsPanel widgetKey="tips" title="הגדרות הצגה דינמיות לווידג׳ט " />
        </div>
    );
}
