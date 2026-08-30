import React, { useMemo } from 'react';
import { Activity, CheckCircle2, CircleAlert, Clock3, ListChecks, ShieldCheck, Tag, Users } from 'lucide-react';
import { BOOM_DESIGN_PRESETS, BOOM_SUMMARY_METRICS, computeBoomProgress } from '../utils/boomData';
import TaskManagementTable, { TASK_STATUS_META } from './TaskManagementTable';

const PRESENTATION_STYLES = Object.freeze({
    operational: { shell: 'border-theme-subtle bg-theme-card shadow-[0_10px_30px_rgba(0,0,0,0.08)]' },
    'command-center': { shell: 'border-slate-700/25 bg-theme-card shadow-[0_12px_34px_rgba(15,23,42,0.14)] dark:border-sky-400/15' },
    compact: { shell: 'border-theme-subtle bg-theme-card shadow-sm' },
});

const ACCENT_STYLES = Object.freeze({
    primary: 'bg-primary/8 text-primary',
    sky: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
});

const METRIC_ICONS = Object.freeze({
    total: ListChecks,
    active: Activity,
    blocked: CircleAlert,
    completed: CheckCircle2,
    overdue: CircleAlert,
    upcoming: Clock3,
    owners: Users,
    categories: Tag,
});

function todayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

export default function BoomPresentation({
    boom,
    tasks = boom?.items || [],
    preview = false,
    emptyMessage = 'עדיין אין משימות BOOM',
}) {
    const design = boom?.design || {};
    const preset = BOOM_DESIGN_PRESETS.some((option) => option.id === design.preset) ? design.preset : 'operational';
    const showSummaryStrip = design.showSummaryStrip !== false;
    const summaryMetrics = useMemo(
        () => (Array.isArray(design.summaryMetrics) ? design.summaryMetrics : ['total', 'active', 'blocked', 'overdue']),
        [design.summaryMetrics]
    );
    const accent = ACCENT_STYLES[design.accent] || ACCENT_STYLES.primary;
    const showSummaryChips = design.showSummaryChips !== false;
    const showCategoryColors = design.showCategoryColors !== false;

    const metrics = useMemo(() => {
        const today = todayDateString();
        const openTasks = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status));
        const values = {
            total: tasks.length,
            active: tasks.filter((task) => task.status === 'active').length,
            blocked: tasks.filter((task) => task.status === 'blocked').length,
            completed: tasks.filter((task) => task.status === 'completed').length,
            overdue: openTasks.filter((task) => task.endDate && task.endDate < today).length,
            upcoming: openTasks.filter((task) => task.endDate && task.endDate >= today).length,
            owners: new Set(openTasks.map((task) => task.owner).filter(Boolean)).size,
            categories: new Set(tasks.map((task) => task.category).filter(Boolean)).size,
        };
        return summaryMetrics
            .map((id) => BOOM_SUMMARY_METRICS.find((metric) => metric.id === id))
            .filter(Boolean)
            .map((metric) => ({ ...metric, value: values[metric.id] }));
    }, [summaryMetrics, tasks]);

    return (
        <div data-testid="boom-presentation" data-preset={preset} className={`space-y-4 ${preview ? 'max-h-[620px] overflow-auto p-1' : ''}`}>
            <header className="px-1 pt-1">
                <h1 className="text-xl font-black tracking-tight text-theme sm:text-2xl">{boom?.pageTitle}</h1>
                {boom?.description && <p className="mt-1 text-sm leading-6 text-theme-muted">{boom.description}</p>}
            </header>

            {showSummaryStrip && metrics.length > 0 && (
                <section data-testid="boom-summary-strip" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-1 sm:gap-y-2">
                    {metrics.map((metric) => {
                        const Icon = METRIC_ICONS[metric.id];
                        const semanticClass = metric.id === 'blocked' || metric.id === 'overdue'
                            ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                            : metric.id === 'completed'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : accent;
                        return (
                            <div key={metric.id} data-testid={`boom-summary-${metric.id}`} className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 ${semanticClass}`}>
                                {React.createElement(Icon, { size: 15, className: 'shrink-0' })}
                                <span className="text-lg font-black tabular-nums">{metric.value}</span>
                                <span className="text-xs font-bold">{metric.label}</span>
                            </div>
                        );
                    })}
                </section>
            )}

            <section data-testid="boom-task-table" className={`overflow-hidden rounded-2xl border ${PRESENTATION_STYLES[preset].shell}`}>
                <header className="flex flex-col gap-3 border-b border-theme-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <h2 className="text-base font-black text-theme">משימות וניהול שוטף</h2>
                    {showSummaryChips && (
                        <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-black ${accent}`}>{tasks.length} משימות</span>
                    )}
                </header>
                {tasks.length > 0 ? (
                    <TaskManagementTable
                        tasks={tasks}
                        categories={boom?.categories}
                        statusMeta={TASK_STATUS_META}
                        getProgress={computeBoomProgress}
                        density={design.tableDensity === 'compact' ? 'compact' : 'comfortable'}
                        showCategoryColors={showCategoryColors}
                        readOnly
                    />
                ) : (
                    <div className="px-6 py-12 text-center text-theme-muted">
                        <ShieldCheck className="mx-auto opacity-40" size={34} />
                        <h2 className="mt-3 text-base font-black text-theme">{emptyMessage}</h2>
                        <p className="mt-1 text-sm">משימות שיוגדרו בניהול BOOM יוצגו כאן.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
