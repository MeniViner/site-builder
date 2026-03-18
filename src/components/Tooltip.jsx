import React, { useState, useRef, useEffect } from 'react';

/**
 * Custom Tooltip component that replaces standard browser title tooltips.
 * Features:
 * - Premium design with blur and glow effects
 * - RTL support
 * - Smart positioning (mostly top-center)
 */
const Tooltip = ({ children, text, position = 'bottom', delay = 300, wrapperClassName = 'inline-block relative' }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });
    const triggerRef = useRef(null);
    const tooltipRef = useRef(null);
    const timeoutRef = useRef(null);

    const showTooltip = () => {
        timeoutRef.current = setTimeout(() => {
            if (triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                const scrollX = window.scrollX;
                const scrollY = window.scrollY;

                let top = rect.top + scrollY;
                let left = rect.left + scrollX + rect.width / 2;

                if (position === 'top') {
                    top -= 8; // Padding
                } else if (position === 'bottom') {
                    top += rect.height + 8;
                }

                setCoords({ top, left });
                setIsVisible(true);
            }
        }, delay);
    };

    const hideTooltip = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setIsVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // If no text, just render children
    if (!text) return children;

    return (
        <div 
            ref={triggerRef}
            className={wrapperClassName}
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
            onFocus={showTooltip}
            onBlur={hideTooltip}
        >
            {children}
            {isVisible && (
                <div 
                    ref={tooltipRef}
                    className="fixed z-[9999] pointer-events-none"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`,
                        transform: position === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                    }}
                >
                    <div className="relative animate-in fade-in zoom-in duration-200">
                        {/* Glow effect */}
                        <div className="absolute inset-0 bg-primary/20 blur-md rounded-lg" />
                        
                        {/* Tooltip Content */}
                        <div className="relative px-3 py-1.5 bg-gray-900/90 dark:bg-black/80 backdrop-blur-md border border-white/10 dark:border-primary/20 rounded-lg shadow-2xl overflow-hidden min-w-max">
                            {/* Decorative line */}
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
                            
                            <span className="text-xs font-bold text-white tracking-wide whitespace-nowrap">
                                {text}
                            </span>
                        </div>
                        
                        {/* Arrow */}
                        <div 
                            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900/90 dark:bg-black/80 border-r border-b border-white/10 dark:border-primary/20 rotate-45 ${
                                position === 'top' ? '-bottom-1' : '-top-1'
                            }`} 
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tooltip;
