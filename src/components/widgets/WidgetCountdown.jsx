import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Target, Timer } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';

function calcTimeLeft(targetDate) {
  const diff = new Date(targetDate) - Date.now();
  if (Number.isNaN(diff)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: false, invalid: true };
  }
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true, invalid: false };
  }
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    expired: false,
    invalid: false,
  };
}

function TimeBlock({ value, label }) {
  const display = value > 99 ? String(value) : String(value).padStart(2, '0');
  return (
    <div className="rounded-[24px] border border-gray-200/80 bg-gradient-to-br from-white via-white to-gray-50 p-4 text-center shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] dark:border-white/10 dark:from-white/[0.07] dark:via-white/[0.05] dark:to-white/[0.02]">
      <span className="block text-3xl font-black leading-none text-primary drop-shadow-[0_0_14px_hsl(var(--color-primary)/0.32)] sm:text-4xl">
        {display}
      </span>
      <span className="mt-2 block text-[11px] font-bold uppercase tracking-[0.24em] text-gray-400 dark:text-gray-500">{label}</span>
    </div>
  );
}

export default function WidgetCountdown({ data = {} }) {
  const { title = '', targetDate = '' } = data;
  const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(targetDate));
  const formattedTargetDate = useMemo(() => {
    if (!targetDate) return '';
    const date = new Date(targetDate);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('he-IL', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, [targetDate]);

  useEffect(() => {
    if (!targetDate) return;
    setTimeLeft(calcTimeLeft(targetDate));
    const id = setInterval(() => setTimeLeft(calcTimeLeft(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) {
    return <WidgetEmptyState icon={Target} title="לא הוגדר תאריך יעד" description="הזן תאריך ושעה בממשק הניהול כדי להפעיל את הספירה לאחור." />;
  }

  if (timeLeft.invalid) {
    return <WidgetEmptyState icon={CalendarClock} title="תאריך היעד אינו תקין" description="עדכן את ערך התאריך בממשק הניהול כדי להציג ספירה פעילה." />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-[22px] border border-gray-200/80 bg-white/90 p-4 shadow-[0_16px_40px_-30px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-white/[0.04]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.24em] text-primary/80">יעד קרוב</div>
            <div className="mt-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
              {formattedTargetDate || 'ממתין לתאריך תקין'}
            </div>
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_18px_hsl(var(--color-primary)/0.18)]">
            <Timer size={18} />
          </div>
        </div>

        {title && (
          <div className="mt-3 rounded-[18px] border border-primary/15 bg-primary/[0.06] px-4 py-3 text-sm font-black text-gray-800 dark:text-gray-100">
            {title}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 rounded-[28px] border border-gray-200/80 bg-gradient-to-br from-white via-white to-gray-100/80 p-4 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.55)] dark:border-white/10 dark:from-white/[0.07] dark:via-white/[0.05] dark:to-white/[0.02]">
        {timeLeft.expired ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-[0_0_24px_hsl(var(--color-primary)/0.25)]">
              <Target size={30} />
            </div>
            <div className="mt-4 text-xl font-black text-gray-900 dark:text-white">הספירה הסתיימה</div>
            <div className="mt-2 max-w-xs text-sm leading-7 text-gray-500 dark:text-gray-400">
              {formattedTargetDate ? `יעד זה היה מתוכנן ל-${formattedTargetDate}.` : 'תאריך היעד כבר חלף.'}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="grid grid-cols-2 gap-3" dir="ltr">
              <TimeBlock value={timeLeft.days} label="ימים" />
              <TimeBlock value={timeLeft.hours} label="שעות" />
              <TimeBlock value={timeLeft.minutes} label="דקות" />
              <TimeBlock value={timeLeft.seconds} label="שניות" />
            </div>

            <div className="mt-4 rounded-[20px] border border-gray-200/80 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-black/20">
              <div className="text-[11px] font-black uppercase tracking-[0.24em] text-primary/80">סטטוס</div>
              <div className="mt-2 text-sm leading-7 text-gray-600 dark:text-gray-300">
                הספירה מתעדכנת בכל שנייה ומציגה את הזמן שנותר עד ליעד.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
