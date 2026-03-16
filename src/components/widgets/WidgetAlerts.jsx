import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bell, Filter } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

export default function WidgetAlerts({ data = [], settings = {} }) {
  const [activeFilter, setActiveFilter] = useState('all');

  const urgentItems = useMemo(() => data.filter((item) => item.isUrgent), [data]);
  const filteredItems = useMemo(() => {
    if (activeFilter === 'urgent') return data.filter((item) => item.isUrgent);
    if (activeFilter === 'regular') return data.filter((item) => !item.isUrgent);
    return data;
  }, [activeFilter, data]);

  const { visibleItems, page, totalPages } = useRotatingWidgetItems(filteredItems, settings, 5000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={Bell} title="אין הודעות במערכת" description="הודעות שוטפות ועדכונים קריטיים יופיעו כאן כאשר הם יוזנו." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[22px] border border-gray-200/80 bg-white/90 p-3 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary/80">לוח הודעות</div>
            <div className="mt-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {urgentItems.length} הודעות קריטיות מתוך {data.length} הודעות
            </div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <Filter size={17} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { id: 'all', label: 'הכל' },
            { id: 'urgent', label: 'קריטיות' },
            { id: 'regular', label: 'שוטפות' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => setActiveFilter(filter.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                activeFilter === filter.id
                  ? 'bg-primary text-white shadow-[0_0_20px_hsl(var(--color-primary)/0.25)]'
                  : 'border border-gray-200 bg-gray-100 text-gray-500 hover:border-primary/25 hover:text-primary dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {urgentItems.length > 0 && activeFilter !== 'regular' && (
        <div className="rounded-[24px] border border-red-500/25 bg-gradient-to-br from-red-500/12 via-red-500/[0.08] to-transparent p-4 shadow-[0_18px_45px_-34px_rgba(239,68,68,0.55)]">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
              <AlertTriangle size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-red-500">הודעה קריטית</div>
              {urgentItems[0].title && <div className="mt-1 font-bold text-gray-900 dark:text-white">{urgentItems[0].title}</div>}
              <p className="mt-1 text-sm font-semibold leading-7 text-gray-800 dark:text-gray-100">
                {urgentItems[0].text}
              </p>
            </div>
          </div>
        </div>
      )}

      {filteredItems.length === 0 ? (
        <WidgetEmptyState icon={Filter} title="אין פריטים בתצוגה זו" description="שנה את הסינון כדי לראות הודעות נוספות." />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <div className="space-y-3">
              {visibleItems.map((item, index) => (
                <div
                  key={item.id}
                  className={`rounded-[22px] border p-3.5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 ${
                    item.isUrgent
                      ? 'border-red-500/20 bg-gradient-to-br from-red-500/[0.07] via-white to-white dark:via-white/[0.06] dark:to-white/[0.02]'
                      : 'border-amber-500/30 bg-gradient-to-br from-amber-500/[0.05] via-white to-white dark:border-white/10 dark:from-white/[0.07] dark:via-white/[0.05] dark:to-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-black ${item.isUrgent ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}>
                      {String(page * Math.max(1, visibleItems.length) + index + 1).padStart(2, '0')}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${item.isUrgent ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'}`}>
                          {item.isUrgent ? 'קריטי' : 'הודעה'}
                        </span>
                      </div>
                      {item.title && <h3 className="mt-2 font-bold text-gray-900 dark:text-white">{item.title}</h3>}
                      <p className={`mt-1 text-sm leading-6 ${item.title ? 'text-gray-600 dark:text-gray-300' : 'text-gray-700 dark:text-gray-200'}`}>
                        {item.text}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }).map((_, index) => (
                <span
                  key={index}
                  className={`transition-all ${index === page ? 'h-2.5 w-7 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--color-primary)/0.35)]' : 'h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15'}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
