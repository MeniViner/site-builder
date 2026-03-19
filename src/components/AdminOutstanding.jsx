import React, { useState, useEffect, useRef } from 'react';
import {
    Award, Plus, Trash2, Pencil,
    X, Check, User, AlignLeft, Upload, AlertTriangle,
} from 'lucide-react';
import Tooltip from './Tooltip';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import { useConfig } from '../context/ConfigProvider';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';

const inputCls = 'w-full bg-theme-elevated border border-theme-subtle rounded-lg px-4 py-2.5 text-sm text-theme placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-emerald-500/40 transition';
const labelCls = 'block text-xs font-semibold text-theme-muted mb-1.5 uppercase tracking-wide';

const EMPTY_PERSON = { id: '', name: '', role: '', image: '', description: '' };
const makeId = () => crypto.randomUUID?.() || Date.now().toString();

function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export default function AdminOutstanding() {
    const { config, updateConfig, saveNow, error } = useConfig();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_PERSON);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = config?.widgets?.data?.outstanding?.items ?? [];
        setList(server.map((person) => ({ ...person, image: person?.imageUrl ?? person?.image ?? '' })));
        lastSavedRef.current = JSON.stringify(server.map((person) => ({ ...person, image: person?.imageUrl ?? person?.image ?? '' })));
    }, [config?.widgets?.data?.outstanding?.items]);

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
                            outstanding: {
                                ...(prev?.widgets?.data?.outstanding || {}),
                                items: list.map((person) => ({
                                    ...person,
                                    imageUrl: person?.imageUrl ?? person?.image ?? '',
                                })),
                            },
                        },
                    },
                }));
                await saveNow();
                lastSavedRef.current = JSON.stringify(list);
            } catch (saveError) {
                console.error(saveError);
                setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
            } finally {
                setIsSaving(false);
            }
        }, 1200);

        return () => clearTimeout(t);
    }, [list, saveNow, updateConfig]);

    const openNew = () => {
        setForm({ ...EMPTY_PERSON, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (person) => {
        setForm({ ...person, image: person?.image ?? person?.imageUrl ?? '' });
        setEditingId(person.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_PERSON);
    };

    const commitEdit = () => {
        if (!form.name.trim()) return;
        setList((prev) => (
            editingId === 'new'
                ? [...prev, form]
                : prev.map((person) => (person.id === editingId ? form : person))
        ));
        cancelEdit();
    };

    const deletePerson = (id) => {
        setList((prev) => prev.filter((person) => person.id !== id));
        if (editingId === id) cancelEdit();
    };

    const handleImageFileChange = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const dataUrl = await fileToDataUrl(file);
            setForm((prev) => ({ ...prev, image: dataUrl }));
        } catch (uploadError) {
            console.error(uploadError);
        } finally {
            event.target.value = '';
        }
    };

    return (
        <div dir="rtl" className="min-h-screen text-theme font-heebo p-8">
            <div className="space-y-6">
                <div className="border-b border-theme-subtle pb-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-theme flex items-center gap-2">
                                <Award className="text-emerald-500" />
                                ניהול מצטיינים
                            </h1>
                            <p className="text-theme-muted">ניהול כרטיסי מצטיינים המוצגים בווידגט ההוקרה.</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <AdminPageHelpButton pageId="outstanding" />
                            <button onClick={openNew} className="h-10 inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white px-4 rounded-lg text-sm font-bold transition">
                                <span className="inline-flex items-center gap-2">
                                    <Plus size={16} />
                                    הוסף מצטיין
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4 bg-theme-card px-4 py-2.5 rounded-lg border border-theme-subtle">
                    <p className="text-sm text-theme-muted">{list.length} מצטיינים ברשימה</p>
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
                            <h3 className="text-base font-bold text-emerald-500">{editingId === 'new' ? 'הוספת מצטיין חדש' : 'עריכת פרטים'}</h3>
                            <HelpTooltipButton
                                title="כרטיס מצטיין"
                                description="כל כרטיס מייצג אדם אחד שמקבל הוקרה באתר."
                                items={[
                                    'מומלץ לשמור על שם ברור, תפקיד קצר ותיאור תמציתי.',
                                    'אם אין תמונה כרגע, אפשר לשמור גם בלי תמונה ולהשלים אחר כך.',
                                ]}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <HelpLabel
                                    as="span"
                                    className={labelCls}
                                    helpTitle="שם מלא"
                                    helpDescription="השם שיופיע על כרטיס ההוקרה."
                                >
                                    <><User size={10} className="inline ml-1" />שם מלא</>
                                </HelpLabel>
                                <input className={inputCls} placeholder="ישראל ישראלי" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div>
                                <HelpLabel
                                    as="span"
                                    className={labelCls}
                                    helpTitle="תפקיד"
                                    helpDescription="הסבר קצר מי האדם ומה תפקידו ביחידה."
                                >
                                    <><AlignLeft size={10} className="inline ml-1" />תפקיד</>
                                </HelpLabel>
                                <input className={inputCls} placeholder="לוחם / מ״פ / קצין..." value={form.role} onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value }))} />
                            </div>
                        </div>
                        <div>
                            <HelpLabel
                                as="span"
                                className={labelCls}
                                helpTitle="העלאת תמונה"
                                helpDescription="כאן מעלים תמונה שתופיע לצד השם. עדיף תמונה ברורה ומרוכזת."
                            >
                                <><Upload size={10} className="inline ml-1" />העלאת תמונה</>
                            </HelpLabel>
                            <label className={`${inputCls} h-10 inline-flex items-center justify-center gap-2 cursor-pointer`}>
                                <Upload size={14} />
                                בחר תמונה מהמחשב
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageFileChange}
                                />
                            </label>
                        </div>
                        <div>
                            <HelpLabel
                                as="span"
                                className={labelCls}
                                helpTitle="תיאור קצר"
                                helpDescription="כמה מילים שמסבירות למה האדם נבחר למצטיין."
                            >
                                תיאור קצר
                            </HelpLabel>
                            <textarea rows={3} className={`${inputCls} resize-none`} placeholder="למה הוא/היא מצטיין/ת?" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
                        </div>
                        {form.image && (
                            <div className="flex items-center gap-3">
                                <img src={form.image} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-emerald-500/40" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                <span className="text-xs text-theme-muted">תצוגה מקדימה</span>
                            </div>
                        )}
                        <div className="flex gap-3 pt-2">
                            <button onClick={commitEdit} disabled={!form.name.trim()} className="h-10 inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 rounded-lg text-sm font-bold transition">
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
                        <Award size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">אין מצטיינים. לחץ "הוסף מצטיין" כדי להתחיל.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                        {list.map((person) => (
                            <div key={person.id} className={`relative bg-theme-card border rounded-xl p-4 flex gap-4 items-start transition ${editingId === person.id ? 'border-emerald-500/50 ring-2 ring-emerald-500/20' : 'border-theme-subtle'}`}>
                                {person.image ? (
                                    <img src={person.image} alt={person.name} className="w-14 h-14 rounded-full object-cover shrink-0 border-2 border-emerald-500/30" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                ) : (
                                    <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0"><User size={24} className="text-emerald-500" /></div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-theme text-sm truncate">{person.name}</p>
                                    <p className="text-xs text-emerald-500 font-medium mt-0.5 truncate">{person.role}</p>
                                    {person.description && <p className="text-xs text-theme-muted mt-1.5 leading-relaxed line-clamp-2">{person.description}</p>}
                                </div>
                                <div className="flex flex-col gap-1.5 shrink-0">
                                    <Tooltip text="ערוך">
                                        <button onClick={() => openEdit(person)} className="p-1.5 rounded-md hover:bg-theme-card-hover text-theme-muted hover:text-blue-500 transition"><Pencil size={14} /></button>
                                    </Tooltip>
                                    <Tooltip text="מחק">
                                        <button onClick={() => deletePerson(person.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-theme-muted hover:text-red-500 transition"><Trash2 size={14} /></button>
                                    </Tooltip>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <WidgetDisplaySettingsPanel widgetId="outstanding" />
            </div>
        </div>
    );
}
