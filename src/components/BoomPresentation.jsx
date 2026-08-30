import React, { useMemo } from 'react';
import { Activity, CircleAlert, Clock3, ShieldCheck, Zap } from 'lucide-react';
import { BOOM_DESIGN_PRESETS, computeBoomProgress } from '../utils/boomData';
import TaskManagementTable, { TASK_STATUS_META } from './TaskManagementTable';

const PRESENTATION_STYLES = Object.freeze({
    operational: {
        shell: 'border-theme-subtle bg-theme-card shadow-[0_14px_44px_rgba(0,0,0,0.10)]',
        header: 'border-theme-subtle bg-theme-card/80',
        accent: 'bg-primary/10 text-primary',
        density: 'comfortable',
    },
    'command-center': {
        shell: 'border-slate-700/30 bg-theme-card shadow-[0_18px_55px_rgba(15,23,42,0.18)] dark:border-sky-400/15',
        header: 'border-slate-700/20 bg-gradient-to-l from-slate-900 to-slate-800 text-white dark:border-sky-400/15',
        accent: 'bg-sky-400/15 text-sky-200',
        density: 'comfortable',
    },
    compact: {
        shell: 'border-theme-subtle bg-theme-card shadow-[0_10px_30px_rgba(0,0,0,0.08)]',
        header: 'border-theme-subtle bg-theme-elevated',
        accent: 'bg-primary/10 text-primary',
        density: 'compact',
    },
});

export default function BoomPresentation({
    boom,
    tasks = boom?.items || [],
    preview = false,
    emptyMessage = 'עדיין אין משימות BOOM',
}) {
    const preset = BOOM_DESIGN_PRESETS.some((option) => option.id === boom?.design?.preset)
        ? boom.design.preset
        : 'operational';
    const style = PRESENTATION_STYLES[preset];
    const summary = useMemo(() => ({
        active: tasks.filter((task) => task.status === 'active').length,
        blocked: tasks.filter((task) => task.status === 'blocked').length,
        dueSoon: tasks.filter((task) => {
            const progress = computeBoomProgress(task);
            return progress > 0 && progress < 100;
        }).length,
    }), [tasks]);
    const commandCenter = preset === 'command-center';

    return (
        <section
            data-testid="boom-presentation"
            data-preset={preset}
            className={`overflow-hidden rounded-[28px] border ${style.shell}`}
        >
            <header className={`border-b p-5 sm:p-6 ${style.header}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${style.accent}`}>
                            <Zap size={14} />Command &amp; Control
                        </span>
                        <h1 className={`mt-2 text-xl font-black text-balance sm:text-2xl ${commandCenter ? 'text-white' : 'text-theme'}`}>
                            {boom?.pageTitle}
                        </h1>
                        {boom?.description && (
                            <p className={`mt-1 max-w-3xl text-sm leading-6 text-pretty ${commandCenter ? 'text-slate-300' : 'text-theme-muted'}`}>
                                {boom.description}
                            </p>
                        )}
                    </div>
                    <div className={`shrink-0 rounded-2xl px-4 py-2 text-center ${commandCenter ? 'bg-white/10 text-white' : 'bg-primary/10 text-primary'}`}>
                        <div className="text-xl font-black tabular-nums">{tasks.length}</div>
                        <div className={`text-[11px] font-bold ${commandCenter ? 'text-slate-300' : 'text-theme-muted'}`}>משימות</div>
                    </div>
                </div>
                {commandCenter && (
                    <div className="mt-4 grid grid-cols-3 gap-2">
                        {[
                            { icon: Activity, label: 'בביצוע', value: summary.active },
                            { icon: CircleAlert, label: 'חסומות', value: summary.blocked },
                            { icon: Clock3, label: 'בטווח', value: summary.dueSoon },
                        ].map(({ icon, label, value }) => (
                            <div key={label} className="rounded-xl bg-white/[0.07] px-3 py-2 text-center text-white">
                                {React.createElement(icon, { className: 'mx-auto text-sky-300', size: 15 })}
                                <div className="mt-1 text-lg font-black tabular-nums">{value}</div>
                                <div className="text-[10px] font-bold text-slate-300">{label}</div>
                            </div>
                        ))}
                    </div>
                )}
            </header>

            {tasks.length > 0 ? (
                <div className={preview ? 'max-h-[520px] overflow-auto' : ''}>
                    <TaskManagementTable
                        tasks={tasks}
                        categories={boom?.categories}
                        statusMeta={TASK_STATUS_META}
                        getProgress={computeBoomProgress}
                        density={style.density}
                        readOnly
                    />
                </div>
            ) : (
                <div className="px-6 py-16 text-center text-theme-muted">
                    <ShieldCheck className="mx-auto opacity-40" size={38} />
                    <h2 className="mt-3 text-lg font-black text-theme">{emptyMessage}</h2>
                    <p className="mt-1 text-sm">משימות שיוגדרו בניהול BOOM יוצגו כאן.</p>
                </div>
            )}
        </section>
    );
}
