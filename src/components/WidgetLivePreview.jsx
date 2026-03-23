import React, { useEffect, useRef, useState } from 'react';
import { Home } from '../App';
import { WidgetContext, useWidget } from '../context/WidgetContext';
import { DEFAULT_ACTIVE_WIDGETS } from '../utils/widgetDisplay';

export default function WidgetLivePreview({
    activeWidget,
    showStand = true,
    fillHeight = false,
    desktopOffsetX = 0
}) {
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const globalWidgetContext = useWidget();

    const DESKTOP_WIDTH = 1440;
    const DESKTOP_HEIGHT = 900;
    // We want the camera to focus on the left 480px of the screen
    const CROP_WIDTH = 480;

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            if (!width) return;
            // In full-height mode we "cover" the frame to avoid dead space.
            if (fillHeight && height) {
                setScale(Math.max(width / CROP_WIDTH, height / DESKTOP_HEIGHT));
                return;
            }
            // Scale the desktop so the 480px crop area fits perfectly in our container
            setScale(width / CROP_WIDTH);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [fillHeight]);

    // Override the global widget context JUST for this preview,
    // so it shows the currently hovered/selected widget in the admin panel
    const previewWidgetContext = {
        ...globalWidgetContext,
        widgetConfig: {
            ...globalWidgetContext.widgetConfig,
            activeWidget: activeWidget,
            activeWidgets: activeWidget ? [activeWidget] : (globalWidgetContext.widgetConfig?.activeWidgets || [...DEFAULT_ACTIVE_WIDGETS])
        }
    };

    return (
        <div className={`flex flex-col items-center w-full ${fillHeight ? 'h-full max-w-none' : 'max-w-[400px] mx-auto'}`}>
            {/* The Screen Bezel */}
            <div
                ref={containerRef}
                className={`w-full rounded-2xl border-[6px] lg:border-[8px] border-[#1e212b] shadow-2xl relative overflow-hidden bg-gray-50 dark:bg-[#1e212b] ${fillHeight ? 'flex-1 min-h-0' : ''}`}
                style={fillHeight ? undefined : { aspectRatio: '4 / 5' }}
            >
                {/* The Virtual Desktop anchored to the bottom left */}
                <div
                    className="absolute bottom-0 left-0 origin-bottom-left pointer-events-none select-none bg-gray-50 dark:bg-[#1e212b]"
                    style={{
                        left: `${desktopOffsetX}px`,
                        width: `${DESKTOP_WIDTH}px`,
                        height: `${DESKTOP_HEIGHT}px`,
                        transform: `scale(${scale})`
                    }}
                >
                    <WidgetContext.Provider value={previewWidgetContext}>
                        <Home isPreview />
                    </WidgetContext.Provider>
                </div>
            </div>

            {/* The Monitor Stand */}
            {showStand && (
                <div className="flex flex-col items-center relative z-0 -mt-1">
                    <div className="w-12 md:w-16 h-6 md:h-8 bg-gradient-to-b from-[#1e212b] to-gray-600 shadow-inner" />
                    <div className="w-28 md:w-36 h-3 md:h-4 bg-gradient-to-b from-gray-500 to-gray-800 rounded-t-lg shadow-2xl border-b-2 border-gray-900 relative">
                        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-white/20" />
                    </div>
                    <div className="w-36 md:w-48 h-1.5 bg-black/20 blur-sm rounded-full mt-1" />
                </div>
            )}
        </div>
    );
}
