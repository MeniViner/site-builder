import React, { useState } from 'react';
import { useEvents } from '../context/EventsContext';
import { Undo2, Plus, Trash2, Save, AlertTriangle } from 'lucide-react';

export default function AdminEvents({ onClose }) {
    const { events: initialEvents, displayCount: initialDisplayCount, loading, error, saveEvents } = useEvents();
    const [events, setEvents] = useState(initialEvents || []);
    const [displayCount, setDisplayCount] = useState(initialDisplayCount || 3);
    const [isSaving, setIsSaving] = useState(false);

    const handleAdd = () => {
        setEvents([
            ...events,
            { id: Date.now().toString(), date: new Date().toISOString().split('T')[0], title: '', subtitle: '', color: 'gray' }
        ]);
    };

    const handleRemove = (id) => {
        setEvents(events.filter(e => e.id !== id));
    };

    const handleChange = (id, field, value) => {
        setEvents(events.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const handleSave = async () => {
        setIsSaving(true);
        const success = await saveEvents(events, displayCount);
        setIsSaving(false);
        if (success) {
            alert('הנתונים נשמרו בהצלחה!');
            onClose();
        } else {
            alert('שגיאה בשמירת הנתונים. אנא נסה שוב.');
        }
    };

    if (loading && !events.length) {
        return <div className="p-8 text-center text-white">טוען נתונים...</div>;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-[#0c0d12] text-white font-heebo p-8">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-4">
                    <h1 className="text-3xl font-black text-white">ניהול מופעי החודש</h1>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition"
                    >
                        <span>חזרה לאתר</span>
                        <Undo2 size={18} />
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-center gap-3">
                        <AlertTriangle className="text-red-400" />
                        <span className="text-red-200">{error}</span>
                    </div>
                )}

                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 mb-8 flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white mb-1">הגדרות תצוגה</h2>
                        <p className="text-gray-400 text-sm">קבע כמה אירועים יוצגו בו-זמנית בחלון (השאר יתחלפו באנימציה).</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="text-sm font-bold text-gray-300">כמות צפייה:</label>
                        <input
                            type="number"
                            min="1"
                            max="10"
                            value={displayCount}
                            onChange={(e) => setDisplayCount(Number(e.target.value))}
                            className="bg-black/50 border border-gray-700 rounded-md px-4 py-2 text-white outline-none focus:border-red-500 w-24 text-center text-lg font-bold"
                        />
                    </div>
                </div>

                <div className="space-y-4 mb-8">
                    {events.map((event, index) => (
                        <div key={event.id} className="bg-gray-800/40 hover:bg-gray-800/60 transition border border-gray-700/50 rounded-xl p-4 flex flex-col gap-4 relative group">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="md:col-span-1">
                                    <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider font-bold">תאריך המופע</label>
                                    <input
                                        type="date"
                                        value={event.date || ''}
                                        onChange={(e) => handleChange(event.id, 'date', e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700/50 rounded-lg px-3 py-2 text-white outline-none focus:border-red-500/80 transition focus:bg-black/60"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider font-bold">כותרת ראשי</label>
                                    <input
                                        type="text"
                                        value={event.title}
                                        onChange={(e) => handleChange(event.id, 'title', e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700/50 rounded-lg px-3 py-2 text-white outline-none focus:border-red-500/80 transition focus:bg-black/60 font-bold"
                                        placeholder="הזן שם מופע פה..."
                                    />
                                </div>
                                <div className="md:col-span-1">
                                    <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider font-bold">צבע תצוגה</label>
                                    <select
                                        value={event.color}
                                        onChange={(e) => handleChange(event.id, 'color', e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700/50 rounded-lg px-3 py-2 text-white outline-none focus:border-red-500/80 transition focus:bg-black/60"
                                    >
                                        <option value="gray">אפור (שגרתי)</option>
                                        <option value="red">אדום (חריג/חשוב)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1 w-full">
                                    <label className="block text-[11px] text-gray-400 mb-1 uppercase tracking-wider font-bold">תת-כותרת (פירוט נוסף)</label>
                                    <input
                                        type="text"
                                        value={event.subtitle}
                                        onChange={(e) => handleChange(event.id, 'subtitle', e.target.value)}
                                        className="w-full bg-black/40 border border-gray-700/50 rounded-lg px-3 py-2 text-gray-300 outline-none focus:border-red-500/80 transition focus:bg-black/60 text-sm"
                                        placeholder="פרטים נוספים למשל: שעות או קהל יעד..."
                                    />
                                </div>
                                <button
                                    onClick={() => handleRemove(event.id)}
                                    className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/40 transition rounded-lg px-4 py-2 flex items-center justify-center h-[38px] w-full md:w-auto mt-2 md:mt-0"
                                    title="מחק מופע"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}

                    {events.length === 0 && (
                        <div className="text-center text-gray-500 py-8 border border-dashed border-gray-800 rounded-xl">
                            אין מופעים, לחץ על הוסף מופע למטה.
                        </div>
                    )}
                </div>

                <div className="flex justify-between items-center border-t border-gray-800 pt-6">
                    <button
                        onClick={handleAdd}
                        className="flex items-center gap-2 text-red-400 hover:text-red-300 transition"
                    >
                        <Plus size={20} />
                        <span className="font-medium">הוסף מופע</span>
                    </button>

                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-8 py-3 rounded-md font-bold transition shadow-[0_0_15px_rgba(220,38,38,0.3)]"
                    >
                        <Save size={20} />
                        <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
