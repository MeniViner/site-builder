import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

export default function WidgetOutstanding({ data = [] }) {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Auto-cycle every 5 s when there's more than one person
    useEffect(() => {
        if (data.length <= 1) return;
        const id = setInterval(() => {
            setCurrentIndex(prev => (prev + 1) % data.length);
        }, 5000);
        return () => clearInterval(id);
    }, [data.length]);

    // Reset index if data shrinks (e.g. item deleted in admin)
    useEffect(() => {
        setCurrentIndex(0);
    }, [data.length]);

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <span className="text-themeText-tertiary text-sm">אין נתונים להצגה</span>
            </div>
        );
    }

    const person = data[currentIndex];

    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-4 animate-fade-in">
            {/* Profile image */}
            {person.image ? (
                <img
                    src={person.image}
                    alt={person.name}
                    className="w-28 h-28 object-cover rounded-full border-4 border-primary/30 shadow-[0_0_15px_var(--color-primary-hex)] mb-4"
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                />
            ) : (
                <div className="w-28 h-28 rounded-full border-4 border-primary/30 shadow-[0_0_15px_var(--color-primary-hex)] mb-4 bg-primary/10 flex items-center justify-center">
                    <User size={48} className="text-primary/50" />
                </div>
            )}

            {/* Name */}
            <h3 className="text-2xl font-black text-themeText-primary leading-tight mb-1">
                {person.name}
            </h3>

            {/* Role */}
            <p className="text-sm font-bold text-primary mb-3">
                {person.role}
            </p>

            {/* Description */}
            {person.description && (
                <p className="text-base text-themeText-secondary font-medium line-clamp-3 max-w-xs leading-relaxed">
                    {person.description}
                </p>
            )}

            {/* Dot pagination */}
            {data.length > 1 && (
                <div className="flex items-center gap-2 mt-5">
                    {data.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentIndex(i)}
                            aria-label={`עבור לכרטיס ${i + 1}`}
                            className={`rounded-full transition-all duration-300 ${i === currentIndex
                                    ? 'w-5 h-2 bg-primary'
                                    : 'w-2 h-2 bg-themeBorder-muted hover:bg-primary/40'
                                }`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
