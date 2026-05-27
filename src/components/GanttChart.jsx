import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Diamond, Flag, OctagonAlert, PauseCircle, Search, XCircle } from 'lucide-react';
import {
    GANTT_STATUS_OPTIONS,
    GANTT_VIEW_OPTIONS,
    computeGanttProgress,
    computeGanttTimeStatus,
    normalizeGanttData,
} from '../utils/ganttData';
import { buildGanttTimelineModel } from '../utils/ganttTimeline';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 50;
const COMPACT_ROW_HEIGHT = 44;
const GROUP_ROW_HEIGHT = 34;
const COMPACT_TASK_COLUMN_WIDTH = 188;

const DENSITY_CONFIG = {
    compact: { rowHeight: 42, groupRowHeight: 30, toolbarPadding: 'p-2', barHeightClass: 'h-5', taskTextClass: 'text-xs', markerSize: 12, legendPadding: 'px-3 py-2' },
    comfortable: { rowHeight: ROW_HEIGHT, groupRowHeight: GROUP_ROW_HEIGHT, toolbarPadding: 'p-3', barHeightClass: 'h-7', taskTextClass: 'text-sm', markerSize: 15, legendPadding: 'px-4 py-3' },
    spacious: { rowHeight: 58, groupRowHeight: 38, toolbarPadding: 'p-4', barHeightClass: 'h-8', taskTextClass: 'text-[15px]', markerSize: 17, legendPadding: 'px-5 py-4' },
};

const TASK_COLUMN_CONFIG = {
    narrow: { large: 250, desktop: 220, small: 190 },
    medium: { large: 300, desktop: 260, small: 220 },
    wide: { large: 360, desktop: 320, small: 260 },
};

const statusMeta = {
    planned: { icon: Circle, className: 'text-slate-500', label: 'מתוכנן' },
    blocked: { icon: OctagonAlert, className: 'text-red-600', label: 'חסום' },
    completed: { icon: CheckCircle2, className: 'text-emerald-600', label: 'הושלם' },
    cancelled: { icon: XCircle, className: 'text-slate-500', label: 'בוטל' },
    onHold: { icon: PauseCircle, className: 'text-amber-600', label: 'בהמתנה' },
};

const timeStatusLabel = {
    upcoming: 'עתידי',
    active: 'בתהליך',
    overdue: 'מאחר',
    completed: 'הושלם',
    cancelled: 'בוטל',
    ended: 'הסתיים',
    invalidDate: 'תאריך לא תקין',
};

function parseDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
}

function toDateString(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
}

function localDateString(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return toDateString(Date.now());
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function diffDays(start, end) {
    return Math.round((end - start) / DAY_MS);
}

function formatShortDate(value) {
    try {
        return new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit' }).format(new Date(`${value}T00:00:00`));
    } catch {
        return value;
    }
}

function colorWithAlpha(color, alphaHex) {
    return /^#[0-9a-fA-F]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

function getCategories(gantt) {
    const byName = new Map();
    gantt.categories.forEach((category) => {
        if (category.name) byName.set(category.name, category);
    });
    gantt.items.forEach((item) => {
        if (!byName.has(item.category)) {
            byName.set(item.category, { id: item.category, name: item.category, color: item.color, order: byName.size + 1 });
        }
    });
    return [...byName.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
}

function EmptyState({ filtered }) {
    return (
        <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-theme-subtle bg-theme-card/80 p-8 text-center text-theme-muted">
            <div>
                <CalendarDays size={36} className="mx-auto mb-3 text-primary" />
                <p className="font-bold text-theme">
                    {filtered ? 'לא נמצאו משימות בהתאם לסינון.' : 'אין משימות להצגה בתרשים הגאנט.'}
                </p>
            </div>
        </div>
    );
}

function ChartToolbar({
    viewMode,
    setViewMode,
    categoryFilter,
    setCategoryFilter,
    statusFilter,
    setStatusFilter,
    searchTerm,
    setSearchTerm,
    categories,
    periodOffset,
    setPeriodOffset,
    design,
    presentation,
    density,
}) {
    const activeViewLabel = GANTT_VIEW_OPTIONS.find((option) => option.value === viewMode)?.label || 'תקופה';
    const selectViewMode = (nextViewMode) => {
        setViewMode(nextViewMode);
        setPeriodOffset(0);
    };
    const goToPreviousPeriod = () => setPeriodOffset((offset) => offset - 1);
    const goToNextPeriod = () => setPeriodOffset((offset) => offset + 1);

    return (
        <div className={`flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${density.toolbarPadding} ${presentation.toolbarClass}`} style={presentation.toolbarStyle}>
            <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-theme-subtle bg-theme-card p-1 text-xs font-black">
                    {GANTT_VIEW_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => selectViewMode(option.value)}
                            className={`rounded-lg px-3 py-1.5 transition ${viewMode === option.value ? 'text-white shadow-sm' : 'text-theme-muted hover:text-theme'}`}
                            style={viewMode === option.value ? { backgroundColor: presentation.accentColor } : undefined}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
                <div className="inline-flex items-center gap-1 rounded-full border border-theme-subtle shadow-sm">
                    <button
                        type="button"
                        onClick={goToPreviousPeriod}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-theme-muted transition hover:bg-theme-elevated hover:text-theme focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        title={`${activeViewLabel} קודם`}
                        aria-label={`${activeViewLabel} קודם`}
                        data-gantt-period-nav="previous"
                    >
                        <ChevronRight size={16} />
                    </button>
                    <span className="min-w-5 text-center text-[11px] font-black text-theme-muted" aria-label={`היסט תקופה ${periodOffset}`}>
                        {periodOffset === 0 ? '•' : periodOffset}
                    </span>
                    <button
                        type="button"
                        onClick={goToNextPeriod}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-theme-muted transition hover:bg-theme-elevated hover:text-theme focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        title={`${activeViewLabel} הבא`}
                        aria-label={`${activeViewLabel} הבא`}
                        data-gantt-period-nav="next"
                    >
                        <ChevronLeft size={16} />
                    </button>
                </div>
                <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className={`h-9 rounded-xl border px-3 text-xs font-bold outline-none focus:border-primary/50 ${presentation.controlClass}`}
                    aria-label="סינון לפי תחום"
                >
                    <option value="all">כל התחומים</option>
                    {categories.map((category) => (
                        <option key={category.id} value={category.name}>{category.name}</option>
                    ))}
                </select>
                <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className={`h-9 rounded-xl border px-3 text-xs font-bold outline-none focus:border-primary/50 ${presentation.controlClass}`}
                    aria-label="סינון לפי סטטוס"
                >
                    <option value="all">כל הסטטוסים</option>
                    {GANTT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            </div>
            <label className="relative block min-w-0 lg:w-72">
                <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-theme-muted" />
                <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className={`h-9 w-full rounded-xl border py-2 pl-3 pr-9 text-sm outline-none transition placeholder:text-theme-muted/70 focus:border-primary/50 ${presentation.controlClass} ${design.toolbarStyle === 'compact' ? 'lg:w-64' : ''}`}
                    placeholder="חיפוש משימה"
                />
            </label>
        </div>
    );
}

function getDensityConfig(design, compact) {
    if (compact) return DENSITY_CONFIG.compact;
    return DENSITY_CONFIG[design.density] || DENSITY_CONFIG.comfortable;
}

function getTaskColumnWidth(design, viewportWidth, compact) {
    if (compact) return COMPACT_TASK_COLUMN_WIDTH;
    const config = TASK_COLUMN_CONFIG[design.taskColumnWidth] || TASK_COLUMN_CONFIG.medium;
    if (viewportWidth >= 1600) return config.large;
    if (viewportWidth >= 1024) return config.desktop;
    return config.small;
}

function getChartHeight(design, compact) {
    if (compact) return undefined;
    if (design.chartHeightMode === 'fixed') return '560px';
    if (design.chartHeightMode === 'compact') return 'clamp(420px, calc(100dvh - 260px), 620px)';
    if (design.chartHeightMode === 'auto') return 'clamp(420px, 60dvh, 720px)';
    return 'clamp(460px, calc(100dvh - 220px), 760px)';
}

function getGridColor(design) {
    if (design.gridStyle === 'strong') return 'rgba(148, 163, 184, 0.58)';
    if (design.gridStyle === 'minimal') return 'rgba(226, 232, 240, 0.55)';
    return 'rgba(203, 213, 225, 0.42)';
}

function getTodayLine(design) {
    if (design.todayLineStyle === 'strong') return { width: 3, opacity: 0.9 };
    if (design.todayLineStyle === 'minimal') return { width: 1, opacity: 0.45 };
    return { width: 2, opacity: 0.62 };
}

function getGanttPresentation(design, layoutVariant = 'default') {
    const forcePublicFullWidth = layoutVariant === 'public';
    const isContained = !forcePublicFullWidth && (design.chartWidthMode === 'contained' || design.layoutMode === 'centered');
    const widthClass = isContained ? 'mx-auto w-full max-w-7xl' : 'w-full max-w-none';
    const gridColor = getGridColor(design);
    const todayLine = getTodayLine(design);
    const cardBackground = design.colors?.cardBackground || '#ffffff';
    const chartBackground = design.colors?.chartBackground || '#ffffff';
    const accentColor = design.colors?.accentColor || '#2563eb';
    const todayLineColor = design.colors?.todayLineColor || '#ef4444';

    if (!design.showOuterCard) {
        return {
            widthClass,
            shellClass: 'rounded-none border-0 bg-transparent text-theme shadow-none',
            shellStyle: {},
            toolbarClass: 'border-b border-theme-subtle bg-theme-elevated/40',
            toolbarStyle: {},
            controlClass: 'border-theme-subtle bg-theme-card text-theme',
            taskCellStyle: {},
            timelineCellStyle: {},
            headerStyle: {},
            groupStyle: {},
            gridColor,
            accentColor,
            todayLineColor,
            todayLine,
        };
    }

    const base = {
        widthClass,
        gridColor,
        accentColor,
        todayLineColor,
        todayLine,
        taskCellStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: cardBackground },
        timelineCellStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: chartBackground },
        headerStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: cardBackground },
        groupStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: chartBackground },
    };

    if (design.cardStyle === 'glass') {
        return {
            ...base,
            shellClass: 'rounded-[28px] border border-white/40 bg-white/70 text-gray-900 shadow-xl backdrop-blur-xl',
            shellStyle: {},
            toolbarClass: 'border-b border-white/40 bg-white/40 backdrop-blur',
            toolbarStyle: {},
            controlClass: 'border-white/50 bg-white/65 text-gray-900',
        };
    }

    if (design.cardStyle === 'minimal') {
        return {
            ...base,
            shellClass: 'rounded-xl border border-gray-200 bg-white text-gray-900 shadow-none',
            shellStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: cardBackground },
            toolbarClass: 'border-b border-gray-200 bg-gray-50',
            toolbarStyle: {},
            controlClass: 'border-gray-200 bg-white text-gray-900',
        };
    }

    if (design.cardStyle === 'clean') {
        return {
            ...base,
            shellClass: 'rounded-2xl border border-gray-200 bg-white text-gray-900 shadow-sm',
            shellStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: cardBackground },
            toolbarClass: 'border-b border-gray-200 bg-gray-50/80',
            toolbarStyle: {},
            controlClass: 'border-gray-200 bg-white text-gray-900',
        };
    }

    return {
        ...base,
        shellClass: 'rounded-2xl border border-theme-subtle bg-theme-card/90 text-theme shadow-xl',
        shellStyle: {},
        toolbarClass: 'border-b border-theme-subtle bg-theme-elevated/40',
        toolbarStyle: {},
        controlClass: 'border-theme-subtle bg-theme-card text-theme',
    };
}

function Legend({ design, presentation, density }) {
    if (design.legendPlacement === 'hidden') return null;
    return (
        <div className={`flex flex-wrap items-center gap-2 border-theme-subtle text-xs font-bold ${density.legendPadding} ${design.legendPlacement === 'top' ? 'border-b' : 'border-t'}`}>
            {GANTT_STATUS_OPTIONS.map((option) => {
                const meta = statusMeta[option.value] || statusMeta.planned;
                const Icon = meta.icon;
                return (
                    <span key={option.value} className="inline-flex items-center gap-1.5 rounded-full border border-theme-subtle bg-theme-elevated/50 px-2.5 py-1 text-theme-muted">
                        <Icon size={13} className={meta.className} />
                        {option.label}
                    </span>
                );
            })}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-theme-subtle bg-theme-elevated/50 px-2.5 py-1 text-theme-muted">
                <Diamond size={13} style={{ color: presentation.accentColor }} />
                אבן דרך
            </span>
        </div>
    );
}

export default function GanttChart({
    data,
    compact = false,
    showToolbar = true,
    viewportHeight,
    layoutVariant = 'default',
    className = '',
}) {
    const gantt = useMemo(() => normalizeGanttData(data), [data]);
    const categories = useMemo(() => getCategories(gantt), [gantt]);
    const [selectedViewMode, setSelectedViewMode] = useState('');
    const [periodOffset, setPeriodOffset] = useState(0);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [todayString] = useState(() => localDateString());
    const [viewportWidth, setViewportWidth] = useState(() => (
        typeof window === 'undefined' ? 1280 : window.innerWidth
    ));
    const viewMode = selectedViewMode || gantt.defaultView;
    const design = gantt.settings.design;
    const density = useMemo(() => getDensityConfig(design, compact), [compact, design]);
    const presentation = useMemo(() => getGanttPresentation(design, layoutVariant), [design, layoutVariant]);
    const resolvedHeight = viewportHeight ?? getChartHeight(design, compact);
    const cardStyle = {
        ...(resolvedHeight ? { height: resolvedHeight } : {}),
        ...presentation.shellStyle,
    };
    const taskColumnWidth = useMemo(
        () => getTaskColumnWidth(design, viewportWidth, compact),
        [compact, design, viewportWidth]
    );

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const filteredItems = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return gantt.items.filter((item) => {
            if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
            if (statusFilter !== 'all' && item.status !== statusFilter) return false;
            if (!query) return true;
            return [item.title, item.owner, item.category, item.details]
                .some((value) => String(value || '').toLowerCase().includes(query));
        });
    }, [categoryFilter, gantt.items, searchTerm, statusFilter]);

    const model = useMemo(() => {
        return buildGanttTimelineModel({
            items: filteredItems,
            viewMode,
            compact,
            viewportWidth,
            taskColumnWidth,
            todayString,
            showToday: gantt.showToday,
            groupBy: gantt.groupBy,
            categories,
            periodOffset,
        });
    }, [categories, compact, filteredItems, gantt.groupBy, gantt.showToday, periodOffset, taskColumnWidth, todayString, viewMode, viewportWidth]);

    if (gantt.items.length === 0) {
        return (
            <section dir="rtl" className={`${presentation.widthClass} flex min-w-0 flex-col overflow-hidden ${presentation.shellClass} ${className}`} style={cardStyle}>
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 custom-scrollbar">
                    <EmptyState filtered={false} />
                </div>
            </section>
        );
    }

    if (filteredItems.length === 0) {
        return (
            <section dir="rtl" className={`${presentation.widthClass} flex min-w-0 flex-col overflow-hidden ${presentation.shellClass} ${className}`} style={cardStyle}>
                {!compact && showToolbar && (
                    <ChartToolbar
                        viewMode={viewMode}
                        setViewMode={setSelectedViewMode}
                        categoryFilter={categoryFilter}
                        setCategoryFilter={setCategoryFilter}
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        categories={categories}
                        periodOffset={periodOffset}
                        setPeriodOffset={setPeriodOffset}
                        design={design}
                        presentation={presentation}
                        density={density}
                    />
                )}
                <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 custom-scrollbar">
                    <EmptyState filtered />
                </div>
            </section>
        );
    }

    const rowHeight = density.rowHeight;
    const groupRowHeight = density.groupRowHeight;
    const showToday = Number.isFinite(model.todayOffset) && model.todayOffset >= 0 && model.todayOffset <= model.width;
    const showLegend = !compact && gantt.showLegend && design.legendPlacement !== 'hidden';

    return (
        <section
            dir="rtl"
            data-gantt-view-mode={viewMode}
            data-gantt-layout-variant={layoutVariant}
            data-gantt-viewport-height={resolvedHeight || ''}
            data-gantt-period-offset={model.periodOffset}
            data-gantt-range-start={toDateString(model.start)}
            data-gantt-range-end={toDateString(model.end)}
            data-gantt-day-width={model.dayWidth}
            data-gantt-total-days={model.totalDays}
            data-gantt-timeline-width={model.width}
            className={`${presentation.widthClass} flex min-w-0 flex-col overflow-hidden ${presentation.shellClass} ${className}`}
            style={cardStyle}
        >
            {!compact && showToolbar && (
                <ChartToolbar
                    viewMode={viewMode}
                    setViewMode={setSelectedViewMode}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={setCategoryFilter}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    categories={categories}
                    periodOffset={periodOffset}
                    setPeriodOffset={setPeriodOffset}
                    design={design}
                    presentation={presentation}
                    density={density}
                />
            )}

            {showLegend && design.legendPlacement === 'top' && <Legend design={design} presentation={presentation} density={density} />}

            <div className="min-h-0 flex-1 overflow-auto overscroll-contain custom-scrollbar [scrollbar-gutter:stable]">
                <div className="grid min-w-full" style={{ gridTemplateColumns: `${taskColumnWidth}px ${model.width}px` }}>
                    <div className="sticky right-0 top-0 z-40 flex items-center border-l border-theme-subtle bg-theme-card px-4 py-3 text-sm font-black shadow-sm" style={presentation.headerStyle}>
                        משימה
                    </div>
                    <div data-gantt-timeline-header className="sticky top-0 z-30 border-b border-theme-subtle bg-theme-elevated/95 shadow-sm backdrop-blur" style={{ width: model.width, ...presentation.headerStyle }}>
                        <div className="flex h-8">
                            {model.months.map((month) => (
                                <div
                                    key={month.key}
                                    className="flex items-center justify-center border-l border-theme-subtle px-2 text-xs font-black text-theme"
                                    style={{ width: month.width, borderColor: presentation.gridColor }}
                                >
                                    <span className="truncate">{month.label}</span>
                                </div>
                            ))}
                        </div>
                        <div className="relative h-8">
                            {model.ticks.map((tick) => (
                                <div
                                    key={tick.date}
                                    data-gantt-tick={tick.date}
                                    className={`absolute top-0 flex h-8 items-center border-r pr-1 text-[11px] ${tick.strong ? 'border-primary/40 text-theme' : 'border-theme-subtle text-theme-muted'}`}
                                    style={{ right: tick.offset, borderColor: tick.strong ? presentation.accentColor : presentation.gridColor }}
                                >
                                    {formatShortDate(tick.date)}
                                </div>
                            ))}
                            {showToday && (
                                <div
                                    data-gantt-today-line="header"
                                    data-gantt-x={model.todayOffset}
                                    className="absolute inset-y-0 z-[2] border-r"
                                    style={{
                                        right: model.todayOffset,
                                        borderColor: presentation.todayLineColor,
                                        borderRightWidth: presentation.todayLine.width,
                                        opacity: presentation.todayLine.opacity,
                                    }}
                                >
                                    <span className="absolute -right-5 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-black" style={{ backgroundColor: colorWithAlpha(presentation.todayLineColor, '18'), color: presentation.todayLineColor }}>
                                        היום
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {model.groups.map((group) => (
                        <React.Fragment key={group.id}>
                            <div className="sticky right-0 z-10 flex items-center justify-between gap-2 border-l border-t border-theme-subtle bg-theme-elevated px-4 text-sm font-black text-primary" style={{ height: groupRowHeight, color: presentation.accentColor, ...presentation.groupStyle }}>
                                <span className="truncate">{group.label}</span>
                                <span className="rounded-full border border-theme-subtle bg-theme-card px-2 py-0.5 text-[10px] text-theme-muted">{group.items.length}</span>
                            </div>
                            <div className="relative border-t border-theme-subtle bg-theme-elevated/40" style={{ width: model.width, height: groupRowHeight, ...presentation.groupStyle }}>
                                {model.ticks.map((tick) => (
                                    <div key={tick.date} className="absolute inset-y-0 border-r" style={{ right: tick.offset, borderColor: tick.strong ? colorWithAlpha(presentation.accentColor, '55') : presentation.gridColor }} />
                                ))}
                                {showToday && (
                                    <div
                                        className="absolute inset-y-0 z-[1] border-r"
                                        style={{
                                            right: model.todayOffset,
                                            borderColor: presentation.todayLineColor,
                                            borderRightWidth: presentation.todayLine.width,
                                            opacity: presentation.todayLine.opacity * 0.8,
                                        }}
                                    />
                                )}
                            </div>

                            {group.items.map((item) => {
                                const start = parseDate(item.startDate) || model.start;
                                const end = parseDate(item.endDate) || start;
                                const offset = Math.max(0, diffDays(model.start, start) * model.dayWidth);
                                const duration = Math.max(1, diffDays(start, end) + 1);
                                const barWidth = Math.max(duration * model.dayWidth, 22);
                                const meta = statusMeta[item.status] || statusMeta.planned;
                                const Icon = meta.icon;
                                const progress = computeGanttProgress(item, todayString);
                                const timeStatus = computeGanttTimeStatus(item, todayString);
                                const milestones = Array.isArray(item.milestones) ? item.milestones : [];
                                const milestoneSize = density.markerSize;
                                const barTitle = `${item.title} | ${item.startDate} - ${item.endDate} | ${timeStatusLabel[timeStatus] || timeStatus} | ${progress}%`;

                                return (
                                    <React.Fragment key={item.id}>
                                        <div className="sticky right-0 z-10 flex items-center gap-2 border-l border-t border-theme-subtle bg-theme-card px-3" style={{ height: rowHeight, ...presentation.taskCellStyle }}>
                                            <Icon size={15} className={`${meta.className} shrink-0`} />
                                            <div className="min-w-0 flex-1 text-right">
                                                <div className={`truncate font-black ${density.taskTextClass}`} title={item.title}>{item.title}</div>
                                                <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-theme-muted">
                                                    <span className="truncate" title={item.owner || item.category}>{item.owner || item.category}</span>
                                                    {milestones.length > 0 && (
                                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-theme-subtle px-1.5 py-0.5">
                                                            <Diamond size={10} style={{ color: presentation.accentColor }} />
                                                            {milestones.length}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div data-gantt-task-row={item.id} className="relative border-t border-theme-subtle bg-theme-card/40" style={{ width: model.width, height: rowHeight, ...presentation.timelineCellStyle }}>
                                            {model.ticks.map((tick) => (
                                                <div key={tick.date} className="absolute inset-y-0 border-r" style={{ right: tick.offset, borderColor: tick.strong ? colorWithAlpha(presentation.accentColor, '44') : presentation.gridColor }} />
                                            ))}
                                            {showToday && (
                                                <div
                                                    data-gantt-today-line="row"
                                                    data-gantt-x={model.todayOffset}
                                                    className="absolute inset-y-0 z-[1] border-r"
                                                    style={{
                                                        right: model.todayOffset,
                                                        borderColor: presentation.todayLineColor,
                                                        borderRightWidth: presentation.todayLine.width,
                                                        opacity: presentation.todayLine.opacity * 0.75,
                                                    }}
                                                />
                                            )}

                                            <div
                                                data-gantt-task-bar={item.id}
                                                data-gantt-x={offset}
                                                data-gantt-width={barWidth}
                                                className={`absolute top-1/2 z-[3] -translate-y-1/2 overflow-hidden border ${density.barHeightClass} ${design.barStyle === 'flat' ? 'rounded-md' : 'rounded-full'} ${design.barShadow ? 'shadow-sm' : ''}`}
                                                style={{
                                                    right: offset,
                                                    width: barWidth,
                                                    borderColor: colorWithAlpha(item.color, '80'),
                                                    backgroundColor: progress >= 100 ? item.color : colorWithAlpha(item.color, '24'),
                                                }}
                                                title={barTitle}
                                            >
                                                <div
                                                    className={`absolute inset-y-0 right-0 transition-all ${design.barStyle === 'flat' ? 'rounded-md' : 'rounded-full'}`}
                                                    style={{ width: `${progress}%`, backgroundColor: item.color }}
                                                />
                                                {!compact && design.showProgressLabel && (
                                                    <span className={`absolute inset-0 flex items-center justify-center px-2 text-[11px] font-black ${progress >= 35 ? 'text-white' : 'text-theme'}`}>
                                                        {progress}%
                                                    </span>
                                                )}
                                            </div>

                                            {milestones.map((milestone) => {
                                                const milestoneDate = parseDate(milestone.date);
                                                if (!Number.isFinite(milestoneDate)) return null;
                                                const milestoneOffset = diffDays(model.start, milestoneDate) * model.dayWidth;
                                                const markerRight = Math.max(0, Math.min(model.width - milestoneSize, milestoneOffset - milestoneSize / 2));
                                                const reached = milestoneDate <= parseDate(todayString);
                                                const milestoneTitle = `אבן דרך ${milestone.order}\n${milestone.title}\n${formatShortDate(milestone.date)}\n${reached ? 'הושגה' : 'טרם הגיעה'}`;
                                                const markerStyle = {
                                                    right: markerRight,
                                                    width: milestoneSize,
                                                    height: milestoneSize,
                                                    borderColor: presentation.accentColor,
                                                    backgroundColor: reached ? presentation.accentColor : presentation.taskCellStyle.backgroundColor || '#ffffff',
                                                    color: reached ? '#ffffff' : presentation.accentColor,
                                                };
                                                const markerClass = design.milestoneStyle === 'dot'
                                                    ? 'rounded-full'
                                                    : (design.milestoneStyle === 'flag' ? 'rounded-full border-0 bg-transparent shadow-none' : 'rotate-45 rounded-[3px]');
                                                return (
                                                    <button
                                                        key={milestone.id}
                                                        type="button"
                                                        data-gantt-milestone={milestone.id}
                                                        data-gantt-x={markerRight}
                                                        className={`absolute top-1/2 z-[4] -translate-y-1/2 border transition focus:outline-none focus:ring-2 focus:ring-primary/40 ${markerClass}`}
                                                        style={markerStyle}
                                                        title={milestoneTitle}
                                                        aria-label={milestoneTitle.replace(/\n/g, ', ')}
                                                    >
                                                        {design.milestoneStyle === 'flag' && <Flag size={milestoneSize + 2} fill={reached ? presentation.accentColor : 'none'} />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </React.Fragment>
                    ))}
                </div>
            </div>

            {showLegend && design.legendPlacement === 'bottom' && <Legend design={design} presentation={presentation} density={density} />}
        </section>
    );
}
