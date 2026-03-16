import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useEvents } from '../context/EventsContext';
import { Undo2, Plus, Trash2, Edit2, AlertTriangle, Calendar, X } from 'lucide-react';

const STATUS_OPTIONS = [
    { value: 'gray', label: 'אפור (כלל משתמשי חרום)', colorClass: 'bg-gray-500', textClass: 'text-gray-200' },
    { value: 'red', label: 'אדום (דחוף / חשוב)', colorClass: 'bg-red-500', textClass: 'text-white' },
    // { value: 'green', label: 'ירוק (פנוי / מאושר)', colorClass: 'bg-green-500', textClass: 'text-white' }
];

export default function AdminEvents({ onClose, inHub = false }) {
    const { events: initialEvents, displayCount: initialDisplayCount, loading, error, saveEvents } = useEvents();
    const [events, setEvents] = useState(initialEvents || []);
    const [displayCount, setDisplayCount] = useState(initialDisplayCount || 3);
    const [isSaving, setIsSaving] = useState(false);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        if (initialEvents && initialDisplayCount !== undefined) {
            setEvents(initialEvents);
            setDisplayCount(initialDisplayCount);
            lastSavedRef.current = JSON.stringify({ events: initialEvents, displayCount: initialDisplayCount });
        }
    }, [initialEvents, initialDisplayCount]);

    useEffect(() => {
        const current = JSON.stringify({ events, displayCount });
        if (lastSavedRef.current === null || current === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            const success = await saveEvents(events, displayCount);
            setIsSaving(false);
            if (success) lastSavedRef.current = current;
            else toast.error('שגיאה בעדכון התצוגה. אנא נסה שוב.');
        }, 1200);
        return () => clearTimeout(t);
    }, [events, displayCount]);

    const [editingEvent, setEditingEvent] = useState(null);

    const handleRemove = (id) => {
        if (window.confirm('האם אתה בטוח שברצונך למחוק אירוע זה?')) {
            setEvents(events.filter(e => e.id !== id));
        }
    };

    const handleSaveEvent = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        const newEvent = {
            id: editingEvent.id || Date.now().toString(),
            date: formData.get('date'),
            title: formData.get('title'),
            subtitle: formData.get('subtitle'),
            color: formData.get('color')
        };

        if (editingEvent.isNew) {
            setEvents([...events, newEvent]);
        } else {
            setEvents(events.map(ev => ev.id === newEvent.id ? newEvent : ev));
        }

        setEditingEvent(null);
    };

    if (loading && !events.length) {
        return <div className="p-8 text-center text-gray-900 dark:text-white">טוען נתונים...</div>;
    }

    return (
        <div dir="rtl" className={`min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo ${inHub ? 'p-8' : 'p-8 max-w-7xl mx-auto'}`}>
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <h1 className="text-3xl font-black text-gray-900 dark:text-white">ניהול אירועי החודש</h1>
                {!inHub && (
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 bg-[#4263eb] hover:bg-[#3b5bdb] text-white px-4 py-2 rounded-md transition"
                    >
                        <span>חזרה לאתר</span>
                        <Undo2 size={18} />
                    </button>
                )}
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/50 border border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-red-400" />
                    <span className="text-red-700 dark:text-red-200">{error}</span>
                </div>
            )}

            {/* Top Control Bar */}
            <div className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 rounded-xl p-6 mb-8 mt-2 flex flex-col md:flex-row items-end md:items-center justify-between gap-6 relative">
                <div className="flex items-center gap-6 w-full md:w-auto">

                    <div className="flex items-center gap-6 text-sm font-bold text-gray-700 dark:text-gray-300 mr-auto md:mr-0">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <span className="font-medium">כמות להצגה</span>
                            <div className="relative">
                                <select
                                    className="appearance-none bg-gray-100 dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 rounded-lg px-4 py-2 pr-4 pl-8 text-gray-900 dark:text-white outline-none focus:border-[#4263eb] font-medium min-w-[100px]"
                                    value={displayCount}
                                    onChange={(e) => setDisplayCount(Number(e.target.value))}
                                >
                                    {[2, 3, 4, 5].map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 dark:text-gray-400">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                </div>
                            </div>
                        </label>
                    </div>

                    {isSaving && <span className="text-sm text-gray-500 dark:text-gray-400">שומר...</span>}
                </div>

                <div className="absolute top-1 right-6 text-sm font-bold text-gray-900 dark:text-white tracking-wide">
                    הגדרות תצוגה
                </div>

                {/* <div className="flex items-center gap-6 w-full md:w-auto mt-2 md:mt-0">
                    <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-300">
                        <span>הצג הכל</span>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={showAll} onChange={() => setShowAll(!showAll)} />
                            <div className={`w-10 h-5 rounded-full transition-colors ${showAll ? 'bg-[#4263eb]' : 'bg-gray-600'}`}></div>
                            <div className={`absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform ${showAll ? 'translate-x-[-20px]' : ''}`}></div>
                        </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-300">
                        <span>כח צפייה</span>
                        <div className="relative">
                            <input type="checkbox" className="sr-only" checked={viewPower} onChange={() => setViewPower(!viewPower)} />
                            <div className={`w-10 h-5 rounded-full transition-colors ${viewPower ? 'bg-[#4263eb]' : 'bg-gray-600'}`}></div>
                            <div className={`absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform ${viewPower ? 'translate-x-[-20px]' : ''}`}></div>
                        </div>
                    </label>
                </div> */}
            </div>

            {/* Grid of Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 pb-8">
                {events.map((event) => {
                    const statusOpt = STATUS_OPTIONS.find(s => s.value === event.color) || STATUS_OPTIONS[0];
                    return (
                        <div key={event.id} className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 rounded-xl flex flex-col relative overflow-hidden group">
                            <div className="p-5 flex-1 flex flex-col items-center justify-center min-h-[160px] text-center">
                                <div className="absolute top-4 left-4 flex items-center gap-1.5 text-gray-500 dark:text-gray-400 text-sm">
                                    <span>תאריך אירוע</span>
                                    <Calendar size={14} />
                                </div>

                                {event.date && (
                                    <div className="absolute top-9 left-4 text-xs font-bold text-gray-400 dark:text-gray-500">
                                        {event.date}
                                    </div>
                                )}

                                <h3 className="text-2xl font-black text-gray-900 dark:text-white mt-8 mb-1 px-4">{event.title || 'ללא כותרת'}</h3>
                                <p className="text-gray-500 dark:text-gray-400 text-[15px] mb-4">{event.subtitle || 'תיאור קצר'}</p>

                                <div className="flex flex-col items-center gap-1 mt-auto">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tracking-wider">סטטוס</span>
                                    <div className={`px-4 py-1.5 rounded-full text-xs font-bold ${statusOpt.colorClass} ${statusOpt.textClass}`}>
                                        {statusOpt.label}
                                    </div>
                                </div>
                            </div>

                            <div className="flex border-t border-gray-200 dark:border-white/5 bg-gray-100/50 dark:bg-[#1e212b]/50">
                                <button
                                    onClick={() => handleRemove(event.id)}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 text-gray-500 dark:text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition"
                                >
                                    <span>מחיקה</span>
                                    <Trash2 size={16} />
                                </button>
                                <div className="w-px bg-gray-100 dark:bg-white/5"></div>
                                <button
                                    onClick={() => setEditingEvent({ ...event, isNew: false })}
                                    className="flex-1 flex items-center justify-center gap-2 py-3 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition"
                                >
                                    <span>עריכה</span>
                                    <Edit2 size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Add New Card Button */}
                <button
                    onClick={() => setEditingEvent({ date: new Date().toISOString().split('T')[0], title: '', subtitle: '', color: 'gray', isNew: true })}
                    className="bg-white/50 dark:bg-[#232733]/50 border-2 border-dashed border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/30 hover:bg-white dark:hover:bg-[#232733] transition rounded-xl flex flex-col items-center justify-center min-h-[220px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white group"
                >
                    <div className="bg-gray-100 dark:bg-white/5 p-4 rounded-full mb-3 group-hover:scale-110 transition-transform">
                        <Plus size={24} />
                    </div>
                    <span className="font-bold">הוסף אירוע חדש</span>
                </button>
            </div>

            {/* Modal */}
            {editingEvent && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 dark:bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-gray-100 dark:bg-[#1e212b] border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800/80">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{editingEvent.isNew ? 'הוסף אירוע חדש' : 'עריכת אירוע'}</h2>
                            <button onClick={() => setEditingEvent(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEvent} className="p-6 flex flex-col gap-5">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">תאריך אירוע</label>
                                <input
                                    name="date"
                                    type="date"
                                    defaultValue={editingEvent.date}
                                    required
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-[#4263eb] transition font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">כותרת ראשית</label>
                                <input
                                    name="title"
                                    type="text"
                                    defaultValue={editingEvent.title}
                                    required
                                    placeholder="הזן שם מופע..."
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-[#4263eb] transition font-medium"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">תת-כותרת (תיאור קצר)</label>
                                <input
                                    name="subtitle"
                                    type="text"
                                    defaultValue={editingEvent.subtitle}
                                    placeholder="פרטים נוספים למשל: שעות או קהל יעד..."
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-[#4263eb] transition text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">סטטוס מופע / צבע</label>
                                <select
                                    name="color"
                                    defaultValue={editingEvent.color || 'gray'}
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-[#4263eb] transition text-sm"
                                >
                                    {STATUS_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/80">
                                <button type="submit" className="flex-1 bg-[#4263eb] hover:bg-[#3b5bdb] text-white py-3 rounded-xl font-bold transition">
                                    {editingEvent.isNew ? 'הוסף' : 'עדכן'}
                                </button>
                                <button type="button" onClick={() => setEditingEvent(null)} className="flex-1 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition">
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
