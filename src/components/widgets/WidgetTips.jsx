import React from 'react';
import { Lightbulb } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

export default function WidgetTips({ data = [], settings = {} }) {
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(data, settings, 6000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={Lightbulb} title="אין טיפים להצגה" description="טיפים, נהלים ותזכורות שימושיות יופיעו כאן." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="bg-themeBg-card text-themeText-primary border-themeBorder rounded-[28px] border border-gray-200 bg-gradient-to-br from-white via-white to-gray-50 p-6 shadow-[0_22px_55px_-34px_rgba(15,23,42,0.55)] dark:border-white/10 dark:from-[#232733] dark:via-[#232733] dark:to-[#1c1f2a]"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-500 shadow-[0_0_22px_rgba(234,179,8,0.28)]">
                  <Lightbulb size={28} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase tracking-[0.24em] text-yellow-500/90">טיפ שימושי</div>
                  <h3 className="mt-2 text-xl font-black text-primary">
                    {item.title}
                  </h3>
                </div>
              </div>

              <p className="text-themeText-secondary mt-5 text-sm leading-8 text-gray-600 dark:text-gray-300">
                {item.text}
              </p>
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
