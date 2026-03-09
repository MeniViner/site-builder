import React from 'react';
import { Phone } from 'lucide-react';

export default function WidgetPhonebook({ data = [] }) {
    if (!data || data.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <span className="text-themeText-tertiary text-sm">אין אנשי קשר</span>
            </div>
        );
    }

    return (
        <div className="w-full h-full overflow-y-auto custom-scrollbar">
            {data.map((contact) => (
                <div
                    key={contact.id}
                    className="flex items-center justify-between p-3 border-b border-themeBorder-muted last:border-0 hover:bg-themeBg-elevated transition-colors"
                >
                    {/* Left: name + department */}
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-themeText-primary truncate">
                            {contact.name}
                        </span>
                        {contact.department && (
                            <span className="text-xs text-themeText-tertiary truncate">
                                {contact.department}
                            </span>
                        )}
                    </div>

                    {/* Right: phone number link */}
                    {contact.number && (
                        <a
                            href={`tel:${contact.number}`}
                            className="flex items-center gap-2 shrink-0 mr-3 group"
                            title={`התקשר ל-${contact.name}`}
                        >
                            <Phone
                                size={14}
                                className="text-primary shrink-0 group-hover:scale-110 transition-transform"
                            />
                            <span className="text-sm font-medium tracking-wider text-themeText-secondary group-hover:text-primary transition-colors" dir="ltr">
                                {contact.number}
                            </span>
                        </a>
                    )}
                </div>
            ))}
        </div>
    );
}
