import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleHelp, Diamond, Flag, OctagonAlert, PauseCircle, Repeat2, Search, X, XCircle } from 'lucide-react';
import {
    GANTT_STATUS_OPTIONS,
    GANTT_VIEW_OPTIONS,
    computeGanttProgress,
    computeGanttTimeStatus,
    describeGanttRecurrence,
    expandGanttRecurringTasks,
    normalizeGanttData,
} from '../utils/ganttData';
import { buildGanttTimelineModel, resolveGanttTimelineRange } from '../utils/ganttTimeline';
import { getHebrewDateLabel, buildHolidayMapForRange } from '../utils/hebrewCalendar';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROW_HEIGHT = 50;
const COMPACT_ROW_HEIGHT = 44;
const GROUP_ROW_HEIGHT = 34;
const COMPACT_TASK_COLUMN_WIDTH = 188;
const MILESTONE_HIT_AREA = 40;
const MILESTONE_POPOVER_MIN_WIDTH = 220;
const MILESTONE_POPOVER_MAX_WIDTH = 260;
const MILESTONE_POPOVER_SCROLL_SPACE = 190;
const FLOATING_OVERLAY_Z = 500;
const TASK_HOVER_CARD_WIDTH = 272;
const TASK_NAME_ON_BAR_MIN_WIDTH = 46;
const PROGRESS_LABEL_MIN_WIDTH = 26;
const BOTH_NAME_AND_PROGRESS_MIN_WIDTH = 72;

/**
 * Shared floating-position calculator used by portal-rendered overlays (legend
 * help panel, task hover card) so they escape ancestor `overflow` clipping and
 * stay correctly placed near viewport edges. Mirrors the pattern already used
 * by HelpTooltipButton (src/components/AdminHelp.jsx).
 */
function useFloatingPosition(isOpen, anchorRef, panelRef, { gap = 8, padding = 12, preferredWidth, align = 'end' } = {}) {
    const [style, setStyle] = useState(null);

    useEffect(() => {
        // No cleanup needed when closed: the caller only renders the portal
        // while `isOpen` is true, so a stale style value is never displayed.
        if (!isOpen || typeof window === 'undefined') return undefined;

        const updatePosition = () => {
            if (!anchorRef.current) return;
            const anchorRect = anchorRef.current.getBoundingClientRect();
            const panelRect = panelRef.current?.getBoundingClientRect();
            const width = Math.min(preferredWidth || panelRect?.width || 280, window.innerWidth - padding * 2);
            const height = panelRect?.height || 160;

            let left = align === 'center'
                ? anchorRect.left + anchorRect.width / 2 - width / 2
                : anchorRect.right - width;
            left = Math.max(padding, Math.min(left, window.innerWidth - width - padding));

            const fitsBelow = anchorRect.bottom + gap + height <= window.innerHeight - padding;
            const top = fitsBelow
                ? anchorRect.bottom + gap
                : Math.max(padding, anchorRect.top - height - gap);
            const placement = fitsBelow ? 'below' : 'above';

            setStyle({ top, left, width, placement });
        };

        // Compute synchronously (no rAF) so the panel is positioned and
        // accessible in the very same commit it opens in.
        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen, anchorRef, panelRef, gap, padding, preferredWidth, align]);

    return style;
}

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
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}${alphaHex}`;
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
        const expanded = color.slice(1).split('').map((digit) => `${digit}${digit}`).join('');
        return `#${expanded}${alphaHex}`;
    }
    return color;
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
                    <LegendHelpButton
                        presentation={presentation}
                        isOpen={isLegendHelpOpen}
                        onToggle={onToggleLegendHelp}
                        onClose={onCloseLegendHelp}
                    />
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

/**
 * Legend trigger + panel. The panel is portal-rendered to `document.body` with
 * viewport-clamped `position: fixed` coordinates (see `useFloatingPosition`)
 * so it always renders above the Gantt content and is never clipped by the
 * chart shell's `overflow-hidden` card container.
 */
function LegendHelpButton({ presentation, isOpen, onToggle, onClose }) {
    const buttonRef = useRef(null);
    const panelRef = useRef(null);
    const panelStyle = useFloatingPosition(isOpen, buttonRef, panelRef, { preferredWidth: 320, align: 'end' });

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={onToggle}
                className={`inline-flex h-9 min-w-10 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-black outline-none transition-[background-color,color,transform,box-shadow] hover:shadow-sm active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-primary/40 ${presentation.controlClass}`}
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                aria-controls="gantt-legend-help"
                title="עזרה לקריאת הגאנט"
            >
                <CircleHelp size={15} />
                <span>מקרא</span>
            </button>
            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    id="gantt-legend-help"
                    role="dialog"
                    aria-label="עזרה לקריאת הגאנט"
                    data-gantt-legend-help
                    className="fixed w-[min(78vw,320px)] rounded-2xl border border-theme-subtle bg-theme-card p-3 text-right text-xs text-theme shadow-[0_18px_44px_rgba(15,23,42,0.22)]"
                    style={{
                        zIndex: FLOATING_OVERLAY_Z,
                        top: panelStyle?.top ?? -9999,
                        left: panelStyle?.left ?? -9999,
                        visibility: panelStyle ? 'visible' : 'hidden',
                    }}
                >
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="min-w-0 font-black text-theme">עזרה לקריאת הגאנט</div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-theme-muted transition-[background-color,color,transform] hover:bg-theme-elevated hover:text-theme active:scale-[0.96] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            aria-label="סגור עזרה לקריאת הגאנט"
                        >
                            <X size={14} />
                        </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <LegendItems presentation={presentation} />
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

/**
 * Premium floating "glass" info panel shown while hovering/focusing a task
 * bar. Positioned with `position: fixed` from the bar's own bounding rect
 * (computed once on mouse/focus enter, so pointer movement within the same
 * bar never re-triggers positioning or flicker) and portal-rendered so it can
 * never be clipped by the scrollable Gantt body.
 */
function TaskHoverCard({ hoverCard, presentation, design, timeStatusLabel: timeStatusLabels }) {
    if (!hoverCard || typeof document === 'undefined') return null;
    const { rect, item, occStartStr, occEndStr, progress, timeStatus, recurrenceEnabled, recurrenceLabel, occurrenceOrdinal, milestonesCount } = hoverCard;
    const viewportWidth = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 800 : window.innerHeight;
    const gap = 10;
    const width = TASK_HOVER_CARD_WIDTH;
    const left = clampNumber(rect.left + rect.width / 2 - width / 2, 8, Math.max(8, viewportWidth - width - 8));
    const estimatedHeight = 172;
    const placeAbove = rect.top - estimatedHeight - gap >= 8 || (viewportHeight - rect.bottom) < estimatedHeight + gap;
    const top = placeAbove ? Math.max(8, rect.top - gap) : Math.min(viewportHeight - 8, rect.bottom + gap);
    // Tailwind's opacity modifier (e.g. `bg-theme-card/75`) can't inject alpha
    // into these theme CSS variables, so the glass tint is built explicitly
    // from the design's own card-background color to guarantee it's actually
    // translucent (and readable) rather than silently rendering solid/transparent.
    const glassBackground = colorWithAlpha(design?.colors?.cardBackground || '#ffffff', 'BF');

    return createPortal(
        <div
            role="tooltip"
            data-gantt-hover-card={item.id}
            className="pointer-events-none fixed"
            style={{
                zIndex: FLOATING_OVERLAY_Z,
                left,
                top,
                width,
                transform: placeAbove ? 'translateY(-100%)' : 'none',
            }}
        >
            <div
                className="rounded-2xl border border-theme-subtle p-3.5 text-xs leading-5 text-theme shadow-[0_22px_55px_rgba(15,23,42,0.28)] backdrop-blur-xl"
                style={{ backgroundColor: glassBackground }}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="truncate text-sm font-black text-theme">{item.title}</div>
                        {item.category && (
                            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-bold text-theme-muted">
                                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="truncate">{item.category}</span>
                            </div>
                        )}
                    </div>
                    <span className="shrink-0 rounded-full border border-theme-subtle bg-theme-elevated px-2 py-0.5 text-[10px] font-black text-theme-muted">
                        {timeStatusLabels[timeStatus] || timeStatus}
                    </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-3 text-[11px] font-bold text-theme-muted">
                    <span className="tabular-nums">{formatShortDate(occStartStr)} – {formatShortDate(occEndStr)}</span>
                    <span className="tabular-nums font-black text-theme">{progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-theme-elevated">
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: item.color }} />
                </div>

                {recurrenceEnabled && (
                    <div className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-theme-subtle bg-theme-elevated px-2 py-1.5 text-[11px] font-bold text-theme-muted">
                        <Repeat2 size={12} className="shrink-0" style={{ color: presentation.accentColor }} />
                        <span className="truncate">מופע {occurrenceOrdinal} · {recurrenceLabel}</span>
                    </div>
                )}
                {milestonesCount > 0 && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-theme-muted">
                        <Diamond size={11} className="shrink-0" style={{ color: presentation.accentColor }} />
                        {milestonesCount} אבני דרך
                    </div>
                )}
            </div>
        </div>,
        document.body
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
    const [hoverCard, setHoverCard] = useState(null);
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
        setHoverCard(null);
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
    const openHoverCard = (details, element) => {
        if (!element) return;
        const rect = element.getBoundingClientRect();
        setHoverCard({
            ...details,
            rect: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
        });
    };
    const closeHoverCard = () => setHoverCard(null);

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

    const timelineRange = useMemo(() => {
        return resolveGanttTimelineRange(filteredItems, viewMode, todayString, periodOffset);
    }, [filteredItems, periodOffset, todayString, viewMode]);

    // Recurring tasks stay a single logical row; occurrences are calculated and
    // rendered as multiple bars within that same row (see the task-row loop below).
    const displayItems = filteredItems;

    const model = useMemo(() => {
        return buildGanttTimelineModel({
            items: displayItems,
            viewMode,
            compact,
            viewportWidth,
            taskColumnWidth,
            todayString,
            showToday: gantt.showToday,
            groupBy: gantt.groupBy,
            categories,
            periodOffset,
            timelineRange,
        });
    }, [categories, compact, displayItems, gantt.groupBy, gantt.showToday, periodOffset, taskColumnWidth, timelineRange, todayString, viewMode, viewportWidth]);

    const holidayMap = useMemo(() => {
        if (!design.showHolidays || !model) return new Map();
        return buildHolidayMapForRange(toDateString(model.start), toDateString(model.end));
    }, [design.showHolidays, model]);

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
    const isMilestonePopoverOpen = Boolean(selectedMilestone);

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

            <div
                data-gantt-scroll-body
                data-gantt-milestone-popover-open={isMilestonePopoverOpen ? 'true' : 'false'}
                className={`min-h-0 overflow-auto overscroll-contain custom-scrollbar [scrollbar-gutter:stable] ${fitHeightToContent ? 'flex-[1_1_auto]' : 'flex-1'}`}
                style={isMilestonePopoverOpen ? { paddingBottom: MILESTONE_POPOVER_SCROLL_SPACE } : undefined}
                onScroll={closeHoverCard}
            >
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
                        <div className={`relative ${design.showHebrewDate ? 'h-12' : 'h-8'}`}>
                            {model.ticks.map((tick) => {
                                const hebrewDateLabel = design.showHebrewDate ? getHebrewDateLabel(tick.date) : null;
                                return (
                                    <div
                                        key={tick.date}
                                        data-gantt-tick={tick.date}
                                        className={`absolute top-0 border-r pr-1 text-[11px] ${design.showHebrewDate ? 'flex h-12 flex-col items-start justify-center gap-0.5' : 'flex h-8 items-center'} ${tick.strong ? 'border-primary/40 text-theme' : 'border-theme-subtle text-theme-muted'}`}
                                        style={{ right: tick.offset, borderColor: tick.strong ? presentation.accentColor : presentation.gridColor }}
                                    >
                                        <span>{formatShortDate(tick.date)}</span>
                                        {hebrewDateLabel && (
                                            <span dir="rtl" className="whitespace-nowrap text-[9px] font-normal leading-none text-theme-muted/80">
                                                {hebrewDateLabel}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
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
                        {design.showHolidays && holidayMap.size > 0 && (
                            <div className="relative h-5 border-t border-theme-subtle/60" data-gantt-holiday-row="">
                                {[...holidayMap.entries()].map(([date, holidays]) => {
                                    const holidayTs = parseDate(date);
                                    if (!Number.isFinite(holidayTs)) return null;
                                    const offset = diffDays(model.start, holidayTs) * model.dayWidth;
                                    const label = holidays.map((holiday) => holiday.nameHe).join(' · ');
                                    return (
                                        <div
                                            key={date}
                                            data-gantt-holiday={date}
                                            title={label}
                                            className="absolute top-0 flex h-5 items-center gap-1 overflow-hidden px-1 text-[9px] font-bold text-amber-600"
                                            style={{ right: offset, width: Math.max(model.dayWidth, 8) }}
                                        >
                                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                            {model.dayWidth >= 46 && <span className="truncate">{label}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
                                    const meta = statusMeta[item.status] || statusMeta.planned;
                                    const Icon = meta.icon;
                                    const milestones = Array.isArray(item.milestones) ? item.milestones : [];
                                    const milestoneSize = density.markerSize;
                                    const recurrenceEnabled = Boolean(item.recurrence?.enabled);
                                    const recurrenceLabel = recurrenceEnabled ? describeGanttRecurrence(item.recurrence, item) : '';
                                    const baseStart = parseDate(item.startDate) || model.start;

                                    // Expand from the real series start through the current range end.
                                    // We then filter down to occurrences that intersect the visible range.
                                    // This keeps one logical Gantt row while preserving the true occurrence
                                    // number and the correctly shifted milestone dates for every occurrence.
                                    const allOccurrenceTasks = recurrenceEnabled
                                        ? expandGanttRecurringTasks([item], { rangeEnd: model.end })
                                        : [item];
                                    const occurrenceTasks = recurrenceEnabled
                                        ? allOccurrenceTasks.filter((occurrenceTask) => {
                                            const occurrenceStart = parseDate(occurrenceTask.startDate);
                                            const occurrenceEnd = parseDate(occurrenceTask.endDate) || occurrenceStart;
                                            return Number.isFinite(occurrenceStart)
                                                && Number.isFinite(occurrenceEnd)
                                                && occurrenceEnd >= model.start
                                                && occurrenceStart <= model.end;
                                        })
                                        : allOccurrenceTasks;

                                    const bars = occurrenceTasks.map((occurrenceTask, occurrenceIndex) => {
                                        const occStart = parseDate(occurrenceTask.startDate) || baseStart;
                                        const occEndMs = parseDate(occurrenceTask.endDate) || occStart;
                                        const occStartStr = toDateString(occStart);
                                        const occEndStr = toDateString(occEndMs);
                                        const offset = Math.max(0, diffDays(model.start, occStart) * model.dayWidth);
                                        const duration = Math.max(1, diffDays(occStart, occEndMs) + 1);
                                        const barWidth = Math.max(duration * model.dayWidth, 22);
                                        const occurrenceLike = { startDate: occStartStr, endDate: occEndStr, status: item.status };
                                        return {
                                            key: recurrenceEnabled ? `${item.id}__occ_${occStartStr}` : item.id,
                                            offset,
                                            barWidth,
                                            occStartStr,
                                            occEndStr,
                                            occurrenceOrdinal: recurrenceEnabled
                                                ? (occurrenceTask.recurrenceMeta?.occurrenceIndex || occurrenceIndex + 1)
                                                : null,
                                            progress: computeGanttProgress(occurrenceLike, todayString),
                                            timeStatus: computeGanttTimeStatus(occurrenceLike, todayString),
                                        };
                                    });

                                    const renderedMilestones = occurrenceTasks
                                        .flatMap((occurrenceTask) => (occurrenceTask.milestones || []).map((milestone) => ({
                                            ...milestone,
                                            renderId: recurrenceEnabled
                                                ? `${milestone.id}__occ_${occurrenceTask.startDate}`
                                                : milestone.id,
                                            occurrenceOrdinal: recurrenceEnabled
                                                ? (occurrenceTask.recurrenceMeta?.occurrenceIndex || null)
                                                : null,
                                        })))
                                        .filter((milestone) => {
                                            const milestoneDate = parseDate(milestone.date);
                                            return Number.isFinite(milestoneDate)
                                                && milestoneDate >= model.start
                                                && milestoneDate <= model.end;
                                        });

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
                                                    {recurrenceEnabled && (
                                                        <span
                                                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-theme-subtle px-1.5 py-0.5"
                                                            title={recurrenceLabel || 'מופע חוזר'}
                                                        >
                                                            <Repeat2 size={10} style={{ color: presentation.accentColor }} />
                                                            חוזר
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

                                            {bars.map((bar) => {
                                                const showName = design.showTaskNameOnBar && bar.barWidth >= TASK_NAME_ON_BAR_MIN_WIDTH;
                                                // On a narrow bar there isn't room for both the name and the
                                                // percentage without clipping either — prefer the name (the
                                                // newly requested option) and let the fill color keep
                                                // conveying progress at a glance.
                                                const showProgressLabel = !compact && design.showProgressLabel && bar.barWidth >= PROGRESS_LABEL_MIN_WIDTH
                                                    && (!showName || bar.barWidth >= BOTH_NAME_AND_PROGRESS_MIN_WIDTH);
                                                const barTitle = `${item.title} | ${bar.occStartStr} - ${bar.occEndStr} | ${timeStatusLabel[bar.timeStatus] || bar.timeStatus} | ${bar.progress}%`;
                                                const handleHoverEnter = (event) => openHoverCard({
                                                    item,
                                                    occStartStr: bar.occStartStr,
                                                    occEndStr: bar.occEndStr,
                                                    progress: bar.progress,
                                                    timeStatus: bar.timeStatus,
                                                    occurrenceOrdinal: bar.occurrenceOrdinal,
                                                    recurrenceEnabled,
                                                    recurrenceLabel,
                                                    milestonesCount: milestones.length,
                                                }, event.currentTarget);

                                                return (
                                                    <div
                                                        key={bar.key}
                                                        data-gantt-task-bar={bar.key}
                                                        data-gantt-x={bar.offset}
                                                        data-gantt-width={bar.barWidth}
                                                        tabIndex={0}
                                                        role="button"
                                                        aria-label={barTitle}
                                                        className={`absolute top-1/2 z-[3] -translate-y-1/2 overflow-hidden border outline-none ${density.barHeightClass} ${design.barStyle === 'flat' ? 'rounded-md' : 'rounded-full'} ${design.barShadow ? 'shadow-sm' : ''} focus-visible:ring-2 focus-visible:ring-primary/50`}
                                                        style={{
                                                            right: bar.offset,
                                                            width: bar.barWidth,
                                                            borderColor: colorWithAlpha(item.color, '80'),
                                                            backgroundColor: bar.progress >= 100 ? item.color : colorWithAlpha(item.color, '24'),
                                                        }}
                                                        onMouseEnter={handleHoverEnter}
                                                        onMouseLeave={closeHoverCard}
                                                        onFocus={handleHoverEnter}
                                                        onBlur={closeHoverCard}
                                                    >
                                                        <div
                                                            className={`absolute inset-y-0 right-0 transition-all ${design.barStyle === 'flat' ? 'rounded-md' : 'rounded-full'}`}
                                                            style={{ width: `${bar.progress}%`, backgroundColor: item.color }}
                                                        />
                                                        {(showName || showProgressLabel) && (
                                                            <span className={`absolute inset-0 flex items-center gap-1.5 px-2 text-[11px] font-black ${bar.progress >= 35 ? 'text-white' : 'text-theme'}`}>
                                                                {showName && (
                                                                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                                                )}
                                                                {showProgressLabel && (
                                                                    <span className={`shrink-0 tabular-nums ${showName ? '' : 'w-full text-center'}`}>{bar.progress}%</span>
                                                                )}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                            {renderedMilestones.map((milestone) => {
                                                const milestoneDate = parseDate(milestone.date);
                                                if (!Number.isFinite(milestoneDate)) return null;
                                                const milestoneOffset = diffDays(model.start, milestoneDate) * model.dayWidth;
                                                const markerCenter = clampNumber(milestoneOffset, milestoneSize / 2, Math.max(milestoneSize / 2, model.width - milestoneSize / 2));
                                                const markerRight = clampNumber(markerCenter - milestoneSize / 2, 0, Math.max(0, model.width - milestoneSize));
                                                const hitAreaRight = clampNumber(markerCenter - MILESTONE_HIT_AREA / 2, 0, Math.max(0, model.width - MILESTONE_HIT_AREA));
                                                const reached = milestoneDate <= parseDate(todayString);
                                                const milestoneTitle = `אבן דרך ${milestone.order}\n${milestone.title}\n${formatShortDate(milestone.date)}\n${reached ? 'הושגה' : 'טרם הגיעה'}`;
                                                const isSelected = selectedMilestone?.taskId === item.id && selectedMilestone?.id === milestone.renderId;
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
                                                        key={milestone.renderId}
                                                        type="button"
                                                        data-gantt-milestone={milestone.renderId}
                                                        data-gantt-x={markerRight}
                                                        aria-expanded={isSelected}
                                                        className={`absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full outline-none transition-transform hover:scale-[1.06] active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-primary/40 ${isSelected ? 'z-[110] scale-[1.08] ring-2 ring-primary/30' : 'z-[4]'}`}
                                                        style={{ right: hitAreaRight }}
                                                        title={milestoneTitle}
                                                        aria-label={milestoneTitle.replace(/\n/g, ', ')}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setSelectedMilestone((current) => (
                                                                current?.taskId === item.id && current?.id === milestone.renderId
                                                                    ? null
                                                                    : {
                                                                        id: milestone.renderId,
                                                                        taskId: item.id,
                                                                    }
                                                            ));
                                                        }}
                                                    >
                                                        <span className="relative block" style={{ width: milestoneSize, height: milestoneSize }} aria-hidden="true">
                                                            <span className={`absolute inset-0 shadow-sm ${markerShapeClass}`} style={markerShapeStyle}>
                                                                {design.milestoneStyle === 'flag' && <Flag size={milestoneSize + 4} fill={reached ? presentation.accentColor : 'none'} />}
                                                            </span>
                                                            <span
                                                                data-gantt-milestone-number={milestone.order}
                                                                className="absolute -top-1.5 -right-1.5 z-[1] flex h-4 min-w-[16px] items-center justify-center rounded-full border px-1 text-[9px] font-black leading-none shadow-sm"
                                                                style={{
                                                                    borderColor: presentation.accentColor,
                                                                    backgroundColor: presentation.taskCellStyle.backgroundColor || '#ffffff',
                                                                    color: presentation.accentColor,
                                                                }}
                                                            >
                                                                {milestone.order}
                                                            </span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                            {selectedMilestone?.taskId === item.id && (() => {
                                                const milestone = renderedMilestones.find((candidate) => candidate.renderId === selectedMilestone.id);
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
                                                        className="absolute top-[calc(50%+18px)] z-[120] rounded-2xl border border-theme-subtle bg-theme-card p-3 text-right text-xs text-theme shadow-[0_18px_40px_rgba(15,23,42,0.18)]"
                                                        style={{ right: popoverRight, width: popoverWidth }}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="text-[11px] font-black text-theme-muted">אבן דרך {milestone.order}</div>
                                                                <div className="mt-1 truncate text-sm font-black text-theme" title={milestone.title}>{milestone.title}</div>
                                                                {milestone.occurrenceOrdinal && (
                                                                    <div className="mt-0.5 text-[10px] font-bold text-theme-muted">מופע {milestone.occurrenceOrdinal}</div>
                                                                )}
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

            <TaskHoverCard hoverCard={hoverCard} presentation={presentation} design={design} timeStatusLabel={timeStatusLabel} />
        </section>
    );
}
