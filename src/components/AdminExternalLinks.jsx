import React, { useState, useEffect, useRef } from 'react';
import { useExternalLinks } from '../context/ExternalLinksContext';
import {
    AlertTriangle, Plus, Trash2, Edit2, X,
    ExternalLink, GripVertical, Image as ImageIcon, Link as LinkIcon, Type, Upload, Loader2, Star
} from 'lucide-react';
import { uploadImage } from '../utils/sharepointUtils';
import { resolveSiteImageUrl } from '../utils/assetUrl';
import { toast } from 'react-toastify';
import IconPickerModal from './IconPickerModal';
import { DynamicIcon } from './DynamicIcon';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default function AdminExternalLinks() {
    const { externalLinks, loading, error, saveExternalLinks } = useExternalLinks();
    const [links, setLinks] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [editingLink, setEditingLink] = useState(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [uploadingIcon, setUploadingIcon] = useState(false);
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const iconFileInputRef = useRef(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        if (externalLinks) {
            const next = externalLinks.map(l => ({ ...l }));
            setLinks(next);
            lastSavedRef.current = JSON.stringify(next);
        }
    }, [externalLinks]);

    useEffect(() => {
        const current = JSON.stringify(links);
        if (lastSavedRef.current === null || current === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            const success = await saveExternalLinks(links);
            setIsSaving(false);
            if (success) lastSavedRef.current = current;
            else toast.error(error || 'שגיאה בשמירה. אנא נסה שוב.');
        }, 1200);
        return () => clearTimeout(t);
    }, [links]);

    const handleIconFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !editingLink) return;
        setUploadingIcon(true);
        try {
            const url = await uploadImage(file, 'ExternalLinks');
            setEditingLink(prev => ({ ...prev, iconUrl: url, icon: '' }));
        } catch (err) {
            console.error('שגיאה בהעלאת יוצג:', err);
            toast.error(`שגיאה בהעלאת תמונה: ${err.message}`);
        } finally {
            setUploadingIcon(false);
            if (iconFileInputRef.current) iconFileInputRef.current.value = '';
        }
    };

    const addLink = () => {
        setEditingLink({
            id: generateId(),
            title: '',
            url: '',
            iconUrl: '',
            icon: '',
            visualType: 'icon',
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
            icon: editingLink.visualType === 'icon' ? (editingLink.icon || '') : '',
            iconUrl: editingLink.visualType === 'image' ? (editingLink.iconUrl || '') : '',
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
        setConfirmDeleteId(id);
    };

    const confirmRemoveLink = () => {
        if (confirmDeleteId) {
            setLinks(prev => prev.filter(l => l.id !== confirmDeleteId));
            setConfirmDeleteId(null);
        }
    };

    const startEdit = (link) => {
        setEditingLink({
            ...link,
            visualType: link.iconUrl && !link.icon ? 'image' : 'icon',
            isNew: false
        });
    };

    if (loading && !externalLinks) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען קישורים חיצוניים...</div>;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">
            {/* מודל אישור מחיקת קישור */}
            {confirmDeleteId && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)}>
                    <div className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/10 rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <p className="text-gray-900 dark:text-white font-bold text-lg mb-4">האם למחוק קישור זה?</p>
                        <div className="flex gap-3 justify-end">
                            <button type="button" onClick={() => setConfirmDeleteId(null)} className="px-4 py-2.5 rounded-xl border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition font-medium">ביטול</button>
                            <button type="button" onClick={confirmRemoveLink} className="px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-medium transition">מחוק</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-6 mb-8 pb-6 border-b border-gray-200 dark:border-white/10">
                <div className="flex items-start gap-4">
                    <div className="bg-primary-500/10 p-3 rounded-xl border border-primary-500/20 shrink-0">
                        <ExternalLink size={24} className="text-primary-500" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">ניהול קישורים חיצוניים</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ניהול הקישורים המוצגים בפוטר — מערכות צה"ל, אתרים חיצוניים ועוד</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <AdminPageHelpButton pageId="external-links" />
                    <button
                        onClick={addLink}
                        className="flex items-center gap-2 bg-white dark:bg-white/5 hover:bg-gray-50 dark:hover:bg-white/10 border-2 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white px-5 py-2.5 rounded-xl font-bold transition text-sm"
                    >
                        <Plus size={18} />
                        <span>הוסף קישור</span>
                    </button>
                    {isSaving && <span className="text-sm text-gray-500 dark:text-gray-400">שומר...</span>}
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-primary-50 dark:bg-primary-900/50 border border-primary-300 dark:border-primary-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-primary-400 shrink-0" />
                    <span className="text-primary-700 dark:text-primary-200">{error}</span>
                </div>
            )}

            {links.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl">
                    <ExternalLink size={48} className="text-gray-700 mb-4" />
                    <h2 className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-2">אין קישורים חיצוניים</h2>
                    <p className="text-gray-400 dark:text-gray-600 text-sm mb-6">לחץ על "הוסף קישור" כדי להוסיף קישור חיצוני ראשון לפוטר.</p>
                    <button
                        onClick={addLink}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-primary-900/20"
                    >
                        <Plus size={18} />
                        <span>הוסף קישור ראשון</span>
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {links.map((link) => (
                        <div
                            key={link.id}
                            className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/10 rounded-2xl p-6 flex flex-col group hover:border-primary-500/30 hover:shadow-lg hover:shadow-primary-500/5 transition-all relative shadow-sm"
                        >
                            <div className="flex items-start gap-4 mb-4">
                                <div className="relative w-16 h-16 rounded-xl bg-gray-100 dark:bg-[#1e212b] border border-gray-200 dark:border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                                    {link.icon ? (
                                        <DynamicIcon name={link.icon} size={32} className="text-gray-500 dark:text-gray-400" />
                                    ) : link.iconUrl ? (
                                        <>
                                            <img
                                                src={resolveSiteImageUrl(link.iconUrl)}
                                                alt={link.title}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { e.target.style.display = 'none'; const fallback = e.target.nextElementSibling; if (fallback) fallback.style.display = 'flex'; }}
                                            />
                                            <span className="hidden absolute inset-0 items-center justify-center bg-gray-100 dark:bg-[#1e212b]">
                                                <ExternalLink size={24} className="text-gray-400 dark:text-gray-600" />
                                            </span>
                                        </>
                                    ) : null}
                                    {!link.icon && !link.iconUrl && (
                                        <ExternalLink size={24} className="text-gray-400 dark:text-gray-600" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-gray-900 dark:text-white text-base truncate mb-1">{link.title || '(ללא כותרת)'}</h3>
                                    <p className="text-xs text-blue-600/80 dark:text-blue-400/70 truncate dir-ltr text-left" dir="ltr">{link.url || '(ללא כתובת)'}</p>
                                </div>
                            </div>

                            {(link.iconUrl || link.icon) && (
                                <p className="text-[11px] text-gray-400 dark:text-gray-600 truncate mb-4 dir-ltr text-left" dir="ltr">
                                    {link.iconUrl ? <ImageIcon size={10} className="inline mr-1" /> : <Star size={10} className="inline mr-1" />}
                                    {link.iconUrl ? link.iconUrl : `Icon: ${link.icon}`}
                                </p>
                            )}

                            <div className="flex items-center gap-2 mt-auto pt-4 border-t border-gray-100 dark:border-white/5">
                                <button
                                    onClick={() => startEdit(link)}
                                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gray-100 dark:bg-white/5 hover:bg-primary-500 hover:text-white text-gray-700 dark:text-gray-300 rounded-xl transition text-sm font-bold"
                                >
                                    <Edit2 size={14} />
                                    <span>ערוך</span>
                                </button>
                                <button
                                    onClick={() => removeLink(link.id)}
                                    className="flex items-center justify-center gap-2 py-2.5 px-4 bg-primary-500/10 hover:bg-primary-500/25 text-primary-500 hover:text-primary-400 rounded-xl transition text-sm font-medium"
                                >
                                    <Trash2 size={14} />
                                    <span>מחק</span>
                                </button>
                            </div>
                        </div>
                    ))}

                    {/* Add card */}
                    {/* <button
                        onClick={addLink}
                        className="border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500 hover:text-primary-500 hover:border-primary-500/40 hover:bg-primary-500/5 dark:hover:bg-primary-500/10 transition-all min-h-[220px]"
                    >
                        <Plus size={32} />
                        <span className="font-bold text-sm">הוסף קישור חדש</span>
                    </button> */}
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
                                <HelpLabel
                                    as="span"
                                    className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="כותרת"
                                    helpDescription="השם שהמשתמשים יראו מתחת לאייקון או על גבי הקישור."
                                >
                                    <><Type size={14} className="text-gray-400 dark:text-gray-500" />כותרת</>
                                </HelpLabel>
                                <input
                                    name="title"
                                    type="text"
                                    defaultValue={editingLink.title}
                                    requiprimary
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-primary-500 transition text-sm"
                                    placeholder='לדוגמה: "פורטל מילואים"'
                                />
                            </div>

                            <div>
                                <HelpLabel
                                    as="span"
                                    className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="כתובת קישור"
                                    helpDescription="הכתובת שאליה המשתמש יגיע אחרי לחיצה. צריך להזין כתובת מלאה."
                                >
                                    <><LinkIcon size={14} className="text-gray-400 dark:text-gray-500" />כתובת URL</>
                                </HelpLabel>
                                <input
                                    name="url"
                                    type="text"
                                    defaultValue={editingLink.url}
                                    requiprimary
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-primary-500 transition text-sm font-mono dir-ltr text-left"
                                    placeholder="https://example.idf.il"
                                    dir="ltr"
                                />
                            </div>

                            <div>
                                <div className="mb-3 flex items-center gap-2">
                                    <span className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-300">
                                        <ImageIcon size={14} className="text-gray-400 dark:text-gray-500" />
                                        תצוגה חזותית <span className="text-gray-400 dark:text-gray-600 font-normal">(אופציונלי)</span>
                                    </span>
                                    <HelpTooltipButton
                                        title="תצוגה חזותית"
                                        description="כאן בוחרים איך הקישור ייראה לעין: בעזרת אייקון פשוט או תמונה מותאמת."
                                    />
                                </div>

                                {/* Visual Type Toggle */}
                                <div className="flex bg-gray-100 dark:bg-[#151821] p-1 rounded-lg mb-4 text-sm font-medium border border-gray-300 dark:border-gray-700/50">
                                    <button
                                        type="button"
                                        onClick={() => setEditingLink(prev => ({ ...prev, visualType: 'icon' }))}
                                        className={`flex-1 py-1.5 px-3 rounded-md transition flex justify-center items-center gap-2 ${editingLink.visualType === 'icon' ? 'bg-white dark:bg-[#232733] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        <Star size={14} /> אייקון
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingLink(prev => ({ ...prev, visualType: 'image' }))}
                                        className={`flex-1 py-1.5 px-3 rounded-md transition flex justify-center items-center gap-2 ${editingLink.visualType === 'image' ? 'bg-white dark:bg-[#232733] text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                    >
                                        <ImageIcon size={14} /> תמונה מותאמת
                                    </button>
                                </div>

                                {editingLink.visualType === 'icon' ? (
                                    <div className="flex bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white dark:bg-[#232733] rounded-lg border border-gray-200 dark:border-gray-700/50 flex flex-col items-center justify-center shrink-0">
                                                <DynamicIcon name={editingLink.icon || 'HelpCircle'} size={20} className="text-blue-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{editingLink.icon || 'לא נבחר אייקון'}</span>
                                                <span className="text-xs text-gray-500">אייקון מספריית Lucide</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setIconPickerOpen(true)}
                                            className="px-4 py-2 bg-gray-200 dark:bg-white/10 hover:bg-primary-500 text-gray-700 hover:text-white dark:text-gray-300 rounded-lg transition text-sm font-bold"
                                        >
                                            בחר
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <label
                                            className={`flex items-center justify-center gap-2 w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 border-dashed rounded-xl px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-primary-500/50 hover:text-gray-700 dark:hover:text-gray-300 transition cursor-pointer ${uploadingIcon ? 'opacity-50 pointer-events-none' : ''}`}
                                        >
                                            {uploadingIcon ? (
                                                <>
                                                    <Loader2 size={16} className="animate-spin text-primary-400" />
                                                    <span>מעלה תמונה...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={16} />
                                                    <span>{editingLink.iconUrl ? 'החלף תמונה' : 'העלה תמונה'}</span>
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
                                                <div className="w-14 h-14 rounded-xl bg-white dark:bg-[#232733] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center">
                                                    <img
                                                        src={resolveSiteImageUrl(editingLink.iconUrl)}
                                                        alt="תצוגה מקדימה"
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs text-gray-400 dark:text-gray-600">תצוגה מקדימה</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingLink(prev => ({ ...prev, iconUrl: '' }))}
                                                        className="text-xs text-primary-400 hover:text-primary-300 transition text-right"
                                                    >
                                                        הסר תמונה
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/80">
                                <button
                                    type="submit"
                                    disabled={uploadingIcon}
                                    className="flex-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-bold transition"
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

            <IconPickerModal
                isOpen={iconPickerOpen}
                onClose={() => setIconPickerOpen(false)}
                currentIcon={editingLink?.icon || ''}
                onSelect={(iconName) => {
                    setEditingLink(prev => ({ ...prev, icon: iconName, iconUrl: '' }));
                }}
            />
        </div>
    );
}
