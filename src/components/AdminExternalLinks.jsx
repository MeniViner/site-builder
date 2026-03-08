import React, { useState, useEffect } from 'react';
import { useExternalLinks } from '../context/ExternalLinksContext';
import {
    Save, AlertTriangle, Plus, Trash2, Edit2, X,
    ExternalLink, GripVertical, Image as ImageIcon, Link as LinkIcon, Type
} from 'lucide-react';

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function AdminExternalLinks() {
    const { externalLinks, loading, error, saveExternalLinks } = useExternalLinks();
    const [links, setLinks] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [editingLink, setEditingLink] = useState(null);

    useEffect(() => {
        if (externalLinks) {
            setLinks(externalLinks.map(l => ({ ...l })));
        }
    }, [externalLinks]);

    const hasChanges = JSON.stringify(links) !== JSON.stringify(externalLinks);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        const success = await saveExternalLinks(links);
        setIsSaving(false);
        if (success) {
            setSaveMessage({ type: 'success', text: 'קישורים חיצוניים נשמרו בהצלחה!' });
        } else {
            setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
        }
        setTimeout(() => setSaveMessage(null), 4000);
    };

    const addLink = () => {
        setEditingLink({
            id: generateId(),
            title: '',
            url: '',
            iconUrl: '',
            isNew: true,
        });
    };

    const saveEdit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const updated = {
            id: editingLink.id,
            title: formData.get('title').trim(),
            url: formData.get('url').trim(),
            iconUrl: formData.get('iconUrl').trim(),
        };

        if (!updated.title || !updated.url) return;

        if (editingLink.isNew) {
            setLinks(prev => [...prev, updated]);
        } else {
            setLinks(prev => prev.map(l => l.id === updated.id ? updated : l));
        }
        setEditingLink(null);
    };

    const removeLink = (id) => {
        if (!window.confirm('האם למחוק קישור זה?')) return;
        setLinks(prev => prev.filter(l => l.id !== id));
    };

    const startEdit = (link) => {
        setEditingLink({ ...link, isNew: false });
    };

    if (loading && !externalLinks) {
        return <div className="p-8 text-center text-gray-400">טוען קישורים חיצוניים...</div>;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-[#1e212b] text-white font-heebo p-8">
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-white">ניהול קישורים חיצוניים</h1>
                    <p className="text-sm text-gray-500 mt-1">ניהול הקישורים המוצגים בפוטר של האתר — מערכות צה"ל, אתרים חיצוניים ועוד</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={addLink}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-2.5 rounded-lg font-bold transition text-sm"
                    >
                        <Plus size={16} />
                        <span>הוסף קישור</span>
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold transition shadow-lg shadow-red-900/20"
                    >
                        <Save size={18} />
                        <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-red-400 shrink-0" />
                    <span className="text-red-200">{error}</span>
                </div>
            )}

            {saveMessage && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${saveMessage.type === 'success' ? 'bg-green-900/50 border border-green-500' : 'bg-red-900/50 border border-red-500'}`}>
                    <span className={saveMessage.type === 'success' ? 'text-green-200' : 'text-red-200'}>{saveMessage.text}</span>
                </div>
            )}

            {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-white/10 rounded-2xl">
                    <ExternalLink size={48} className="text-gray-700 mb-4" />
                    <h2 className="text-xl font-bold text-gray-400 mb-2">אין קישורים חיצוניים</h2>
                    <p className="text-gray-600 text-sm mb-6">לחץ על "הוסף קישור" כדי להוסיף קישור חיצוני ראשון לפוטר.</p>
                    <button
                        onClick={addLink}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-red-900/20"
                    >
                        <Plus size={18} />
                        <span>הוסף קישור ראשון</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {links.map((link) => (
                        <div
                            key={link.id}
                            className="bg-[#232733] border border-white/5 rounded-xl p-5 flex flex-col group hover:border-white/10 transition-all relative"
                        >
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-xl bg-[#1e212b] border border-gray-700/50 overflow-hidden flex items-center justify-center shrink-0">
                                    {link.iconUrl ? (
                                        <img
                                            src={link.iconUrl}
                                            alt={link.title}
                                            className="w-full h-full object-contain p-1.5"
                                            onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                                        />
                                    ) : null}
                                    <div
                                        className={`w-full h-full items-center justify-center ${link.iconUrl ? 'hidden' : 'flex'}`}
                                    >
                                        <ExternalLink size={22} className="text-gray-600" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-white text-base truncate mb-1">{link.title || '(ללא כותרת)'}</h3>
                                    <p className="text-xs text-blue-400/70 truncate dir-ltr text-left" dir="ltr">{link.url || '(ללא כתובת)'}</p>
                                </div>
                            </div>

                            {link.iconUrl && (
                                <p className="text-[11px] text-gray-600 truncate mb-3 dir-ltr text-left" dir="ltr">
                                    <ImageIcon size={10} className="inline mr-1" />{link.iconUrl}
                                </p>
                            )}

                            <div className="flex items-center gap-2 mt-auto pt-3 border-t border-white/5">
                                <button
                                    onClick={() => startEdit(link)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white rounded-lg transition text-sm font-medium"
                                >
                                    <Edit2 size={14} />
                                    <span>ערוך</span>
                                </button>
                                <button
                                    onClick={() => removeLink(link.id)}
                                    className="flex items-center justify-center gap-2 py-2 px-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg transition text-sm font-medium"
                                >
                                    <Trash2 size={14} />
                                    <span>מחק</span>
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Add card */}
                    <button
                        onClick={addLink}
                        className="border-2 border-dashed border-white/10 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-gray-300 hover:border-white/20 hover:bg-white/[0.02] transition-all min-h-[200px]"
                    >
                        <Plus size={28} />
                        <span className="font-bold text-sm">הוסף קישור חדש</span>
                    </button>
                </div>
            )}

            {hasChanges && (
                <div className="mt-8 p-4 bg-amber-900/30 border border-amber-500/30 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                    <span className="text-amber-200 text-sm font-medium">
                        יש שינויים שלא נשמרו — לחץ "שמור שינויים" כדי לשמור את רשימת הקישורים.
                    </span>
                </div>
            )}

            {/* Edit / Add Modal */}
            {editingLink && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#1e212b] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-800/80">
                            <h2 className="text-xl font-bold text-white">
                                {editingLink.isNew ? 'הוסף קישור חיצוני' : 'עריכת קישור'}
                            </h2>
                            <button onClick={() => setEditingLink(null)} className="text-gray-400 hover:text-white transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={saveEdit} className="p-6 flex flex-col gap-5">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-300 mb-2">
                                    <Type size={14} className="text-gray-500" />
                                    כותרת
                                </label>
                                <input
                                    name="title"
                                    type="text"
                                    defaultValue={editingLink.title}
                                    required
                                    className="w-full bg-[#151821] border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 transition text-sm"
                                    placeholder='לדוגמה: "פורטל מילואים"'
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-300 mb-2">
                                    <LinkIcon size={14} className="text-gray-500" />
                                    כתובת URL
                                </label>
                                <input
                                    name="url"
                                    type="text"
                                    defaultValue={editingLink.url}
                                    required
                                    className="w-full bg-[#151821] border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 transition text-sm font-mono dir-ltr text-left"
                                    placeholder="https://example.idf.il"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-300 mb-2">
                                    <ImageIcon size={14} className="text-gray-500" />
                                    נתיב אייקון / תמונה
                                    <span className="text-gray-600 font-normal">(אופציונלי)</span>
                                </label>
                                <input
                                    name="iconUrl"
                                    type="text"
                                    defaultValue={editingLink.iconUrl}
                                    className="w-full bg-[#151821] border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 transition text-sm font-mono dir-ltr text-left"
                                    placeholder="/images/icon.png או https://..."
                                    dir="ltr"
                                />
                                {editingLink.iconUrl && (
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-[#232733] border border-gray-700/50 overflow-hidden flex items-center justify-center">
                                            <img
                                                src={editingLink.iconUrl}
                                                alt="תצוגה מקדימה"
                                                className="w-full h-full object-contain p-1"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        </div>
                                        <span className="text-xs text-gray-600">תצוגה מקדימה</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-800/80">
                                <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition">
                                    {editingLink.isNew ? 'הוסף' : 'שמור'}
                                </button>
                                <button type="button" onClick={() => setEditingLink(null)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold transition">
                                    ביטול
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
