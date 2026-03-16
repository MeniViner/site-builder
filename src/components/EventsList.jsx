import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useEvents } from '../context/EventsContext';
import WidgetEmptyState from './widgets/WidgetEmptyState';

export default function EventsList() {
  const { events, displayCount = 3, loading } = useEvents();
  const [currentIndex, setCurrentIndex] = useState(0);
  const sortedEvents = useMemo(() => {
    return [...(events || [])].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
  }, [events]);

  useEffect(() => {
    if (!sortedEvents || sortedEvents.length <= displayCount) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + displayCount) % sortedEvents.length);
    }, 6000);

    return () => clearInterval(interval);
  }, [sortedEvents, displayCount]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [displayCount, sortedEvents.length]);

  if (loading) {
    return <WidgetEmptyState icon={CalendarDays} title="טוען אירועים..." description="רשימת האירועים הקרובים נטענת כעת." />;
  }

  if (!sortedEvents || sortedEvents.length === 0) {
    return <WidgetEmptyState icon={CalendarDays} title="אין אירועים להצגה" description="האירועים הקרובים של היחידה יופיעו כאן מיד לאחר הזנה." />;
  }

  const getHebrewMonth = (dateString, fallbackMonth) => {
    if (!dateString) return fallbackMonth || '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return fallbackMonth || '';
    const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
    return months[d.getMonth()];
  };

  const getDayNumeric = (dateString, fallbackDay) => {
    if (!dateString) return fallbackDay || '';
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return fallbackDay || '';
    return d.getDate().toString().padStart(2, '0');
  };

  let slice = [];
  if (sortedEvents.length <= displayCount) {
    slice = sortedEvents;
  } else {
    slice = sortedEvents.slice(currentIndex, currentIndex + displayCount);
    if (slice.length < displayCount) {
      slice = [...slice, ...sortedEvents.slice(0, displayCount - slice.length)];
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[22px] border border-gray-200/80 bg-white/90 p-4 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary/80">לו״ז קרוב</div>
            <div className="mt-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {sortedEvents.length} אירועים מתוכננים
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            <CalendarDays size={18} />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="flex flex-col gap-3">
          {slice.map((event, idx) => (
            <div
              key={`${event.id}-${currentIndex}`}
              className={`relative animate-aggressive overflow-hidden rounded-[24px] border bg-gradient-to-br text-gray-800 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] transition ${
                event.color === 'red'
                  ? 'border-red-500/25 from-red-500/[0.08] via-white to-white dark:via-white/[0.06] dark:to-white/[0.02]'
                  : 'border-gray-200/80 from-white via-white to-gray-50 dark:border-white/10 dark:from-white/[0.07] dark:via-white/[0.05] dark:to-white/[0.02]'
              }`}
              style={{ animationDelay: `${idx * 0.15}s` }}
            >
              <div className="absolute left-4 top-4 rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 shadow-sm dark:border-white/10 dark:bg-black/20 dark:text-gray-300">
                {event.color === 'red' ? 'דחוף' : 'מתוכנן'}
              </div>

              <div className="flex min-h-[108px] items-stretch">
                <div className="flex w-[34%] flex-col items-center justify-center border-l border-gray-200/80 bg-gray-50/80 px-3 dark:border-white/10 dark:bg-black/15">
                  <span className="text-3xl font-black leading-none text-gray-900 dark:text-white">
                    {getDayNumeric(event.date, event.day)}
                  </span>
                  <span className="mt-1 text-[11px] font-bold uppercase tracking-[0.24em] text-primary/80">
                    {getHebrewMonth(event.date, event.month)}
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-center px-4 py-4">
                  <div className="pr-14 text-base font-black leading-tight text-gray-900 dark:text-white">
                    {event.title || 'ללא כותרת'}
                  </div>
                  <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
                    {event.subtitle || 'אירוע יחידתי מתוכנן'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {sortedEvents.length > displayCount && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: Math.ceil(sortedEvents.length / displayCount) }).map((_, pageIndex) => {
            const isActive = Math.floor(currentIndex / displayCount) === pageIndex;
            return (
              <span
                key={pageIndex}
                className={`transition-all ${
                  isActive
                    ? 'h-2.5 w-7 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--color-primary)/0.35)]'
                    : 'h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15'
                }`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
