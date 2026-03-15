import React, { useRef, useEffect } from 'react';
import { Search, Globe } from 'lucide-react';
import { applyThemeToElement } from '../context/ThemeContext';

function tacticalClip(style, size) {
    const s = size;
    switch (style) {
        case 'tactical-1':
            return `polygon(${s}px 0, 100% 0, 100% calc(100% - ${s}px), calc(100% - ${s}px) 100%, 0 100%, 0 ${s}px)`;
        case 'tactical-2':
            return `polygon(0 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% 100%, ${s}px 100%, 0 calc(100% - ${s}px))`;
        case 'tactical-3':
            return `polygon(${s}px 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% calc(100% - ${s}px), calc(100% - ${s}px) 100%, ${s}px 100%, 0 calc(100% - ${s}px), 0 ${s}px)`;
        default:
            return null;
    }
}

const MOCK_LINKS = [
    { id: '1', title: 'קישור 1', url: '#', icon: 'Globe' },
    { id: '2', title: 'קישור 2', url: '#', icon: 'Globe' },
];

function getWidgetHeightPx(level) {
    switch (level) {
        case 'full': return 180;
        case 'high': return 140;
        case 'medium': return 100;
        case 'low':
        default: return 72;
    }
}

export default function ThemeLivePreview({ draft }) {
    const wrapperRef = useRef(null);

    useEffect(() => {
        if (wrapperRef.current && draft) {
            applyThemeToElement(wrapperRef.current, draft);
        }
    }, [draft]);

    if (!draft) return null;

    const borderStyle = draft.borderStyle || 'tactical-1';
    const isTactical = borderStyle && borderStyle !== 'standard';
    const clip = (s) => tacticalClip(borderStyle, s);
    const panelClip = isTactical ? tacticalClip(borderStyle, 10) : null;
    const widgetH = getWidgetHeightPx(draft.widgetHeight);
    const showNavCategories = draft.showNavCategories !== false;
    const extLayout = draft.externalLinksLayout || 'cards';
    const extBordered = draft.externalLinksBordered !== false;
    const extShowBg = draft.externalLinksShowBackground !== false;

    return (
        <div
            ref={wrapperRef}
            dir="rtl"
            className="min-h-[400px] rounded-xl overflow-hidden bg-[var(--surface-bg)] text-[var(--surface-text)] font-heebo border border-gray-300 dark:border-white/10 shadow-inner"
        >
            {/* Mini Navbar */}
            <nav className="w-full px-3 py-2 flex items-center justify-between bg-white/80 dark:bg-[#1a1d24]/90 border-b border-gray-200 dark:border-white/5">
                <div className="flex items-center gap-2">
                    <div className="font-bold text-sm relative shrink-0" style={{ color: draft.primaryColor ?? '#dc2626' }}>
                        שם האתר
                        <div className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-t-sm" style={{ backgroundColor: draft.primaryColor ?? '#dc2626' }} />
                    </div>
                    {showNavCategories && (
                        <>
                            <span className="px-2 py-0.5 rounded text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5">קטגוריה 1</span>
                            <span className="px-2 py-0.5 rounded text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-white/5">קטגוריה 2</span>
                        </>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-24 h-6 rounded flex items-center px-1.5 bg-gray-100 dark:bg-[#1e212b] border border-gray-200 dark:border-white/10">
                        <Search size={12} style={{ color: 'var(--color-primary-hex)' }} />
                    </div>
                    <button className="text-[10px] px-2 py-1 border rounded" style={{ borderColor: draft.primaryColor ?? '#dc2626' }}>כפתור</button>
                </div>
            </nav>

            {/* Mini Hero + Panels row */}
            <div className="p-2 flex flex-col gap-2">
                <div className="h-12 rounded bg-gradient-to-br from-gray-100 to-gray-50 dark:from-surface-card dark:to-[#1e212b] border border-gray-200 dark:border-white/5 flex items-center px-3">
                    <span className="text-xs font-bold" style={{ color: 'var(--color-primary-hex)' }}>כותרת Hero</span>
                    <span className="text-[10px] text-gray-500 dark:text-gray-400 mr-2">תיאור קצר</span>
                </div>

                <div className="flex gap-2 items-end">
                    {/* Tactical Panel */}
                    <div
                        className="flex-1 min-h-0 bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 p-2"
                        style={panelClip ? { clipPath: panelClip } : { borderRadius: '8px' }}
                    >
                        <div className="text-[10px] text-gray-600 dark:text-gray-400">פאנל טקטי</div>
                    </div>
                    {/* Widget */}
                    <div
                        className="w-24 bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 p-1.5 flex flex-col"
                        style={{
                            height: `${widgetH}px`,
                            ...(isTactical ? { clipPath: clip(6) } : { borderRadius: '6px' }),
                        }}
                    >
                        <div className="text-[9px] font-bold border-b border-gray-200 dark:border-white/10 pb-1">ווידגט</div>
                        <div className="flex-1 text-[8px] text-gray-500 dark:text-gray-500">תוכן</div>
                    </div>
                </div>
            </div>

            {/* External links preview */}
            <div className="mt-auto border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#1e212b] px-2 py-2">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <Globe size={12} style={{ color: 'var(--color-primary-hex)' }} />
                    <span className="text-[10px] font-bold">קישורים חיצוניים</span>
                </div>
                {extLayout === 'cards' && (
                    <div className="flex gap-1.5 flex-wrap">
                        {MOCK_LINKS.map((link) => (
                            <div
                                key={link.id}
                                className={`flex flex-col items-center gap-0.5 p-1.5 rounded-lg text-center ${extBordered ? 'border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.02]' : ''}`}
                            >
                                <div className={`w-6 h-6 rounded flex items-center justify-center ${extBordered ? 'bg-gray-100 dark:bg-white/5' : ''}`}>
                                    <Globe size={10} style={{ color: 'var(--color-primary-hex)' }} />
                                </div>
                                <span className="text-[8px] text-gray-500 dark:text-gray-400">{link.title}</span>
                            </div>
                        ))}
                    </div>
                )}
                {extLayout === 'minimal' && (
                    <div className={`flex items-center gap-2 ${extBordered ? 'rounded-full border border-gray-200 dark:border-white/10 p-1' : ''}`}>
                        {MOCK_LINKS.map((link) => (
                            <div
                                key={link.id}
                                className={`w-6 h-6 rounded-full flex items-center justify-center ${extBordered ? 'bg-gray-100 dark:bg-white/5' : ''}`}
                            >
                                <Globe size={10} style={{ color: 'var(--color-primary-hex)' }} />
                            </div>
                        ))}
                    </div>
                )}
                {extLayout === 'floating' && (
                    <div className={`flex items-center gap-1 rounded-full px-2 py-1 ${extShowBg ? 'bg-white/80 dark:bg-black/80' : ''} ${extBordered && extShowBg ? 'border border-gray-200 dark:border-white/10' : ''}`}>
                        {MOCK_LINKS.map((link) => (
                            <div key={link.id} className="w-5 h-5 rounded-full bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                                <Globe size={8} style={{ color: 'var(--color-primary-hex)' }} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
