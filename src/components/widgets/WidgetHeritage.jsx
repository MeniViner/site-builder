import React from 'react';
import { Quote } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

export default function WidgetHeritage({ data = [], settings = {} }) {
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(data, settings, 7000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={Quote} title="אין ציטוטים להצגה" description="ציטוטי מורשת והשראה יוצגו כאן לאחר שיוזנו במערכת." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="bg-themeBg-card text-themeText-primary border-themeBorder relative overflow-hidden rounded-[28px] border border-gray-200 bg-white p-6 shadow-[0_22px_55px_-34px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#232733]"
            >
              <Quote size={120} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-primary opacity-5" />

              <div className="relative z-10 flex h-full flex-col justify-center">
                <p className="text-themeText-primary text-center text-lg font-medium italic leading-8 text-gray-900 dark:text-white">
                  {item.quote}
                </p>

                <div className="my-6 h-px w-full bg-gradient-to-l from-transparent via-primary/30 to-transparent" />

                <div className="text-center">
                  <div className="text-sm font-black text-themeText-primary text-gray-900 dark:text-white">
                    {item.author}
                  </div>
                  {item.role && (
                    <div className="mt-1 text-xs font-medium text-themeText-secondary text-gray-500 dark:text-gray-400">
                      {item.role}
                    </div>
                  )}
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
    </div>
  );
}
