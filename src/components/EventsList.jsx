import React, { useState, useEffect } from 'react';
import { useEvents } from '../context/EventsContext';

export default function EventsList() {
    const { events, displayCount = 3, loading } = useEvents();
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (!events || events.length <= displayCount) return;

        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + displayCount) % events.length);
        }, 6000);

        return () => clearInterval(interval);
    }, [events, displayCount]);

    if (loading) {
        return <div className="text-gray-500 dark:text-gray-400 p-4">טוען מופעים...</div>;
    }

    if (!events || events.length === 0) {
        return <div className="text-gray-500 dark:text-gray-400 p-4">אין מופעים להצגה.</div>;
    }

    const sortedEvents = [...events].sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
    });

    const getHebrewMonth = (dateString, fallbackMonth) => {
        if (!dateString) return fallbackMonth || '';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return fallbackMonth || '';
        const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
        return months[d.getMonth()];
    };

    const getDayNumeric = (dateString, fallbackDay) => {
        if (!dateString) return fallbackDay || '';
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return fallbackDay || '';
        return d.getDate().toString().padStart(2, '0');
    };

    let slice = [];
    if (events.length <= displayCount) {
        slice = events;
    } else {
        slice = events.slice(currentIndex, currentIndex + displayCount);
        if (slice.length < displayCount) {
            slice = [...slice, ...events.slice(0, displayCount - slice.length)];
        }
    }

    return (
        <div className="flex flex-col gap-4 overflow-hidden">
            {slice.map((event, idx) => (
                <div
                    key={`${event.id}-${currentIndex}`}
                    className={`relative group cursor-pointer transition h-20 animate-aggressive ${event.color === 'red' ? 'ring-1 ring-red-500 shadow-[0_0_12px_rgba(220,38,38,0.2)]' : 'hover:opacity-100'} bg-white border border-gray-200 shadow-md text-gray-800 dark:bg-[#232733] dark:border-white/5 dark:text-white dark:shadow-none flex items-stretch rounded-lg overflow-hidden`}
                    style={{ animationDelay: `${idx * 0.15}s` }}
                >
                    <div className="w-[30%] flex flex-col items-center justify-center border-l border-inherit font-bold">
                        <span className="text-3xl leading-none drop-shadow-sm">{getDayNumeric(event.date, event.day)}</span>
                        <span className="text-[10px] mt-1 tracking-widest opacity-80">{getHebrewMonth(event.date, event.month)}</span>
                    </div>
                    <div className="flex-1 flex flex-col justify-center pr-4 pl-2">
                        <div className="font-bold text-[15px] lg:text-lg leading-tight mb-0.5 truncate drop-shadow-sm text-gray-900 dark:text-white">{event.title}</div>
                        <div className="text-[10px] lg:text-[11px] uppercase tracking-widest font-medium text-gray-600 dark:text-gray-300">{event.subtitle}</div>
                    </div>
                </div>
            ))}
        </div>
    );
}
