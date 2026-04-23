import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useEvents } from '../context/EventsContext';
import { Undo2, Plus, Trash2, Edit2, AlertTriangle, Calendar, X, Settings2 } from 'lucide-react';
import { confirmToast } from '../utils/confirmToast';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';
import AdminAIActionCard from './AdminAIActionCard';

const STATUS_OPTIONS = [
    { value: 'gray', label: 'אפור (כלל משתמשי חרום)', colorClass: 'bg-gray-500', textClass: 'text-gray-200' },
    { value: 'red', label: 'אדום (דחוף / חשוב)', colorClass: 'bg-red-500', textClass: 'text-white' },
];
const VALID_EVENT_DISPLAY_MODES = new Set(['default', 'monthly', 'calendar']);
const VALID_EVENT_COLOR = new Set(['gray', 'red']);

function normalizeAiEventsPayload(payload) {
    const sourceEvents = Array.isArray(payload?.events) ? payload.events : [];
    const normalizedEvents = sourceEvents
        .map((item, index) => {
            const rawDate = String(item?.date || '').trim();
            const title = String(item?.title || '').trim();
            const subtitle = String(item?.subtitle || '').trim();
            const color = String(item?.color || 'gray').trim().toLowerCase();

            if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || !title) {
                return null;
            }

            return {
                id: String(item?.id || `ev_${Date.now()}_${index}`),
                date: rawDate,
                title,
                subtitle,
                color: VALID_EVENT_COLOR.has(color) ? color : 'gray',
            };
        })
        .filter(Boolean);

    if (!normalizedEvents.length) {
        throw new Error('לא התקבלו אירועים תקינים מה-AI');
    }

    const requestedDisplayMode = String(payload?.displayMode || 'default').trim().toLowerCase();
    const displayMode = VALID_EVENT_DISPLAY_MODES.has(requestedDisplayMode)
        ? requestedDisplayMode
        : 'default';
    const requestedDisplayCount = Number(payload?.displayCount);
    const displayCount = Number.isFinite(requestedDisplayCount)
        ? Math.max(1, Math.min(normalizedEvents.length, Math.round(requestedDisplayCount)))
        : Math.min(3, normalizedEvents.length);

    let intervalMs = 6000;
    if (Number.isFinite(Number(payload?.intervalMs))) {
        intervalMs = Math.max(2000, Math.round(Number(payload.intervalMs)));
    } else if (Number.isFinite(Number(payload?.intervalSeconds))) {
        intervalMs = Math.max(2000, Math.round(Number(payload.intervalSeconds) * 1000));
    }

    return {
        events: normalizedEvents,
        displayCount,
        displayMode,
        intervalMs,
    };
}

export default function AdminEvents({ onClose, inHub = false }) {
    const {
        events: initialEvents,
        displayCount: initialDisplayCount,
        displayMode: initialDisplayMode,
        intervalMs: initialIntervalMs,
        loading,
        error,
        saveEvents,
    } = useEvents();
    const [events, setEvents] = useState(initialEvents || []);
    const [displayCount, setDisplayCount] = useState(initialDisplayCount || 3);
    const [displayMode, setDisplayMode] = useState(initialDisplayMode || 'default');
    const [intervalMs, setIntervalMs] = useState(Math.max(2000, Number(initialIntervalMs) || 6000));
    const [isSaving, setIsSaving] = useState(false);
    const lastSavedRef = useRef(null);
    const [editingEvent, setEditingEvent] = useState(null);
    const maxDisplayCount = Math.max(1, events.length || 1);
    const plannedThisMonth = (() => {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        return events.filter((eventItem) => {
            const rawDate = String(eventItem?.date || '');
            const [yearPart, monthPart] = rawDate.split('-');
            const eventYear = Number(yearPart);
            const eventMonth = Number(monthPart);
            if (!Number.isFinite(eventYear) || !Number.isFinite(eventMonth)) return false;
            return eventYear === year && eventMonth === month;
        }).length;
    })();

    useEffect(() => {
        if (initialEvents && initialDisplayCount !== undefined) {
            setEvents(initialEvents);
            setDisplayCount(initialDisplayCount);
            setDisplayMode(initialDisplayMode || 'default');
            setIntervalMs(Math.max(2000, Number(initialIntervalMs) || 6000));
            lastSavedRef.current = JSON.stringify({
                events: initialEvents,
                displayCount: initialDisplayCount,
                displayMode: initialDisplayMode || 'default',
                intervalMs: Math.max(2000, Number(initialIntervalMs) || 6000),
            });
        }
    }, [initialEvents, initialDisplayCount, initialDisplayMode, initialIntervalMs]);

    useEffect(() => {
        const current = JSON.stringify({ events, displayCount, displayMode, intervalMs });
        if (lastSavedRef.current === null || current === lastSavedRef.current) return;

        const t = setTimeout(async () => {
            setIsSaving(true);
            const success = await saveEvents(events, displayCount, displayMode, intervalMs);
            setIsSaving(false);
            if (success) lastSavedRef.current = current;
            else toast.error('שגיאה בעדכון התצוגה. אנא נסה שוב.');
        }, 1200);

        return () => clearTimeout(t);
    }, [events, displayCount, displayMode, intervalMs, saveEvents]);

    useEffect(() => {
        setDisplayCount((prev) => Math.min(maxDisplayCount, Math.max(1, prev)));
    }, [maxDisplayCount]);

    const handleRemove = (id) => {
        confirmToast({
            title: 'מחיקת אירוע',
            message: 'האם אתה בטוח שברצונך למחוק אירוע זה?',
            confirmText: 'מחק',
            cancelText: 'ביטול',
            type: 'warning',
        }).then((confirmed) => {
            if (!confirmed) return;
            setEvents((prev) => prev.filter((event) => event.id !== id));
        });
    };

    const handleSaveEvent = (event) => {
        event.preventDefault();
        const formData = new FormData(event.target);

        const nextEvent = {
            id: editingEvent.id || Date.now().toString(),
            date: formData.get('date'),
            title: formData.get('title'),
            subtitle: formData.get('subtitle'),
            color: formData.get('color'),
        };

        if (editingEvent.isNew) {
            setEvents((prev) => [...prev, nextEvent]);
        } else {
            setEvents((prev) => prev.map((current) => (current.id === nextEvent.id ? nextEvent : current)));
        }

        setEditingEvent(null);
    };

    const buildEventsAiPrompt = (instruction) => {
        const today = new Date().toISOString().slice(0, 10);
        const currentSnapshot = {
            displayCount,
            displayMode,
            intervalMs,
            events: events.slice(0, 12),
        };

        return [
            'אתה עורך תוכן אירועים לפורטל ארגוני.',
            'החזר JSON בלבד ללא טקסט נוסף.',
            'סכימה נדרשת:',
            '{',
            '  "events": [',
            '    { "date": "YYYY-MM-DD", "title": "string", "subtitle": "string", "color": "gray|red" }',
            '  ],',
            '  "displayCount": 1-10,',
            '  "displayMode": "default|monthly|calendar",',
            '  "intervalSeconds": number',
            '}',
            'חוקים:',
            '- לפחות 3 אירועים.',
            '- כל title קצר וברור.',
            '- תאריכים חייבים להיות תקינים.',
            `תאריך היום: ${today}`,
            `נתונים קיימים: ${JSON.stringify(currentSnapshot)}`,
            `בקשת המשתמש: ${instruction}`,
        ].join('\n');
    };

    const applyAiEvents = (parsed) => {
        const normalized = normalizeAiEventsPayload(parsed);
        setEvents(normalized.events);
        setDisplayCount(normalized.displayCount);
        setDisplayMode(normalized.displayMode);
        setIntervalMs(normalized.intervalMs);
        setEditingEvent(null);
        toast.success('הצעת AI הוחלה על אירועי החודש');
    };

    if (loading && !events.length) {
        return <div className="p-8 text-center text-theme">טוען נתונים...</div>;
    }

    return (
        <div dir="rtl" className={`min-h-screen text-theme font-heebo ${inHub ? 'p-6' : 'p-8 max-w-7xl mx-auto'}`}>
            <div className="space-y-6">
                <div className="border-b border-theme-subtle pb-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-black text-theme flex items-center gap-2">
                                <Calendar className="text-blue-500" />
                                ניהול אירועי החודש
                            </h1>
                            <p className="text-theme-muted">ניהול אירועים פעילים, כמות פריטים בתצוגה וסוג תצוגת הווידגט.</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <AdminPageHelpButton pageId="events" />
                            <AdminAIActionCard
                                compact
                                compactLabel="AI"
                                title="עוזר AI לאירועים"
                                description="ייצור רשימת אירועים + הגדרות תצוגה לפי בקשה חופשית, ואז Apply ישירות למסך."
                                inputLabel="מה לייצר?"
                                inputPlaceholder='דוגמה: "צור 6 אירועים לחודש הקרוב עם דגש על הכשרות ורווחה, ושמור על ניסוח קצר"'
                                defaultInput="צור סדרת אירועים חודשית מקצועית וברורה"
                                buildPrompt={buildEventsAiPrompt}
                                onApply={applyAiEvents}
                                applyButtonLabel="החל על אירועים"
                                generateButtonLabel="ייצר אירועים"
                            />
                            <button
                                onClick={() => setEditingEvent({ date: new Date().toISOString().split('T')[0], title: '', subtitle: '', color: 'gray', isNew: true })}
                                className="h-10 inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg text-sm font-bold transition"
                            >
                                <span className="inline-flex items-center gap-2">
                                    <Plus size={16} />
                                    הוסף אירוע
                                </span>
                            </button>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500/40 rounded-lg flex items-center gap-3 text-red-500">
                        <AlertTriangle className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-theme-card px-4 py-2.5 rounded-lg border border-theme-subtle">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-theme-muted">{plannedThisMonth} אירועים מתוכננים החודש</span>
                        <span className="text-sm text-theme-muted">{isSaving ? 'שומר...' : 'מוכן לעריכה'}</span>
                    </div>

                    {!inHub && (
                        <button
                            onClick={onClose}
                            className="flex items-center gap-2 bg-theme-elevated hover:bg-theme-card-hover text-theme px-3 py-1.5 rounded-lg border border-theme-subtle transition"
                        >
                            <span>חזרה לאתר</span>
                            <Undo2 size={16} />
                        </button>
                    )}
                </div>

                {events.length === 0 ? (
                    <div className="py-20 text-center text-theme-muted border-2 border-dashed border-theme-subtle rounded-2xl bg-theme-card">
                        <Calendar size={40} className="mx-auto mb-3 opacity-40" />
                        <p className="font-medium">אין אירועים. לחץ "הוסף אירוע" כדי להתחיל.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {events.map((eventItem) => {
                            const statusOpt = STATUS_OPTIONS.find((status) => status.value === eventItem.color) || STATUS_OPTIONS[0];
                            return (
                                <div key={eventItem.id} className="bg-theme-card border border-theme-subtle rounded-xl flex flex-col relative overflow-hidden">
                                    <div className="p-5 flex-1 flex flex-col min-h-[190px] text-right">
                                        <div className="inline-flex items-center gap-1.5 text-theme-muted text-sm self-start">
                                            <span>תאריך אירוע</span>
                                            <Calendar size={14} />
                                        </div>

                                        {eventItem.date && (
                                            <div className="mt-1 text-sm font-bold text-theme-muted/90 self-start" dir="ltr">
                                                {eventItem.date}
                                            </div>
                                        )}

                                        <div className="mt-5 flex-1">
                                            <h3 className="text-4xl leading-tight font-black text-theme break-words">{eventItem.title || 'ללא כותרת'}</h3>
                                            <p className="text-theme-muted text-lg mt-2 break-words">{eventItem.subtitle || 'תיאור קצר'}</p>
                                        </div>

                                        <div className="flex flex-col items-center gap-1 mt-4">
                                            <span className="text-sm font-medium text-theme-muted">סטטוס</span>
                                            <div className={`px-4 py-1.5 rounded-full text-xs font-bold ${statusOpt.colorClass} ${statusOpt.textClass}`}>
                                                {statusOpt.label}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex border-t border-theme-subtle bg-theme-elevated/40">
                                        <button
                                            onClick={() => handleRemove(eventItem.id)}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 text-theme-muted hover:text-red-500 hover:bg-red-500/10 transition"
                                        >
                                            <span>מחיקה</span>
                                            <Trash2 size={16} />
                                        </button>
                                        <div className="w-px bg-theme-subtle"></div>
                                        <button
                                            onClick={() => setEditingEvent({ ...eventItem, isNew: false })}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 text-theme-muted hover:text-theme hover:bg-theme-card-hover transition"
                                        >
                                            <span>עריכה</span>
                                            <Edit2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 mt-6">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-bold text-theme flex items-center gap-2">
                                <Settings2 size={18} className="text-primary" />
                                הגדרות תצוגה לווידגט
                            </h3>
                            <HelpTooltipButton
                                title="הגדרות התצוגה"
                                description="כאן קובעים איך רשימת האירועים תופיע באתר."
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className="block">
                            <HelpLabel
                                as="span"
                                className="text-sm font-semibold text-theme"
                                wrapperClassName="flex items-center gap-2"
                                helpTitle="משך זמן לתצוגת עמוד"
                                helpDescription="כמה שניות כל מסך של אירועים יוצג לפני המעבר הבא."
                            >
                                משך זמן לתצוגת עמוד (שניות)
                            </HelpLabel>
                            <input
                                type="number"
                                min="2"
                                step="1"
                                className="mt-1.5 w-full bg-theme-elevated border border-theme-subtle rounded-lg px-3 py-1.5 text-theme"
                                value={Math.round(intervalMs / 1000)}
                                onChange={(e) => setIntervalMs(Math.max(2000, (Number(e.target.value) || 2) * 1000))}
                            />
                        </label>

                        <label className="block">
                            <HelpLabel
                                as="span"
                                className="text-sm font-semibold text-theme"
                                wrapperClassName="flex items-center gap-2"
                                helpTitle="כמות פריטים להצגה יחד"
                                helpDescription="כמה אירועים יוצגו באותו זמן בתוך הווידג׳ט."
                            >
                                כמות פריטים להצגה יחד
                            </HelpLabel>
                            <select
                                className="mt-1.5 w-full bg-theme-elevated border border-theme-subtle rounded-lg px-3 py-1.5 text-theme"
                                value={displayCount}
                                onChange={(e) => setDisplayCount(Number(e.target.value))}
                            >
                                {Array.from({ length: maxDisplayCount }, (_, index) => index + 1).map((count) => (
                                    <option key={count} value={count}>{count}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <HelpLabel
                                as="span"
                                className="text-sm font-semibold text-theme"
                                wrapperClassName="flex items-center gap-2"
                                helpTitle="סוג תצוגה"
                                helpDescription="בחירה בצורה שבה האירועים יופיעו בתוך הווידג׳ט."
                                helpItems={[
                                    'תצוגה רגילה מתאימה לרוב המצבים.',
                                    'תצוגה קומפקטית טובה כשיש הרבה אירועים קצרים.',
                                    'תצוגת לוח שנה מתאימה כשחשוב לראות מבט כללי על התאריכים.',
                                ]}
                            >
                                סוג תצוגה
                            </HelpLabel>
                            <select
                                className="mt-1.5 w-full bg-theme-elevated border border-theme-subtle rounded-lg px-3 py-1.5 text-theme"
                                value={displayMode}
                                onChange={(e) => setDisplayMode(e.target.value)}
                            >
                                <option value="default">תצוגה רגילה</option>
                                <option value="monthly">תצוגה קומפקטית</option>
                                <option value="calendar">תצוגת לוח שנה</option>
                            </select>
                        </label>
                    </div>
                </div>
            </div>

            {editingEvent && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-theme-card border border-theme-subtle rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-theme-subtle">
                            <h2 className="text-xl font-bold text-theme">{editingEvent.isNew ? 'הוסף אירוע חדש' : 'עריכת אירוע'}</h2>
                            <button onClick={() => setEditingEvent(null)} className="text-theme-muted hover:text-theme transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEvent} className="p-6 flex flex-col gap-5">
                            <div>
                                <HelpLabel
                                    as="span"
                                    className="block text-sm font-bold text-theme-muted"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="תאריך אירוע"
                                    helpDescription="התאריך שבו האירוע יקרה ויופיע למשתמשים."
                                >
                                    תאריך אירוע
                                </HelpLabel>
                                <input
                                    name="date"
                                    type="date"
                                    defaultValue={editingEvent.date}
                                    required
                                    className="w-full bg-theme-elevated border border-theme-subtle rounded-xl px-4 py-3 text-theme outline-none focus:border-blue-500 transition font-medium"
                                />
                            </div>

                            <div>
                                <HelpLabel
                                    as="span"
                                    className="block text-sm font-bold text-theme-muted"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="כותרת ראשית"
                                    helpDescription="השם המרכזי של האירוע כפי שיופיע בכרטיס."
                                >
                                    כותרת ראשית
                                </HelpLabel>
                                <input
                                    name="title"
                                    type="text"
                                    defaultValue={editingEvent.title}
                                    required
                                    placeholder="הזן שם מופע..."
                                    className="w-full bg-theme-elevated border border-theme-subtle rounded-xl px-4 py-3 text-theme outline-none focus:border-blue-500 transition font-medium"
                                />
                            </div>

                            <div>
                                <HelpLabel
                                    as="span"
                                    className="block text-sm font-bold text-theme-muted"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="תת-כותרת"
                                    helpDescription="מידע משלים כמו שעה, מקום או קהל יעד."
                                >
                                    תת-כותרת (תיאור קצר)
                                </HelpLabel>
                                <input
                                    name="subtitle"
                                    type="text"
                                    defaultValue={editingEvent.subtitle}
                                    placeholder="פרטים נוספים למשל: שעות או קהל יעד..."
                                    className="w-full bg-theme-elevated border border-theme-subtle rounded-xl px-4 py-3 text-theme outline-none focus:border-blue-500 transition text-sm"
                                />
                            </div>

                            <div>
                                <HelpLabel
                                    as="span"
                                    className="block text-sm font-bold text-theme-muted"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="סטטוס או צבע"
                                    helpDescription="הצבע עוזר לסמן עד כמה האירוע חשוב או בולט."
                                >
                                    סטטוס מופע / צבע
                                </HelpLabel>
                                <select
                                    name="color"
                                    defaultValue={editingEvent.color || 'gray'}
                                    className="w-full bg-theme-elevated border border-theme-subtle rounded-xl px-4 py-3 text-theme outline-none focus:border-blue-500 transition text-sm"
                                >
                                    {STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-theme-subtle">
                                <button type="submit" className="h-10 flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition">
                                    {editingEvent.isNew ? 'הוסף' : 'עדכן'}
                                </button>
                                <button type="button" onClick={() => setEditingEvent(null)} className="h-10 flex-1 bg-theme-elevated hover:bg-theme-card-hover text-theme rounded-xl text-sm font-bold transition border border-theme-subtle">
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
