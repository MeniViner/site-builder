import React from 'react';
import { CalendarDays, Medal, PartyPopper } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

export default function WidgetCelebrations({ data = [], settings = {} }) {
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(data, settings, 5000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={PartyPopper} title="אין אירועים השבוע" description="אירועי שחרור, דרגות וחגיגות יוצגו כאן כשהם יעודכנו." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="bg-themeBg-card text-themeText-primary border-themeBorder relative overflow-hidden rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 p-6 shadow-[0_24px_60px_-34px_rgba(15,23,42,0.55)] dark:border-white/10 dark:from-[#232733] dark:via-[#232733] dark:to-[#1d202b]"
            >
              <div className="absolute left-5 top-5 text-primary/10">
                <PartyPopper size={74} />
              </div>
              <div className="absolute bottom-4 right-4 text-primary/10">
                <Medal size={54} />
              </div>

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                  <PartyPopper size={14} />
                  {item.type}
                </div>

                <h3 className="mt-4 text-2xl font-black text-themeText-primary text-gray-900 dark:text-white">
                  {item.name}
                </h3>

                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-themeText-secondary text-gray-600 dark:bg-white/10 dark:text-gray-300">
                  <CalendarDays size={14} className="text-primary" />
                  {item.date}
                </div>

                <p className="mt-5 text-sm leading-7 text-themeText-secondary text-gray-600 dark:text-gray-300">
                  {item.description}
                </p>
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
    </div>
  );
}
