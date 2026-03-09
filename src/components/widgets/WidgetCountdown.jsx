import React, { useState, useEffect } from 'react';

function calcTimeLeft(targetDate) {
    const diff = new Date(targetDate) - Date.now();
    if (isNaN(diff) || diff <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: diff <= 0 };
    }
    return {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        expired: false,
    };
}

function TimeBlock({ value, label }) {
    const display = String(value).padStart(2, '0');
    return (
        <div className="flex flex-col items-center justify-center bg-themeBg-elevated border border-themeBorder rounded-xl p-3 min-w-[70px]">
            <span className="text-4xl font-black text-primary drop-shadow-[0_0_10px_var(--color-primary-900)] tabular-nums leading-none">
                {display}
            </span>
            <span className="text-xs font-medium text-themeText-tertiary mt-1">{label}</span>
        </div>
    );
}

export default function WidgetCountdown({ data = {} }) {
    const { title = '', targetDate = '' } = data;
    const [timeLeft, setTimeLeft] = useState(() => calcTimeLeft(targetDate));

    useEffect(() => {
        if (!targetDate) return;
        setTimeLeft(calcTimeLeft(targetDate));
        const id = setInterval(() => setTimeLeft(calcTimeLeft(targetDate)), 1000);
        return () => clearInterval(id);
    }, [targetDate]);

    if (!targetDate) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <span className="text-themeText-tertiary text-sm">לא הוגדר תאריך יעד</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-4">
            {title && (
                <h3 className="text-xl font-bold text-themeText-primary mb-6 text-center">
                    {title}
                </h3>
            )}

            {timeLeft.expired ? (
                <p className="text-base font-bold text-primary/70">⏱️ הספירה הסתיימה</p>
            ) : (
                <div className="flex items-center gap-3" dir="ltr">
                    <TimeBlock value={timeLeft.days} label="ימים" />
                    <span className="text-2xl font-black text-primary/40 pb-5">:</span>
                    <TimeBlock value={timeLeft.hours} label="שעות" />
                    <span className="text-2xl font-black text-primary/40 pb-5">:</span>
                    <TimeBlock value={timeLeft.minutes} label="דקות" />
                    <span className="text-2xl font-black text-primary/40 pb-5">:</span>
                    <TimeBlock value={timeLeft.seconds} label="שניות" />
                </div>
            )}
        </div>
    );
}
