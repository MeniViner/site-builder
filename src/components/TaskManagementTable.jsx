import React from 'react';
import { Copy, Edit3, Trash2, UserRound } from 'lucide-react';

const FALLBACK_CATEGORY_COLOR = '#2563eb';

export const TASK_STATUS_META = Object.freeze({
    planned: { label: 'מתוכנן', className: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-200' },
    active: { label: 'בביצוע', className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200' },
    blocked: { label: 'חסום', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' },
    completed: { label: 'הושלם', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
    cancelled: { label: 'בוטל', className: 'border-gray-300 bg-gray-100 text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300' },
    onHold: { label: 'בהמתנה', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' },
});

function formatDate(value) {
    if (!value) return '-';
    try {
        return new Intl.DateTimeFormat('he-IL', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
        }).format(new Date(`${value}T00:00:00`));
    } catch {
        return value;
    }
}

function getCategoryColor(categories, task) {
    return categories.find((category) => category.name === task.category)?.color
        || task.color
        || FALLBACK_CATEGORY_COLOR;
}

export function TaskTablePill({ children, className = '' }) {
    return (
        <span className={`inline-flex h-6 min-w-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-black leading-none ${className}`}>
            {children}
        </span>
    );
}

export function TaskProgressMeter({ value }) {
    const progress = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
    return (
        <div className="mx-auto w-[86px]">
            <div className="mb-0.5 text-center text-xs font-black tabular-nums text-gray-700 dark:text-gray-200">{progress}%</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-300 dark:bg-white/20">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
        </div>
    );
}

function TaskBadges({ task, statusMeta, timingMeta, getTimingStatus }) {
    const status = statusMeta?.[task.status] || Object.values(statusMeta || {})[0];
    const timingKey = typeof getTimingStatus === 'function' ? getTimingStatus(task) : '';
    const timing = timingKey ? timingMeta?.[timingKey] : null;

    return (
        <div className="flex flex-wrap items-center gap-1">
            {status && <TaskTablePill className={status.className}>{status.label}</TaskTablePill>}
            {timing && <TaskTablePill className={timing.className}>{timing.label}</TaskTablePill>}
        </div>
    );
}

function ActionIconButton({ label, onClick, children, danger = false }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-gray-500 transition-[color,background-color,border-color,transform] hover:border-gray-200 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:text-gray-300 dark:hover:border-white/10 dark:hover:bg-white/5 ${
                danger ? 'hover:text-red-600 dark:hover:text-red-300' : 'hover:text-primary'
            }`}
        >
            {children}
        </button>
    );
}

function AssigneeCell({ task, onAssign, readOnly }) {
    if (task.owner) {
        return (
            <span className="block truncate text-gray-600 dark:text-gray-300" title={task.owner}>
                {task.owner}
            </span>
        );
    }

    if (readOnly || typeof onAssign !== 'function') {
        return <span className="text-gray-400 dark:text-gray-500">—</span>;
    }

    return (
        <button
            type="button"
            onClick={onAssign}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-500 transition-[color,background-color,border-color,transform] hover:border-primary/40 hover:text-primary active:scale-[0.96] dark:border-white/10 dark:bg-white/5 dark:text-gray-300"
            title="לא שויך אחראי"
            aria-label="הוסף אחראי למשימה"
        >
            <UserRound size={13} />
            + אחראי
        </button>
    );
}

export default function TaskManagementTable({
    tasks = [],
    categories = [],
    statusMeta = TASK_STATUS_META,
    timingMeta = {},
    getTimingStatus,
    getProgress = (task) => task.progress,
    getTaskSubtitle = (task) => task.details || '',
    renderTaskIndicators,
    onAssign,
    onEdit,
    onDuplicate,
    onDelete,
    readOnly = false,
    density = 'comfortable',
    showCategoryColors = true,
}) {
    const showActions = !readOnly && [onEdit, onDuplicate, onDelete].some((handler) => typeof handler === 'function');
    const compact = density === 'compact';
    const headerCellClass = `${compact ? 'px-3 py-2' : 'px-4 py-3'} align-middle text-xs font-black text-gray-500 dark:text-gray-300`;
    const bodyCellClass = `${compact ? 'px-3 py-2' : 'px-4 py-3'} align-middle text-sm text-gray-700 dark:text-gray-200`;

    const renderActions = (task, mobile = false) => {
        if (!showActions) return null;
        const buttonClass = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 transition-[color,background-color,border-color,transform] hover:border-primary/40 hover:text-primary active:scale-[0.96] dark:border-white/10 dark:bg-white/5 dark:text-gray-200';

        if (mobile) {
            return (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-3 dark:border-white/10">
                    {onEdit && <button type="button" onClick={() => onEdit(task)} className={buttonClass}><Edit3 size={14} />ערוך</button>}
                    {onDuplicate && <button type="button" onClick={() => onDuplicate(task)} className={buttonClass}><Copy size={14} />שכפל</button>}
                    {onDelete && <button type="button" onClick={() => onDelete(task)} className={`${buttonClass} hover:border-red-200 hover:text-red-600 dark:hover:border-red-500/30 dark:hover:text-red-300`}><Trash2 size={14} />מחק</button>}
                </div>
            );
        }

        return (
            <div className="flex items-center justify-center gap-0.5">
                {onEdit && <ActionIconButton label="ערוך משימה" onClick={() => onEdit(task)}><Edit3 size={15} /></ActionIconButton>}
                {onDuplicate && <ActionIconButton label="שכפל משימה" onClick={() => onDuplicate(task)}><Copy size={15} /></ActionIconButton>}
                {onDelete && <ActionIconButton label="מחק משימה" onClick={() => onDelete(task)} danger><Trash2 size={15} /></ActionIconButton>}
            </div>
        );
    };

    return (
        <>
            <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px] table-fixed divide-y divide-gray-200 text-right text-sm dark:divide-white/10">
                    <colgroup>
                        <col className={showActions ? 'w-[24%]' : 'w-[27%]'} />
                        <col className={showActions ? 'w-[14%]' : 'w-[16%]'} />
                        <col className="w-[9%]" />
                        <col className="w-[9%]" />
                        <col className={showActions ? 'w-[12%]' : 'w-[14%]'} />
                        <col className={showActions ? 'w-[14%]' : 'w-[16%]'} />
                        <col className="w-[8%]" />
                        {showActions && <col className="w-[10%]" />}
                    </colgroup>
                    <thead className="bg-gray-50 text-xs font-black text-gray-500 dark:bg-[#1e212b] dark:text-gray-300">
                        <tr>
                            <th className={`${headerCellClass} text-right`}>שם משימה</th>
                            <th className={`${headerCellClass} text-right`}>תחום / קטגוריה</th>
                            <th className={`${headerCellClass} text-center`}>התחלה</th>
                            <th className={`${headerCellClass} text-center`}>סיום</th>
                            <th className={`${headerCellClass} text-right`}>אחראי</th>
                            <th className={`${headerCellClass} text-right`}>סטטוס</th>
                            <th className={`${headerCellClass} text-center`}>%</th>
                            {showActions && <th className={`${headerCellClass} text-center`}>פעולות</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                        {tasks.map((task) => (
                            <tr key={task.id} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-white/[0.03]">
                                <td className={`${bodyCellClass} text-right`}>
                                    <div className="flex items-center gap-2">
                                        {showCategoryColors && <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-gray-200 dark:ring-white/10" style={{ backgroundColor: getCategoryColor(categories, task) }} title={task.color} />}
                                        {renderTaskIndicators?.(task, false)}
                                        <div className="min-w-0">
                                            <div className="truncate font-black text-gray-900 dark:text-white" title={task.title}>{task.title}</div>
                                            <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={getTaskSubtitle(task)}>
                                                {getTaskSubtitle(task)}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className={`${bodyCellClass} text-right`}>
                                    <TaskTablePill className="max-w-full border-gray-200 bg-gray-50 text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                        {showCategoryColors && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(categories, task) }} />}
                                        <span className="truncate">{task.category}</span>
                                    </TaskTablePill>
                                </td>
                                <td className={`${bodyCellClass} whitespace-nowrap text-center text-gray-600 dark:text-gray-300`}>{formatDate(task.startDate)}</td>
                                <td className={`${bodyCellClass} whitespace-nowrap text-center text-gray-600 dark:text-gray-300`}>{formatDate(task.endDate)}</td>
                                <td className={`${bodyCellClass} text-right`}><AssigneeCell task={task} onAssign={onAssign ? () => onAssign(task) : undefined} readOnly={readOnly} /></td>
                                <td className={`${bodyCellClass} text-right`}><TaskBadges task={task} statusMeta={statusMeta} timingMeta={timingMeta} getTimingStatus={getTimingStatus} /></td>
                                <td className={`${bodyCellClass} text-center`}><TaskProgressMeter value={getProgress(task)} /></td>
                                {showActions && <td className={`${bodyCellClass} text-center`}>{renderActions(task)}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className={`${compact ? 'space-y-2 p-3' : 'space-y-3 p-4'} lg:hidden`}>
                {tasks.map((task) => (
                    <article key={task.id} className={`rounded-2xl border border-gray-200 bg-gray-50 dark:border-white/10 dark:bg-[#1e212b] ${compact ? 'p-3' : 'p-4'}`}>
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                    {showCategoryColors && <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-gray-200 dark:ring-white/10" style={{ backgroundColor: getCategoryColor(categories, task) }} />}
                                    {renderTaskIndicators?.(task, true)}
                                    <h3 className="truncate text-base font-black text-gray-900 dark:text-white">{task.title}</h3>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                    <span>{formatDate(task.startDate)} - {formatDate(task.endDate)}</span>
                                    <AssigneeCell task={task} onAssign={onAssign ? () => onAssign(task) : undefined} readOnly={readOnly} />
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <TaskTablePill className="border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-white/5 dark:text-gray-200">
                                {showCategoryColors && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getCategoryColor(categories, task) }} />}
                                {task.category}
                            </TaskTablePill>
                            <TaskBadges task={task} statusMeta={statusMeta} timingMeta={timingMeta} getTimingStatus={getTimingStatus} />
                        </div>
                        {getTaskSubtitle(task) && (
                            <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{getTaskSubtitle(task)}</p>
                        )}
                        <div className="mt-4"><TaskProgressMeter value={getProgress(task)} /></div>
                        {renderActions(task, true)}
                    </article>
                ))}
            </div>
        </>
    );
}
