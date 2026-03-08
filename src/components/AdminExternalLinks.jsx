import React, { useState, useEffect, useRef } from 'react';
import { useExternalLinks } from '../context/ExternalLinksContext';
import {
    Save, AlertTriangle, Plus, Trash2, Edit2, X,
    ExternalLink, GripVertical, Image as ImageIcon, Link as LinkIcon, Type, Upload, Loader2
} from 'lucide-react';
import { uploadImage } from '../utils/sharepointUtils';

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function AdminExternalLinks() {
    const { externalLinks, loading, error, saveExternalLinks } = useExternalLinks();
    const [links, setLinks] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [editingLink, setEditingLink] = useState(null);
    const [uploadingIcon, setUploadingIcon] = useState(false);
    const iconFileInputRef = useRef(null);

    useEffect(() => {
        if (externalLinks) {
            setLinks(externalLinks.map(l => ({ ...l })));
        }
    }, [externalLinks]);

    const hasChanges = JSON.stringify(links) !== JSON.stringify(externalLinks);

    const handleIconFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !editingLink) return;
        setUploadingIcon(true);
        try {
            const url = await uploadImage(file, 'ExternalLinks');
            setEditingLink(prev => ({ ...prev, iconUrl: url }));
        } catch (err) {
            console.error('שגיאה בהעלאת אייקון:', err);
            setSaveMessage({ type: 'error', text: `שגיאה בהעלאת אייקון: ${err.message}` });
            setTimeout(() => setSaveMessage(null), 4000);
        } finally {
            setUploadingIcon(false);
            if (iconFileInputRef.current) iconFileInputRef.current.value = '';
        }
    };

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
            iconUrl: editingLink.iconUrl || '',
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
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען קישורים חיצוניים...</div>;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white">ניהול קישורים חיצוניים</h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">ניהול הקישורים המוצגים בפוטר של האתר — מערכות צה"ל, אתרים חיצוניים ועוד</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={addLink}
                        className="flex items-center gap-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-300 dark:border-white/10 text-gray-900 dark:text-white px-5 py-2.5 rounded-lg font-bold transition text-sm"
                    >
                        <Plus size={16} />
                        <span>הוסף קישור</span>
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges || uploadingIcon}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold transition shadow-lg shadow-red-900/20"
                    >
                        <Save size={18} />
                        <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/50 border border-red-300 dark:border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-red-400 shrink-0" />
                    <span className="text-red-700 dark:text-red-200">{error}</span>
                </div>
            )}

            {saveMessage && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/50 border border-green-300 dark:border-green-500' : 'bg-red-50 dark:bg-red-900/50 border border-red-300 dark:border-red-500'}`}>
                    <span className={saveMessage.type === 'success' ? 'text-green-700 dark:text-green-200' : 'text-red-700 dark:text-red-200'}>{saveMessage.text}</span>
                </div>
            )}

            {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl">
                    <ExternalLink size={48} className="text-gray-700 mb-4" />
                    <h2 className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">אין קישורים חיצוניים</h2>
                    <p className="text-gray-400 dark:text-gray-600 text-sm mb-6">לחץ על "הוסף קישור" כדי להוסיף קישור חיצוני ראשון לפוטר.</p>
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
                            className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 rounded-xl p-5 flex flex-col group hover:border-gray-300 dark:hover:border-white/10 transition-all relative"
                        >
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center shrink-0">
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
                                        <ExternalLink size={22} className="text-gray-400 dark:text-gray-600" />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 dark:text-white text-base truncate mb-1">{link.title || '(ללא כותרת)'}</h3>
                                    <p className="text-xs text-blue-400/70 truncate dir-ltr text-left" dir="ltr">{link.url || '(ללא כתובת)'}</p>
                                </div>
                            </div>

                            {link.iconUrl && (
                                <p className="text-[11px] text-gray-400 dark:text-gray-600 truncate mb-3 dir-ltr text-left" dir="ltr">
                                    <ImageIcon size={10} className="inline mr-1" />{link.iconUrl}
                                </p>
                            )}

                            <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-200 dark:border-white/5">
                                <button
                                    onClick={() => startEdit(link)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg transition text-sm font-medium"
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
                        className="border-2 border-dashed border-gray-300 dark:border-white/10 rounded-xl p-5 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-400 dark:hover:border-white/20 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-all min-h-[200px]"
                    >
                        <Plus size={28} />
                        <span className="font-bold text-sm">הוסף קישור חדש</span>
                    </button>
                </div>
            )}

            {hasChanges && (
                <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-500/30 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-200 text-sm font-medium">
                        יש שינויים שלא נשמרו — לחץ "שמור שינויים" כדי לשמור את רשימת הקישורים.
                    </span>
                </div>
            )}

            {/* Edit / Add Modal */}
            {editingLink && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 dark:bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-gray-100 dark:bg-[#1e212b] border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800/80">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {editingLink.isNew ? 'הוסף קישור חיצוני' : 'עריכת קישור'}
                            </h2>
                            <button onClick={() => setEditingLink(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={saveEdit} className="p-6 flex flex-col gap-5">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                    <Type size={14} className="text-gray-400 dark:text-gray-500" />
                                    כותרת
                                </label>
                                <input
                                    name="title"
                                    type="text"
                                    defaultValue={editingLink.title}
                                    required
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-red-500 transition text-sm"
                                    placeholder='לדוגמה: "פורטל מילואים"'
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                    <LinkIcon size={14} className="text-gray-400 dark:text-gray-500" />
                                    כתובת URL
                                </label>
                                <input
                                    name="url"
                                    type="text"
                                    defaultValue={editingLink.url}
                                    required
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-red-500 transition text-sm font-mono dir-ltr text-left"
                                    placeholder="https://example.idf.il"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                    <ImageIcon size={14} className="text-gray-400 dark:text-gray-500" />
                                    אייקון / תמונה
                                    <span className="text-gray-400 dark:text-gray-600 font-normal">(אופציונלי)</span>
                                </label>
                                <input name="iconUrl" type="hidden" value={editingLink.iconUrl || ''} />
                                <label
                                    className={`flex items-center justify-center gap-2 w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 border-dashed rounded-xl px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-red-500/50 hover:text-gray-700 dark:hover:text-gray-300 transition cursor-pointer ${uploadingIcon ? 'opacity-50 pointer-events-none' : ''}`}
                                >
                                    {uploadingIcon ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin text-red-400" />
                                            <span>מעלה אייקון...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Upload size={16} />
                                            <span>{editingLink.iconUrl ? 'החלף אייקון' : 'העלה אייקון'}</span>
                                        </>
                                    )}
                                    <input
                                        ref={iconFileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleIconFileUpload}
                                        className="hidden"
                                        disabled={uploadingIcon}
                                    />
                                </label>
                                {editingLink.iconUrl && (
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-lg bg-white dark:bg-[#232733] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center">
                                            <img
                                                src={editingLink.iconUrl}
                                                alt="תצוגה מקדימה"
                                                className="w-full h-full object-contain p-1"
                                                onError={(e) => { e.target.style.display = 'none'; }}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-gray-400 dark:text-gray-600">תצוגה מקדימה</span>
                                            <button
                                                type="button"
                                                onClick={() => setEditingLink(prev => ({ ...prev, iconUrl: '' }))}
                                                className="text-xs text-red-400 hover:text-red-300 transition text-right"
                                            >
                                                הסר אייקון
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/80">
                                <button
                                    type="submit"
                                    disabled={uploadingIcon}
                                    className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition"
                                >
                                    {uploadingIcon ? 'ממתין להעלאה...' : editingLink.isNew ? 'הוסף' : 'שמור'}
                                </button>
                                <button type="button" onClick={() => setEditingLink(null)} className="flex-1 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition">
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
