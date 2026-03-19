import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useWidget } from '../context/WidgetContext';
import { Timer, AlignLeft, Clock, Plus, Check, X, Pencil, Trash2, AlertTriangle, Info } from 'lucide-react';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';

const inputCls = 'w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide';
const primaryBtnCls = 'h-10 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white transition hover:bg-sky-700';
const secondaryBtnCls = 'h-10 inline-flex items-center gap-2 rounded-lg bg-gray-200 px-5 text-sm font-bold text-gray-700 transition hover:bg-gray-300 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15';

const EMPTY_COUNTDOWN = {
    id: '',
    title: '',
    targetDate: '',
    showDetails: false,
    details: '',
};

const makeId = () => crypto.randomUUID?.() || Date.now().toString();

function toLocalInputValue(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return '';
    }
}

function normalizeCountdownSource(countdownSource) {
    const source = countdownSource || {};
    const sourceItems = Array.isArray(source.items) && source.items.length > 0
        ? source.items
        : ((source.title || source.targetDate || source.details)
            ? [{ id: 'countdown-1', title: source.title, targetDate: source.targetDate, showDetails: source.showDetails, details: source.details }]
            : []);

    const items = sourceItems.map((item, index) => ({
        id: String(item?.id ?? `countdown-${index + 1}`),
        title: item?.title ?? '',
        targetDate: item?.targetDate ?? '',
        showDetails: item?.showDetails ?? false,
        details: item?.details ?? '',
    }));

    const ids = new Set(items.map((item) => item.id));
    const activeItemId = ids.has(String(source.activeItemId ?? ''))
        ? String(source.activeItemId)
        : (items[0]?.id ?? null);

    return { items, activeItemId };
}

export default function AdminCountdown() {
    const { widgetConfig, saveWidgetConfig } = useWidget();

    const [list, setList] = useState([]);
    const [activeItemId, setActiveItemId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_COUNTDOWN);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const normalized = normalizeCountdownSource(widgetConfig?.countdown);
        setList(normalized.items);
        setActiveItemId(normalized.activeItemId);
        lastSavedRef.current = JSON.stringify({
            items: normalized.items,
            activeItemId: normalized.activeItemId,
        });
    }, [widgetConfig]);

    useEffect(() => {
        const current = JSON.stringify({ items: list, activeItemId });
        if (current === lastSavedRef.current) return;

        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);

            const active = list.find((item) => item.id === activeItemId) || list[0] || null;
            const countdownPayload = {
                title: active?.title || '',
                targetDate: active?.targetDate || '',
                showDetails: active?.showDetails || false,
                details: active?.details || '',
                activeItemId: activeItemId || active?.id || null,
                items: list,
            };

            const success = await saveWidgetConfig({ ...widgetConfig, countdown: countdownPayload });
            setIsSaving(false);
            if (success) {
                lastSavedRef.current = current;
            } else {
                setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
            }
        }, 1200);

        return () => clearTimeout(t);
    }, [list, activeItemId, widgetConfig, saveWidgetConfig]);

    const activeCountdown = useMemo(
        () => list.find((item) => item.id === activeItemId) || list[0] || null,
        [list, activeItemId]
    );

    const timeLeftText = useMemo(() => {
        if (!activeCountdown?.targetDate) return '';
        const ms = new Date(activeCountdown.targetDate) - Date.now();
        if (!Number.isFinite(ms) || ms <= 0) return 'התאריך עבר';
        const days = Math.floor(ms / 86400000);
        const hrs = Math.floor((ms % 86400000) / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        return `${days} ימים, ${hrs} שעות, ${mins} דקות`;
    }, [activeCountdown]);

    const openNew = () => {
        setForm({ ...EMPTY_COUNTDOWN, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (item) => {
        setForm({ ...item });
        setEditingId(item.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_COUNTDOWN);
    };

    const commitEdit = () => {
        if (!form.title.trim() || !form.targetDate) return;

        const nextItem = {
            ...form,
            details: form.showDetails ? form.details : '',
        };

        setList((prev) => (
            editingId === 'new'
                ? [...prev, nextItem]
                : prev.map((item) => (item.id === editingId ? nextItem : item))
        ));

        if (!activeItemId) {
            setActiveItemId(nextItem.id);
        }

        cancelEdit();
    };

    const deleteItem = (id) => {
        setList((prev) => {
            const next = prev.filter((item) => item.id !== id);
            if (activeItemId === id) {
                setActiveItemId(next[0]?.id || null);
            }
            return next;
        });

        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen text-gray-900 dark:text-white font-heebo p-8">
            <div className="mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                            <Timer size={28} className="text-sky-400" />
                            ניהול ספירה לאחור
                        </h1>
                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">ניהול כמה ספירות לאחור, בחירת ספירה פעילה ופרטים אופציונליים.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <AdminPageHelpButton pageId="countdown" />
                        <button onClick={openNew} className={primaryBtnCls}>
                            <Plus size={16} />
                            הוסף ספירה
                        </button>
                    </div>
                </div>
            </div>

            {saveMessage?.type === 'error' && (
                <div className="mb-6 p-4 rounded-lg flex items-center gap-3 bg-red-50 dark:bg-red-900/50 border border-red-500">
                    <AlertTriangle size={16} className="shrink-0" />
                    <span className="text-red-700 dark:text-red-200">{saveMessage.text}</span>
                </div>
            )}

            <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#232733] px-4 py-2.5">
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} ספירות מוגדרות</p>
                <span className="text-sm text-gray-500 dark:text-gray-400">{isSaving ? 'שומר...' : 'מוכן לעריכה'}</span>
            </div>

            {editingId !== null && (
                <div className="bg-white dark:bg-[#232733] border border-sky-500/20 rounded-2xl p-6 shadow-lg max-w-2xl space-y-5 mb-6">
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-sky-400">{editingId === 'new' ? 'הוספת ספירה' : 'עריכת ספירה'}</h3>
                        <HelpTooltipButton
                            title="ספירה לאחור"
                            description="כל פריט כאן הוא יעד אחד שסופרים אליו זמן."
                            items={[
                                'אפשר לשמור כמה יעדים שונים.',
                                'רק יעד אחד יהיה פעיל ויוצג כרגע באתר.',
                            ]}
                        />
                    </div>

                    <div>
                        <HelpLabel
                            as="span"
                            className={labelCls}
                            helpTitle="כותרת הספירה"
                            helpDescription="המשפט הקצר שמסביר למה סופרים, למשל לקראת אירוע או תאריך יעד."
                        >
                            <><AlignLeft size={10} className="inline ml-1" />כותרת הספירה</>
                        </HelpLabel>
                        <input
                            className={inputCls}
                            placeholder="לדוגמה: ימים לסיום הקורס"
                            value={form.title}
                            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                        />
                    </div>

                    <div>
                        <HelpLabel
                            as="span"
                            className={labelCls}
                            helpTitle="תאריך ושעת יעד"
                            helpDescription="הרגע המדויק שאליו הספירה תרד. כשהתאריך יעבור, תופיע הודעה שהתאריך עבר."
                        >
                            <><Clock size={10} className="inline ml-1" />תאריך ושעת יעד</>
                        </HelpLabel>
                        <input
                            type="datetime-local"
                            className={inputCls}
                            value={toLocalInputValue(form.targetDate)}
                            onChange={(e) => {
                                const val = e.target.value;
                                setForm((prev) => ({ ...prev, targetDate: val ? new Date(val).toISOString() : '' }));
                            }}
                        />
                    </div>

                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-600 dark:text-gray-300">
                        <input
                            type="checkbox"
                            checked={form.showDetails}
                            onChange={(e) => setForm((prev) => ({ ...prev, showDetails: e.target.checked }))}
                            className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                        />
                        האם להוסיף פרטים
                        <HelpTooltipButton
                            title="פרטים נוספים"
                            description="האפשרות הזאת מוסיפה טקסט משלים מתחת לספירה, למשל הסבר או הנחיה."
                        />
                    </label>

                    {form.showDetails && (
                        <div>
                            <HelpLabel
                                as="span"
                                className={labelCls}
                                helpTitle="פרטים"
                                helpDescription="טקסט משלים שמופיע יחד עם הספירה, אם בחרת להציג פרטים נוספים."
                            >
                                <><Info size={10} className="inline ml-1" />פרטים</>
                            </HelpLabel>
                            <textarea
                                rows={3}
                                className={`${inputCls} resize-none`}
                                placeholder="הוסף פרטים אופציונליים על הספירה"
                                value={form.details}
                                onChange={(e) => setForm((prev) => ({ ...prev, details: e.target.value }))}
                            />
                        </div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <button onClick={commitEdit} className={primaryBtnCls}>
                            <Check size={16} />
                            {editingId === 'new' ? 'הוסף' : 'עדכן'}
                        </button>
                        <button onClick={cancelEdit} className={secondaryBtnCls}>
                            <X size={16} />
                            ביטול
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {list.map((item) => {
                    const isActive = item.id === activeItemId;
                    return (
                        <div key={item.id} className={`rounded-2xl border p-5 ${isActive ? 'border-sky-400/50 bg-sky-500/5' : 'border-gray-200 bg-white dark:border-white/10 dark:bg-[#232733]'}`}>
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <h4 className="text-lg font-bold text-gray-900 dark:text-white">{item.title}</h4>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{item.targetDate ? new Date(item.targetDate).toLocaleString('he-IL') : 'ללא תאריך'}</p>
                                    {item.showDetails && item.details && (
                                        <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{item.details}</p>
                                    )}
                                    {isActive && timeLeftText && (
                                        <p className="mt-3 text-xs font-bold text-sky-500">נותר: {timeLeftText}</p>
                                    )}
                                </div>

                                <div className="flex gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setActiveItemId(item.id)}
                                        className={`h-9 rounded-lg border px-3 text-xs font-bold transition ${isActive ? 'border-sky-500 bg-sky-500/10 text-sky-500' : 'border-gray-300 bg-white text-gray-600 hover:border-sky-500/40 hover:text-sky-500 dark:border-white/15 dark:bg-white/5 dark:text-gray-300'}`}
                                    >
                                        {isActive ? 'פעיל' : 'קבע כפעיל'}
                                    </button>
                                    <button onClick={() => openEdit(item)} className="rounded-md p-2 text-gray-400 transition hover:bg-sky-500/10 hover:text-sky-400"><Pencil size={15} /></button>
                                    <button onClick={() => deleteItem(item.id)} className="rounded-md p-2 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
