import React, { useState, useEffect } from 'react';
import { useWidget } from '../context/WidgetContext';
import {
    Save, AlertTriangle, BookUser, Plus, Trash2, Pencil,
    X, Check, User, Phone, Hash
} from 'lucide-react';

const inputCls = 'w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide';

const EMPTY_CONTACT = { id: '', name: '', number: '', department: '' };

export default function AdminPhonebook() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_CONTACT);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    useEffect(() => {
        setList(widgetConfig?.phonebook ?? []);
    }, [widgetConfig]);

    const isDirty = JSON.stringify(list) !== JSON.stringify(widgetConfig?.phonebook ?? []);

    const openNew = () => { setForm({ ...EMPTY_CONTACT, id: crypto.randomUUID() }); setEditingId('new'); };
    const openEdit = (c) => { setForm({ ...c }); setEditingId(c.id); };
    const cancelEdit = () => { setEditingId(null); setForm(EMPTY_CONTACT); };

    const commitEdit = () => {
        if (!form.name.trim()) return;
        setList(prev => editingId === 'new' ? [...prev, form] : prev.map(c => c.id === editingId ? form : c));
        cancelEdit();
    };

    const deleteContact = (id) => {
        setList(prev => prev.filter(c => c.id !== id));
        if (editingId === id) cancelEdit();
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        const success = await saveWidgetConfig({ ...widgetConfig, phonebook: list });
        setIsSaving(false);
        setSaveMessage(success
            ? { type: 'success', text: 'ספר הטלפונים עודכן בהצלחה!' }
            : { type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' }
        );
        setTimeout(() => setSaveMessage(null), 4000);
    };

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <BookUser size={28} className="text-violet-400" />
                        ניהול ספר טלפונים
                    </h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">ניהול רשימת אנשי הקשר המוצגת בווידגט</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={!isDirty || isSaving}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold transition shadow-lg shadow-violet-900/20"
                >
                    <Save size={18} />
                    <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                </button>
            </div>

            {saveMessage && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/50 border border-green-500' : 'bg-red-50 dark:bg-red-900/50 border border-red-500'}`}>
                    <span className={saveMessage.type === 'success' ? 'text-green-700 dark:text-green-200' : 'text-red-700 dark:text-red-200'}>{saveMessage.text}</span>
                </div>
            )}

            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} אנשי קשר ברשימה</p>
                <button onClick={openNew} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition shadow">
                    <Plus size={16} />הוסף איש קשר
                </button>
            </div>

            {/* Inline form */}
            {editingId !== null && (
                <div className="bg-white dark:bg-[#232733] border border-violet-500/30 rounded-2xl p-6 shadow-lg space-y-4 mb-6">
                    <h3 className="text-base font-bold text-violet-400">{editingId === 'new' ? 'הוספת איש קשר' : 'עריכת פרטים'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className={labelCls}><User size={10} className="inline ml-1" />שם</label>
                            <input className={inputCls} placeholder="ישראל ישראלי" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                            <label className={labelCls}><Phone size={10} className="inline ml-1" />מספר טלפון</label>
                            <input className={inputCls} placeholder="050-0000000" value={form.number} dir="ltr" onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}><Hash size={10} className="inline ml-1" />מחלקה / יחידת משנה</label>
                        <input className={inputCls} placeholder="מחלקה א׳ / מטה / לוגיסטיקה..." value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                    </div>
                    <div className="flex gap-3 pt-2">
                        <button onClick={commitEdit} disabled={!form.name.trim()} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 py-2 rounded-lg text-sm font-bold transition">
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
                    <BookUser size={40} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">אין אנשי קשר. לחץ "הוסף איש קשר" להתחיל.</p>
                </div>
            )}

            {/* Contact table */}
            {list.length > 0 && (
                <div className="bg-white dark:bg-[#232733] rounded-2xl border border-gray-200 dark:border-white/8 overflow-hidden">
                    {list.map((contact, idx) => (
                        <div
                            key={contact.id}
                            className={`flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-white/5 last:border-0 transition ${editingId === contact.id ? 'bg-violet-500/5' : 'hover:bg-gray-50 dark:hover:bg-white/[0.03]'}`}
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                                    <span className="text-xs font-black text-violet-400">{idx + 1}</span>
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{contact.name}</p>
                                    {contact.department && <p className="text-xs text-gray-400 truncate">{contact.department}</p>}
                                </div>
                            </div>
                            <div className="flex items-center gap-4 shrink-0">
                                {contact.number && (
                                    <a
                                        href={`tel:${contact.number}`}
                                        className="flex items-center gap-1.5 text-sm font-mono text-gray-500 dark:text-gray-400 hover:text-violet-400 transition"
                                        dir="ltr"
                                        title="התקשר"
                                    >
                                        <Phone size={13} className="text-violet-400" />
                                        {contact.number}
                                    </a>
                                )}
                                <div className="flex gap-1">
                                    <button onClick={() => openEdit(contact)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400 hover:text-blue-400 transition"><Pencil size={14} /></button>
                                    <button onClick={() => deleteContact(contact.id)} className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-400 transition"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {isDirty && (
                <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-500/30 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-200 text-sm font-medium">יש שינויים שלא נשמרו.</span>
                </div>
            )}
        </div>
    );
}
