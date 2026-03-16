import React, { useState, useEffect, useRef } from 'react';
import { useWidget } from '../context/WidgetContext';
import {
    Award, Plus, Trash2, Pencil,
    X, Check, User, AlignLeft, Image as ImageIcon
} from 'lucide-react';

const inputCls = 'w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide';

const EMPTY_PERSON = { id: '', name: '', role: '', image: '', description: '' };

export default function AdminOutstanding() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_PERSON);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = widgetConfig?.outstanding ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [widgetConfig]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, outstanding: list });
            setIsSaving(false);
            if (success) lastSavedRef.current = JSON.stringify(list);
            else setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
        }, 1200);
        return () => clearTimeout(t);
    }, [list, widgetConfig]);

    const openNew = () => { setForm({ ...EMPTY_PERSON, id: crypto.randomUUID() }); setEditingId('new'); };
    const openEdit = (p) => { setForm({ ...p }); setEditingId(p.id); };
    const cancelEdit = () => { setEditingId(null); setForm(EMPTY_PERSON); };

    const commitEdit = () => {
        if (!form.name.trim()) return;
        setList(prev => editingId === 'new' ? [...prev, form] : prev.map(p => p.id === editingId ? form : p));
        cancelEdit();
    };

    const deletePerson = (id) => {
        setList(prev => prev.filter(p => p.id !== id));
        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <Award size={28} className="text-emerald-400" />
                        ניהול מצטיינים
                    </h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">ניהול כרטיסי המצטיינים המוצגים בווידגט היחידה</p>
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
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} מצטיינים ברשימה</p>
                <button onClick={openNew} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow">
                    <Plus size={16} />הוסף מצטיין
                </button>
            </div>

            {/* Inline form */}
            {editingId !== null && (
                <div className="bg-white dark:bg-[#232733] border border-emerald-500/30 rounded-2xl p-6 shadow-lg space-y-4 mb-6">
                    <h3 className="text-base font-bold text-emerald-400">{editingId === 'new' ? 'הוספת מצטיין חדש' : 'עריכת פרטים'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}><User size={10} className="inline ml-1" />שם מלא</label>
                            <input className={inputCls} placeholder="ישראל ישראלי" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className={labelCls}><AlignLeft size={10} className="inline ml-1" />תפקיד</label>
                            <input className={inputCls} placeholder="לוחם / מ״פ / קצין..." value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}><ImageIcon size={10} className="inline ml-1" />כתובת תמונה (URL)</label>
                        <input className={inputCls} placeholder="https://..." value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} />
                    </div>
                    <div>
                        <label className={labelCls}>תיאור קצר</label>
                        <textarea rows={3} className={`${inputCls} resize-none`} placeholder="למה הוא/היא מצטיין?" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    </div>
                    {form.image && (
                        <div className="flex items-center gap-3">
                            <img src={form.image} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/40" onError={e => { e.currentTarget.style.display = 'none'; }} />
                            <span className="text-xs text-gray-400">תצוגה מקדימה</span>
                        </div>
                    )}
                    <div className="flex gap-3 pt-2">
                        <button onClick={commitEdit} disabled={!form.name.trim()} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-bold transition">
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
                    <Award size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">אין מצטיינים. לחץ "הוסף מצטיין" להתחיל.</p>
                </div>
            )}

            {/* Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {list.map(person => (
                    <div key={person.id} className={`relative bg-white dark:bg-[#232733] border rounded-xl p-4 flex gap-4 items-start transition ${editingId === person.id ? 'border-emerald-500/50 ring-2 ring-emerald-500/20' : 'border-gray-200 dark:border-white/8'}`}>
                        {person.image ? (
                            <img src={person.image} alt={person.name} className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-emerald-500/30" onError={e => { e.currentTarget.style.display = 'none'; }} />
                        ) : (
                            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0"><User size={24} className="text-emerald-400" /></div>
                        )}
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{person.name}</p>
                            <p className="text-xs text-emerald-400 font-medium mt-0.5 truncate">{person.role}</p>
                            {person.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{person.description}</p>}
                        </div>
                        <div className="flex flex-col gap-1.5 shrink-0">
                            <button onClick={() => openEdit(person)} title="ערוך" className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-blue-400 transition"><Pencil size={14} /></button>
                            <button onClick={() => deletePerson(person.id)} title="מחק" className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-400 transition"><Trash2 size={14} /></button>
                        </div>
                    </div>
                ))}
            </div>

        </div>
    );
}
