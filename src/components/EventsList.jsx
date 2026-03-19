import React, { useEffect, useMemo, useState, useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { useEvents } from '../context/EventsContext';
import WidgetEmptyState from './widgets/WidgetEmptyState';

export default function EventsList() {
  const {
    events,
    displayCount = 3,
    displayMode = 'default',
    intervalMs = 6000,
    loading,
  } = useEvents();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flippedDay, setFlippedDay] = useState(null);
  const flipTimeoutRef = useRef(null);
  const isHoveringRef = useRef(false);

  const handleDayClick = (dayEvents, day) => {
    if (!dayEvents || dayEvents.length === 0) return;
    setFlippedDay(day);
    startFlipTimer();
  };

  const startFlipTimer = () => {
    if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current);
    flipTimeoutRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setFlippedDay(null);
      }
    }, 4500);
  };

  const handleFlipMouseEnter = () => {
    isHoveringRef.current = true;
    if (flipTimeoutRef.current) clearTimeout(flipTimeoutRef.current);
  };

  const handleFlipMouseLeave = () => {
    isHoveringRef.current = false;
    startFlipTimer();
  };

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
    }, Math.max(2000, Number(intervalMs) || 6000));

    return () => clearInterval(interval);
  }, [sortedEvents, displayCount, intervalMs]);

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

  const renderCalendar = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();

    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

    const monthNames = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
    const weekDays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

    const eventsByDay = {};
    sortedEvents.forEach(ev => {
        if (!ev.date) return;
        const d = new Date(ev.date);
        if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
            const dateNum = d.getDate();
            if (!eventsByDay[dateNum]) eventsByDay[dateNum] = [];
            eventsByDay[dateNum].push(ev);
        }
    });

    const days = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
        days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
        days.push(i);
    }
    while (days.length % 7 !== 0) {
        days.push(null);
    }

    return (
        <div className="relative w-full h-full" style={{ perspective: '1000px' }}>
            <div className={`w-full h-full transition-transform duration-700 ease-out`} style={{ transformStyle: 'preserve-3d', transform: flippedDay ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                {/* Front (Calendar) */}
                <div className="absolute inset-0 w-full h-full" style={{ backfaceVisibility: 'hidden' }}>
                    <div className="flex flex-col h-full bg-white/50 dark:bg-black/20 rounded-[20px] p-4 border border-gray-200/60 dark:border-white/10 shadow-sm overflow-visible text-right">
                        <div className="flex items-center justify-between mb-4 px-1">
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{monthNames[currentMonth]} {currentYear}</span>
                        </div>
                        <div className="grid grid-cols-7 gap-1 text-center mb-2">
                            {weekDays.map(d => (
                                <div key={d} className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{d}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1 flex-1 relative z-10">
                            {days.map((d, index) => {
                                if (!d) return <div key={`empty-${index}`} className="h-8 flex items-center justify-center"></div>;
                                
                                const dayEvents = eventsByDay[d];
                                const isToday = d === today.getDate();
                                const hasRedEvent = dayEvents?.some(e => e.color === 'red');

                                return (
                                    <div key={d} className="group relative">
                                        <div 
                                            onClick={() => handleDayClick(dayEvents, d)}
                                            className={`
                                            flex items-center justify-center h-8 rounded-lg text-[13px] font-semibold transition-all cursor-${dayEvents ? 'pointer hover:scale-105 hover:-translate-y-0.5 shadow-sm' : 'default'}
                                            ${isToday ? 'bg-primary text-white shadow-md' : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-white/10'}
                                            ${dayEvents && !isToday ? 'bg-primary/5 dark:bg-primary/20 border border-primary/40 dark:border-primary/50 text-primary dark:text-primary' : ''}
                                            ${hasRedEvent && !isToday ? 'border-red-400 bg-red-50 text-red-600 dark:bg-red-500/20 dark:text-red-400 dark:border-red-400/60' : ''}
                                        `}>
                                            {d}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Back (Event Details) */}
                <div 
                    className="absolute inset-0 w-full h-full bg-white/95 dark:bg-[#1a1c23] rounded-[20px] p-4 border border-primary/30 shadow-[0_10px_30px_-5px_rgba(var(--color-primary),0.2)] flex flex-col items-start overflow-y-auto custom-scrollbar text-right rtl"
                    dir="rtl"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                    onMouseEnter={handleFlipMouseEnter}
                    onMouseLeave={handleFlipMouseLeave}
                >
                    {flippedDay && eventsByDay[flippedDay] ? (
                        <div className="w-full flex flex-col h-full">
                            <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 pb-3 mb-3 shrink-0">
                                <span className="text-sm font-black text-gray-900 dark:text-white">
                                    לו״ז יומי - {flippedDay} {monthNames[currentMonth]}
                                </span>
                                <button 
                                    onClick={() => { isHoveringRef.current = false; setFlippedDay(null); }}
                                    className="p-1 rounded-full text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100 dark:bg-white/5 transition-colors cursor-pointer"
                                    title="חזור"
                                >
                                  <span className="sr-only">סגור</span>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                                </button>
                            </div>
                            
                            <div className="flex flex-col gap-2 flex-1">
                                {eventsByDay[flippedDay].map((ev, ei) => (
                                    <div key={ei} className="flex gap-3 items-start bg-gray-50/80 dark:bg-white/5 rounded-xl p-3 border border-gray-100 dark:border-white/5 transition-all">
                                        <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${ev.color === 'red' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.8)]'}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-[13px] font-black leading-tight mb-0.5 truncate ${ev.color === 'red' ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{ev.title || 'ללא כותרת'}</div>
                                            <div className="text-[12px] font-medium text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{ev.subtitle}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[22px]  border-gray-200/80 bg-white/90 p-4 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)]  dark:border-white/10 dark:bg-white/[0.04]">
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

      <div className={`min-h-0 flex-1 pr-1 ${displayMode !== 'calendar' ? 'overflow-y-auto custom-scrollbar' : ''}`}>
        {displayMode === 'calendar' ? (
          renderCalendar()
        ) : (
          <div className="flex flex-col gap-3">
            {slice.map((event, idx) => {
              if (displayMode === 'monthly') {
                 return (
                   <div
                     key={`${event.id}-${currentIndex}`}
                     className="group relative flex flex-col justify-center rounded-[16px] border border-gray-200/60 bg-white/60 p-2.5 transition-all hover:bg-white hover:shadow-lg dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 overflow-hidden"
                   >
                     <div className="flex items-center gap-3">
                         <div className={`flex flex-col items-center justify-center rounded-xl px-3 py-2 text-center min-w-[50px] shrink-0 ${event.color === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-primary/10 text-primary dark:bg-primary/20'}`}>
                           <span className="text-xl font-black leading-none">{getDayNumeric(event.date, event.day)}</span>
                           <span className="text-[10px] font-bold uppercase tracking-wider mt-0.5">{getHebrewMonth(event.date, event.month)}</span>
                         </div>
                         
                         <div className="flex flex-1 flex-col text-right overflow-hidden">
                           <div className="truncate text-sm font-bold text-gray-900 dark:text-white transition-all group-hover:text-primary">
                             {event.title || 'ללא כותרת'}
                           </div>
                           <div className="truncate text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5 transition-all max-w-[90%]">
                             {event.subtitle || 'אירוע יחידתי'}
                           </div>
                         </div>
                         
                         {event.color === 'red' && (
                           <div className="shrink-0 flex items-center justify-center pl-1">
                               <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                           </div>
                         )}
                     </div>
                     
                     {/* Expandable Details Area (Visible on Hover) */}
                     <div className="max-h-0 opacity-0 overflow-hidden transition-all duration-300 ease-in-out group-hover:max-h-[100px] group-hover:opacity-100 group-hover:mt-3">
                         <div className="border-t border-gray-100 dark:border-white/10 pt-2 text-right">
                             <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                                 {event.subtitle}
                             </p>
                         </div>
                     </div>
                   </div>
                 );
              }

              return (
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
                    <div className="flex flex-1 flex-col justify-start items-start px-4 py-4 text-right" >
                      <div className="pl-14 text-base font-black leading-tight text-gray-900 dark:text-white w-full">
                        {event.title || 'ללא כותרת'}
                      </div>
                      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400 w-full">
                        {event.subtitle || 'אירוע יחידתי מתוכנן'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {displayMode !== 'calendar' && sortedEvents.length > displayCount && (
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
