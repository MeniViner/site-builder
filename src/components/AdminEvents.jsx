import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useEvents } from '../context/EventsContext';
import { Undo2, Plus, Trash2, Edit2, AlertTriangle, Calendar, X, Settings2 } from 'lucide-react';
import { confirmToast } from '../utils/confirmToast';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';
import AdminAIActionCard from './AdminAIActionCard';
import { UI_FEATURES } from '../config/uiFeatures.config';
import { eventColorToHex, getContrastingTextColor, normalizeEventColor } from '../utils/colorValidation';
import {
    DEFAULT_AI_EVENTS_COUNT,
    buildEventsAiPromptText,
    normalizeAiEventsPayload,
    resolveRequestedAiEventCount,
} from '../utils/eventsAi';
import {
    SMART_LINK_TYPES,
    cleanSmartText,
    getSmartTextDocument,
    smartTextTokensToPlainText,
    updateSmartTextLinkLabel,
} from '../utils/smartText';
import SmartTextRenderer from './SmartTextRenderer';
import SmartTextEditor from './SmartTextEditor';

const STATUS_OPTIONS = [
    { value: 'gray', label: 'אפור (כלל משתמשי חרום)', hex: '#6B7280' },
    { value: 'red', label: 'אדום (דחוף / חשוב)', hex: '#EF4444' },
];

function getUrlPromptKeys(token) {
    return [token?.raw, token?.value, token?.href, String(token?.raw || '').toLowerCase(), String(token?.href || '').toLowerCase()]
        .map((key) => cleanSmartText(key).trim())
        .filter(Boolean);
}

function hasHandledUrl(linkLabels, token, promptedLinks, queuedLinks = new Set()) {
    const labels = linkLabels && typeof linkLabels === 'object' ? linkLabels : {};
    const keys = getUrlPromptKeys(token);
    const tokenText = cleanSmartText(token?.text).trim();
    const defaultTexts = new Set(keys);

    if (tokenText && !defaultTexts.has(tokenText) && !defaultTexts.has(tokenText.toLowerCase())) {
        return true;
    }

    return keys.some((key) => {
        const normalizedKey = cleanSmartText(key).trim();
        if (!normalizedKey) return false;
        return Boolean(labels[normalizedKey]) || promptedLinks.has(normalizedKey) || queuedLinks.has(normalizedKey);
    });
}

function findUnhandledUrls(tokens, linkLabels, promptedLinks, queuedLinks) {
    return getSmartTextDocument(tokens, '', linkLabels).filter((token) => (
        token.linkType === SMART_LINK_TYPES.url
        && token.href
        && !hasHandledUrl(linkLabels, token, promptedLinks, queuedLinks)
    ));
}

function isUrlPromptReady(token) {
    try {
        const url = new URL(token.href);
        const labels = url.hostname.split('.').filter(Boolean);
        const tld = labels[labels.length - 1] || '';
        return labels.length >= 2 && tld.length >= 2;
    } catch {
        return false;
    }
}

function buildUrlPrompt(token) {
    return {
        raw: token.raw,
        href: token.href,
        value: token.value,
        label: token.raw || token.text || token.href,
    };
}

function getEventStatusLabel(color) {
    return STATUS_OPTIONS.find((option) => option.value === color)?.label || 'צבע מותאם';
}

export default function AdminEvents({ onClose, inHub = false }) {
    const showAiUi = UI_FEATURES.showAiUi;
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
    const [smartLinkPrompt, setSmartLinkPrompt] = useState(null);
    const [aiHistory, setAiHistory] = useState({ past: [], future: [] });
    const promptedLinksRef = useRef(new Set());
    const queuedLinksRef = useRef(new Set());
    const smartLinkQueueRef = useRef([]);
    const subtitlePromptTimerRef = useRef(null);
    const aiRequestedEventCountRef = useRef(DEFAULT_AI_EVENTS_COUNT);
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

    const getEventsSnapshot = () => ({
        events,
        displayCount,
        displayMode,
        intervalMs,
    });

    const restoreEventsSnapshot = (snapshot) => {
        setEvents(Array.isArray(snapshot?.events) ? snapshot.events : []);
        setDisplayCount(Number.isFinite(Number(snapshot?.displayCount)) ? Number(snapshot.displayCount) : 3);
        setDisplayMode(snapshot?.displayMode || 'default');
        setIntervalMs(Math.max(2000, Number(snapshot?.intervalMs) || 6000));
        setEditingEvent(null);
    };

    const handleUndoAiEvents = () => {
        if (!aiHistory.past.length) return;
        const target = aiHistory.past[aiHistory.past.length - 1];
        const current = getEventsSnapshot();
        setAiHistory((prev) => ({
            past: prev.past.slice(0, -1),
            future: [current, ...prev.future].slice(0, 20),
        }));
        restoreEventsSnapshot(target);
    };

    const handleRedoAiEvents = () => {
        if (!aiHistory.future.length) return;
        const target = aiHistory.future[0];
        const current = getEventsSnapshot();
        setAiHistory((prev) => ({
            past: [...prev.past, current].slice(-20),
            future: prev.future.slice(1),
        }));
        restoreEventsSnapshot(target);
    };

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

    useEffect(() => () => {
        if (subtitlePromptTimerRef.current) {
            window.clearTimeout(subtitlePromptTimerRef.current);
        }
    }, []);

    const clearSubtitlePromptTimer = () => {
        if (subtitlePromptTimerRef.current) {
            window.clearTimeout(subtitlePromptTimerRef.current);
            subtitlePromptTimerRef.current = null;
        }
    };

    const resetSmartLinkPromptState = () => {
        clearSubtitlePromptTimer();
        promptedLinksRef.current = new Set();
        queuedLinksRef.current = new Set();
        smartLinkQueueRef.current = [];
        setSmartLinkPrompt(null);
    };

    const openNextSmartLinkPrompt = () => {
        clearSubtitlePromptTimer();
        setSmartLinkPrompt((current) => {
            if (current) return current;
            const next = smartLinkQueueRef.current.shift() || null;
            if (next) {
                getUrlPromptKeys(next).forEach((key) => queuedLinksRef.current.delete(key));
            }
            return next;
        });
    };

    const scheduleNextSmartLinkPrompt = () => {
        clearSubtitlePromptTimer();
        subtitlePromptTimerRef.current = window.setTimeout(() => {
            openNextSmartLinkPrompt();
            subtitlePromptTimerRef.current = null;
        }, 350);
    };

    const enqueueUrlPrompts = (tokens, linkLabels) => {
        if (smartLinkPrompt) return;
        const urls = findUnhandledUrls(tokens, linkLabels, promptedLinksRef.current, queuedLinksRef.current)
            .filter(isUrlPromptReady);
        if (!urls.length) return;

        urls.forEach((token) => {
            const keys = getUrlPromptKeys(token);
            if (!keys.length || keys.some((key) => queuedLinksRef.current.has(key))) return;
            keys.forEach((key) => queuedLinksRef.current.add(key));
            smartLinkQueueRef.current.push(buildUrlPrompt(token));
        });

        if (smartLinkQueueRef.current.length) scheduleNextSmartLinkPrompt();
    };

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
        const subtitleRichText = getSmartTextDocument(
            editingEvent.subtitleRichText,
            editingEvent.subtitle,
            editingEvent.linkLabels,
        );

        const nextEvent = {
            id: editingEvent.id || Date.now().toString(),
            date: formData.get('date'),
            title: formData.get('title'),
            subtitle: smartTextTokensToPlainText(subtitleRichText),
            subtitleRichText,
            linkLabels: editingEvent.linkLabels && typeof editingEvent.linkLabels === 'object'
                ? editingEvent.linkLabels
                : {},
            color: normalizeEventColor(editingEvent.color, 'gray'),
        };

        if (editingEvent.isNew) {
            setEvents((prev) => [...prev, nextEvent]);
        } else {
            setEvents((prev) => prev.map((current) => (current.id === nextEvent.id ? nextEvent : current)));
        }

        setEditingEvent(null);
        setSmartLinkPrompt(null);
    };

    const openNewEventEditor = () => {
        resetSmartLinkPromptState();
        setEditingEvent({
            date: new Date().toISOString().split('T')[0],
            title: '',
            subtitle: '',
            subtitleRichText: [],
            linkLabels: {},
            color: 'gray',
            isNew: true,
        });
    };

    const openExistingEventEditor = (eventItem) => {
        resetSmartLinkPromptState();
        const linkLabels = eventItem.linkLabels && typeof eventItem.linkLabels === 'object' ? eventItem.linkLabels : {};
        setEditingEvent({
            ...eventItem,
            subtitleRichText: getSmartTextDocument(eventItem.subtitleRichText, eventItem.subtitle, linkLabels),
            linkLabels,
            isNew: false,
        });
    };

    const closeEventEditor = () => {
        resetSmartLinkPromptState();
        setEditingEvent(null);
    };

    const handleSubtitleEditorChange = ({ tokens, plainText }) => {
        const linkLabels = editingEvent?.linkLabels || {};
        setEditingEvent((prev) => prev ? {
            ...prev,
            subtitle: plainText,
            subtitleRichText: tokens,
        } : prev);
        enqueueUrlPrompts(tokens, linkLabels);
    };

    const applySmartLinkPromptLabel = (rawLabel) => {
        if (!smartLinkPrompt) return;
        clearSubtitlePromptTimer();
        const label = cleanSmartText(rawLabel || smartLinkPrompt.raw || smartLinkPrompt.href).trim();
        const handledKeys = [smartLinkPrompt.raw, smartLinkPrompt.href, smartLinkPrompt.value]
            .map((item) => cleanSmartText(item).trim())
            .filter(Boolean);
        handledKeys.forEach((key) => promptedLinksRef.current.add(key));

        let nextPrompt = smartLinkQueueRef.current.shift() || null;
        if (nextPrompt) {
            getUrlPromptKeys(nextPrompt).forEach((key) => queuedLinksRef.current.delete(key));
        }

        if (label) {
            const currentLabels = editingEvent?.linkLabels && typeof editingEvent.linkLabels === 'object'
                ? editingEvent.linkLabels
                : {};
            const previewLabels = { ...currentLabels };
            handledKeys.forEach((key) => {
                previewLabels[key] = label;
            });
            const previewRichText = updateSmartTextLinkLabel(
                getSmartTextDocument(editingEvent?.subtitleRichText, editingEvent?.subtitle, previewLabels),
                smartLinkPrompt,
                label,
            );

            if (!nextPrompt) {
                const nextUrl = findUnhandledUrls(previewRichText, previewLabels, promptedLinksRef.current, new Set())
                    .filter(isUrlPromptReady)[0];
                if (nextUrl) nextPrompt = buildUrlPrompt(nextUrl);
            }

            setEditingEvent((prev) => {
                if (!prev) return prev;
                const nextLabels = { ...(prev.linkLabels || {}) };
                handledKeys.forEach((key) => {
                    nextLabels[key] = label;
                });
                const subtitleRichText = updateSmartTextLinkLabel(
                    getSmartTextDocument(prev.subtitleRichText, prev.subtitle, nextLabels),
                    smartLinkPrompt,
                    label,
                );
                return {
                    ...prev,
                    subtitle: smartTextTokensToPlainText(subtitleRichText),
                    subtitleRichText,
                    linkLabels: nextLabels,
                };
            });
        }

        setSmartLinkPrompt(nextPrompt);
    };

    const saveSmartLinkLabel = () => {
        applySmartLinkPromptLabel(smartLinkPrompt?.label);
    };

    const cancelSmartLinkLabel = () => {
        applySmartLinkPromptLabel(smartLinkPrompt?.raw || smartLinkPrompt?.href);
    };

    const buildEventsAiPrompt = (instruction) => {
        const today = new Date().toISOString().slice(0, 10);
        const requestedEventCount = resolveRequestedAiEventCount(instruction);
        aiRequestedEventCountRef.current = requestedEventCount;
        const currentSnapshot = {
            displayCount,
            displayMode,
            intervalMs,
            events: events.slice(0, 12),
        };

        return buildEventsAiPromptText({
            instruction,
            today,
            currentSnapshot,
            requestedEventCount,
        });
    };

    const applyAiEvents = (parsed) => {
        const normalized = normalizeAiEventsPayload(parsed, {
            eventCount: aiRequestedEventCountRef.current,
        });
        const current = getEventsSnapshot();
        const next = {
            events: normalized.events,
            displayCount: normalized.displayCount,
            displayMode: normalized.displayMode,
            intervalMs: normalized.intervalMs,
        };
        if (JSON.stringify(current) !== JSON.stringify(next)) {
            setAiHistory((prev) => ({
                past: [...prev.past, current].slice(-20),
                future: [],
            }));
        }
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
                            {showAiUi && (
                                <AdminAIActionCard
                                    compact
                                    compactLabel="AI"
                                    title="עוזר AI לאירועים"
                                    description="ייצור רשימת אירועים + טקסט עשיר והגדרות תצוגה. ברירת מחדל 3 אירועים, מקסימום 6."
                                    inputLabel="מה לייצר?"
                                    inputPlaceholder='דוגמה: "צור 6 אירועים לחודש הקרוב עם דגש על הכשרות ורווחה, כולל קישורים והדגשות"'
                                    defaultInput="צור סדרת אירועים חודשית מקצועית וברורה"
                                    buildPrompt={buildEventsAiPrompt}
                                    onApply={applyAiEvents}
                                    canUndo={aiHistory.past.length > 0}
                                    canRedo={aiHistory.future.length > 0}
                                    onUndo={handleUndoAiEvents}
                                    onRedo={handleRedoAiEvents}
                                    applyButtonLabel="החל על אירועים"
                                    generateButtonLabel="ייצר אירועים"
                                />
                            )}
                            <button
                                onClick={openNewEventEditor}
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
                            const statusHex = eventColorToHex(eventItem.color);
                            const statusLabel = getEventStatusLabel(eventItem.color);
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
                                            <SmartTextRenderer
                                                text={eventItem.subtitle}
                                                richText={eventItem.subtitleRichText}
                                                linkLabels={eventItem.linkLabels}
                                                fallback="תיאור קצר"
                                                className="mt-2 block text-theme-muted text-lg break-words"
                                            />
                                        </div>

                                        <div className="flex flex-col items-center gap-1 mt-4">
                                            <span className="text-sm font-medium text-theme-muted">סטטוס</span>
                                            <div
                                                className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
                                                style={{ backgroundColor: statusHex }}
                                            >
                                                {statusLabel}
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
                                            onClick={() => openExistingEventEditor(eventItem)}
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
                <>
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-theme-card border border-theme-subtle rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-theme-subtle">
                            <h2 className="text-xl font-bold text-theme">{editingEvent.isNew ? 'הוסף אירוע חדש' : 'עריכת אירוע'}</h2>
                            <button onClick={closeEventEditor} className="text-theme-muted hover:text-theme transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEvent} className="p-6 flex max-h-[78vh] flex-col gap-5 overflow-y-auto custom-scrollbar">
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
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <HelpLabel
                                        as="span"
                                        className="block text-sm font-bold text-theme-muted"
                                        wrapperClassName="flex items-center gap-2"
                                        helpTitle="תת-כותרת"
                                        helpDescription="מידע משלים כמו שעה, מקום או קהל יעד."
                                    >
                                        תת-כותרת (תיאור קצר)
                                    </HelpLabel>
                                    <HelpTooltipButton
                                        title="כתיבה חכמה"
                                        description="טקסט האירוע תומך בקישורים, הדגשה וקיצורי מקלדת."
                                        items={[
                                            'איך להדגיש טקסט: סמנו טקסט ולחצו על כפתור ההדגשה, או השתמשו ב־Ctrl+B / Cmd+B.',
                                            'איך להוסיף קישור: לחצו על כפתור הקישור ליד B/I/U, הזינו שם וכתובת, או הדביקו URL לזיהוי אוטומטי.',
                                            'מספר אישי: מספר אישי שמתחיל ב־S או C ואחריו 7 או 8 ספרות, למשל S1234567, הופך לקישור מייל צבאי.',
                                            'מספר טלפון הופך לקישור חיוג.',
                                            'כתובות URL: כתובות כמו https://example.com וגם www.example.com מזוהות אוטומטית.',
                                        ]}
                                    />
                                </div>
                                <SmartTextEditor
                                    value={editingEvent.subtitleRichText}
                                    plainText={editingEvent.subtitle || ''}
                                    linkLabels={editingEvent.linkLabels || {}}
                                    onChange={handleSubtitleEditorChange}
                                    placeholder="פרטים נוספים למשל: שעות, קהל יעד או קישור..."
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
                                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                    <div className="flex flex-wrap gap-2">
                                        {STATUS_OPTIONS.map((option) => {
                                            const isActive = editingEvent.color === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => setEditingEvent((prev) => prev ? { ...prev, color: option.value } : prev)}
                                                    className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition ${
                                                        isActive
                                                            ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                                                            : 'border-theme-subtle bg-theme-elevated text-theme-muted hover:text-theme'
                                                    }`}
                                                >
                                                    <span className="h-4 w-4 rounded-full border border-white/50" style={{ backgroundColor: option.hex }} />
                                                    {option.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <label className="inline-flex items-center gap-3 rounded-xl border border-theme-subtle bg-theme-elevated px-3 py-2">
                                        <span className="text-sm font-bold text-theme-muted">צבע מותאם</span>
                                        <input
                                            type="color"
                                            value={eventColorToHex(editingEvent.color)}
                                            onChange={(event) => setEditingEvent((prev) => prev ? { ...prev, color: normalizeEventColor(event.target.value, prev.color || 'gray') } : prev)}
                                            className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                                            title="בחירת צבע סטטוס מותאם"
                                        />
                                    </label>
                                </div>
                                <div
                                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-black/10 px-4 py-1.5 text-xs font-bold"
                                    style={{
                                        backgroundColor: eventColorToHex(editingEvent.color),
                                        color: getContrastingTextColor(editingEvent.color),
                                    }}
                                >
                                    <span className="h-2 w-2 rounded-full bg-current opacity-80" />
                                    {getEventStatusLabel(editingEvent.color)}
                                </div>
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-theme-subtle">
                                <button type="submit" className="h-10 flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition">
                                    {editingEvent.isNew ? 'הוסף' : 'עדכן'}
                                </button>
                                <button type="button" onClick={closeEventEditor} className="h-10 flex-1 bg-theme-elevated hover:bg-theme-card-hover text-theme rounded-xl text-sm font-bold transition border border-theme-subtle">
                                    ביטול
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
                {smartLinkPrompt && (
                    <div className="fixed inset-0 z-[230] flex items-center justify-center bg-black/40 p-4">
                        <div
                            className="w-full max-w-md rounded-2xl border border-theme-subtle bg-theme-card p-5 text-right shadow-2xl"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="smart-link-label-title"
                        >
                            <div className="mb-4">
                                <h3 id="smart-link-label-title" className="text-lg font-black text-theme">שם תצוגה לקישור</h3>
                                <p className="mt-1 text-sm text-theme-muted">
                                    זוהתה כתובת URL. אפשר לבחור שם ידידותי שיוצג במקום הכתובת הארוכה.
                                </p>
                            </div>
                            <div className="mb-3 rounded-xl border border-theme-subtle bg-theme-elevated px-3 py-2 text-left font-mono text-xs text-theme-muted" dir="ltr">
                                {smartLinkPrompt.href}
                            </div>
                            <input
                                autoFocus
                                value={smartLinkPrompt.label}
                                onChange={(event) => setSmartLinkPrompt((prev) => prev ? { ...prev, label: event.target.value } : prev)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') saveSmartLinkLabel();
                                    if (event.key === 'Escape') cancelSmartLinkLabel();
                                }}
                                className="w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-3 text-theme outline-none transition focus:border-blue-500"
                                placeholder="לדוגמה: טופס הרשמה"
                            />
                            <div className="mt-5 flex gap-3">
                                <button type="button" onClick={saveSmartLinkLabel} className="h-10 flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-700">
                                    שמור שם
                                </button>
                                <button type="button" onClick={cancelSmartLinkLabel} className="h-10 flex-1 rounded-xl border border-theme-subtle bg-theme-elevated text-sm font-bold text-theme transition hover:bg-theme-card-hover">
                                    השאר כתובת
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                </>
            )}
        </div>
    );
}
