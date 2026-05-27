import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Copy,
    Diamond,
    Edit3,
    ExternalLink,
    Loader2,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    UserRound,
    X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useGantt } from '../context/GanttContext';
import {
    GANTT_COLOR_OPTIONS,
    GANTT_DESIGN_PRESETS,
    GANTT_STATUS_OPTIONS,
    GANTT_VIEW_OPTIONS,
    applyGanttDesignPreset,
    cloneGanttData,
    computeGanttProgress,
    computeGanttTimeStatus,
    createGanttTask,
    isValidGanttColor,
    normalizeGanttDesignSettings,
    normalizeGanttMilestones,
    normalizeGanttData,
    normalizeGanttTask,
} from '../utils/ganttData';
import { confirmToast } from '../utils/confirmToast';
import GanttChart from './GanttChart';

const TABS = [
    { id: 'basic', label: 'הגדרות בסיס' },
    { id: 'manage', label: 'ניהול הגאנט' },
    { id: 'design', label: 'עיצוב הגאנט' },
    { id: 'preview', label: 'תצוגה מקדימה' },
];

const GROUP_BY_OPTIONS = [
    { value: 'category', label: 'לפי תחום' },
    { value: 'owner', label: 'לפי אחראי' },
    { value: 'status', label: 'לפי סטטוס' },
    { value: 'none', label: 'ללא קיבוץ' },
];

const TASK_SORT_OPTIONS = [
    { value: 'date', label: 'לפי תאריך' },
    { value: 'title', label: 'לפי שם' },
    { value: 'status', label: 'לפי סטטוס' },
    { value: 'progress', label: 'לפי התקדמות' },
];

const DESIGN_SELECT_OPTIONS = {
    layoutMode: [
        { value: 'fullWidth', label: 'רוחב מלא' },
        { value: 'centered', label: 'כרטיס ממורכז' },
    ],
    chartWidthMode: [
        { value: 'full', label: 'מלא' },
        { value: 'contained', label: 'תחום וממורכז' },
    ],
    chartHeightMode: [
        { value: 'auto', label: 'גובה אוטומטי' },
        { value: 'viewport', label: 'לפי המסך' },
        { value: 'fixed', label: 'גובה קבוע' },
        { value: 'compact', label: 'קומפקטי' },
    ],
    density: [
        { value: 'compact', label: 'קומפקטי' },
        { value: 'comfortable', label: 'רגיל' },
        { value: 'spacious', label: 'מרווח' },
    ],
    taskColumnWidth: [
        { value: 'narrow', label: 'צר' },
        { value: 'medium', label: 'בינוני' },
        { value: 'wide', label: 'רחב' },
    ],
    cardStyle: [
        { value: 'soft', label: 'רך' },
        { value: 'clean', label: 'נקי' },
        { value: 'minimal', label: 'מינימלי' },
        { value: 'glass', label: 'זכוכית' },
    ],
    backgroundStyle: [
        { value: 'site', label: 'רקע האתר' },
        { value: 'clean', label: 'בהיר נקי' },
        { value: 'subtle', label: 'עדין' },
        { value: 'glass', label: 'זכוכית' },
    ],
    toolbarStyle: [
        { value: 'compact', label: 'קומפקטי' },
        { value: 'comfortable', label: 'רגיל' },
        { value: 'sticky', label: 'דביק' },
    ],
    gridStyle: [
        { value: 'minimal', label: 'מינימלי' },
        { value: 'subtle', label: 'עדין' },
        { value: 'strong', label: 'מודגש' },
    ],
    barStyle: [
        { value: 'rounded', label: 'מעוגל' },
        { value: 'flat', label: 'שטוח' },
    ],
    milestoneStyle: [
        { value: 'diamond', label: 'יהלום' },
        { value: 'dot', label: 'נקודה' },
        { value: 'flag', label: 'דגל' },
    ],
    legendPlacement: [
        { value: 'bottom', label: 'למטה' },
        { value: 'top', label: 'למעלה' },
        { value: 'hidden', label: 'מוסתר' },
    ],
    todayLineStyle: [
        { value: 'soft', label: 'עדין' },
        { value: 'strong', label: 'מודגש' },
        { value: 'minimal', label: 'מינימלי' },
    ],
};

const statusMeta = {
    planned: { label: 'מתוכנן', className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-200' },
    blocked: { label: 'חסום', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' },
    completed: { label: 'הושלם', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
    cancelled: { label: 'בוטל', className: 'border-gray-300 bg-gray-100 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300' },
    onHold: { label: 'בהמתנה', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' },
};

const timingMeta = {
    upcoming: { label: 'עתידי', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200' },
    active: { label: 'פעיל', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
    overdue: { label: 'מאחר', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' },
    completed: { label: 'הושלם', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
    cancelled: { label: 'בוטל', className: 'border-gray-300 bg-gray-100 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300' },
    ended: { label: 'הסתיים', className: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300' },
    invalidDate: { label: 'תאריך לא תקין', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' },
};

const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#1e212b] dark:text-white dark:focus:border-primary/50 dark:focus:ring-primary/20';
const labelCls = 'mb-1.5 block text-xs font-bold text-gray-600 dark:text-gray-300';
const panelCls = 'rounded-[32px] border border-gray-200 bg-white/90 shadow-sm dark:border-white/10 dark:bg-white/[0.04]';
const compactCardCls = 'rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1b1f2a]';
const headerCellCls = 'px-4 py-3 align-middle text-xs font-black text-gray-500 dark:text-gray-300';
const bodyCellCls = 'px-4 py-3 align-middle text-sm text-gray-700 dark:text-gray-200';

function reorderByDate(items) {
    return [...items].sort((a, b) => {
        const aDate = Date.parse(`${a.startDate}T00:00:00`);
        const bDate = Date.parse(`${b.startDate}T00:00:00`);
        return (Number.isFinite(aDate) ? aDate : 0) - (Number.isFinite(bDate) ? bDate : 0);
    });
}

function compareText(a, b) {
    return String(a || '').localeCompare(String(b || ''), 'he');
}

function formatDate(value) {
    if (!value) return '-';
    try {
        return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(`${value}T00:00:00`));
    } catch {
        return value;
    }
}

function createCategory(name, color, order) {
    return {
        id: `gantt-category-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: String(name || '').trim() || 'כללי',
        color: isValidGanttColor(color) ? color : GANTT_COLOR_OPTIONS[0],
        order: Number.isFinite(Number(order)) ? Math.max(0, Math.round(Number(order))) : 1,
    };
}

function getNextCategoryOrder(categories) {
    return categories.reduce((max, category) => Math.max(max, Number(category.order) || 0), 0) + 1;
}

function getCategoryColor(categories, categoryName, fallback) {
    return categories.find((category) => category.name === categoryName)?.color || fallback || GANTT_COLOR_OPTIONS[0];
}

function sortTasks(items, sortBy) {
    const next = [...items];
    if (sortBy === 'title') return next.sort((a, b) => compareText(a.title, b.title));
    if (sortBy === 'status') return next.sort((a, b) => compareText(statusMeta[a.status]?.label, statusMeta[b.status]?.label));
    if (sortBy === 'progress') return next.sort((a, b) => computeGanttProgress(b) - computeGanttProgress(a));
    return reorderByDate(next);
}

function TaskBadges({ task }) {
    const status = statusMeta[task.status] || statusMeta.planned;
    const timing = timingMeta[computeGanttTimeStatus(task)] || timingMeta.invalidDate;
    return (
        <div className="flex flex-wrap items-center gap-1">
            <GanttPill className={status.className}>{status.label}</GanttPill>
            <GanttPill className={timing.className}>{timing.label}</GanttPill>
        </div>
    );
}

function GanttPill({ children, className = '' }) {
    return (
        <span className={`inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-black leading-none ${className}`}>
            {children}
        </span>
    );
}

function ProgressMeter({ value }) {
    const progress = Math.min(100, Math.max(0, Number(value) || 0));
    return (
        <div className="mx-auto w-[86px]">
            <div className="mb-0.5 text-center text-xs font-black text-gray-700 dark:text-gray-200">{progress}%</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-300 dark:bg-white/20">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
        </div>
    );
}

function ToggleSwitch({ checked, onChange, label }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className="inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm transition hover:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
        >
            <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/20'}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? '-translate-x-5' : '-translate-x-1'}`} />
            </span>
            <span>{label}</span>
        </button>
    );
}

function IconButton({ label, onClick, children, danger = false }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-gray-500 transition hover:border-gray-200 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:text-gray-300 dark:hover:border-white/10 dark:hover:bg-white/5 ${
                danger ? 'hover:text-red-600 dark:hover:text-red-300' : 'hover:text-primary'
            }`}
        >
            {children}
        </button>
    );
}

function AssigneeCell({ task, onAssign }) {
    if (task.owner) {
        return (
            <span className="block truncate text-gray-600 dark:text-gray-300" title={task.owner}>
                {task.owner}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={onAssign}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-500 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
            title="לא שויך אחראי"
            aria-label="הוסף אחראי למשימה"
        >
            <UserRound size={13} />
            + אחראי
        </button>
    );
}

function MetricCard({ label, value, caption }) {
    return (
        <div className="rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
            <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{label}</div>
            <div className="mt-2 text-2xl font-black text-gray-900 dark:text-white">{value}</div>
            <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{caption}</div>
        </div>
    );
}

function TaskModal({ modal, categories, onClose, onSubmit, onChange }) {
    const form = modal?.form;
    if (!form) return null;
    const milestones = normalizeGanttMilestones(form.milestones);
    const updateMilestones = (nextMilestones) => onChange({ milestones: normalizeGanttMilestones(nextMilestones) });
    const createMilestoneId = (nextOrder) => {
        const baseId = String(form.id || 'gantt-task').replace(/[^a-zA-Z0-9_-]/g, '-');
        let suffix = nextOrder;
        let candidate = `${baseId}-milestone-${suffix}`;
        while (milestones.some((milestone) => milestone.id === candidate)) {
            suffix += 1;
            candidate = `${baseId}-milestone-${suffix}`;
        }
        return candidate;
    };
    const addMilestone = () => {
        const nextOrder = milestones.length + 1;
        updateMilestones([
            ...milestones,
            {
                id: createMilestoneId(nextOrder),
                title: `אבן דרך ${nextOrder}`,
                date: form.endDate || form.startDate,
                order: nextOrder,
            },
        ]);
    };
    const updateMilestone = (milestoneId, patch) => {
        updateMilestones(milestones.map((milestone) => (
            milestone.id === milestoneId ? { ...milestone, ...patch } : milestone
        )));
    };
    const removeMilestone = (milestoneId) => {
        updateMilestones(milestones.filter((milestone) => milestone.id !== milestoneId));
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-[34px] border border-gray-200 bg-gray-50 shadow-[0_28px_80px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-[#151922]">
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                    <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                            {modal.mode === 'edit' ? 'עריכה' : 'הוספה'}
                        </div>
                        <h2 className="mt-2 text-2xl font-black text-gray-900 dark:text-white">
                            {modal.mode === 'edit' ? form.title || 'עריכת משימה' : 'הוספת משימה'}
                        </h2>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            כל פרטי המשימה נערכים כאן, בלי להעמיס על רשימת הגאנט.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
                        aria-label="סגור"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="min-h-0 overflow-y-auto p-6">
                    {modal.error && (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                            {modal.error}
                        </div>
                    )}

                    <datalist id="gantt-category-options">
                        {categories.map((category) => (
                            <option key={category.id} value={category.name} />
                        ))}
                    </datalist>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <label className={compactCardCls}>
                            <span className={labelCls}>שם משימה</span>
                            <input className={inputCls} value={form.title} onChange={(event) => onChange({ title: event.target.value })} autoFocus />
                        </label>
                        <label className={compactCardCls}>
                            <span className={labelCls}>תחום / קטגוריה</span>
                            <input
                                list="gantt-category-options"
                                className={inputCls}
                                value={form.category}
                                onChange={(event) => {
                                    const category = categories.find((item) => item.name === event.target.value);
                                    onChange({
                                        category: event.target.value,
                                        ...(category ? { color: category.color } : {}),
                                    });
                                }}
                            />
                        </label>
                        <label className={compactCardCls}>
                            <span className={labelCls}>תאריך התחלה</span>
                            <input type="date" className={inputCls} value={form.startDate} onChange={(event) => onChange({ startDate: event.target.value })} />
                        </label>
                        <label className={compactCardCls}>
                            <span className={labelCls}>תאריך סיום</span>
                            <input type="date" className={inputCls} value={form.endDate} onChange={(event) => onChange({ endDate: event.target.value })} />
                        </label>
                        <label className={compactCardCls}>
                            <span className={labelCls}>אחראי</span>
                            <input className={inputCls} value={form.owner} onChange={(event) => onChange({ owner: event.target.value })} placeholder="שם אחראי או צוות" />
                        </label>
                        <label className={compactCardCls}>
                            <span className={labelCls}>סטטוס עבודה</span>
                            <select className={inputCls} value={form.status} onChange={(event) => onChange({ status: event.target.value })}>
                                {GANTT_STATUS_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <label className={compactCardCls}>
                            <span className={labelCls}>צבע</span>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={isValidGanttColor(form.color) ? form.color : GANTT_COLOR_OPTIONS[0]}
                                    onChange={(event) => onChange({ color: event.target.value })}
                                    className="h-10 w-12 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-[#232733]"
                                    aria-label="בחר צבע"
                                />
                                <input
                                    className={`${inputCls} font-mono text-left`}
                                    dir="ltr"
                                    value={form.color}
                                    onChange={(event) => onChange({ color: event.target.value })}
                                />
                            </div>
                        </label>
                        <label className={`${compactCardCls} lg:col-span-2`}>
                            <span className={labelCls}>פירוט / הערות</span>
                            <textarea
                                className={`${inputCls} min-h-[92px] resize-y leading-6`}
                                value={form.details}
                                onChange={(event) => onChange({ details: event.target.value })}
                                placeholder="מידע קצר שיוצג למנהלים או כטולטיפ בתרשים"
                            />
                        </label>
                    </div>

                    <section className="mt-5 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#202532]">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">אבני דרך</h3>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">סמן נקודות משמעותיות על ציר הזמן של המשימה.</p>
                            </div>
                            <button
                                type="button"
                                onClick={addMilestone}
                                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
                            >
                                <Plus size={15} />
                                הוסף אבן דרך
                            </button>
                        </div>

                        {milestones.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-sm text-gray-500 dark:border-white/20 dark:text-gray-400">
                                אין אבני דרך למשימה זו.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {milestones.map((milestone) => (
                                    <div key={milestone.id} className="grid gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-[#1b1f2a] md:grid-cols-[64px_minmax(0,1fr)_160px_40px] md:items-end">
                                        <div>
                                            <span className={labelCls}>מס׳</span>
                                            <div className="flex h-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-sm font-black text-primary">
                                                {milestone.order}
                                            </div>
                                        </div>
                                        <label>
                                            <span className={labelCls}>שם אבן דרך</span>
                                            <input className={inputCls} value={milestone.title} onChange={(event) => updateMilestone(milestone.id, { title: event.target.value })} />
                                        </label>
                                        <label>
                                            <span className={labelCls}>תאריך</span>
                                            <input type="date" className={inputCls} value={milestone.date} onChange={(event) => updateMilestone(milestone.id, { date: event.target.value })} />
                                        </label>
                                        <div className="flex justify-end">
                                            <IconButton label="מחק אבן דרך" onClick={() => removeMilestone(milestone.id)} danger>
                                                <Trash2 size={15} />
                                            </IconButton>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-5 dark:border-white/10">
                        <div className="text-xs font-bold text-gray-500 dark:text-gray-400">
                            התקדמות וסטטוס זמנים מחושבים אוטומטית לפי תאריכי המשימה.
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="rounded-2xl border border-gray-300 bg-white px-5 py-3 font-bold text-gray-800 transition hover:bg-gray-100 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                            >
                                ביטול
                            </button>
                            <button
                                type="submit"
                                className="rounded-2xl bg-primary px-6 py-3 font-bold text-white transition hover:brightness-110"
                            >
                                {modal.mode === 'edit' ? 'עדכן משימה' : 'הוסף משימה'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function AdminGantt() {
    const navigate = useNavigate();
    const { gantt, loading, saving, error, saveGantt, reloadGantt } = useGantt();
    const [draft, setDraft] = useState(() => cloneGanttData(gantt));
    const [activeTab, setActiveTab] = useState('basic');
    const [taskModal, setTaskModal] = useState(null);
    const [categoryForm, setCategoryForm] = useState({ name: '', color: GANTT_COLOR_OPTIONS[0], order: '' });
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [taskSearch, setTaskSearch] = useState('');
    const [taskStatusFilter, setTaskStatusFilter] = useState('all');
    const [taskCategoryFilter, setTaskCategoryFilter] = useState('all');
    const [taskSort, setTaskSort] = useState('date');
    const [autoSaveState, setAutoSaveState] = useState('saved');
    const savedSnapshotRef = useRef(JSON.stringify(normalizeGanttData(gantt)));
    const draftSnapshotRef = useRef(JSON.stringify(normalizeGanttData(gantt)));

    useEffect(() => {
        const incomingSnapshot = JSON.stringify(normalizeGanttData(gantt));
        setDraft((currentDraft) => {
            const currentSnapshot = JSON.stringify(normalizeGanttData(currentDraft));
            const hasLocalEdits = currentSnapshot !== savedSnapshotRef.current && currentSnapshot !== incomingSnapshot;
            savedSnapshotRef.current = incomingSnapshot;
            return hasLocalEdits ? currentDraft : cloneGanttData(gantt);
        });
    }, [gantt]);

    const normalizedDraftString = useMemo(() => JSON.stringify(normalizeGanttData(draft)), [draft]);
    const normalizedSavedString = useMemo(() => JSON.stringify(normalizeGanttData(gantt)), [gantt]);
    const isDirty = normalizedDraftString !== normalizedSavedString;

    useEffect(() => {
        draftSnapshotRef.current = normalizedDraftString;
    }, [normalizedDraftString]);

    const categoryOptions = useMemo(
        () => [...draft.categories].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he')),
        [draft.categories]
    );

    const visibleTasks = useMemo(() => {
        const query = taskSearch.trim().toLowerCase();
        const filtered = draft.items.filter((task) => {
            if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) return false;
            if (taskCategoryFilter !== 'all' && task.category !== taskCategoryFilter) return false;
            if (!query) return true;
            return [task.title, task.owner, task.category, task.details]
                .some((value) => String(value || '').toLowerCase().includes(query));
        });
        return sortTasks(filtered, taskSort);
    }, [draft.items, taskCategoryFilter, taskSearch, taskSort, taskStatusFilter]);

    const lateCount = useMemo(
        () => draft.items.filter((task) => computeGanttTimeStatus(task) === 'overdue').length,
        [draft.items]
    );

    const designSettings = useMemo(
        () => normalizeGanttDesignSettings(draft.settings?.design),
        [draft.settings?.design]
    );

    const updateDraft = (updater) => {
        setAutoSaveState((prev) => (prev === 'error' ? 'saved' : prev));
        setDraft((prev) => normalizeGanttData(typeof updater === 'function' ? updater(prev) : { ...prev, ...updater }));
    };

    const updateDesign = (patch) => {
        updateDraft((prev) => ({
            ...prev,
            settings: {
                ...(prev.settings || {}),
                design: normalizeGanttDesignSettings({
                    ...(prev.settings?.design || {}),
                    ...patch,
                }),
            },
        }));
    };

    const updateDesignColors = (patch) => {
        updateDraft((prev) => ({
            ...prev,
            settings: {
                ...(prev.settings || {}),
                design: normalizeGanttDesignSettings({
                    ...(prev.settings?.design || {}),
                    colors: {
                        ...(prev.settings?.design?.colors || {}),
                        ...patch,
                    },
                }),
            },
        }));
    };

    const savePayload = useCallback(async (payload) => {
        const normalizedPayload = normalizeGanttData(payload);
        const payloadSnapshot = JSON.stringify(normalizedPayload);
        setAutoSaveState('saving');
        try {
            const saved = await saveGantt(normalizedPayload);
            savedSnapshotRef.current = JSON.stringify(normalizeGanttData(saved));
            setAutoSaveState(draftSnapshotRef.current === payloadSnapshot ? 'saved' : 'pending');
            return true;
        } catch (saveError) {
            setAutoSaveState('error');
            toast.error(saveError?.message || 'שמירה אוטומטית של הגאנט נכשלה');
            return false;
        }
    }, [saveGantt]);

    useEffect(() => {
        if (loading || !isDirty) return undefined;

        const payload = normalizeGanttData(draft);
        const timer = window.setTimeout(() => {
            savePayload(payload);
        }, 900);

        return () => window.clearTimeout(timer);
    }, [draft, isDirty, loading, savePayload]);

    const selectDesignPreset = (presetId) => {
        updateDraft((prev) => ({
            ...prev,
            settings: {
                ...(prev.settings || {}),
                design: applyGanttDesignPreset(presetId),
            },
        }));
    };

    const openAddTask = () => {
        const firstCategory = categoryOptions[0];
        setTaskModal({
            mode: 'add',
            form: createGanttTask({
                id: `gantt-${Date.now()}`,
                category: firstCategory?.name || 'כללי',
                color: firstCategory?.color || GANTT_COLOR_OPTIONS[0],
            }),
            error: '',
        });
    };

    const openEditTask = (task) => {
        setTaskModal({ mode: 'edit', taskId: task.id, form: { ...task }, error: '' });
    };

    const updateTaskModal = (patch) => {
        setTaskModal((prev) => (prev ? { ...prev, error: '', form: { ...prev.form, ...patch } } : prev));
    };

    const ensureTaskCategory = (categories, task) => {
        const categoryName = String(task.category || 'כללי').trim() || 'כללי';
        if (categories.some((category) => category.name === categoryName)) return categories;
        return [
            ...categories,
            createCategory(categoryName, task.color, getNextCategoryOrder(categories)),
        ];
    };

    const validateTask = (task) => {
        if (!String(task.title || '').trim()) return 'שם משימה הוא שדה חובה.';
        if (!task.startDate) return 'תאריך התחלה הוא שדה חובה.';
        if (!task.endDate) return 'תאריך סיום הוא שדה חובה.';
        if (Date.parse(`${task.endDate}T00:00:00`) < Date.parse(`${task.startDate}T00:00:00`)) return 'תאריך הסיום לא יכול להיות לפני תאריך ההתחלה.';
        if (!isValidGanttColor(task.color)) return 'צבע המשימה חייב להיות ערך HEX תקין.';
        const milestones = Array.isArray(task.milestones) ? task.milestones : [];
        const invalidMilestone = milestones.find((milestone) => !String(milestone.title || '').trim() || !milestone.date);
        if (invalidMilestone) return 'כל אבן דרך חייבת לכלול שם ותאריך.';
        return '';
    };

    const submitTaskModal = (event) => {
        event.preventDefault();
        if (!taskModal) return;

        const validationError = validateTask(taskModal.form);
        if (validationError) {
            setTaskModal((prev) => ({ ...prev, error: validationError }));
            return;
        }

        const normalizedTask = normalizeGanttTask({
            ...taskModal.form,
        }, draft.items.length);

        updateDraft((prev) => {
            const nextItems = taskModal.mode === 'edit'
                ? prev.items.map((item) => (item.id === taskModal.taskId ? normalizedTask : item))
                : [...prev.items, normalizedTask];
            return {
                ...prev,
                categories: ensureTaskCategory(prev.categories, normalizedTask),
                items: nextItems,
            };
        });
        setTaskModal(null);
    };

    const duplicateTask = (task) => {
        const nextTask = createGanttTask({
            ...task,
            id: `gantt-${Date.now()}`,
            title: `${task.title} - עותק`,
        });
        updateDraft((prev) => ({
            ...prev,
            categories: ensureTaskCategory(prev.categories, nextTask),
            items: [...prev.items, nextTask],
        }));
    };

    const removeTask = async (taskId) => {
        const confirmed = await confirmToast({
            title: 'מחיקת משימה',
            message: 'האם למחוק את המשימה מהגאנט?',
            confirmText: 'מחק',
            cancelText: 'ביטול',
            type: 'warning',
        });
        if (!confirmed) return;
        updateDraft((prev) => ({
            ...prev,
            items: prev.items.filter((item) => item.id !== taskId),
        }));
    };

    const addCategory = () => {
        const name = categoryForm.name.trim();
        if (!name) {
            toast.error('יש להזין שם תחום.');
            return;
        }
        if (categoryOptions.some((category) => category.name === name)) {
            toast.error('תחום בשם הזה כבר קיים.');
            return;
        }
        if (!isValidGanttColor(categoryForm.color)) {
            toast.error('צבע התחום חייב להיות ערך HEX תקין.');
            return;
        }

        updateDraft((prev) => ({
            ...prev,
            categories: [
                ...prev.categories,
                createCategory(name, categoryForm.color, categoryForm.order || getNextCategoryOrder(prev.categories)),
            ],
        }));
        setCategoryForm({ name: '', color: GANTT_COLOR_OPTIONS[0], order: '' });
        setIsAddingCategory(false);
    };

    const cancelAddCategory = () => {
        setCategoryForm({ name: '', color: GANTT_COLOR_OPTIONS[0], order: '' });
        setIsAddingCategory(false);
    };

    const updateCategory = (categoryId, patch) => {
        updateDraft((prev) => {
            const previousCategory = prev.categories.find((category) => category.id === categoryId);
            const nextCategories = prev.categories.map((category) => (
                category.id === categoryId ? { ...category, ...patch } : category
            ));
            const nextName = nextCategories.find((category) => category.id === categoryId)?.name;
            const nextItems = previousCategory && nextName
                ? prev.items.map((item) => (item.category === previousCategory.name ? { ...item, category: nextName } : item))
                : prev.items;
            return { ...prev, categories: nextCategories, items: nextItems };
        });
    };

    const removeCategory = async (category) => {
        const usedCount = draft.items.filter((item) => item.category === category.name).length;
        const confirmed = await confirmToast({
            title: 'מחיקת תחום',
            message: usedCount > 0
                ? `התחום משויך ל-${usedCount} משימות. למחוק ולהעביר אותן ל"כללי"?`
                : 'האם למחוק את התחום?',
            confirmText: 'מחק',
            cancelText: 'ביטול',
            type: 'warning',
        });
        if (!confirmed) return;

        updateDraft((prev) => ({
            ...prev,
            categories: prev.categories.filter((item) => item.id !== category.id),
            items: prev.items.map((item) => (
                item.category === category.name
                    ? { ...item, category: 'כללי', color: getCategoryColor(prev.categories, 'כללי', item.color) }
                    : item
            )),
        }));
    };

    const openPublicPage = async () => {
        if (isDirty) {
            const saved = await savePayload(draft);
            if (!saved) return;
        }
        navigate('/gantt');
    };

    const reset = async () => {
        await reloadGantt();
        setTaskModal(null);
        toast.info('הגאנט נטען מחדש');
    };

    const autoSaveLabel = (() => {
        if (saving || autoSaveState === 'saving') return 'שומר אוטומטית...';
        if (autoSaveState === 'error') return 'שגיאה בשמירה אוטומטית';
        if (isDirty) return 'ממתין לשמירה אוטומטית';
        return 'נשמר אוטומטית';
    })();

    const autoSaveClassName = autoSaveState === 'error'
        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200';

    const renderAutoSaveStatus = (compact = false) => (
        <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black ${autoSaveClassName}`}>
            {(saving || autoSaveState === 'saving') && <Loader2 size={13} className="animate-spin" />}
            {!compact && autoSaveLabel}
            {compact && (autoSaveState === 'error' ? 'שגיאת שמירה' : 'שמירה אוטומטית')}
        </span>
    );

    const renderBasicTab = () => (
        <div className="space-y-6">
            {/* <section className={`${panelCls} overflow-hidden`}>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 dark:text-white">הגדרות בסיס</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הגדרות כלליות לעמוד הגאנט ולכפתור הציבורי, עם תצוגה חיה בצד.</p>
                    </div>
                    <ToggleSwitch
                        checked={draft.enabled}
                        onChange={(enabled) => updateDraft({ enabled })}
                        label={draft.enabled ? 'מוצג באתר' : 'לא מוצג באתר'}
                    />
                </div>
            </section> */}

            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:[direction:ltr]">
                {renderLivePreviewPanel({
                    title: 'תצוגה חיה',
                    description: 'כל שינוי בהגדרות הבסיס מתעדכן כאן מיד.',
                    badge: draft.enabled ? 'מוצג באתר' : 'כבוי',
                    className: 'order-1 xl:sticky xl:top-[156px] xl:flex-1',
                })}

                <section dir="rtl" className={`${panelCls} order-2 min-w-0 overflow-hidden xl:w-[520px] xl:shrink-0 2xl:w-[580px]`}>
                    <div className="border-b border-gray-200 px-5 m-4 dark:border-white/10">
                        <h3 className="text-xl font-black text-gray-900 dark:text-white">הגדרות בסיס</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הפעלה, טקסטים ותצוגת ברירת מחדל של הגאנט.</p>
                    </div>

                    <div className="max-h-none space-y-4 p-5 xl:max-h-[calc(100dvh-220px)] xl:overflow-y-auto xl:pr-5 custom-scrollbar">
                        {renderSettingGroup('הפעלה וכפתור', 'כאשר הגאנט כבוי, הכפתור הציבורי לא יוצג והעמוד הציבורי יציג מצב לא פעיל.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className={`${compactCardCls} sm:col-span-2 flex items-center justify-between gap-2`}>
                                    <label className="text-sm font-bold text-gray-700 dark:text-gray-200"> סווויצ׳ להפעלת הדף </label>
                                    <ToggleSwitch
                                        checked={draft.enabled}
                                        onChange={(enabled) => updateDraft({ enabled })}
                                        label={draft.enabled ? 'הדף פעיל' : 'הדף כבוי'}
                                    />
                                </div>
                                <label className={compactCardCls}>
                                    <span className={labelCls}>שם הכפתור בדף הבית</span>
                                    <input className={inputCls} value={draft.buttonLabel} onChange={(event) => updateDraft({ buttonLabel: event.target.value })} placeholder="גאנט עבודה" />
                                </label>
                                <label className={compactCardCls}>
                                    <span className={labelCls}>שם העמוד</span>
                                    <input className={inputCls} value={draft.pageTitle} onChange={(event) => updateDraft({ pageTitle: event.target.value })} placeholder="גאנט עבודה" />
                                </label>
                            </div>
                        ))}

                        {renderSettingGroup('תוכן קצר', 'הטקסטים שמופיעים סביב תרשים הגאנט בעמוד הציבורי.', (
                            <div className="grid gap-3">
                                <label className={compactCardCls}>
                                    <span className={labelCls}>תיאור קצר</span>
                                    <input className={inputCls} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="תיאור שיוצג בראש העמוד הציבורי" />
                                </label>
                            </div>
                        ))}

                        {renderSettingGroup('תצוגת ברירת מחדל', 'בחירת מצב הפתיחה והקיבוץ הראשוני של התרשים.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className={compactCardCls}>
                                    <span className={labelCls}>תצוגת ברירת מחדל</span>
                                    <select className={inputCls} value={draft.defaultView} onChange={(event) => updateDraft({ defaultView: event.target.value })}>
                                        {GANTT_VIEW_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                </label>
                                <label className={compactCardCls}>
                                    <span className={labelCls}>קיבוץ ברירת מחדל</span>
                                    <select className={inputCls} value={draft.groupBy} onChange={(event) => updateDraft({ groupBy: event.target.value })}>
                                        {GROUP_BY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                    </select>
                                </label>
                            </div>
                        ))}

                        {renderSettingGroup('רכיבי תצוגה', 'הצגה או הסתרה של רכיבים משלימים בתרשים.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <label className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10">
                                    <input type="checkbox" checked={draft.showLegend} onChange={(event) => updateDraft({ showLegend: event.target.checked })} className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10" />
                                    הצג מקרא
                                </label>
                                <label className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-gray-200 dark:bg-white/5 dark:text-gray-200 dark:ring-white/10">
                                    <input type="checkbox" checked={draft.showToday} onChange={(event) => updateDraft({ showToday: event.target.checked })} className="h-4 w-4 rounded-md border border-primary/30 bg-white accent-primary shadow-sm dark:bg-white/10" />
                                    הצג קו היום
                                </label>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );

    const renderCategoryManager = () => {
        const openAddCategory = () => {
            setCategoryForm({ name: '', color: GANTT_COLOR_OPTIONS[0], order: getNextCategoryOrder(categoryOptions) });
            setIsAddingCategory(true);
        };
        const getTaskCount = (categoryName) => draft.items.filter((item) => item.category === categoryName).length;

        return (
            <section className={`${panelCls} overflow-hidden`}>
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">תחומים / קטגוריות</h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ניהול צבעים וסדר הופעה לפי תחום.</p>
                    </div>
                    <button
                        type="button"
                        onClick={openAddCategory}
                        disabled={isAddingCategory}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10"
                    >
                        <Plus size={16} />
                        הוסף תחום
                    </button>
                </div>

                <div className="">
                    {categoryOptions.length === 0 && !isAddingCategory ? (
                        <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-white/20 dark:text-gray-400">
                            עדיין אין תחומים. אפשר להוסיף תחום או ליצור משימה ראשונה.
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {categoryOptions.map((category) => (
                                <article key={category.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 transition hover:border-primary/30 hover:bg-white dark:border-white/10 dark:bg-[#1b1f2a] dark:hover:bg-white/[0.06]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span className="h-4 w-4 shrink-0 rounded-full ring-2 ring-white shadow-sm dark:ring-[#1b1f2a]" style={{ backgroundColor: category.color }} />
                                            <div className="min-w-0">
                                                <input
                                                    className="w-full min-w-0 border-0 bg-transparent p-0 text-base font-black text-gray-900 outline-none focus:text-primary dark:text-white"
                                                    value={category.name}
                                                    onChange={(event) => updateCategory(category.id, { name: event.target.value })}
                                                    aria-label="שם תחום"
                                                />
                                                <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">
                                                    סדר {category.order || 0} · {getTaskCount(category.name)} משימות
                                                </p>
                                            </div>
                                        </div>
                                        <IconButton label="מחק תחום" onClick={() => removeCategory(category)} danger>
                                            <Trash2 size={15} />
                                        </IconButton>
                                    </div>

                                    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                                        <label>
                                            <span className={labelCls}>צבע</span>
                                            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
                                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                                                <input
                                                    type="color"
                                                    className="h-8 w-full min-w-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                                                    value={category.color}
                                                    onChange={(event) => updateCategory(category.id, { color: event.target.value })}
                                                    aria-label="צבע תחום"
                                                />
                                            </div>
                                        </label>
                                        <label>
                                            <span className={labelCls}>סדר</span>
                                            <input
                                                type="number"
                                                min="0"
                                                className={`${inputCls} text-center`}
                                                value={category.order}
                                                onChange={(event) => updateCategory(category.id, { order: event.target.value })}
                                                aria-label="סדר תחום"
                                            />
                                        </label>
                                    </div>
                                </article>
                            ))}

                            {isAddingCategory && (
                                <article className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-4 dark:bg-primary/[0.08]">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h3 className="text-base font-black text-gray-900 dark:text-white">תחום חדש</h3>
                                            <p className="mt-1 text-xs font-bold text-gray-500 dark:text-gray-400">התחום יתווסף לרשימת הקטגוריות.</p>
                                        </div>
                                        <button type="button" onClick={cancelAddCategory} className="rounded-full p-1 text-gray-400 transition hover:bg-white/70 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-white" aria-label="ביטול הוספת תחום">
                                            <X size={16} />
                                        </button>
                                    </div>
                                    <div className="mt-4 grid gap-3">
                                        <label>
                                            <span className={labelCls}>שם תחום</span>
                                            <input className={inputCls} value={categoryForm.name} onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="שם תחום" />
                                        </label>
                                        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-3">
                                            <label>
                                                <span className={labelCls}>צבע</span>
                                                <input type="color" className="h-10 w-full rounded-xl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-[#232733]" value={categoryForm.color} onChange={(event) => setCategoryForm((prev) => ({ ...prev, color: event.target.value }))} />
                                            </label>
                                            <label>
                                                <span className={labelCls}>סדר</span>
                                                <input type="number" min="0" className={`${inputCls} text-center`} value={categoryForm.order} onChange={(event) => setCategoryForm((prev) => ({ ...prev, order: event.target.value }))} placeholder={String(getNextCategoryOrder(categoryOptions))} />
                                            </label>
                                        </div>
                                        <div className="flex justify-end gap-2">
                                            <button type="button" onClick={cancelAddCategory} className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:bg-white/10">
                                                ביטול
                                            </button>
                                            <button type="button" onClick={addCategory} className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-white transition hover:brightness-110">
                                                הוסף תחום
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            )}
                        </div>
                    )}
                </div>
            </section>
        );
    };

    const renderTasksTable = () => (
        <section className={`${panelCls} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">משימות הגאנט</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{draft.items.length} משימות, {visibleTasks.length} מוצגות לפי הסינון הנוכחי.</p>
                </div>
                <button
                    type="button"
                    onClick={openAddTask}
                    className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 font-bold text-white transition hover:brightness-110"
                >
                    <Plus size={16} />
                    הוסף משימה
                </button>
            </div>

            <div className="border-b border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-[#1b1f2a]/70">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_170px_170px_160px_auto]">
                    <label className="relative">
                        <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            className={`${inputCls} pr-9`}
                            value={taskSearch}
                            onChange={(event) => setTaskSearch(event.target.value)}
                            placeholder="חיפוש משימה, אחראי או הערה"
                        />
                    </label>
                    <select className={inputCls} value={taskCategoryFilter} onChange={(event) => setTaskCategoryFilter(event.target.value)} aria-label="סינון לפי תחום">
                        <option value="all">כל התחומים</option>
                        {categoryOptions.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                    </select>
                    <select className={inputCls} value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)} aria-label="סינון לפי סטטוס">
                        <option value="all">כל הסטטוסים</option>
                        {GANTT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <select className={inputCls} value={taskSort} onChange={(event) => setTaskSort(event.target.value)} aria-label="מיון משימות">
                        {TASK_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <button
                        type="button"
                        onClick={() => updateDraft((prev) => ({ ...prev, items: reorderByDate(prev.items) }))}
                        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold transition hover:bg-gray-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                        סדר לפי תאריכים
                    </button>
                </div>
            </div>

            {draft.items.length === 0 ? (
                <div className="m-6 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500 dark:border-white/20 dark:text-gray-400">
                    עדיין אין משימות. אפשר להוסיף משימה ראשונה כדי להתחיל לבנות את הגאנט.
                </div>
            ) : visibleTasks.length === 0 ? (
                <div className="m-6 rounded-2xl border border-dashed border-gray-300 p-10 text-center text-gray-500 dark:border-white/20 dark:text-gray-400">
                    לא נמצאו משימות בהתאם לסינון הנוכחי.
                </div>
            ) : (
                <>
                    <div className="hidden overflow-x-auto lg:block">
                        <table className="w-full min-w-[980px] table-fixed divide-y divide-gray-200 text-right text-sm dark:divide-white/10">
                            <colgroup>
                                <col className="w-[24%]" />
                                <col className="w-[14%]" />
                                <col className="w-[9%]" />
                                <col className="w-[9%]" />
                                <col className="w-[12%]" />
                                <col className="w-[14%]" />
                                <col className="w-[8%]" />
                                <col className="w-[10%]" />
                            </colgroup>
                            <thead className="bg-gray-50 text-xs font-black text-gray-500 dark:bg-[#1e212b] dark:text-gray-300">
                                <tr>
                                    <th className={`${headerCellCls} text-right`}>שם משימה</th>
                                    <th className={`${headerCellCls} text-right`}>תחום / קטגוריה</th>
                                    <th className={`${headerCellCls} text-center`}>התחלה</th>
                                    <th className={`${headerCellCls} text-center`}>סיום</th>
                                    <th className={`${headerCellCls} text-right`}>אחראי</th>
                                    <th className={`${headerCellCls} text-right`}>סטטוס</th>
                                    <th className={`${headerCellCls} text-center`}>%</th>
                                    <th className={`${headerCellCls} text-center`}>פעולות</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                {visibleTasks.map((task) => (
                                    <tr key={task.id} className="transition hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                                        <td className={`${bodyCellCls} text-right`}>
                                            <div className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-gray-200 dark:ring-white/10" style={{ backgroundColor: task.color }} title={task.color} />
                                                {task.milestones.length > 0 && <Diamond size={14} className="shrink-0 text-primary" title={`${task.milestones.length} אבני דרך`} />}
                                                <div className="min-w-0">
                                                    <div className="truncate font-black text-gray-900 dark:text-white" title={task.title}>{task.title}</div>
                                                    <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={task.details || ''}>
                                                        {task.milestones.length > 0 ? `${task.milestones.length} אבני דרך` : (task.details || '')}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className={`${bodyCellCls} text-right`}>
                                            <GanttPill className="max-w-full border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(categoryOptions, task.category, task.color) }} />
                                                <span className="truncate">{task.category}</span>
                                            </GanttPill>
                                        </td>
                                        <td className={`${bodyCellCls} whitespace-nowrap text-center text-gray-600 dark:text-gray-300`}>{formatDate(task.startDate)}</td>
                                        <td className={`${bodyCellCls} whitespace-nowrap text-center text-gray-600 dark:text-gray-300`}>{formatDate(task.endDate)}</td>
                                        <td className={`${bodyCellCls} text-right`}>
                                            <AssigneeCell task={task} onAssign={() => openEditTask(task)} />
                                        </td>
                                        <td className={`${bodyCellCls} text-right`}>
                                            <TaskBadges task={task} />
                                        </td>
                                        <td className={`${bodyCellCls} text-center`}>
                                            <ProgressMeter value={computeGanttProgress(task)} />
                                        </td>
                                        <td className={`${bodyCellCls} text-center`}>
                                            <div className="flex items-center justify-center gap-0.5">
                                                <IconButton label="ערוך משימה" onClick={() => openEditTask(task)}>
                                                    <Edit3 size={15} />
                                                </IconButton>
                                                <IconButton label="שכפל משימה" onClick={() => duplicateTask(task)}>
                                                    <Copy size={15} />
                                                </IconButton>
                                                <IconButton label="מחק משימה" onClick={() => removeTask(task.id)} danger>
                                                    <Trash2 size={15} />
                                                </IconButton>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-3 p-4 lg:hidden">
                        {visibleTasks.map((task) => (
                            <article key={task.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-[#1e212b]">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-gray-200 dark:ring-white/10" style={{ backgroundColor: task.color }} />
                                            {task.milestones.length > 0 && <Diamond size={14} className="shrink-0 text-primary" title={`${task.milestones.length} אבני דרך`} />}
                                            <h3 className="truncate text-base font-black text-gray-900 dark:text-white">{task.title}</h3>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                            <span>{formatDate(task.startDate)} - {formatDate(task.endDate)}</span>
                                            <AssigneeCell task={task} onAssign={() => openEditTask(task)} />
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <GanttPill className="border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(categoryOptions, task.category, task.color) }} />
                                        {task.category}
                                    </GanttPill>
                                    <TaskBadges task={task} />
                                </div>
                                <div className="mt-4">
                                            <ProgressMeter value={computeGanttProgress(task)} />
                                </div>
                                <div className="mt-4 flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-white/10">
                                    <button type="button" onClick={() => openEditTask(task)} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200" aria-label="ערוך משימה">
                                        <Edit3 size={14} />
                                        ערוך
                                    </button>
                                    <button type="button" onClick={() => duplicateTask(task)} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200" aria-label="שכפל משימה">
                                        <Copy size={14} />
                                        שכפל
                                    </button>
                                    <button type="button" onClick={() => removeTask(task.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition hover:border-red-200 hover:text-red-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-200 dark:hover:border-red-500/30 dark:hover:text-red-300" aria-label="מחק משימה">
                                        <Trash2 size={14} />
                                        מחק
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                </>
            )}
        </section>
    );

    const renderManageTab = () => (
        <div className="space-y-6">
            <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <MetricCard label="משימות" value={draft.items.length} caption="סך המשימות בגאנט" />
                <MetricCard label="תחומים" value={categoryOptions.length} caption="קטגוריות פעילות" />
                <MetricCard label="באיחור" value={lateCount} caption="משימות שעברו את תאריך הסיום" />
            </section>
            {renderTasksTable()}
            {renderCategoryManager()}
        </div>
    );

    const renderDesignSelect = (label, field) => (
        <label className={compactCardCls}>
            <span className={labelCls}>{label}</span>
            <select className={inputCls} value={designSettings[field]} onChange={(event) => updateDesign({ [field]: event.target.value })}>
                {DESIGN_SELECT_OPTIONS[field].map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                ))}
            </select>
        </label>
    );

    const renderDesignColor = (label, field) => (
        <label className={compactCardCls}>
            <span className={labelCls}>{label}</span>
            <div className="flex items-center gap-2">
                <input
                    type="color"
                    className="h-10 w-12 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-[#232733]"
                    value={designSettings.colors[field]}
                    onChange={(event) => updateDesignColors({ [field]: event.target.value })}
                    aria-label={label}
                />
                <input
                    className={`${inputCls} font-mono text-left`}
                    dir="ltr"
                    value={designSettings.colors[field]}
                    onChange={(event) => updateDesignColors({ [field]: event.target.value })}
                />
            </div>
        </label>
    );

    const renderSettingGroup = (title, description, children) => (
        <section className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 shadow-sm dark:border-white/10 dark:bg-[#1b1f2a]/80">
            <div className="mb-4">
                <h4 className="text-base font-black text-gray-900 dark:text-white">{title}</h4>
                {description && <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>}
            </div>
            {children}
        </section>
    );

    const renderLivePreviewPanel = ({ title = 'תצוגה חיה', description, badge, className = '' } = {}) => (
        <section dir="rtl" data-gantt-live-preview className={`${panelCls} min-w-0 overflow-hidden ${className}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/10">
                <div>
                    <h3 className="text-xl font-black text-gray-900 dark:text-white">{title}</h3>
                    {description && <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</p>}
                </div>
                {badge && (
                    <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                        {badge}
                    </span>
                )}
            </div>
            <div className="p-3 sm:p-5">
                <div className="flex h-[clamp(460px,calc(100dvh-300px),760px)] min-h-[460px] min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#1b1f2a]">
                    <div className="shrink-0 border-b border-gray-200 bg-white/90 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-gray-500 dark:text-gray-400">
                                    <span className="truncate">האתר</span>
                                    <span className="text-gray-300 dark:text-gray-600">|</span>
                                    <span className="truncate text-gray-900 dark:text-white">{draft.pageTitle || 'גאנט'}</span>
                                </div>
                                {draft.description ? (
                                    <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-gray-500 dark:text-gray-400">{draft.description}</p>
                                ) : (
                                    <p className="mt-1 text-xs font-bold leading-5 text-gray-400 dark:text-gray-500">תיאור קצר יוצג כאן בזמן אמת.</p>
                                )}
                            </div>
                            <span className="inline-flex max-w-full items-center rounded-xl border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                                <span className="truncate">{draft.buttonLabel || draft.pageTitle || 'גאנט'}</span>
                            </span>
                        </div>
                    </div>
                    <div className="min-h-0 flex-1">
                        <GanttChart data={draft} viewportHeight="100%" className="border-0 shadow-none" />
                    </div>
                </div>
            </div>
        </section>
    );

    const renderPresetMiniPreview = (preset) => {
        const design = applyGanttDesignPreset(preset.id);
        const isGlass = design.cardStyle === 'glass';
        const isCompact = design.density === 'compact';
        return (
            <div className={`mt-4 rounded-xl border p-3 ${isGlass ? 'border-white/60 bg-white/60 backdrop-blur' : 'border-gray-200 bg-white'} ${preset.id === 'classic-beige' ? 'bg-amber-50' : ''}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="h-2 w-14 rounded-full" style={{ backgroundColor: design.colors.accentColor }} />
                    <span className="h-2 w-8 rounded-full bg-gray-200" />
                </div>
                <div className="space-y-1.5">
                    {[0, 1, 2].map((item) => (
                        <div key={item} className="grid grid-cols-[70px_minmax(0,1fr)] items-center gap-2">
                            <span className="h-2 rounded-full bg-gray-200" />
                            <span className={`${isCompact ? 'h-2' : 'h-3'} rounded-full`} style={{ width: `${55 + item * 12}%`, backgroundColor: item === 1 ? '#16a34a' : design.colors.accentColor }} />
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const renderDesignTab = () => (
        <div className="space-y-6">
            <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:[direction:ltr]">
                {renderLivePreviewPanel({
                    title: 'תצוגה חיה',
                    description: 'כל שינוי מימין מתעדכן כאן מיד ברכיב הגאנט האמיתי.',
                    badge: GANTT_DESIGN_PRESETS.find((preset) => preset.id === designSettings.presetId)?.name || 'עיצוב מותאם',
                    className: 'order-1 xl:sticky xl:top-[156px] xl:flex-1',
                })}

                <section dir="rtl" data-gantt-design-pane="settings" className={`${panelCls} order-2 min-w-0 overflow-hidden xl:w-[560px] xl:shrink-0 2xl:w-[640px]`}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-white/10">
                        <div>
                            <h3 className="text-xl font-black text-gray-900 dark:text-white">הגדרות עיצוב</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">בחרו פריסט ואז כווננו ידנית צבעים, צפיפות, מקרא, פסים ואבני דרך.</p>
                        </div>
                        <button type="button" onClick={() => selectDesignPreset('classic-beige')} className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                            איפוס לעיצוב ברירת מחדל
                        </button>
                    </div>

                    <div className="max-h-none space-y-4 p-5 xl:max-h-[calc(100dvh-220px)] xl:overflow-y-auto xl:pr-5 custom-scrollbar">
                        {renderSettingGroup('עיצובים מוכנים', 'בחירה בעיצוב מוכנה מעדכנת מיד את התצוגה משמאל.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {GANTT_DESIGN_PRESETS.map((preset) => {
                                    const selected = designSettings.presetId === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            onClick={() => selectDesignPreset(preset.id)}
                                            className={`rounded-2xl border p-4 text-right transition ${selected ? 'border-primary bg-primary/[0.06] shadow-sm ring-2 ring-primary/20' : 'border-gray-200 bg-gray-50 hover:border-primary/40 hover:bg-white dark:border-white/10 dark:bg-[#1b1f2a] dark:hover:bg-white/[0.06]'}`}
                                            aria-pressed={selected}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <h5 className="text-base font-black text-gray-900 dark:text-white">{preset.name}</h5>
                                                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{preset.description}</p>
                                                </div>
                                                <span className={`rounded-full px-2 py-1 text-[11px] font-black ${selected ? 'bg-primary text-white' : 'bg-white text-gray-500 dark:bg-white/10 dark:text-gray-300'}`}>
                                                    {selected ? 'נבחר' : 'בחר'}
                                                </span>
                                            </div>
                                            {renderPresetMiniPreview(preset)}
                                        </button>
                                    );
                                })}
                            </div>
                        ))}

                        {renderSettingGroup('פריסה וגודל', 'רוחב, גובה ועמודת המשימות של התרשים.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {renderDesignSelect('פריסה', 'layoutMode')}
                                {renderDesignSelect('רוחב תרשים', 'chartWidthMode')}
                                {renderDesignSelect('גובה תרשים', 'chartHeightMode')}
                                {renderDesignSelect('צפיפות', 'density')}
                                {renderDesignSelect('רוחב עמודת משימות', 'taskColumnWidth')}
                            </div>
                        ))}

                        {renderSettingGroup('מבנה הכרטיס והרקע', 'התחושה הכללית של מעטפת הגאנט והרקע סביבו.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {renderDesignSelect('סגנון כרטיס', 'cardStyle')}
                                {renderDesignSelect('רקע', 'backgroundStyle')}
                                {renderDesignSelect('סרגל כלים', 'toolbarStyle')}
                                <div className={`${compactCardCls} flex flex-col justify-center gap-3`}>
                                    <span className={labelCls}>מעטפת</span>
                                    <ToggleSwitch checked={designSettings.showOuterCard} onChange={(showOuterCard) => updateDesign({ showOuterCard })} label="הצג כרטיס חיצוני" />
                                </div>
                            </div>
                        ))}

                        {renderSettingGroup('ציר זמן וסימונים', 'קווי רשת, מקרא, קו היום ואבני דרך.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {renderDesignSelect('קווי רשת', 'gridStyle')}
                                {renderDesignSelect('סימון אבני דרך', 'milestoneStyle')}
                                {renderDesignSelect('מיקום מקרא', 'legendPlacement')}
                                {renderDesignSelect('קו היום', 'todayLineStyle')}
                            </div>
                        ))}

                        {renderSettingGroup('פסי משימות', 'צורת הפסים, צל ואחוז התקדמות על הפס.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {renderDesignSelect('צורת פסי זמן', 'barStyle')}
                                <div className={`${compactCardCls} flex flex-col gap-3`}>
                                    <span className={labelCls}>אפשרויות פסים</span>
                                    <ToggleSwitch checked={designSettings.barShadow} onChange={(barShadow) => updateDesign({ barShadow })} label="צל עדין לפסים" />
                                    <ToggleSwitch checked={designSettings.showProgressLabel} onChange={(showProgressLabel) => updateDesign({ showProgressLabel })} label="הצג אחוז על הפס" />
                                </div>
                            </div>
                        ))}

                        {renderSettingGroup('צבעים', 'צבעי הרקע, הכרטיס, ההדגשה וקו היום.', (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {renderDesignColor('רקע התרשים', 'chartBackground')}
                                {renderDesignColor('רקע הכרטיס', 'cardBackground')}
                                {renderDesignColor('צבע הדגשה', 'accentColor')}
                                {renderDesignColor('צבע קו היום', 'todayLineColor')}
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );

    const renderPreviewTab = () => (
        <section className={`${panelCls} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 px-6 py-5 dark:border-white/10">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 dark:text-white">תצוגה מקדימה</h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">כך ייראה תרשים הגאנט בעמוד הציבורי.</p>
                </div>
                <button
                    type="button"
                    onClick={openPublicPage}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                >
                    <ExternalLink size={16} />
                    פתח עמוד ציבורי
                </button>
            </div>
            <div className="p-6">
                <div className="h-[clamp(420px,60vh,680px)] min-h-[420px] overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#1b1f2a]">
                    <GanttChart data={draft} viewportHeight="100%" className="border-0 shadow-none" />
                </div>
            </div>
        </section>
    );

    if (loading) {
        return (
            <div dir="rtl" className="flex min-h-[420px] items-center justify-center text-gray-600 dark:text-gray-300">
                <Loader2 className="ml-2 animate-spin" size={20} />
                טוען גאנט...
            </div>
        );
    }

    return (
        <div dir="rtl" className="relative flex h-full min-w-0 flex-col bg-gray-50 font-heebo text-gray-900 dark:bg-[#12141a] dark:text-white">
            <div className="sticky top-0 z-50 shrink-0 border-b border-gray-200 bg-gray-50/95 px-6 pb-4 pt-6 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-[#12141a]/95 sm:px-10">
                <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">ניהול גאנט</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            הפעלת עמוד הגאנט, עריכת משימות, תאריכים, סטטוסים ואחראים.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={openPublicPage}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold transition hover:border-primary/40 hover:text-primary disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                            <ExternalLink size={16} />
                            תצוגה ציבורית
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                            <RotateCcw size={16} />
                            טען מחדש
                        </button>
                        {renderAutoSaveStatus()}
                    </div>
                </div>

                <nav className="flex w-full items-center gap-2 overflow-x-auto p-1 custom-scrollbar">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition ${
                                activeTab === tab.id
                                    ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                    : 'border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-transparent dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>

            {error && (
                <div className="mx-6 mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 shadow-sm dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 sm:mx-10">
                    {error}
                </div>
            )}

            <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                <div className="mx-auto w-full max-w-[1800px]">
                    {activeTab === 'basic' && renderBasicTab()}
                    {activeTab === 'manage' && renderManageTab()}
                    {activeTab === 'design' && renderDesignTab()}
                    {activeTab === 'preview' && renderPreviewTab()}
                </div>
            </main>

            <TaskModal
                modal={taskModal}
                categories={categoryOptions}
                onClose={() => setTaskModal(null)}
                onSubmit={submitTaskModal}
                onChange={updateTaskModal}
            />
        </div>
    );
}
