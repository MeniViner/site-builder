import React, { useEffect, useMemo, useRef, useState } from 'react';
import OrgChartPage from '../pages/OrgChartPage';

const DESKTOP_WIDTH = 1440;
const DESKTOP_HEIGHT = 900;

export default function OrgChartLivePreview({ draft }) {
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const previewData = useMemo(() => ({ ...draft, enabled: true }), [draft]);

    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new ResizeObserver((entries) => {
            const { width } = entries[0].contentRect;
            if (!width) return;
            setScale(width / DESKTOP_WIDTH);
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    if (!draft) return null;

    return (
        <div
            ref={containerRef}
            className="w-full rounded-2xl border-gray-800 dark:border-white/20 shadow-2xl relative overflow-hidden bg-gray-50 dark:bg-[#1e212b]"
            style={{ aspectRatio: `${DESKTOP_WIDTH} / ${DESKTOP_HEIGHT}` }}
        >
            <div
                className="absolute top-0 right-0 origin-top-right overflow-y-auto overflow-x-hidden custom-scrollbar bg-gray-50 dark:bg-[#1e212b]"
                style={{
                    width: `${DESKTOP_WIDTH}px`,
                    height: `${DESKTOP_HEIGHT}px`,
                    transform: `scale(${scale})`,
                }}
            >
                <div className="pointer-events-none select-none w-full h-full">
                    <OrgChartPage isPreview previewData={previewData} />
                </div>
            </div>
        </div>
    );
}
