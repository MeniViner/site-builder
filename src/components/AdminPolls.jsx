// src/components/AdminPolls.jsx
import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Check, ListChecks, Pencil, Plus, Trash2, Vote, X } from 'lucide-react';
import WidgetDisplaySettingsPanel from './WidgetDisplaySettingsPanel';
import { useWidget } from '../context/WidgetContext';
import { AdminPageHelpButton, HelpTooltipButton } from './AdminHelp';

const panelCls = 'bg-themeBg-card bg-white dark:bg-[#232733] text-themeText-primary text-gray-900 dark:text-white border border-gray-200 dark:border-white/10';
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-pink-400 focus:ring-2 focus:ring-pink-500/20 dark:border-white/10 dark:bg-[#1a1d24] dark:text-white';

const EMPTY_POLL = { id: '', question: '', optionsInput: '', active: true };
const makeId = () => crypto.randomUUID?.() || Date.now().toString();
const ensureSingleActivePoll = (polls, preferredActiveId = null) => {
    const source = Array.isArray(polls) ? polls : [];
    if (source.length === 0) return [];

    const preferred = preferredActiveId !== null && preferredActiveId !== undefined
        ? source.find((item) => String(item?.id) === String(preferredActiveId))
        : null;
    const existingActive = source.find((item) => item?.active === true);
    const resolvedActiveId = String(preferred?.id ?? existingActive?.id ?? source[0]?.id);

    return source.map((item) => ({
        ...item,
        active: String(item?.id) === resolvedActiveId,
    }));
};
const resolveVoterLabel = (voter) => {
    if (typeof voter === 'string') return voter.trim();
    if (!voter || typeof voter !== 'object') return '';

    const name = String(voter.name ?? voter.displayName ?? '').trim();
    if (name) return name;

    const email = String(voter.email ?? '').trim();
    if (email) return email;

    const loginName = String(voter.loginName ?? '').trim();
    if (loginName) return loginName;

    const personalNumber = String(voter.personalNumber ?? '').trim();
    if (personalNumber) return personalNumber;

    return '';
};

export default function AdminPolls() {
    const { widgetConfig, saveWidgetConfig } = useWidget();
    const [list, setList] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_POLL);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const lastSavedRef = useRef(null);

    useEffect(() => {
        const server = widgetConfig?.polls ?? [];
        const normalized = ensureSingleActivePoll(server);
        setList(normalized);
        // Keep snapshot of the raw server payload so normalization (if needed)
        // will trigger a save and persist to shared config.
        lastSavedRef.current = JSON.stringify(server);
    }, [widgetConfig]);

    useEffect(() => {
        if (JSON.stringify(list) === lastSavedRef.current) return;
        const t = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveWidgetConfig({ ...widgetConfig, polls: list });
            setIsSaving(false);
            if (success) lastSavedRef.current = JSON.stringify(list);
            else setSaveMessage({ type: 'error', text: 'שמירת הסקרים נכשלה. נסה שוב.' });
        }, 1200);
        return () => clearTimeout(t);
    }, [list, widgetConfig]);

    const openNew = () => {
        setForm({ ...EMPTY_POLL, id: makeId() });
        setEditingId('new');
    };

    const openEdit = (item) => {
        setForm({
            id: item.id,
            question: item.question,
            optionsInput: (item.options || []).map((option) => option.text).join(', '),
            active: item.active !== false,
        });
        setEditingId(item.id);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setForm(EMPTY_POLL);
    };

    const buildOptions = () => {
        const existing = list.find((item) => item.id === editingId)?.options ?? [];
        return form.optionsInput
            .split(',')
            .map((option) => option.trim())
            .filter(Boolean)
            .map((text, index) => {
                const match = existing.find((option) => option.text === text);
                return match || { id: `o-${form.id}-${index + 1}`, text, votes: 0 };
            });
    };

    const commitEdit = () => {
        const options = buildOptions();
        if (!form.question.trim() || options.length === 0) return;
        const nextItem = { id: form.id, question: form.question, options, active: form.active };
        setList((prev) => (
            ensureSingleActivePoll(
                editingId === 'new'
                ? [...prev, nextItem]
                    : prev.map((item) => (item.id === editingId ? nextItem : item)),
                form.active ? nextItem.id : null
            )
        ));
        cancelEdit();
    };

    const deleteItem = (id) => {
        setList((prev) => ensureSingleActivePoll(prev.filter((item) => item.id !== id)));
        if (editingId === id) cancelEdit();
    };

    return (
        <div dir="rtl" className="min-h-screen p-8 font-heebo text-gray-900 dark:text-white">
            <div className="mb-8 border-b border-gray-300 pb-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="flex items-center gap-3 text-3xl font-black">
                            <Vote size={28} className="text-pink-400" />
                            ניהול סקרים
                        </h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הגדרת שאלות ואפשרויות הצבעה בפורמט פשוט ומהיר.</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <AdminPageHelpButton pageId="polls" />
                        <button onClick={openNew} className="h-10 inline-flex items-center gap-2 rounded-lg bg-pink-600 px-4 text-sm font-bold text-white transition hover:bg-pink-700">
                            <Plus size={16} />
                            הוסף סקר
                        </button>
                    </div>
                </div>
            </div>

            {saveMessage?.type === 'error' && (
                <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-500 bg-red-50 p-4 text-red-700 dark:bg-red-900/30 dark:text-red-200">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>{saveMessage.text}</span>
                </div>
            )}

            <div className="mb-6 flex items-center justify-between rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-[#232733] px-4 py-2.5">
                <p className="text-sm text-gray-500 dark:text-gray-400">{list.length} סקרים מוגדרים</p>
                <span className="text-sm text-gray-500 dark:text-gray-400">{isSaving ? 'שומר...' : 'מוכן לעריכה'}</span>
            </div>

            {editingId !== null && (
                <div className={`${panelCls} mb-6 rounded-2xl p-6 shadow-lg`}>
                    <div className="mb-4 flex items-center gap-2">
                        <h3 className="text-base font-bold text-pink-400">{editingId === 'new' ? 'הוספת סקר' : 'עריכת סקר'}</h3>
                        <HelpTooltipButton
                            title="עריכת סקר"
                            description="כאן מגדירים שאלה אחת ואת כל אפשרויות התשובה עבורה."
                            items={[
                                'כל אפשרות תשובה נכתבת באותו שדה, מופרדת בפסיק.',
                                'סקר פעיל יופיע למשתמשים. סקר סגור יישמר אבל לא יהיה זמין להצבעה.',
                            ]}
                        />
                    </div>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">שאלת הסקר</span>
                                <HelpTooltipButton
                                    title="שאלת הסקר"
                                    description="השאלה המרכזית שהמשתמשים יראו לפני ההצבעה."
                                />
                            </div>
                            <input className={inputCls} placeholder="שאלת הסקר" value={form.question} onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))} />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">אפשרויות תשובה</span>
                                <HelpTooltipButton
                                    title="אפשרויות תשובה"
                                    description="כותבים את כל האפשרויות בשדה אחד, ומפרידים ביניהן בפסיקים."
                                    items={[
                                        'לדוגמה: כן, לא, אולי',
                                    ]}
                                />
                            </div>
                            <textarea className={`${inputCls} min-h-[110px] resize-none`} placeholder="אפשרויות מופרדות בפסיקים" value={form.optionsInput} onChange={(e) => setForm((prev) => ({ ...prev, optionsInput: e.target.value }))} />
                        </div>
                        <label className="flex items-center gap-3 text-sm font-medium text-gray-600 dark:text-gray-300">
                            <input type="checkbox" checked={form.active} onChange={(e) => setForm((prev) => ({ ...prev, active: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-pink-600 focus:ring-pink-500" />
                            סקר פעיל
                            <HelpTooltipButton
                                title="סקר פעיל"
                                description="כאשר האפשרות פעילה, הסקר יופיע למשתמשים. כשהיא כבויה, הסקר יישמר אך לא יוצג."
                            />
                        </label>
                    </div>
                    <div className="mt-4 flex gap-3">
                        <button onClick={commitEdit} className="h-10 inline-flex items-center gap-2 rounded-lg bg-pink-600 px-5 text-sm font-bold text-white transition hover:bg-pink-700">
                            <Check size={16} />
                            {editingId === 'new' ? 'הוסף' : 'עדכן'}
                        </button>
                        <button onClick={cancelEdit} className="h-10 inline-flex items-center gap-2 rounded-lg bg-gray-200 px-5 text-sm font-bold text-gray-700 transition hover:bg-gray-300 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/15">
                            <X size={16} />
                            ביטול
                        </button>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {list.map((item) => (
                    <div key={item.id} className={`${panelCls} rounded-2xl p-5 shadow-sm`}>
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-lg font-bold">{item.question}</h3>
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.active ? 'bg-pink-500/10 text-pink-500' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
                                        {item.active ? 'פעיל' : 'סגור'}
                                    </span>
                                </div>
                                <div className="mt-3 grid gap-2">
                                    {(item.options || []).map((option) => {
                                        const voterNames = (Array.isArray(option?.voters) ? option.voters : [])
                                            .map(resolveVoterLabel)
                                            .filter(Boolean);

                                        return (
                                            <div key={option.id} className="rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2 dark:border-white/10 dark:bg-[#1a1d24]/70">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
                                                        <ListChecks size={12} className="text-pink-400" />
                                                        {option.text}
                                                    </span>
                                                    <span className="rounded-full bg-pink-500/10 px-2.5 py-0.5 text-xs font-bold text-pink-500">
                                                        {option.votes} קולות
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    {voterNames.length > 0
                                                        ? `מצביעים (${voterNames.length}): ${voterNames.join(', ')}`
                                                        : 'מצביעים: אין נתונים'}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => openEdit(item)} className="rounded-md p-2 text-gray-400 transition hover:bg-pink-500/10 hover:text-pink-400"><Pencil size={15} /></button>
                                <button onClick={() => deleteItem(item.id)} className="rounded-md p-2 text-gray-400 transition hover:bg-red-500/10 hover:text-red-400"><Trash2 size={15} /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <WidgetDisplaySettingsPanel widgetKey="polls" title="הגדרות הצגה דינמיות לווידג׳ט " />
        </div>
    );
}
