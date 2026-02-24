import React, { useState, useEffect } from 'react';
import { useEvents } from '../context/EventsContext';

export default function EventsList() {
    const { events, displayCount = 3, loading } = useEvents();
    const [currentIndex, setCurrentIndex] = useState(0);

    // Auto-rotate logic
    useEffect(() => {
        if (!events || events.length <= displayCount) return;

        const interval = setInterval(() => {
            setCurrentIndex(prev => (prev + displayCount) % events.length);
        }, 6000); // Changes every 6 seconds

        return () => clearInterval(interval);
    }, [events, displayCount]);

    if (loading) {
        return <div className="text-gray-400 p-4">טוען מופעים...</div>;
    }

    if (!events || events.length === 0) {
        return <div className="text-gray-400 p-4">אין מופעים להצגה.</div>;
    }

    // Sort events by date ascending
    const sortedEvents = [...events].sort((a, b) => {
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(a.date) - new Date(b.date);
    });

    // Helper functions for formatting dates
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

    // Determine slice to show
    let slice = [];
    if (events.length <= displayCount) {
        slice = events;
    } else {
        slice = events.slice(currentIndex, currentIndex + displayCount);
        // If we hit the end and it's less than displayCount, wrap around
        if (slice.length < displayCount) {
            slice = [...slice, ...events.slice(0, displayCount - slice.length)];
        }
    }

    return (
        <div className="flex flex-col gap-4 overflow-hidden">
            {slice.map((event, idx) => (
                <div
                    key={`${event.id}-${currentIndex}`}
                    className={`relative group cursor-pointer transition h-20 animate-aggressive ${event.color === 'red' ? 'filter drop-shadow-[0_0_12px_rgba(220,38,38,0.2)]' : 'hover:opacity-100'}`}
                    style={{ animationDelay: `${idx * 0.15}s` }}
                >
                    <div
                        className={`absolute inset-0 ${event.color === 'red' ? 'bg-red-500' : 'bg-gray-600/50'}`}
                        style={{ clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)' }}
                    />
                    <div
                        className={`absolute inset-[1px] ${event.color === 'red' ? 'bg-[#0c0d12]/60' : 'bg-[#0c0d12]/50'} backdrop-blur-xl`}
                        style={{ clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)' }}
                    />
                    <div
                        className={`absolute inset-[1px] bg-gradient-to-l ${event.color === 'red' ? 'from-red-600/40 backdrop-blur-md' : 'from-gray-600/20 mix-blend-screen'} to-transparent`}
                        style={{ clipPath: 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)' }}
                    />
                    <div className={`relative z-10 flex items-stretch h-full ${event.color === 'red' ? 'text-white' : 'text-gray-200'}`}>
                        <div className={`w-[30%] flex flex-col items-center justify-center border-l ${event.color === 'red' ? 'border-red-500/30' : 'border-gray-600/40 text-gray-300 group-hover:text-white transition'} font-bold`}>
                            <span className="text-3xl leading-none drop-shadow-sm">{getDayNumeric(event.date, event.day)}</span>
                            <span className={`text-[10px] mt-1 tracking-widest ${event.color === 'red' ? 'opacity-90 text-red-100' : 'opacity-80'}`}>{getHebrewMonth(event.date, event.month)}</span>
                        </div>
                        <div className={`flex-1 flex flex-col justify-center pr-4 pl-2 ${event.color === 'red' ? '' : 'group-hover:text-white transition'}`}>
                            <div className="font-bold text-[15px] lg:text-lg leading-tight mb-0.5 truncate drop-shadow-sm">{event.title}</div>
                            <div className={`text-[10px] lg:text-[11px] uppercase tracking-widest font-medium ${event.color === 'red' ? 'opacity-80' : 'text-gray-400'}`}>{event.subtitle}</div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
