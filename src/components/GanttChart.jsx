import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleHelp, Diamond, Flag, OctagonAlert, PauseCircle, Search, X, XCircle } from 'lucide-react';
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
const MILESTONE_HIT_AREA = 40;
const MILESTONE_POPOVER_MIN_WIDTH = 220;
const MILESTONE_POPOVER_MAX_WIDTH = 260;

const DENSITY_CONFIG = {
    compact: { rowHeight: 42, groupRowHeight: 30, toolbarPadding: 'p-2', barHeightClass: 'h-5', taskTextClass: 'text-xs', markerSize: 12, legendPadding: 'px-3 py-2' },
    comfortable: { rowHeight: ROW_HEIGHT, groupRowHeight: GROUP_ROW_HEIGHT, toolbarPadding: 'p-3', barHeightClass: 'h-7', taskTextClass: 'text-sm', markerSize: 15, legendPadding: 'px-4 py-3' },
    publicComfortable: { rowHeight: 46, groupRowHeight: 32, toolbarPadding: 'p-2.5', barHeightClass: 'h-6', taskTextClass: 'text-sm', markerSize: 15, legendPadding: 'px-3 py-2' },
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

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
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
    showLegendHelp,
    isLegendHelpOpen,
    onToggleLegendHelp,
    onCloseLegendHelp,
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
                {showLegendHelp && (
                    <div className="relative z-50">
                        <button
                            type="button"
                            onClick={onToggleLegendHelp}
                            className={`inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black outline-none transition-[background-color,color,transform,box-shadow] hover:shadow-sm active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-primary/40 ${presentation.controlClass}`}
                            aria-expanded={isLegendHelpOpen}
                            aria-haspopup="dialog"
                            aria-controls="gantt-legend-help"
                            title="עזרה לקריאת הגאנט"
                        >
                            <CircleHelp size={15} />
                            <span>מקרא</span>
                        </button>
                        {isLegendHelpOpen && (
                            <div
                                id="gantt-legend-help"
                                role="dialog"
                                aria-label="עזרה לקריאת הגאנט"
                                data-gantt-legend-help
                                className="absolute right-[calc(100%+8px)] top-1/2 z-[80] w-[min(78vw,360px)] -translate-y-1/2 rounded-2xl border border-theme-subtle bg-theme-card p-3 text-right text-xs text-theme shadow-[0_18px_44px_rgba(15,23,42,0.18)]"
                            >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <div className="min-w-0 font-black text-theme">עזרה לקריאת הגאנט</div>
                                    <button
                                        type="button"
                                        onClick={onCloseLegendHelp}
                                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-theme-muted transition-[background-color,color,transform] hover:bg-theme-elevated hover:text-theme active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                        aria-label="סגור עזרה לקריאת הגאנט"
                                    >
                                        <X size={14} />
                                    </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <LegendItems presentation={presentation} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
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

function getDensityConfig(design, compact, layoutVariant) {
    if (compact) return DENSITY_CONFIG.compact;
    if (layoutVariant === 'public' && design.density === 'comfortable') return DENSITY_CONFIG.publicComfortable;
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
            shellClass: `rounded-[28px] border border-white/40 bg-white/70 text-gray-900 ${forcePublicFullWidth ? 'shadow-none' : 'shadow-xl'} backdrop-blur-xl`,
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
            shellClass: `rounded-2xl border border-gray-200 bg-white text-gray-900 ${forcePublicFullWidth ? 'shadow-none' : 'shadow-sm'}`,
            shellStyle: design.backgroundStyle === 'site' ? {} : { backgroundColor: cardBackground },
            toolbarClass: 'border-b border-gray-200 bg-gray-50/80',
            toolbarStyle: {},
            controlClass: 'border-gray-200 bg-white text-gray-900',
        };
    }

    return {
        ...base,
        shellClass: `rounded-2xl border border-theme-subtle bg-theme-card/90 text-theme ${forcePublicFullWidth ? 'shadow-none' : 'shadow-xl'}`,
        shellStyle: {},
        toolbarClass: 'border-b border-theme-subtle bg-theme-elevated/40',
        toolbarStyle: {},
        controlClass: 'border-theme-subtle bg-theme-card text-theme',
    };
}

function LegendItems({ presentation }) {
    return (
        <>
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
        </>
    );
}

export default function GanttChart({
    data,
    compact = false,
    showToolbar = true,
    viewportHeight,
    fitHeightToContent = false,
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
    const [selectedMilestone, setSelectedMilestone] = useState(null);
    const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
    const [isLegendHelpOpen, setIsLegendHelpOpen] = useState(false);
    const [todayString] = useState(() => localDateString());
    const [viewportWidth, setViewportWidth] = useState(() => (
        typeof window === 'undefined' ? 1280 : window.innerWidth
    ));
    const viewMode = selectedViewMode || gantt.defaultView;
    const design = gantt.settings.design;
    const density = useMemo(() => getDensityConfig(design, compact, layoutVariant), [compact, design, layoutVariant]);
    const presentation = useMemo(() => getGanttPresentation(design, layoutVariant), [design, layoutVariant]);
    const resolvedHeight = viewportHeight ?? getChartHeight(design, compact);
    const cardStyle = {
        ...(resolvedHeight ? (fitHeightToContent ? { maxHeight: resolvedHeight } : { height: resolvedHeight }) : {}),
        ...presentation.shellStyle,
    };
    const taskColumnWidth = useMemo(
        () => getTaskColumnWidth(design, viewportWidth, compact),
        [compact, design, viewportWidth]
    );
    const showLegendHelp = !compact && gantt.showLegend && design.legendPlacement !== 'hidden';

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const onResize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const closeFloatingDetails = () => {
        setSelectedMilestone(null);
        setIsLegendHelpOpen(false);
    };
    const updateSelectedViewMode = (nextViewMode) => {
        closeFloatingDetails();
        setSelectedViewMode(nextViewMode);
    };
    const updatePeriodOffset = (nextPeriodOffset) => {
        closeFloatingDetails();
        setPeriodOffset(nextPeriodOffset);
    };
    const updateCategoryFilter = (nextCategoryFilter) => {
        closeFloatingDetails();
        setCategoryFilter(nextCategoryFilter);
    };
    const updateStatusFilter = (nextStatusFilter) => {
        closeFloatingDetails();
        setStatusFilter(nextStatusFilter);
    };
    const updateSearchTerm = (nextSearchTerm) => {
        closeFloatingDetails();
        setSearchTerm(nextSearchTerm);
    };
    const toggleGroupCollapsed = (groupId) => {
        closeFloatingDetails();
        setCollapsedGroups((current) => {
            const next = new Set(current);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };
    const toggleLegendHelp = () => {
        setSelectedMilestone(null);
        setIsLegendHelpOpen((isOpen) => !isOpen);
    };

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
                        setViewMode={updateSelectedViewMode}
                        categoryFilter={categoryFilter}
                        setCategoryFilter={updateCategoryFilter}
                        statusFilter={statusFilter}
                        setStatusFilter={updateStatusFilter}
                        searchTerm={searchTerm}
                        setSearchTerm={updateSearchTerm}
                        categories={categories}
                        periodOffset={periodOffset}
                        setPeriodOffset={updatePeriodOffset}
                        design={design}
                        presentation={presentation}
                        density={density}
                        showLegendHelp={showLegendHelp}
                        isLegendHelpOpen={isLegendHelpOpen}
                        onToggleLegendHelp={toggleLegendHelp}
                        onCloseLegendHelp={() => setIsLegendHelpOpen(false)}
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
    const todayLabelRight = showToday
        ? clampNumber(model.todayOffset - 27, 6, Math.max(6, model.width - 60))
        : 0;

    return (
        <section
            dir="rtl"
            data-gantt-view-mode={viewMode}
            data-gantt-layout-variant={layoutVariant}
            data-gantt-viewport-height={resolvedHeight || ''}
            data-gantt-fit-height-to-content={fitHeightToContent ? 'true' : 'false'}
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
                    setViewMode={updateSelectedViewMode}
                    categoryFilter={categoryFilter}
                    setCategoryFilter={updateCategoryFilter}
                    statusFilter={statusFilter}
                    setStatusFilter={updateStatusFilter}
                    searchTerm={searchTerm}
                    setSearchTerm={updateSearchTerm}
                    categories={categories}
                    periodOffset={periodOffset}
                    setPeriodOffset={updatePeriodOffset}
                    design={design}
                    presentation={presentation}
                    density={density}
                    showLegendHelp={showLegendHelp}
                    isLegendHelpOpen={isLegendHelpOpen}
                    onToggleLegendHelp={toggleLegendHelp}
                    onCloseLegendHelp={() => setIsLegendHelpOpen(false)}
                />
            )}

            <div className={`min-h-0 overflow-auto overscroll-contain custom-scrollbar [scrollbar-gutter:stable] ${fitHeightToContent ? 'flex-[1_1_auto]' : 'flex-1'}`}>
                <div className="grid min-w-full" style={{ gridTemplateColumns: `${taskColumnWidth}px ${model.width}px` }}>
                    <div className="sticky right-0 top-0 z-40 flex items-center border-l border-theme-subtle bg-theme-card px-4 py-3 text-sm font-black shadow-sm" style={presentation.headerStyle}>
                        משימה
                    </div>
                    <div data-gantt-timeline-header className="sticky top-0 z-30 border-b border-theme-subtle bg-theme-elevated/95 shadow-sm backdrop-blur" style={{ width: model.width, ...presentation.headerStyle }}>
                        {showToday && (
                            <span
                                data-gantt-today-label="header"
                                data-gantt-x={model.todayOffset}
                                className="pointer-events-none absolute top-8 z-50 inline-flex h-6 min-w-[54px] items-center justify-center rounded-full border px-2 text-[11px] font-black shadow-sm tabular-nums"
                                style={{
                                    right: todayLabelRight,
                                    borderColor: colorWithAlpha(presentation.todayLineColor, '66'),
                                    backgroundColor: presentation.taskCellStyle.backgroundColor || presentation.headerStyle.backgroundColor || '#ffffff',
                                    color: presentation.todayLineColor,
                                    boxShadow: '0 8px 18px rgba(15, 23, 42, 0.14)',
                                }}
                            >
                                היום
                            </span>
                        )}
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
                                />
                            )}
                        </div>
                    </div>

                    {model.groups.map((group) => {
                        const isCollapsed = collapsedGroups.has(group.id);
                        const toggleLabel = `${isCollapsed ? 'הרחב' : 'צמצם'} קטגוריה ${group.label}`;
                        return (
                            <React.Fragment key={group.id}>
                                <div className="sticky right-0 z-10 flex items-center justify-between gap-2 border-l border-t border-theme-subtle bg-theme-elevated px-3 text-sm font-black text-primary" style={{ height: groupRowHeight, color: presentation.accentColor, ...presentation.groupStyle }}>
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <button
                                            type="button"
                                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-theme-muted transition-[background-color,color,transform] hover:bg-theme-card hover:text-theme active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                            onClick={() => toggleGroupCollapsed(group.id)}
                                            aria-expanded={!isCollapsed}
                                            aria-label={toggleLabel}
                                            title={toggleLabel}
                                            data-gantt-group-toggle={group.id}
                                        >
                                            <ChevronDown size={16} className={`transition-transform ${isCollapsed ? 'rotate-90' : ''}`} />
                                        </button>
                                        <span className="truncate">{group.label}</span>
                                    </div>
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

                                {!isCollapsed && group.items.map((item) => {
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
                                                const markerCenter = clampNumber(milestoneOffset, milestoneSize / 2, Math.max(milestoneSize / 2, model.width - milestoneSize / 2));
                                                const markerRight = clampNumber(markerCenter - milestoneSize / 2, 0, Math.max(0, model.width - milestoneSize));
                                                const hitAreaRight = clampNumber(markerCenter - MILESTONE_HIT_AREA / 2, 0, Math.max(0, model.width - MILESTONE_HIT_AREA));
                                                const reached = milestoneDate <= parseDate(todayString);
                                                const milestoneTitle = `אבן דרך ${milestone.order}\n${milestone.title}\n${formatShortDate(milestone.date)}\n${reached ? 'הושגה' : 'טרם הגיעה'}`;
                                                const isSelected = selectedMilestone?.taskId === item.id && selectedMilestone?.id === milestone.id;
                                                const markerShapeStyle = {
                                                    width: milestoneSize,
                                                    height: milestoneSize,
                                                    borderColor: presentation.accentColor,
                                                    backgroundColor: reached ? presentation.accentColor : presentation.taskCellStyle.backgroundColor || '#ffffff',
                                                    color: reached ? '#ffffff' : presentation.accentColor,
                                                };
                                                const markerShapeClass = design.milestoneStyle === 'dot'
                                                    ? 'rounded-full border'
                                                    : (design.milestoneStyle === 'flag' ? 'flex items-center justify-center rounded-full border-0 bg-transparent shadow-none' : 'rotate-45 rounded-[3px] border');
                                                return (
                                                    <button
                                                        key={milestone.id}
                                                        type="button"
                                                        data-gantt-milestone={milestone.id}
                                                        data-gantt-x={markerRight}
                                                        aria-expanded={isSelected}
                                                        className={`absolute top-1/2 z-[4] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-transform hover:scale-[1.06] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-primary/40 ${isSelected ? 'scale-[1.08] ring-2 ring-primary/30' : ''}`}
                                                        style={{ right: hitAreaRight }}
                                                        title={milestoneTitle}
                                                        aria-label={milestoneTitle.replace(/\n/g, ', ')}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setSelectedMilestone((current) => (
                                                                current?.taskId === item.id && current?.id === milestone.id
                                                                    ? null
                                                                    : {
                                                                        id: milestone.id,
                                                                        taskId: item.id,
                                                                    }
                                                            ));
                                                        }}
                                                    >
                                                        <span className={`block shadow-sm ${markerShapeClass}`} style={markerShapeStyle} aria-hidden="true">
                                                            {design.milestoneStyle === 'flag' && <Flag size={milestoneSize + 4} fill={reached ? presentation.accentColor : 'none'} />}
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                            {selectedMilestone?.taskId === item.id && (() => {
                                                const milestone = milestones.find((candidate) => candidate.id === selectedMilestone.id);
                                                if (!milestone) return null;
                                                const milestoneDate = parseDate(milestone.date);
                                                if (!Number.isFinite(milestoneDate)) return null;
                                                const milestoneOffset = diffDays(model.start, milestoneDate) * model.dayWidth;
                                                const markerCenter = clampNumber(milestoneOffset, milestoneSize / 2, Math.max(milestoneSize / 2, model.width - milestoneSize / 2));
                                                const popoverWidth = Math.min(MILESTONE_POPOVER_MAX_WIDTH, Math.max(MILESTONE_POPOVER_MIN_WIDTH, model.width - 16));
                                                const popoverRight = clampNumber(markerCenter - popoverWidth / 2, 8, Math.max(8, model.width - popoverWidth - 8));
                                                const reached = milestoneDate <= parseDate(todayString);
                                                return (
                                                    <div
                                                        role="dialog"
                                                        aria-label={`פרטי אבן דרך ${milestone.title}`}
                                                        data-gantt-milestone-popover={milestone.id}
                                                        className="absolute top-[calc(50%+18px)] z-[60] rounded-2xl border border-theme-subtle bg-theme-card p-3 text-right text-xs text-theme shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
                                                        style={{ right: popoverRight, width: popoverWidth }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="text-[11px] font-black text-theme-muted">אבן דרך {milestone.order}</div>
                                                                <div className="mt-1 truncate text-sm font-black text-theme" title={milestone.title}>{milestone.title}</div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedMilestone(null)}
                                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-theme-muted transition-transform hover:bg-theme-elevated hover:text-theme active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                                                                aria-label="סגור פרטי אבן דרך"
                                                            >
                                                                <X size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="mt-3 space-y-1.5 leading-5">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="font-bold text-theme-muted">משימה</span>
                                                                <span className="min-w-0 truncate font-black text-theme" title={item.title}>{item.title}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="font-bold text-theme-muted">תאריך</span>
                                                                <span className="font-black tabular-nums text-theme">{formatShortDate(milestone.date)}</span>
                                                            </div>
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="font-bold text-theme-muted">מצב</span>
                                                                <span className="rounded-full border border-theme-subtle bg-theme-elevated px-2 py-0.5 font-black text-theme">
                                                                    {reached ? 'הושגה' : 'טרם הגיעה'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </React.Fragment>
                        );
                    })}
                </div>
            </div>

        </section>
    );
}
