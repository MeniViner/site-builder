import React, { useState, useEffect, useRef } from 'react';
import { BookUser, Plus, Trash2, Pencil, X, Check, User, Phone, Hash, AlertTriangle } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import Tooltip from './Tooltip';
import { useConfig } from '../context/ConfigProvider';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';

const inputCls = 'w-full bg-theme-elevated border border-theme-subtle rounded-lg px-4 py-2.5 text-sm text-theme placeholder-theme-muted focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition';
const labelCls = 'block text-xs font-semibold text-theme-muted mb-1.5 uppercase tracking-wide';

const EMPTY_CONTACT = { id: '', name: '', number: '', department: '' };
const makeId = () => crypto.randomUUID?.() || Date.now().toString();

export default function AdminPhonebook() {
    const { config, updateConfig, saveNow, error } = useConfig();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_CONTACT);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = config?.widgets?.data?.phonebook?.items ?? [];
        setList(server);
        lastSavedRef.current = JSON.stringify(server);
    }, [config?.widgets?.data?.phonebook?.items]);

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
                            phonebook: {
                                ...(prev?.widgets?.data?.phonebook || {}),
                                items: list,
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
        setForm({ ...EMPTY_CONTACT, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (contact) => {
        setForm({ ...contact });
        setEditingId(contact.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_CONTACT);
    };

    const commitEdit = () => {
        if (!form.name.trim()) return;
        setList((prev) => (
            editingId === 'new'
                ? [...prev, form]
                : prev.map((contact) => (contact.id === editingId ? form : contact))
        ));
        cancelEdit();
    };

    const deleteContact = (id) => {
        setList((prev) => prev.filter((contact) => contact.id !== id));
        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen text-theme font-heebo p-8">
            <div className="space-y-6">
                <div className="border-b border-theme-subtle pb-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-theme flex items-center gap-2">
                                <BookUser className="text-violet-500" />
                                ניהול ספר טלפונים
                            </h1>
                            <p className="text-theme-muted">ניהול אנשי הקשר שיוצגו בווידגט הטלפונים של היחידה.</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <AdminPageHelpButton pageId="phonebook" />
                            <button onClick={openNew} className="h-10 inline-flex items-center bg-violet-600 hover:bg-violet-700 text-white px-4 rounded-lg text-sm font-bold transition">
                                <span className="inline-flex items-center gap-2">
                                    <Plus size={16} />
                                    הוסף איש קשר
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-4 bg-theme-card px-4 py-2.5 rounded-lg border border-theme-subtle">
                    <p className="text-sm text-theme-muted">{list.length} אנשי קשר ברשימה</p>
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
                            <h3 className="text-base font-bold text-violet-500">{editingId === 'new' ? 'הוספת איש קשר' : 'עריכת פרטי איש קשר'}</h3>
                            <HelpTooltipButton
                                title="איש קשר"
                                description="הכרטיס הזה מיועד לאדם אחד שמופיע בספר הטלפונים."
                                items={[
                                    'כדאי למלא לפחות שם ומספר.',
                                    'המחלקה עוזרת להבין למי צריך לפנות.',
                                ]}
                            />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <HelpLabel
                                    as="span"
                                    className={labelCls}
                                    helpTitle="שם"
                                    helpDescription="השם שיוצג למשתמשים ברשימת אנשי הקשר."
                                >
                                    <><User size={10} className="inline ml-1" />שם</>
                                </HelpLabel>
                                <input className={inputCls} placeholder="ישראל ישראלי" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
                            </div>
                            <div>
                                <HelpLabel
                                    as="span"
                                    className={labelCls}
                                    helpTitle="מספר טלפון"
                                    helpDescription="המספר שהמשתמשים יוכלו להעתיק או ללחוץ עליו לחיוג."
                                >
                                    <><Phone size={10} className="inline ml-1" />מספר טלפון</>
                                </HelpLabel>
                                <input className={inputCls} placeholder="050-0000000" value={form.number} dir="ltr" onChange={(e) => setForm((prev) => ({ ...prev, number: e.target.value }))} />
                            </div>
                        </div>
                        <div>
                            <HelpLabel
                                as="span"
                                className={labelCls}
                                helpTitle="מחלקה או יחידת משנה"
                                helpDescription="ממלאים כאן מאיפה איש הקשר מגיע, כדי שיהיה קל לזהות אותו."
                            >
                                <><Hash size={10} className="inline ml-1" />מחלקה / יחידת משנה</>
                            </HelpLabel>
                            <input className={inputCls} placeholder="מחלקה א׳ / מטה / לוגיסטיקה..." value={form.department} onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))} />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={commitEdit} disabled={!form.name.trim()} className="h-10 inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-5 rounded-lg text-sm font-bold transition">
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
                        <BookUser size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="font-medium">אין אנשי קשר. לחץ "הוסף איש קשר" כדי להתחיל.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {list.map((contact, index) => (
                            <div
                                key={contact.id}
                                className={`flex items-center justify-between px-5 py-4 rounded-xl border transition ${editingId === contact.id ? 'border-violet-500/40 bg-violet-500/10' : 'bg-theme-card border-theme-subtle'}`}
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                                        <span className="text-xs font-black text-violet-500">{index + 1}</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-theme truncate">{contact.name}</p>
                                        {contact.department && <p className="text-xs text-theme-muted truncate">{contact.department}</p>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 shrink-0">
                                    {contact.number && (
                                        <Tooltip text="התקשר">
                                            <a
                                                href={`tel:${contact.number}`}
                                                className="flex items-center gap-1.5 text-sm font-mono text-theme-muted hover:text-violet-500 transition"
                                                dir="ltr"
                                            >
                                                <Phone size={13} className="text-violet-500" />
                                                {contact.number}
                                            </a>
                                        </Tooltip>
                                    )}
                                    <div className="flex gap-1">
                                        <button onClick={() => openEdit(contact)} className="p-1.5 rounded-md hover:bg-theme-card-hover text-theme-muted hover:text-blue-500 transition"><Pencil size={14} /></button>
                                        <button onClick={() => deleteContact(contact.id)} className="p-1.5 rounded-md hover:bg-red-500/10 text-theme-muted hover:text-red-500 transition"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <WidgetDisplaySettingsPanel widgetId="phonebook" />
            </div>
        </div>
    );
}
