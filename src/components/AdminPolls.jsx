import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Check, ListChecks, Pencil, Plus, Trash2, Vote, X } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import { useWidget } from '../context/WidgetContext';

const panelCls = 'bg-themeBg-card bg-white dark:bg-[#232733] text-themeText-primary text-gray-900 dark:text-white border border-gray-200 dark:border-white/10';
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-500/20 dark:border-white/10 dark:bg-[#1a1d24] dark:text-white';

const EMPTY_POLL = { id: '', question: '', optionsInput: '', active: true };
const makeId = () => crypto.randomUUID?.() || Date.now().toString();

export default function AdminPolls() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_POLL);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = widgetConfig?.polls ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [widgetConfig]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, polls: list });
            setIsSaving(false);
            if (success) lastSavedRef.current = JSON.stringify(list);
            else setSaveMessage({ type: 'error', text: 'שמירת הסקרים נכשלה. נסה שוב.' });
        }, 1200);
        return () => clearTimeout(t);
    }, [list, widgetConfig]);

    const openNew = () => {
        setForm({ ...EMPTY_POLL, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (item) => {
        setForm({
            id: item.id,
            question: item.question,
            optionsInput: (item.options || []).map((option) => option.text).join(', '),
            active: item.active !== false,
        });
        setEditingId(item.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_POLL);
    };

    const buildOptions = () => {
        const existing = list.find((item) => item.id === editingId)?.options ?? [];
        return form.optionsInput
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean)
            .map((text, index) => {
                const match = existing.find((option) => option.text === text);
                return match || { id: `o-${form.id}-${index + 1}`, text, votes: 0 };
            });
    };

    const commitEdit = () => {
        const options = buildOptions();
        if (!form.question.trim() || options.length === 0) return;
        const nextItem = { id: form.id, question: form.question, options, active: form.active };
        setList((prev) => (
            editingId === 'new'
                ? [...prev, nextItem]
                : prev.map((item) => (item.id === editingId ? nextItem : item))
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
                        <Vote size={28} className="text-pink-400" />
                        ניהול סקרים
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הגדרת שאלות ואפשרויות הצבעה בפורמט פשוט ומהיר.</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} סקרים מוגדרים</p>
                <button onClick={openNew} className="flex items-center gap-2 rounded-lg bg-pink-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-pink-700">
                    <Plus size={16} />
                    הוסף סקר
                </button>
            </div>

            {editingId !== null && (
                <div className={`${panelCls} mb-6 rounded-2xl p-6 shadow-lg`}>
                    <h3 className="mb-4 text-base font-bold text-pink-400">{editingId === 'new' ? 'הוספת סקר' : 'עריכת סקר'}</h3>
                    <div className="space-y-4">
                        <input className={inputCls} placeholder="שאלת הסקר" value={form.question} onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))} />
                        <textarea className={`${inputCls} min-h-[110px] resize-none`} placeholder="אפשרויות מופרדות בפסיקים" value={form.optionsInput} onChange={(e) => setForm((prev) => ({ ...prev, optionsInput: e.target.value }))} />
                        <label className="flex items-center gap-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
                            סקר פעיל
                        </label>
                    </div>
                    <div className="mt-4 flex gap-3">
                        <button onClick={commitEdit} className="flex items-center gap-2 rounded-lg bg-pink-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-pink-700">
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

            <div className="space-y-4">
                {list.map((item) => (
                    <div key={item.id} className={`${panelCls} rounded-2xl p-5 shadow-sm`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-bold">{item.question}</h3>
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.active ? 'bg-pink-500/10 text-pink-500' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
                                        {item.active ? 'פעיל' : 'סגור'}
                                    </span>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {(item.options || []).map((option) => (
                                        <span key={option.id} className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 dark:bg-white/10 dark:text-gray-200">
                                            <ListChecks size={12} className="text-pink-400" />
                                            {option.text}
                                            <span className="text-pink-500">({option.votes})</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(item)} className="rounded-md p-2 text-gray-400 transition hover:bg-pink-500/10 hover:text-pink-400"><Pencil size={15} /></button>
                                <button onClick={() => deleteItem(item.id)} className="rounded-md p-2 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <WidgetDisplaySettingsPanel widgetKey="polls" title="הגדרות הצגה דינמיות לווידג׳ט " />
        </div>
    );
}
