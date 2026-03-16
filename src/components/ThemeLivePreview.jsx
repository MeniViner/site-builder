import React, { useEffect, useRef, useState } from 'react';
import { Home } from '../App';
import { ThemeContext, useTheme, applyThemeToElement } from '../context/ThemeContext';

export default function ThemeLivePreview({ draft, displayModeOverride }) {
    const containerRef = useRef(null);
    const contentRef = useRef(null);
    const globalThemeContext = useTheme();
    const [scale, setScale] = useState(1);

    // We render the Home component inside a container simulating a standard desktop view.
    const DESKTOP_WIDTH = 1440;
    const DESKTOP_HEIGHT = 900;

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            const { width } = entries[0].contentRect;
            if (!width) return;
            // Scale strictly based on width. The aspect-ratio will handle the height perfectly.
            setScale(width / DESKTOP_WIDTH);
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const previewMode = displayModeOverride === 'dark'
        ? 'dark'
        : displayModeOverride === 'light'
            ? 'light'
            : globalThemeContext.effectiveMode;

    // Apply the draft CSS variables to the scaled DOM element continuously
    useEffect(() => {
        if (!contentRef.current || !draft) return;
        applyThemeToElement(contentRef.current, {
            ...draft,
            displayMode: previewMode,
        });
        contentRef.current.dataset.theme = draft.colorPackage || 'classic';
    }, [draft, previewMode]);

    if (!draft) return null;

    // Forge a ThemeContext value where the global theme is overridden by our draft theme.
    // This allows `<Home />` (which internally calls `useTheme()`) to instantly read our sliders.
        const previewContextValue = {
            ...globalThemeContext,
            theme: draft,
            effectiveMode: previewMode,
        };

    return (
        <div
            ref={containerRef}
            className="w-full rounded-2xl border-gray-800 dark:border-white/20 shadow-2xl relative overflow-hidden bg-[var(--color-bg-base)]"
            // Force the wrapper to match the inner desktop proportions exactly
            style={{ aspectRatio: `${DESKTOP_WIDTH} / ${DESKTOP_HEIGHT}` }}
        >
            <div
                ref={contentRef}
                className="absolute top-0 right-0 origin-top-right overflow-y-auto overflow-x-hidden custom-scrollbar bg-[var(--color-bg-base)]"
                style={{
                    width: `${DESKTOP_WIDTH}px`,
                    height: `${DESKTOP_HEIGHT}px`,
                    transform: `scale(${scale})`
                }}
            >
                {/* Apply the exact theme configuration overriding to the whole application tree inside this container */}
                <ThemeContext.Provider value={previewContextValue}>
                    {/* Disable interactions so admin doesn't accidentally click links inside the preview */}
                    <div className="pointer-events-none select-none w-full h-full pb-32">
                        <Home />
                    </div>
                </ThemeContext.Provider>
            </div>
        </div>
    );
}
