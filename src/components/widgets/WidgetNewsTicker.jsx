import React from 'react';

export default function WidgetNewsTicker({ data = [] }) {
    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <span className="text-themeText-tertiary text-sm">אין מבזקים פעילים</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar pr-1">
            {data.map((item) => (
                <div
                    key={item.id}
                    className="flex items-start gap-3 p-3 mb-2 rounded-xl bg-themeBg-elevated border border-themeBorder-muted"
                >
                    {/* Status dot */}
                    <span className="shrink-0 mt-1.5">
                        {item.isUrgent ? (
                            <span className="block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        ) : (
                            <span className="block w-2 h-2 rounded-full bg-primary" />
                        )}
                    </span>

                    {/* Text */}
                    <p
                        className={`text-sm text-themeText-primary leading-relaxed ${item.isUrgent ? 'font-semibold' : 'font-normal'
                            }`}
                    >
                        {item.text}
                    </p>
                </div>
            ))}
        </div>
    );
}
