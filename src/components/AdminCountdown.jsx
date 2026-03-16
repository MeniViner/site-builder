import React, { useState, useEffect, useRef } from 'react';
import { useWidget } from '../context/WidgetContext';
import { Timer, AlignLeft, Clock } from 'lucide-react';

const inputCls = 'w-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 transition';
const labelCls = 'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide';

export default function AdminCountdown() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [title, setTitle] = useState('');
    const [targetDate, setTargetDate] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const t = widgetConfig?.countdown?.title ?? '';
        const d = widgetConfig?.countdown?.targetDate ?? '';
        setTitle(t);
        setTargetDate(d);
        lastSavedRef.current = JSON.stringify({ title: t, targetDate: d });
    }, [widgetConfig]);

    useEffect(() => {
        const current = JSON.stringify({ title, targetDate });
        if (current === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, countdown: { title, targetDate } });
            setIsSaving(false);
            if (success) lastSavedRef.current = current;
            else setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
        }, 1200);
        return () => clearTimeout(t);
    }, [title, targetDate, widgetConfig]);

    const toLocalInputValue = (iso) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch { return ''; }
    };

    const handleDateChange = (e) => {
        const val = e.target.value;
        setTargetDate(val ? new Date(val).toISOString() : '');
    };

    // Live preview calculation
    const ms = targetDate ? new Date(targetDate) - Date.now() : null;
    const days = ms !== null ? Math.max(0, Math.floor(ms / 86400000)) : 0;
    const hrs = ms !== null ? Math.max(0, Math.floor((ms % 86400000) / 3600000)) : 0;
    const mins = ms !== null ? Math.max(0, Math.floor((ms % 3600000) / 60000)) : 0;

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">
            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white flex items-center gap-3">
                        <Timer size={28} className="text-sky-400" />
                        ניהול ספירה לאחור
                    </h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">הגדרת כותרת ותאריך היעד של הטיימר</p>
                </div>
                {isSaving && <span className="text-sm text-gray-500 dark:text-gray-400">שומר...</span>}
            </div>

            {saveMessage?.type === 'error' && (
                <div className="mb-6 p-4 rounded-lg flex items-center gap-3 bg-red-50 dark:bg-red-900/50 border border-red-500">
                    <span className="text-red-700 dark:text-red-200">{saveMessage.text}</span>
                </div>
            )}

            {/* Form card */}
            <div className="bg-white dark:bg-[#232733] border border-sky-500/20 rounded-2xl p-8 shadow-lg max-w-2xl space-y-6">
                <div>
                    <label className={labelCls}><AlignLeft size={10} className="inline ml-1" />כותרת הספירה</label>
                    <input
                        className={inputCls}
                        placeholder="לדוגמה: ימים לסיום הקורס"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                    />
                </div>

                <div>
                    <label className={labelCls}><Clock size={10} className="inline ml-1" />תאריך ושעת יעד</label>
                    <input
                        type="datetime-local"
                        className={inputCls}
                        value={toLocalInputValue(targetDate)}
                        onChange={handleDateChange}
                    />
                    {targetDate && (
                        <p className="mt-1.5 text-xs text-gray-400">
                            ISO: <span className="font-mono text-sky-400">{targetDate}</span>
                        </p>
                    )}
                </div>

                {/* Live preview */}
                {title && targetDate && (
                    <div className="flex items-start gap-4 p-5 bg-sky-500/5 border border-sky-500/20 rounded-xl">
                        <Timer size={22} className="text-sky-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-xs text-sky-400 font-semibold uppercase tracking-wide mb-1">תצוגה מקדימה</p>
                            <p className="text-base text-gray-800 dark:text-gray-100 font-bold">{title}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {ms > 0 ? `${days} ימים, ${hrs} שעות, ${mins} דקות` : '⏱️ התאריך עבר'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

        </div>
    );
}
