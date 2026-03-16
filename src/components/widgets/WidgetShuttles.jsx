import React from 'react';
import { Bus, Clock3, MapPin, TramFront } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

function ShuttleIcon({ type }) {
  if (type === 'minibus') return <TramFront size={18} />;
  return <Bus size={18} />;
}

export default function WidgetShuttles({ data = [], settings = {} }) {
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(data, settings, 5000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={Bus} title="אין נסיעות מתוכננות" description="ברגע שיוגדרו היסעים, הם יופיעו כאן לפי סדר היציאה." />;
  }

  const [nextShuttle, ...otherShuttles] = visibleItems;

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="bg-themeBg-card text-themeText-primary border-themeBorder rounded-[24px] border border-primary/30 bg-primary/10 p-5 shadow-[0_18px_45px_-32px_hsl(var(--color-primary)/0.35)]">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/15 text-primary">
            <Bus size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-primary/80">הנסיעה הקרובה</div>
            <div className="mt-2 text-lg font-black text-themeText-primary text-gray-900 dark:text-white">
              {nextShuttle.destination}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-white/60 px-3 py-1 text-primary dark:bg-black/20">
                <Clock3 size={12} />
                {nextShuttle.departureTime}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-white/60 px-3 py-1 text-themeText-secondary text-gray-600 dark:bg-black/20 dark:text-gray-300">
                <ShuttleIcon type={nextShuttle.type} />
                {nextShuttle.type === 'minibus' ? 'מיניבוס' : 'אוטובוס'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {otherShuttles.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
          <div className="space-y-3">
            {otherShuttles.map((shuttle) => (
              <div
                key={shuttle.id}
                className="bg-themeBg-card text-themeText-primary border-themeBorder flex items-center gap-3 rounded-[20px] border border-gray-200 bg-white p-4 shadow-[0_12px_32px_-28px_rgba(15,23,42,0.6)] transition hover:border-primary/20 dark:border-white/10 dark:bg-[#232733]"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-primary dark:bg-white/5">
                  <ShuttleIcon type={shuttle.type} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-black text-themeText-primary text-gray-900 dark:text-white">
                    {shuttle.destination}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-themeText-secondary text-gray-500 dark:text-gray-400">
                    <MapPin size={12} className="text-primary/70" />
                    <span>{shuttle.type === 'minibus' ? 'מיניבוס' : 'אוטובוס'}</span>
                  </div>
                </div>
                <div className="rounded-full bg-primary/10 px-3 py-1 text-sm font-black text-primary">
                  {shuttle.departureTime}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
}
