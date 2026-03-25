import React from 'react';
import { Sparkles, User } from 'lucide-react';
import WidgetEmptyState, { getInitials } from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';
import { resolveSiteImageUrl } from '../../utils/assetUrl';

export default function WidgetOutstanding({ data = [], settings = {} }) {
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(data, settings, 5000);

  if (!data || data.length === 0) {
    return <WidgetEmptyState icon={Sparkles} title="אין מצטיינים להצגה" description="כשתתווסף רשימת מצטיינים, הכרטיס המרכזי יופיע כאן עם תמונה ותיאור." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between rounded-[22px] border border-gray-200/80 bg-white/90 px-4 py-3 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary/80">זרקור יחידתי</div>
          <div className="mt-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
            מוצגים {visibleItems.length} מתוך {data.length}
          </div>
        </div>
        <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
          מצטיינים
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {visibleItems.map((person) => (
            <div
              key={person.id}
              className="relative overflow-hidden rounded-[26px] border border-gray-200/80 bg-gradient-to-br from-white via-white to-gray-100/80 p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] dark:border-white/10 dark:from-white/[0.07] dark:via-white/[0.05] dark:to-white/[0.02]"
            >
              <div className="absolute inset-x-6 top-0 h-16 bg-gradient-to-b from-primary/10 to-transparent blur-2xl" />
              <div className="relative flex items-start gap-4">
                {person.image ? (
                  <img
                    src={resolveSiteImageUrl(person.image)}
                    alt={person.name}
                    className="h-20 w-20 shrink-0 rounded-full border-4 border-primary/25 object-cover shadow-[0_0_24px_hsl(var(--color-primary)/0.2)]"
                    onError={(event) => { event.currentTarget.style.display = 'none'; }}
                  />
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-primary/25 bg-primary/10 text-2xl font-black text-primary shadow-[0_0_24px_hsl(var(--color-primary)/0.2)]">
                    {person.name ? getInitials(person.name) : <User size={32} className="text-primary/70" />}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-primary w-fit">
                    נבחר החודש
                  </div>
                  <h3 className="mt-3 text-xl font-black leading-tight text-gray-900 dark:text-white">
                    {person.name || 'ללא שם'}
                  </h3>
                  {person.role && (
                    <div className="mt-2 rounded-full border border-primary/20 bg-primary/[0.08] px-3 py-1 text-xs font-bold text-primary w-fit">
                      {person.role}
                    </div>
                  )}
                  <p className="mt-3 text-sm leading-7 text-gray-600 dark:text-gray-300">
                    {person.description || 'טרם נוסף תיאור אישי למצטיין זה.'}
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
              className={`transition-all ${
                index === page
                  ? 'h-2.5 w-7 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--color-primary)/0.35)]'
                  : 'h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
