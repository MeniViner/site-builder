import React, { useState, useEffect } from 'react';
import { useSiteContent } from '../context/SiteContentContext';
import {
    Save, AlertTriangle, Plus, Trash2, Edit2, X,
    Image as ImageIcon, Type, MessageSquare, ChevronDown, ChevronUp, GripVertical
} from 'lucide-react';

const MAX_COMMANDER_MESSAGES = 3;

export default function AdminSiteContent() {
    const { siteContent, loading, error, saveSiteContent } = useSiteContent();
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    const [hero, setHero] = useState({ title: '', subtitle: '', description: '', backgroundImages: [] });
    const [commander, setCommander] = useState({ image: '', sectionTitle: '', roleLabel: '', messages: [] });
    const [editingMessage, setEditingMessage] = useState(null);

    useEffect(() => {
        if (siteContent) {
            setHero({ ...siteContent.hero });
            setCommander(JSON.parse(JSON.stringify(siteContent.commander)));
        }
    }, [siteContent]);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        const success = await saveSiteContent({ hero, commander });
        setIsSaving(false);
        if (success) {
            setSaveMessage({ type: 'success', text: 'התוכן נשמר בהצלחה!' });
        } else {
            setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
        }
        setTimeout(() => setSaveMessage(null), 4000);
    };

    const updateHeroField = (field, value) => {
        setHero(prev => ({ ...prev, [field]: value }));
    };

    const updateBackgroundImage = (index, value) => {
        setHero(prev => {
            const imgs = [...prev.backgroundImages];
            imgs[index] = value;
            return { ...prev, backgroundImages: imgs };
        });
    };

    const addBackgroundImage = () => {
        setHero(prev => ({ ...prev, backgroundImages: [...prev.backgroundImages, ''] }));
    };

    const removeBackgroundImage = (index) => {
        setHero(prev => ({
            ...prev,
            backgroundImages: prev.backgroundImages.filter((_, i) => i !== index)
        }));
    };

    const addMessage = () => {
        if (commander.messages.length >= MAX_COMMANDER_MESSAGES) return;
        const newMsg = {
            id: Date.now().toString(),
            text: '',
            signature: ''
        };
        setEditingMessage({ ...newMsg, isNew: true });
    };

    const saveMessageEdit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const updated = {
            id: editingMessage.id || Date.now().toString(),
            text: formData.get('text'),
            signature: formData.get('signature'),
        };

        if (editingMessage.isNew) {
            setCommander(prev => ({
                ...prev,
                messages: [...prev.messages, updated]
            }));
        } else {
            setCommander(prev => ({
                ...prev,
                messages: prev.messages.map(m => m.id === updated.id ? updated : m)
            }));
        }
        setEditingMessage(null);
    };

    const removeMessage = (id) => {
        if (!window.confirm('האם למחוק הודעה זו?')) return;
        setCommander(prev => ({
            ...prev,
            messages: prev.messages.filter(m => m.id !== id)
        }));
    };

    const moveMessage = (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= commander.messages.length) return;
        setCommander(prev => {
            const msgs = [...prev.messages];
            [msgs[index], msgs[targetIndex]] = [msgs[targetIndex], msgs[index]];
            return { ...prev, messages: msgs };
        });
    };

    if (loading && !siteContent) {
        return <div className="p-8 text-center text-gray-400">טוען תוכן אתר...</div>;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-[#1e212b] text-white font-heebo p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                <h1 className="text-3xl font-black text-white">ניהול המידע</h1>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition shadow-lg shadow-red-900/20"
                >
                    <Save size={18} />
                    <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                </button>
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

            {/* ==================== HERO SECTION ==================== */}
            <section className="bg-[#232733] border border-white/5 rounded-xl p-6 mb-8">
                <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                    <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                        <Type size={20} className="text-red-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">אזור Hero ראשי</h2>
                        <p className="text-sm text-gray-500">כותרת, תיאור ותמונות רקע של העמוד הראשי</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="space-y-5">
                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">תת-כותרת עליונה</label>
                            <input
                                type="text"
                                value={hero.subtitle}
                                onChange={(e) => updateHeroField('subtitle', e.target.value)}
                                className="w-full bg-[#1e212b] border border-gray-700/50 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition font-medium"
                                placeholder='לדוגמה: "ברוכים הבאים"'
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">כותרת ראשית</label>
                            <textarea
                                value={hero.title}
                                onChange={(e) => updateHeroField('title', e.target.value)}
                                rows={2}
                                className="w-full bg-[#1e212b] border border-gray-700/50 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition font-medium resize-none"
                                placeholder='לדוגמה: "בית הספר לחמ"ם\n7134"'
                            />
                            <p className="text-xs text-gray-600 mt-1">השתמש ב-\n לשבירת שורה</p>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-gray-300 mb-2">תיאור</label>
                            <textarea
                                value={hero.description}
                                onChange={(e) => updateHeroField('description', e.target.value)}
                                rows={4}
                                className="w-full bg-[#1e212b] border border-gray-700/50 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition text-sm resize-none"
                                placeholder="תיאור קצר שמופיע מתחת לכותרת..."
                            />
                        </div>
                    </div>

                    {/* Background Images */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-bold text-gray-300 flex items-center gap-2">
                                <ImageIcon size={16} className="text-gray-500" />
                                תמונות רקע מתחלפות
                            </label>
                            <button
                                onClick={addBackgroundImage}
                                className="flex items-center gap-1 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 px-3 py-1.5 rounded-lg transition font-medium"
                            >
                                <Plus size={14} />
                                <span>הוסף תמונה</span>
                            </button>
                        </div>
                        <div className="space-y-2 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                            {hero.backgroundImages.map((img, idx) => (
                                <div key={idx} className="flex items-center gap-2 group">
                                    <span className="text-xs text-gray-600 w-6 text-center shrink-0">{idx + 1}</span>
                                    <input
                                        type="text"
                                        value={img}
                                        onChange={(e) => updateBackgroundImage(idx, e.target.value)}
                                        className="flex-1 bg-[#1e212b] border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-blue-300 outline-none focus:border-red-500 transition dir-ltr text-left"
                                        placeholder="/images/background.jpg"
                                        dir="ltr"
                                    />
                                    <button
                                        onClick={() => removeBackgroundImage(idx)}
                                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                                        title="הסר"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                            {hero.backgroundImages.length === 0 && (
                                <div className="text-center py-8 text-gray-600 text-sm">
                                    אין תמונות רקע. לחץ על "הוסף תמונה" להוספה.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* ==================== COMMANDER SECTION ==================== */}
            <section className="bg-[#232733] border border-white/5 rounded-xl p-6 mb-8">
                <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                    <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                        <MessageSquare size={20} className="text-red-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">דבר המפקד</h2>
                        <p className="text-sm text-gray-500">תמונת מפקד, כותרת האזור, והודעות מתחלפות (עד {MAX_COMMANDER_MESSAGES})</p>
                    </div>
                </div>

                {/* Commander Meta */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">כותרת אזור</label>
                        <input
                            type="text"
                            value={commander.sectionTitle}
                            onChange={(e) => setCommander(prev => ({ ...prev, sectionTitle: e.target.value }))}
                            className="w-full bg-[#1e212b] border border-gray-700/50 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition font-medium"
                            placeholder='דבר המפקד'
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">תפקיד</label>
                        <input
                            type="text"
                            value={commander.roleLabel}
                            onChange={(e) => setCommander(prev => ({ ...prev, roleLabel: e.target.value }))}
                            className="w-full bg-[#1e212b] border border-gray-700/50 rounded-lg px-4 py-3 text-white outline-none focus:border-red-500 transition font-medium"
                            placeholder='מפקד היחידה'
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-300 mb-2">נתיב תמונת מפקד</label>
                        <input
                            type="text"
                            value={commander.image}
                            onChange={(e) => setCommander(prev => ({ ...prev, image: e.target.value }))}
                            className="w-full bg-[#1e212b] border border-gray-700/50 rounded-lg px-3 py-3 text-sm text-blue-300 outline-none focus:border-red-500 transition dir-ltr text-left"
                            placeholder="/images/commander.png"
                            dir="ltr"
                        />
                    </div>
                </div>

                {/* Commander Image Preview */}
                {commander.image && (
                    <div className="mb-6 flex items-center gap-4">
                        <div className="w-24 h-24 rounded-xl bg-[#1e212b] border border-gray-700/50 overflow-hidden flex items-center justify-center">
                            <img
                                src={commander.image}
                                alt="תצוגה מקדימה"
                                className="w-full h-full object-contain"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        </div>
                        <div className="text-sm text-gray-500">תצוגה מקדימה של תמונת המפקד</div>
                    </div>
                )}

                {/* Messages List */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-200">
                        הודעות מפקד
                        <span className="text-sm font-normal text-gray-500 mr-2">
                            ({commander.messages.length}/{MAX_COMMANDER_MESSAGES})
                        </span>
                    </h3>
                    <button
                        onClick={addMessage}
                        disabled={commander.messages.length >= MAX_COMMANDER_MESSAGES}
                        className="flex items-center gap-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition font-bold"
                    >
                        <Plus size={16} />
                        <span>הוסף הודעה</span>
                    </button>
                </div>

                {commander.messages.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-xl text-gray-600">
                        <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-base font-medium">אין הודעות מפקד. לחץ על "הוסף הודעה" ליצירת הודעה ראשונה.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {commander.messages.map((msg, idx) => (
                            <div key={msg.id} className="bg-[#1e212b] border border-gray-700/30 rounded-xl p-5 flex gap-4 group relative">
                                {/* Reorder controls */}
                                <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                                    <span className="text-xs text-gray-600 font-bold mb-1">{idx + 1}</span>
                                    <button
                                        onClick={() => moveMessage(idx, -1)}
                                        disabled={idx === 0}
                                        className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition rounded"
                                        title="הזז למעלה"
                                    >
                                        <ChevronUp size={14} />
                                    </button>
                                    <button
                                        onClick={() => moveMessage(idx, 1)}
                                        disabled={idx === commander.messages.length - 1}
                                        className="p-1 text-gray-600 hover:text-white disabled:opacity-20 transition rounded"
                                        title="הזז למטה"
                                    >
                                        <ChevronDown size={14} />
                                    </button>
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-gray-300 text-sm leading-relaxed line-clamp-3 mb-2">{msg.text || '(הודעה ריקה)'}</p>
                                    <p className="text-gray-500 text-xs">{msg.signature || '(ללא חתימה)'}</p>
                                </div>

                                {/* Actions */}
                                <div className="flex items-start gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => setEditingMessage({ ...msg, isNew: false })}
                                        className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white rounded-lg transition"
                                        title="ערוך"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                    <button
                                        onClick={() => removeMessage(msg.id)}
                                        className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-lg transition"
                                        title="מחק"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {commander.messages.length === 1 && (
                    <p className="mt-3 text-xs text-gray-600 bg-yellow-900/20 border border-yellow-500/20 rounded-lg px-4 py-2">
                        כאשר קיימת רק הודעה אחת, כפתורי הניווט (חצים) יוסתרו אוטומטית בחזית האתר ויוחלפו באלמנט עיצובי.
                    </p>
                )}
            </section>

            {/* Message Edit Modal */}
            {editingMessage && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#1e212b] border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-800/80">
                            <h2 className="text-xl font-bold text-white">
                                {editingMessage.isNew ? 'הוסף הודעת מפקד' : 'עריכת הודעה'}
                            </h2>
                            <button onClick={() => setEditingMessage(null)} className="text-gray-400 hover:text-white transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={saveMessageEdit} className="p-6 flex flex-col gap-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-2">תוכן ההודעה</label>
                                <textarea
                                    name="text"
                                    defaultValue={editingMessage.text}
                                    required
                                    rows={5}
                                    className="w-full bg-[#151821] border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 transition text-sm resize-none leading-relaxed"
                                    placeholder="הזן את תוכן הודעת המפקד..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-300 mb-2">חתימה</label>
                                <input
                                    name="signature"
                                    type="text"
                                    defaultValue={editingMessage.signature}
                                    className="w-full bg-[#151821] border border-gray-700/50 rounded-xl px-4 py-3 text-white outline-none focus:border-red-500 transition text-sm"
                                    placeholder='לדוגמה: סא"ל א׳, מפקד בית הספר'
                                />
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-800/80">
                                <button type="submit" className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold transition">
                                    שמור
                                </button>
                                <button type="button" onClick={() => setEditingMessage(null)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-xl font-bold transition">
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
