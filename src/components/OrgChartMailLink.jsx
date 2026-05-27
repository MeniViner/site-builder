import React from 'react';
import { Mail } from 'lucide-react';

export default function OrgChartMailLink({
    href,
    label,
    className = '',
    iconSize = 14,
    title = 'שליחת מייל',
    target = '_blank',
}) {
    if (!href) return null;

    const stopTreeInteraction = (event) => {
        event.stopPropagation();
    };

    const handleKeyDown = (event) => {
        event.stopPropagation();
    };

    return (
        <a
            href={href}
            target={target}
            rel="noreferrer"
            draggable={false}
            className={`pointer-events-auto relative z-10 ${className}`}
            style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
            title={title}
            aria-label={`${title} אל ${label}`}
            onPointerDownCapture={stopTreeInteraction}
            onMouseDownCapture={stopTreeInteraction}
            onClickCapture={stopTreeInteraction}
            onPointerDown={stopTreeInteraction}
            onMouseDown={stopTreeInteraction}
            onClick={stopTreeInteraction}
            onKeyDown={handleKeyDown}
        >
            <Mail size={iconSize} aria-hidden="true" />
        </a>
    );
}
