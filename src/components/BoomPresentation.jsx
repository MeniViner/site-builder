import React, { useMemo } from 'react';
import { Activity, CircleAlert, Clock3, ShieldCheck, Zap } from 'lucide-react';
import { BOOM_DASHBOARD_WIDGETS, BOOM_DESIGN_PRESETS, BOOM_STATUS_OPTIONS, computeBoomProgress } from '../utils/boomData';
import TaskManagementTable, { TASK_STATUS_META } from './TaskManagementTable';

const PRESENTATION_STYLES = Object.freeze({
    operational: {
        shell: 'border-theme-subtle bg-theme-card shadow-[0_14px_44px_rgba(0,0,0,0.10)]',
        header: 'border-theme-subtle bg-theme-card/80',
    },
    'command-center': {
        shell: 'border-slate-700/30 bg-theme-card shadow-[0_18px_55px_rgba(15,23,42,0.18)] dark:border-sky-400/15',
        header: 'border-slate-700/20 bg-gradient-to-l from-slate-900 to-slate-800 text-white dark:border-sky-400/15',
    },
    compact: {
        shell: 'border-theme-subtle bg-theme-card shadow-[0_10px_30px_rgba(0,0,0,0.08)]',
        header: 'border-theme-subtle bg-theme-elevated',
    },
});

const ACCENT_STYLES = Object.freeze({
    primary: { soft: 'bg-primary/10 text-primary', dot: 'bg-primary' },
    sky: { soft: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
    emerald: { soft: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
});

function todayDateString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function countBy(items, valueFor) {
    return [...items.reduce((counts, item) => {
        const value = valueFor(item) || 'ללא שיוך';
        counts.set(value, (counts.get(value) || 0) + 1);
        return counts;
    }, new Map()).entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'he'));
}

function DashboardWidget({ title, children, compact, className = '' }) {
    return (
        <section className={`rounded-2xl border border-theme-subtle bg-theme-card/70 ${compact ? 'p-3' : 'p-4'} ${className}`}>
            <h3 className="text-sm font-black text-theme">{title}</h3>
            {children}
        </section>
    );
}

export default function BoomPresentation({
    boom,
    tasks = boom?.items || [],
    preview = false,
    emptyMessage = 'עדיין אין משימות BOOM',
}) {
    const design = boom?.design || {};
    const preset = BOOM_DESIGN_PRESETS.some((option) => option.id === design.preset)
        ? design.preset
        : 'operational';
    const style = PRESENTATION_STYLES[preset];
    const accent = ACCENT_STYLES[design.accent] || ACCENT_STYLES.primary;
    const showDashboard = design.showDashboard !== false;
    const widgets = new Set(Array.isArray(design.dashboardWidgets)
        ? design.dashboardWidgets
        : BOOM_DASHBOARD_WIDGETS.map((widget) => widget.id));
    const compactDashboard = design.dashboardDensity === 'compact';
    const commandCenter = preset === 'command-center';
    const emphasizeCards = design.cardEmphasis === 'outlined';
    const showSummaryChips = design.showSummaryChips !== false;
    const showCategoryColors = design.showCategoryColors !== false;

    const summary = useMemo(() => {
        const today = todayDateString();
        const openTasks = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status));
        const overdue = openTasks.filter((task) => task.endDate && task.endDate < today);
        const upcoming = openTasks.filter((task) => task.endDate && task.endDate >= today).sort((left, right) => left.endDate.localeCompare(right.endDate));
        return {
            active: tasks.filter((task) => task.status === 'active').length,
            blocked: tasks.filter((task) => task.status === 'blocked').length,
            overdue,
            upcoming: upcoming.slice(0, 3),
            owners: countBy(openTasks, (task) => task.owner).slice(0, 4),
            statuses: BOOM_STATUS_OPTIONS.map((status) => ({
                id: status.value,
                label: status.label,
                count: tasks.filter((task) => task.status === status.value).length,
            })),
            categories: (boom?.categories || []).map((category) => ({
                ...category,
                value: tasks.filter((task) => task.category === category.name).length,
            })).filter((category) => category.value > 0),
            unassigned: openTasks.filter((task) => !task.owner).length,
        };
    }, [boom?.categories, tasks]);

    const headerTextClass = commandCenter ? 'text-white' : 'text-theme';
    const mutedTextClass = commandCenter ? 'text-slate-300' : 'text-theme-muted';
    const sectionBorderClass = emphasizeCards ? 'border-primary/25' : '';

    const renderDashboard = () => (
        <section data-testid="boom-dashboard" className={`overflow-hidden rounded-[28px] border ${style.shell}`}>
            <header className={`border-b ${design.headerStyle === 'minimal' ? 'p-4 sm:p-5' : 'p-5 sm:p-6'} ${style.header}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${commandCenter ? 'bg-white/10 text-sky-200' : accent.soft}`}>
                            <Zap size={14} />Command &amp; Control
                        </span>
                        <h1 className={`mt-2 text-xl font-black text-balance sm:text-2xl ${headerTextClass}`}>{boom?.pageTitle}</h1>
                        {(design.dashboardTitle || boom?.description) && (
                            <p className={`mt-1 max-w-3xl text-sm leading-6 text-pretty ${mutedTextClass}`}>
                                {design.dashboardTitle || boom?.description}
                            </p>
                        )}
                        {design.dashboardSubtitle && <p className={`mt-1 text-xs leading-5 ${mutedTextClass}`}>{design.dashboardSubtitle}</p>}
                    </div>
                    <div className={`shrink-0 rounded-2xl px-4 py-2 text-center ${commandCenter ? 'bg-white/10 text-white' : accent.soft}`}>
                        <div className="text-xl font-black tabular-nums">{tasks.length}</div>
                        <div className={`text-[11px] font-bold ${mutedTextClass}`}>משימות</div>
                    </div>
                </div>
            </header>

            <div className={`grid gap-3 ${compactDashboard ? 'p-3' : 'p-4 sm:p-5'} md:grid-cols-2 xl:grid-cols-3`}>
                {widgets.has('overview') && (
                    <DashboardWidget title="תמונת מצב" compact={compactDashboard} className={`md:col-span-2 xl:col-span-1 ${sectionBorderClass}`}>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                            {[
                                { icon: Activity, label: 'בביצוע', value: summary.active },
                                { icon: CircleAlert, label: 'חסומות', value: summary.blocked },
                                { icon: Clock3, label: 'באיחור', value: summary.overdue.length },
                            ].map(({ icon: Icon, label, value }) => (
                                <div key={label} className={`rounded-xl px-2 py-2 ${commandCenter ? 'bg-white/[0.07] text-white' : 'bg-theme-elevated text-theme'}`}>
                                    {React.createElement(Icon, { className: `mx-auto ${commandCenter ? 'text-sky-300' : accent.dot.replace('bg-', 'text-')}`, size: 15 })}
                                    <div className="mt-1 text-lg font-black tabular-nums">{value}</div>
                                    <div className={`text-[10px] font-bold ${mutedTextClass}`}>{label}</div>
                                </div>
                            ))}
                        </div>
                    </DashboardWidget>
                )}

                {widgets.has('status') && (
                    <DashboardWidget title="התפלגות סטטוסים" compact={compactDashboard} className={sectionBorderClass}>
                        <div className="mt-3 space-y-2">
                            {summary.statuses.filter((status) => status.count > 0).map((status) => (
                                <div key={status.id} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="font-bold text-theme-muted">{status.label}</span>
                                    <span className={`rounded-full px-2 py-0.5 font-black ${TASK_STATUS_META[status.id]?.className}`}>{status.count}</span>
                                </div>
                            ))}
                            {!summary.statuses.some((status) => status.count > 0) && <p className="text-xs text-theme-muted">אין משימות להצגה.</p>}
                        </div>
                    </DashboardWidget>
                )}

                {widgets.has('owners') && (
                    <DashboardWidget title="עומס אחראים" compact={compactDashboard} className={sectionBorderClass}>
                        <div className="mt-3 space-y-2">
                            {summary.owners.map((owner) => (
                                <div key={owner.label} className="flex items-center justify-between gap-3 text-xs">
                                    <span className="truncate font-bold text-theme-muted">{owner.label}</span>
                                    <span className="font-black tabular-nums text-theme">{owner.value}</span>
                                </div>
                            ))}
                            {!summary.owners.length && <p className="text-xs text-theme-muted">אין משימות פתוחות עם אחראי.</p>}
                        </div>
                    </DashboardWidget>
                )}

                {widgets.has('upcoming') && (
                    <DashboardWidget title="קרוב ודחוף" compact={compactDashboard} className={`md:col-span-2 ${sectionBorderClass}`}>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl bg-red-500/8 px-3 py-2">
                                <div className="text-xs font-black text-red-700 dark:text-red-300">באיחור · {summary.overdue.length}</div>
                                <p className="mt-1 truncate text-xs text-theme-muted">{summary.overdue[0]?.title || 'אין משימות באיחור'}</p>
                            </div>
                            <div className="rounded-xl bg-amber-500/8 px-3 py-2">
                                <div className="text-xs font-black text-amber-700 dark:text-amber-300">היעדים הקרובים · {summary.upcoming.length}</div>
                                <p className="mt-1 truncate text-xs text-theme-muted">{summary.upcoming[0]?.title || 'אין יעדים קרובים'}</p>
                            </div>
                        </div>
                    </DashboardWidget>
                )}

                {widgets.has('categories') && (
                    <DashboardWidget title="תחומים" compact={compactDashboard} className={sectionBorderClass}>
                        <div className="mt-3 flex flex-wrap gap-2">
                            {summary.categories.map((category) => (
                                <span key={category.id} className="inline-flex items-center gap-1.5 rounded-full border border-theme-subtle px-2.5 py-1 text-xs font-bold text-theme">
                                    {showCategoryColors && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />}
                                    {category.name} <span className="tabular-nums text-theme-muted">{category.value}</span>
                                </span>
                            ))}
                            {!summary.categories.length && <p className="text-xs text-theme-muted">אין חלוקה לקטגוריות עדיין.</p>}
                        </div>
                    </DashboardWidget>
                )}

                {widgets.has('insights') && (
                    <DashboardWidget title="תובנות תפעוליות" compact={compactDashboard} className={sectionBorderClass}>
                        <ul className="mt-3 space-y-1.5 text-xs leading-5 text-theme-muted">
                            <li>{summary.blocked ? `${summary.blocked} משימות חסומות דורשות טיפול.` : 'אין משימות חסומות כרגע.'}</li>
                            <li>{summary.unassigned ? `${summary.unassigned} משימות פתוחות עדיין ללא אחראי.` : 'לכל המשימות הפתוחות הוגדר אחראי.'}</li>
                            <li>{summary.overdue.length ? `${summary.overdue.length} משימות עברו את תאריך היעד.` : 'אין חריגות תאריך פעילות.'}</li>
                        </ul>
                    </DashboardWidget>
                )}
            </div>
        </section>
    );

    return (
        <div data-testid="boom-presentation" data-preset={preset} className={`space-y-5 ${preview ? 'max-h-[620px] overflow-auto p-1' : ''}`}>
            {showDashboard && renderDashboard()}

            <section data-testid="boom-task-table" className={`overflow-hidden rounded-[28px] border ${style.shell}`}>
                <header className={`border-b px-5 py-4 sm:px-6 ${style.header}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            {!showDashboard && <h1 className={`text-xl font-black sm:text-2xl ${headerTextClass}`}>{boom?.pageTitle}</h1>}
                            <h2 className={`font-black ${showDashboard ? 'text-lg' : 'mt-1 text-base'} ${headerTextClass}`}>משימות וניהול שוטף</h2>
                            {boom?.description && !showDashboard && <p className={`mt-1 text-sm ${mutedTextClass}`}>{boom.description}</p>}
                        </div>
                        {showSummaryChips && (
                            <div className="flex flex-wrap gap-1.5">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-black ${commandCenter ? 'bg-white/10 text-white' : accent.soft}`}>{tasks.length} משימות</span>
                                <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-black text-red-700 dark:text-red-300">{summary.overdue.length} באיחור</span>
                            </div>
                        )}
                    </div>
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
                    <div className="px-6 py-16 text-center text-theme-muted">
                        <ShieldCheck className="mx-auto opacity-40" size={38} />
                        <h2 className="mt-3 text-lg font-black text-theme">{emptyMessage}</h2>
                        <p className="mt-1 text-sm">משימות שיוגדרו בניהול BOOM יוצגו כאן.</p>
                    </div>
                )}
            </section>
        </div>
    );
}
