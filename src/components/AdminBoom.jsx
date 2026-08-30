import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Database,
    LayoutDashboard,
    ListChecks,
    Palette,
    Tag,
    ExternalLink,
    Loader2,
    Plus,
    RefreshCw,
    Search,
    ShieldCheck,
    Trash2,
    X,
    Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useBoom } from '../context/BoomContext';
import {
    BOOM_COLOR_OPTIONS,
    BOOM_ACCENT_OPTIONS,
    BOOM_DESIGN_PRESETS,
    BOOM_SUMMARY_METRICS,
    BOOM_STATUS_OPTIONS,
    BOOM_TABLE_DENSITIES,
    clearBoomTasks,
    cloneBoomData,
    computeBoomProgress,
    createBoomCategory,
    createBoomTask,
    deleteBoomCategory,
    loadBoomDemoData,
    normalizeBoomData,
    reorderBoomCategory,
    updateBoomCategory,
} from '../utils/boomData';
import { AdminAddonTabs, AdminAddonToggle } from './AdminAddonControls';
import TaskManagementTable, { TASK_STATUS_META } from './TaskManagementTable';
import BoomPresentation from './BoomPresentation';

const panelClass = 'rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#1b1f2a]';
const fieldClass = 'min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-800 outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/5 dark:text-white';
const labelClass = 'mb-1.5 block text-xs font-black text-gray-600 dark:text-gray-300';

function reorderMetric(metrics, metricId, direction) {
    const current = Array.isArray(metrics) ? [...metrics] : [];
    const index = current.indexOf(metricId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
    [current[index], current[nextIndex]] = [current[nextIndex], current[index]];
    return current;
}

function BoomTaskDialog({ modal, categories, onChange, onClose, onSubmit }) {
    if (!modal) return null;
    const form = modal.form;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" dir="rtl" role="presentation">
            <div role="dialog" aria-modal="true" aria-labelledby="boom-task-dialog-title" className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-[28px] bg-white p-5 shadow-2xl dark:bg-[#1b1f2a] sm:p-7">
                <div className="mb-6 flex items-start justify-between gap-4">
                    <div>
                        <h2 id="boom-task-dialog-title" className="text-2xl font-black text-gray-900 dark:text-white">
                            {modal.mode === 'edit' ? 'עריכת משימת BOOM' : 'משימת BOOM חדשה'}
                        </h2>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הגדרת המשימה, האחריות ולוחות הזמנים. ההתקדמות מחושבת אוטומטית.</p>
                    </div>
                    <button type="button" onClick={onClose} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-500 transition-[background-color,color,transform] hover:bg-gray-100 hover:text-gray-900 active:scale-[0.96] dark:hover:bg-white/10 dark:hover:text-white" aria-label="סגירת חלון">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
                    <label className="sm:col-span-2">
                        <span className={labelClass}>שם המשימה</span>
                        <input autoFocus className={fieldClass} value={form.title} onChange={(event) => onChange({ title: event.target.value })} required />
                    </label>
                    <label>
                        <span className={labelClass}>תחום / קטגוריה</span>
                        <input className={fieldClass} list="boom-category-options" value={form.category} onChange={(event) => onChange({ category: event.target.value })} required />
                        <datalist id="boom-category-options">
                            {categories.map((category) => <option key={category.id} value={category.name} />)}
                        </datalist>
                    </label>
                    <label>
                        <span className={labelClass}>אחראי</span>
                        <input className={fieldClass} value={form.owner} onChange={(event) => onChange({ owner: event.target.value })} placeholder="שם בעל המשימה" />
                    </label>
                    <label>
                        <span className={labelClass}>סטטוס</span>
                        <select className={fieldClass} value={form.status} onChange={(event) => onChange({ status: event.target.value })}>
                            {BOOM_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                        </select>
                    </label>
                    <label>
                        <span className={labelClass}>תאריך התחלה</span>
                        <input className={`${fieldClass} [direction:ltr]`} type="date" value={form.startDate} onChange={(event) => onChange({ startDate: event.target.value })} required />
                    </label>
                    <label>
                        <span className={labelClass}>תאריך יעד</span>
                        <input className={`${fieldClass} [direction:ltr]`} type="date" value={form.endDate} onChange={(event) => onChange({ endDate: event.target.value })} required />
                    </label>
                    <label className="sm:col-span-2">
                        <span className={labelClass}>פרטים / הערות</span>
                        <textarea className={`${fieldClass} min-h-24 resize-y py-3`} value={form.details} onChange={(event) => onChange({ details: event.target.value })} />
                    </label>
                    {modal.error && <p className="sm:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-500/10 dark:text-red-200">{modal.error}</p>}
                    <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-5 dark:border-white/10 sm:col-span-2">
                        <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-gray-200 px-5 text-sm font-bold text-gray-600 transition-[background-color,transform] hover:bg-gray-50 active:scale-[0.96] dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/5">ביטול</button>
                        <button type="submit" className="min-h-11 rounded-xl bg-primary px-6 text-sm font-black text-white shadow-lg shadow-primary/20 transition-[filter,transform] hover:brightness-110 active:scale-[0.96]">
                            {modal.mode === 'edit' ? 'עדכון משימה' : 'הוספת משימה'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function AdminBoom() {
    const navigate = useNavigate();
    const { boom, loading, loaded, saving, error, saveBoom, reloadBoom } = useBoom();
    const [draft, setDraft] = useState(() => cloneBoomData(boom));
    const [modal, setModal] = useState(null);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [activeTab, setActiveTab] = useState('basic');
    const [categoryNameDrafts, setCategoryNameDrafts] = useState({});
    const [autoSaveState, setAutoSaveState] = useState('saved');
    const savedSnapshotRef = useRef(JSON.stringify(normalizeBoomData(boom)));
    const draftSnapshotRef = useRef(JSON.stringify(normalizeBoomData(boom)));
    const draftRef = useRef(draft);
    const loadedRef = useRef(loaded);
    const saveBoomRef = useRef(saveBoom);
    const ownPersistedSnapshotRef = useRef(null);

    useEffect(() => {
        const incomingSnapshot = JSON.stringify(normalizeBoomData(boom));
        setDraft((current) => {
            const currentSnapshot = JSON.stringify(normalizeBoomData(current));
            const cameFromOwnSave = ownPersistedSnapshotRef.current === incomingSnapshot;
            if (cameFromOwnSave) ownPersistedSnapshotRef.current = null;
            const hasLocalEdits = currentSnapshot !== savedSnapshotRef.current && currentSnapshot !== incomingSnapshot;
            savedSnapshotRef.current = incomingSnapshot;
            return hasLocalEdits || (cameFromOwnSave && currentSnapshot === incomingSnapshot)
                ? current
                : cloneBoomData(boom);
        });
    }, [boom]);

    const draftSnapshot = useMemo(() => JSON.stringify(normalizeBoomData(draft)), [draft]);
    const savedSnapshot = useMemo(() => JSON.stringify(normalizeBoomData(boom)), [boom]);
    const isDirty = draftSnapshot !== savedSnapshot;

    useEffect(() => {
        draftSnapshotRef.current = draftSnapshot;
        draftRef.current = draft;
    }, [draft, draftSnapshot]);

    useEffect(() => {
        loadedRef.current = loaded;
        saveBoomRef.current = saveBoom;
    }, [loaded, saveBoom]);

    useEffect(() => () => {
        const pendingDraft = draftRef.current;
        const pendingSnapshot = JSON.stringify(normalizeBoomData(pendingDraft));
        if (!loadedRef.current || pendingSnapshot === savedSnapshotRef.current) return;
        void saveBoomRef.current(pendingDraft).catch((saveError) => {
            console.error('[BOOM] Failed to flush pending changes while leaving the admin page.', saveError);
        });
    }, []);

    const savePayload = useCallback(async (payload) => {
        const normalized = normalizeBoomData(payload);
        const payloadSnapshot = JSON.stringify(normalized);
        setAutoSaveState('saving');
        try {
            const saved = await saveBoom(normalized);
            const persistedSnapshot = JSON.stringify(normalizeBoomData(saved));
            ownPersistedSnapshotRef.current = persistedSnapshot;
            savedSnapshotRef.current = persistedSnapshot;
            setAutoSaveState(draftSnapshotRef.current === payloadSnapshot ? 'saved' : 'pending');
        } catch (saveError) {
            setAutoSaveState('error');
            toast.error(saveError?.message || 'שמירת נתוני BOOM נכשלה');
        }
    }, [saveBoom]);

    useEffect(() => {
        if (loading || !isDirty) return undefined;
        const timer = window.setTimeout(() => savePayload(draft), 800);
        return () => window.clearTimeout(timer);
    }, [draft, isDirty, loading, savePayload]);

    const updateDraft = (updater) => {
        setAutoSaveState((current) => (current === 'error' ? 'pending' : current));
        setDraft((current) => (
            typeof updater === 'function'
                ? updater(current)
                : { ...current, ...updater }
        ));
    };

    const updateDesign = (patch) => {
        updateDraft((current) => ({ ...current, design: { ...current.design, ...patch } }));
    };

    const visibleTasks = useMemo(() => {
        const normalizedQuery = query.trim().toLocaleLowerCase('he');
        return draft.items.filter((task) => {
            if (statusFilter !== 'all' && task.status !== statusFilter) return false;
            if (!normalizedQuery) return true;
            return [task.title, task.category, task.owner, task.details]
                .some((value) => String(value || '').toLocaleLowerCase('he').includes(normalizedQuery));
        });
    }, [draft.items, query, statusFilter]);

    const openAdd = () => {
        const category = draft.categories[0];
        setModal({
            mode: 'add',
            form: createBoomTask({ category: category?.name || 'כללי', color: category?.color || BOOM_COLOR_OPTIONS[0] }),
            error: '',
        });
    };

    const submitTask = (event) => {
        event.preventDefault();
        const title = modal.form.title.trim();
        const categoryName = modal.form.category.trim();
        if (!title || !categoryName) {
            setModal((current) => ({ ...current, error: 'יש להזין שם משימה ותחום.' }));
            return;
        }
        if (Date.parse(`${modal.form.endDate}T00:00:00`) < Date.parse(`${modal.form.startDate}T00:00:00`)) {
            setModal((current) => ({ ...current, error: 'תאריך היעד לא יכול להיות לפני תאריך ההתחלה.' }));
            return;
        }

        updateDraft((current) => {
            const category = current.categories.find((item) => item.name === categoryName);
            const color = category?.color || BOOM_COLOR_OPTIONS[current.categories.length % BOOM_COLOR_OPTIONS.length];
            const categories = category
                ? current.categories
                : [...current.categories, {
                    id: `boom-category-${Date.now()}`,
                    name: categoryName,
                    color,
                    order: current.categories.length + 1,
                }];
            const task = { ...modal.form, title, category: categoryName, color };
            const items = modal.mode === 'edit'
                ? current.items.map((item) => (item.id === modal.taskId ? task : item))
                : [...current.items, task];
            return { ...current, categories, items };
        });
        setModal(null);
        toast.success(modal.mode === 'edit' ? 'המשימה עודכנה' : 'המשימה נוספה');
    };

    const duplicateTask = (task) => {
        updateDraft((current) => ({
            ...current,
            items: [...current.items, createBoomTask({
                ...task,
                id: `boom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                title: `${task.title} - עותק`,
                order: Date.now(),
            })],
        }));
    };

    const deleteTask = (task) => {
        if (!window.confirm(`למחוק את המשימה "${task.title}"?`)) return;
        updateDraft((current) => ({ ...current, items: current.items.filter((item) => item.id !== task.id) }));
    };

    const loadDemo = () => {
        if (draft.items.length > 0 && !window.confirm('טעינת נתוני ההדגמה תחליף את משימות BOOM הקיימות. להמשיך?')) return;
        updateDraft((current) => loadBoomDemoData(current));
        toast.success('נתוני ההדגמה נטענו');
    };

    const clearTasks = () => {
        if (draft.items.length === 0) return;
        if (!window.confirm('למחוק את כל משימות BOOM? הפעולה אינה מוחקת את הגדרות העמוד.')) return;
        updateDraft((current) => clearBoomTasks(current));
        toast.success('משימות BOOM נוקו');
    };

    const addCategory = () => {
        updateDraft((current) => ({
            ...current,
            categories: [...current.categories, createBoomCategory({}, current.categories)],
        }));
    };

    const editCategory = (category, patch) => {
        const nextName = typeof patch.name === 'string' ? patch.name.trim() : category.name;
        if (!nextName) {
            toast.error('יש להזין שם לקטגוריה.');
            return;
        }
        const hasDuplicate = draft.categories.some((item) => (
            item.id !== category.id && item.name.toLocaleLowerCase('he') === nextName.toLocaleLowerCase('he')
        ));
        if (hasDuplicate) {
            toast.error('כבר קיימת קטגוריה בשם זה.');
            return;
        }
        updateDraft((current) => updateBoomCategory(current, category.id, patch));
    };

    const removeCategory = (category) => {
        if (draft.categories.length === 1) {
            toast.error('לא ניתן למחוק את הקטגוריה האחרונה. יש להוסיף קטגוריה חלופית תחילה.');
            return;
        }
        const replacement = draft.categories.find((item) => item.id !== category.id);
        const affectedCount = draft.items.filter((task) => task.category === category.name).length;
        const message = affectedCount
            ? `מחיקת "${category.name}" תעביר ${affectedCount} משימות אל "${replacement.name}". להמשיך?`
            : `למחוק את הקטגוריה "${category.name}"?`;
        if (!window.confirm(message)) return;
        updateDraft((current) => deleteBoomCategory(current, category.id, replacement.id));
        toast.success(affectedCount ? `הקטגוריה נמחקה והמשימות הועברו אל "${replacement.name}"` : 'הקטגוריה נמחקה');
    };

    const reload = async () => {
        const loaded = await reloadBoom();
        if (loaded) {
            setDraft(cloneBoomData(loaded));
            setAutoSaveState('saved');
            toast.success('נתוני BOOM נטענו מחדש');
        }
    };

    if (loading) {
        return <div dir="rtl" className="flex min-h-[420px] items-center justify-center text-gray-600 dark:text-gray-300"><Loader2 className="ml-2 animate-spin" size={20} />טוען BOOM...</div>;
    }

    if (!loaded) {
        return (
            <div dir="rtl" className="flex min-h-[420px] items-center justify-center bg-gray-50 px-5 font-heebo dark:bg-[#12141a]">
                <div className="w-full max-w-xl rounded-3xl border border-red-200 bg-white p-7 text-right shadow-xl dark:border-red-500/30 dark:bg-[#1b1f2a]">
                    <h1 className="text-2xl font-black text-gray-900 dark:text-white">נתוני BOOM לא נטענו</h1>
                    <p className="mt-3 leading-7 text-red-700 dark:text-red-200">
                        {error || 'אירעה שגיאה בטעינת הנתונים. העריכה חסומה כדי למנוע דריסה של מידע קיים.'}
                    </p>
                    <button type="button" onClick={reloadBoom} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]">
                        <RefreshCw size={17} />ניסיון טעינה חוזר
                    </button>
                </div>
            </div>
        );
    }

    const saveLabel = saving || autoSaveState === 'saving'
        ? 'שומר אוטומטית...'
        : autoSaveState === 'error'
            ? 'שגיאה בשמירה'
            : isDirty
                ? 'ממתין לשמירה'
                : 'נשמר אוטומטית';

    return (
        <div dir="rtl" className="relative flex h-full min-w-0 flex-col bg-gray-50 font-heebo text-gray-900 dark:bg-[#12141a] dark:text-white">
            <header className="sticky top-0 z-40 border-b border-gray-200 bg-gray-50/95 px-5 py-5 shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-[#12141a]/95 sm:px-10">
                <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                    <div>
                        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                            <Zap size={14} />
                            Command &amp; Control
                        </div>
                        <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">ניהול בום</h1>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ניהול עצמאי של משימות, אחריות, סטטוסים והתקדמות.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => navigate('/boom')} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold transition-[color,border-color,transform] hover:border-primary/40 hover:text-primary active:scale-[0.96] dark:border-white/10 dark:bg-white/5">
                            <ExternalLink size={16} />תצוגה ציבורית
                        </button>
                        <button type="button" onClick={reload} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold transition-[background-color,transform] hover:bg-gray-100 active:scale-[0.96] disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10">
                            <RefreshCw size={16} />טען מחדש
                        </button>
                        <span className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-xs font-black ${
                            autoSaveState === 'error'
                                ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                        }`}>
                            {(saving || autoSaveState === 'saving') && <Loader2 size={13} className="animate-spin" />}
                            {saveLabel}
                        </span>
                    </div>
                </div>
            </header>

            <main className="space-y-6 p-5 sm:p-8 lg:p-10">
                {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{error}</div>}

                <AdminAddonTabs
                    tabs={[
                        { id: 'basic', label: 'הגדרות בסיסיות', icon: LayoutDashboard },
                        { id: 'design', label: 'עיצוב', icon: Palette },
                        { id: 'categories', label: 'קטגוריות', icon: Tag },
                        { id: 'tasks', label: 'ניהול משימות', icon: ListChecks },
                    ]}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                    ariaLabel="לשוניות ניהול BOOM"
                />

                {activeTab === 'basic' && (
                    <section className={`${panelClass} p-5 sm:p-6`}>
                        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ShieldCheck size={23} /></span>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 dark:text-white">הפעלת BOOM באתר</h2>
                                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">המידע נשמר באופן עצמאי ואינו משנה את נתוני הגאנט.</p>
                                </div>
                            </div>
                            <AdminAddonToggle
                                checked={draft.enabled}
                                onChange={(enabled) => updateDraft({ enabled })}
                                label={draft.enabled ? 'הדף פעיל' : 'הדף כבוי'}
                                ariaLabel="הפעלת עמוד BOOM"
                            />
                        </div>
                        <div className="mt-5 grid gap-4 border-t border-gray-200 pt-5 dark:border-white/10 md:grid-cols-2">
                            <label><span className={labelClass}>שם הכפתור באתר</span><input className={fieldClass} value={draft.buttonLabel} onChange={(event) => updateDraft({ buttonLabel: event.target.value })} /></label>
                            <label><span className={labelClass}>כותרת העמוד</span><input className={fieldClass} value={draft.pageTitle} onChange={(event) => updateDraft({ pageTitle: event.target.value })} /></label>
                            <label className="md:col-span-2"><span className={labelClass}>תיאור קצר</span><input className={fieldClass} value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} /></label>
                        </div>
                        <div className="mt-6 flex flex-col gap-3 rounded-2xl bg-gray-50 p-4 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <h3 className="flex items-center gap-2 text-sm font-black text-gray-900 dark:text-white"><Database size={16} />נתוני הדגמה</h3>
                                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">טעינת דוגמה שימושית או ניקוי המשימות בלבד, ללא שינוי הגדרות העמוד.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={loadDemo} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]">טעינת נתוני הדגמה</button>
                                <button type="button" onClick={clearTasks} disabled={draft.items.length === 0} className="min-h-10 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-600 transition-[background-color,transform] hover:bg-red-50 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 dark:border-red-500/30 dark:bg-white/5 dark:text-red-300 dark:hover:bg-red-500/10">ניקוי משימות BOOM</button>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'design' && (
                    <section className="grid gap-6 xl:grid-cols-2 xl:items-start">
                        <div className={`${panelClass} p-5 sm:p-6`}>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white">תצוגת תמונת מצב</h2>
                            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">כל שינוי מוצג מיד בתצוגה החיה ונשמר כחלק מהגדרות BOOM.</p>
                            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900 dark:text-white">הצגת שורת סטטוס</h3>
                                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">שורה תמציתית מעל טבלת המשימות. כאשר היא כבויה, העמוד מתחיל בטבלה.</p>
                                    </div>
                                    <AdminAddonToggle
                                        checked={draft.design.showSummaryStrip}
                                        onChange={(showSummaryStrip) => updateDesign({ showSummaryStrip })}
                                        label={draft.design.showSummaryStrip ? 'מוצג' : 'מוסתר'}
                                        ariaLabel="הצגת שורת סטטוס"
                                    />
                                </div>
                            </div>

                            <h3 className="mt-6 text-sm font-black text-gray-900 dark:text-white">סגנון תצוגה</h3>
                            <div className="mt-5 space-y-3">
                                {BOOM_DESIGN_PRESETS.map((preset) => {
                                    const selected = draft.design.preset === preset.id;
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            aria-pressed={selected}
                                            onClick={() => updateDesign({ preset: preset.id })}
                                            className={`w-full rounded-2xl p-4 text-right transition-[box-shadow,transform] active:scale-[0.96] ${
                                                selected
                                                    ? 'bg-primary/10 text-primary shadow-[inset_0_0_0_2px_currentColor]'
                                                    : 'bg-gray-50 text-gray-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.08)] hover:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.45)] dark:bg-white/[0.03] dark:text-gray-200 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'
                                            }`}
                                        >
                                            <span className="block font-black">{preset.label}</span>
                                            <span className={`mt-1 block text-xs leading-5 ${selected ? 'text-primary/80' : 'text-gray-500 dark:text-gray-400'}`}>{preset.description}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="mt-6">
                                <h3 className="text-sm font-black text-gray-900 dark:text-white">מדדים בשורת הסטטוס</h3>
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {BOOM_SUMMARY_METRICS.map((metric) => {
                                        const checked = draft.design.summaryMetrics.includes(metric.id);
                                        return (
                                            <label key={metric.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 transition ${checked ? 'border-primary/35 bg-primary/5' : 'border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-white/[0.03]'}`}>
                                                <span className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={() => updateDesign({
                                                            summaryMetrics: checked
                                                                ? draft.design.summaryMetrics.filter((id) => id !== metric.id)
                                                                : [...draft.design.summaryMetrics, metric.id],
                                                        })}
                                                        className="h-4 w-4 rounded border-primary/30 accent-primary"
                                                    />
                                                    <span className="text-sm font-black text-gray-800 dark:text-gray-100">{metric.label}</span>
                                                </span>
                                                {checked && (
                                                    <span className="flex gap-1">
                                                        <button type="button" aria-label={`העבר את ${metric.label} ימינה`} onClick={() => updateDesign({ summaryMetrics: reorderMetric(draft.design.summaryMetrics, metric.id, -1) })} disabled={draft.design.summaryMetrics.indexOf(metric.id) === 0} className="rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:opacity-35 dark:border-white/10">ימינה</button>
                                                        <button type="button" aria-label={`העבר את ${metric.label} שמאלה`} onClick={() => updateDesign({ summaryMetrics: reorderMetric(draft.design.summaryMetrics, metric.id, 1) })} disabled={draft.design.summaryMetrics.indexOf(metric.id) === draft.design.summaryMetrics.length - 1} className="rounded border border-gray-200 px-1.5 py-0.5 text-xs disabled:opacity-35 dark:border-white/10">שמאלה</button>
                                                    </span>
                                                )}
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="mt-6 grid gap-3 sm:grid-cols-2">
                                <label><span className={labelClass}>צפיפות טבלת המשימות</span><select className={fieldClass} value={draft.design.tableDensity} onChange={(event) => updateDesign({ tableDensity: event.target.value })}>{BOOM_TABLE_DENSITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                                <label><span className={labelClass}>צבע מוביל</span><select className={fieldClass} value={draft.design.accent} onChange={(event) => updateDesign({ accent: event.target.value })}>{BOOM_ACCENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                                <div className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm font-bold text-gray-700 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-200">
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.design.showCategoryColors} onChange={(event) => updateDesign({ showCategoryColors: event.target.checked })} className="h-4 w-4 rounded border-primary/30 accent-primary" />הדגש צבעי קטגוריות</label>
                                    <label className="flex items-center gap-2"><input type="checkbox" checked={draft.design.showSummaryChips} onChange={(event) => updateDesign({ showSummaryChips: event.target.checked })} className="h-4 w-4 rounded border-primary/30 accent-primary" />הצג תגי סיכום בטבלה</label>
                                </div>
                            </div>
                        </div>
                        <div className="min-w-0 xl:sticky xl:top-36">
                            <div className="mb-2 text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">תצוגה חיה</div>
                            <BoomPresentation boom={draft} preview />
                        </div>
                    </section>
                )}

                {activeTab === 'categories' && (
                    <section className={`${panelClass} overflow-hidden`}>
                        <div className="flex flex-col justify-between gap-4 border-b border-gray-200 p-5 dark:border-white/10 sm:flex-row sm:items-center sm:p-6">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 dark:text-white">ניהול קטגוריות</h2>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">צבעים ושמות מתעדכנים מיד במשימות ובלוח הבקרה.</p>
                            </div>
                            <button type="button" onClick={addCategory} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/20 transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"><Plus size={18} />קטגוריה חדשה</button>
                        </div>
                        <div className="divide-y divide-gray-200 dark:divide-white/10">
                            {draft.categories.map((category, index) => {
                                const taskCount = draft.items.filter((task) => task.category === category.name).length;
                                return (
                                    <div key={category.id} className="grid gap-3 p-5 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:items-end sm:p-6">
                                        <label>
                                            <span className={labelClass}>צבע</span>
                                            <input aria-label={`צבע עבור ${category.name}`} type="color" value={category.color} onChange={(event) => editCategory(category, { color: event.target.value })} className="h-11 w-14 cursor-pointer rounded-xl border border-gray-200 bg-white p-1 dark:border-white/10 dark:bg-white/5" />
                                        </label>
                                        <label>
                                            <span className={labelClass}>שם הקטגוריה</span>
                                            <input
                                                aria-label={`שם קטגוריה ${category.name}`}
                                                className={fieldClass}
                                                value={categoryNameDrafts[category.id] ?? category.name}
                                                onChange={(event) => setCategoryNameDrafts((current) => ({ ...current, [category.id]: event.target.value }))}
                                                onBlur={(event) => {
                                                    editCategory(category, { name: event.target.value });
                                                    setCategoryNameDrafts((current) => {
                                                        const next = { ...current };
                                                        delete next[category.id];
                                                        return next;
                                                    });
                                                }}
                                            />
                                        </label>
                                        <div className="text-sm font-bold text-gray-500 dark:text-gray-400">{taskCount} משימות</div>
                                        <button type="button" onClick={() => removeCategory(category)} disabled={draft.categories.length === 1} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"><Trash2 size={16} />מחיקה</button>
                                        <div className="flex gap-2 sm:col-span-4">
                                            <button type="button" onClick={() => updateDraft((current) => reorderBoomCategory(current, category.id, -1))} disabled={index === 0} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-white/10">העבר למעלה</button>
                                            <button type="button" onClick={() => updateDraft((current) => reorderBoomCategory(current, category.id, 1))} disabled={index === draft.categories.length - 1} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40 dark:border-white/10">העבר למטה</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {activeTab === 'tasks' && (
                    <section className={`${panelClass} overflow-hidden`}>
                    <div className="flex flex-col justify-between gap-4 border-b border-gray-200 p-5 dark:border-white/10 sm:p-6 lg:flex-row lg:items-center">
                        <div>
                            <h2 className="text-xl font-black text-gray-900 dark:text-white">משימות BOOM</h2>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{draft.items.length} משימות במערכת</p>
                        </div>
                        <button type="button" onClick={openAdd} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white shadow-lg shadow-primary/20 transition-[filter,transform] hover:brightness-110 active:scale-[0.96]">
                            <Plus size={18} />משימה חדשה
                        </button>
                    </div>
                    <div className="grid gap-3 border-b border-gray-200 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/[0.02] md:grid-cols-[minmax(0,1fr)_220px]">
                        <label className="relative">
                            <Search size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <span className="sr-only">חיפוש משימות</span>
                            <input className={`${fieldClass} pr-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש לפי משימה, תחום או אחראי" />
                        </label>
                        <label>
                            <span className="sr-only">סינון לפי סטטוס</span>
                            <select className={fieldClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                                <option value="all">כל הסטטוסים</option>
                                {BOOM_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                            </select>
                        </label>
                    </div>
                    {visibleTasks.length > 0 ? (
                        <TaskManagementTable
                            tasks={visibleTasks}
                            categories={draft.categories}
                            statusMeta={TASK_STATUS_META}
                            getProgress={computeBoomProgress}
                            onAssign={(task) => setModal({ mode: 'edit', taskId: task.id, form: { ...task }, error: '' })}
                            onEdit={(task) => setModal({ mode: 'edit', taskId: task.id, form: { ...task }, error: '' })}
                            onDuplicate={duplicateTask}
                            onDelete={deleteTask}
                        />
                    ) : (
                        <div className="px-6 py-16 text-center">
                            <Zap className="mx-auto text-gray-300 dark:text-gray-600" size={38} />
                            <h3 className="mt-3 font-black text-gray-700 dark:text-gray-200">אין משימות להצגה</h3>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{draft.items.length ? 'נסו לשנות את החיפוש או הסינון.' : 'הוסיפו משימה ראשונה למערכת BOOM.'}</p>
                        </div>
                    )}
                    </section>
                )}
            </main>

            <BoomTaskDialog
                modal={modal}
                categories={draft.categories}
                onChange={(patch) => setModal((current) => ({ ...current, error: '', form: { ...current.form, ...patch } }))}
                onClose={() => setModal(null)}
                onSubmit={submitTask}
            />
        </div>
    );
}
