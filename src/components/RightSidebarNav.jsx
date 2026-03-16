import React, { useState, useRef, useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useTheme } from '../context/ThemeContext';
import { DynamicIcon } from './DynamicIcon';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { normalizeBorderStyle, panelStyle } from '../utils/borderStyles';

/**
 * RightSidebarNav — Tactical right sidebar navigation.
 *
 * Level 1 opens on CLICK (useState), closes on click-outside.
 * Level 2→3 accordion uses useState for expandedLevel2.
 * No scrollbars, no overflow constraints — panels float freely.
 */
export default function RightSidebarNav() {
    const { navItems } = useNavigation();
    const { theme, borderTargets } = useTheme();
    const [activeLevel1, setActiveLevel1] = useState(null);
    const [expandedLevel2, setExpandedLevel2] = useState(null);
    const sidebarRef = useRef(null);
    const topLevelBorderStyle = borderTargets?.sideNav
        ? normalizeBorderStyle(theme?.borderStyle || 'cyber')
        : 'standard';

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
                setActiveLevel1(null);
                setExpandedLevel2(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const categories = navItems || [];
    if (categories.length === 0) return null;

    const handleLevel1Click = (item) => {
        if (item.url || item.isDirectLink) {
            if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
            return;
        }
        setActiveLevel1((prev) => (prev === item.id ? null : item.id));
        setExpandedLevel2(null);
    };

    const handleLevel2Click = (child) => {
        if (child.url) {
            window.open(child.url, '_blank', 'noopener,noreferrer');
            return;
        }
        setExpandedLevel2((prev) => (prev === child.id ? null : child.id));
    };

    const handleLevel3Click = (link) => {
        if (link.url) {
            window.open(link.url, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <aside ref={sidebarRef} className="fixed right-0 top-32 z-[9999] flex flex-col gap-3 p-2 w-[70px]">
            {categories.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isDirectLink = item.url || item.isDirectLink;
                const isOpen = activeLevel1 === item.id;

                return (
                    <div className="relative" key={item.id}>
                        {/* Level 1 Button */}
                        {isDirectLink ? (
                            <a
                                href={item.url || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="sidebar-nav-item flex flex-col items-center gap-1 px-1 py-2.5 rounded-lg bg-theme-chrome backdrop-blur-md border border-theme-subtle shadow-md text-theme-muted hover:text-primary hover:brightness-110 hover:shadow-lg transition-all text-center cursor-pointer"
                                title={item.label}
                                style={panelStyle(topLevelBorderStyle, 10)}
                            >
                                <DynamicIcon name={item.icon} size={20} />
                                <span className="text-[9px] font-bold leading-tight max-w-[54px] truncate">
                                    {item.label}
                                </span>
                            </a>
                        ) : (
                            <button
                                onClick={() => handleLevel1Click(item)}
                                className={`sidebar-nav-item w-full flex flex-col items-center gap-1 px-1 py-2.5 rounded-lg bg-theme-chrome backdrop-blur-md border shadow-md hover:shadow-lg transition-all text-center cursor-pointer ${isOpen
                                        ? 'text-primary border-primary/30 brightness-110'
                                        : 'text-theme-muted border-theme-subtle hover:text-primary hover:brightness-110'
                                    }`}
                                title={item.label}
                                style={panelStyle(topLevelBorderStyle, 10)}
                            >
                                <DynamicIcon name={item.icon} size={20} />
                                <span className="text-[9px] font-bold leading-tight max-w-[54px] truncate">
                                    {item.label}
                                </span>
                            </button>
                        )}

                        {/* Level 2 Flyout — click-controlled, absolutely free over the page */}
                        {hasChildren && !isDirectLink && (
                            <div
                                className={`absolute right-full top-0 mr-4 w-auto min-w-[300px] bg-theme-card backdrop-blur-md shadow-2xl rounded-l-xl z-[10000] border border-theme-subtle p-4 transition-all duration-300 ${isOpen
                                        ? 'opacity-100 visible pointer-events-auto'
                                        : 'opacity-0 invisible pointer-events-none'
                                    }`}
                            >
                                {/* Panel Header */}
                                <div className="flex items-center gap-2 px-1 pb-3 mb-2 border-b border-theme-subtle">
                                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                                        <DynamicIcon name={item.icon} size={15} className="text-primary" />
                                    </div>
                                    <span className="font-bold text-sm text-theme whitespace-nowrap">
                                        {item.label}
                                    </span>
                                </div>

                                {/* Level 2 Items (Parents) */}
                                <div className="flex flex-col gap-0.5">
                                    {item.children.map((child) => {
                                        const isExpanded = expandedLevel2 === child.id;
                                        const hasSubLinks = child.subLinks && child.subLinks.length > 0;
                                        const childIsLink = !!child.url;

                                        return (
                                            <div key={child.id}>
                                                <button
                                                    onClick={() => handleLevel2Click(child)}
                                                    className="sidebar-nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-right transition-all hover:bg-theme-card-hover group/l2"
                                                >
                                                    <div
                                                        className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 transition ${isExpanded
                                                                ? 'bg-primary/15 text-primary'
                                                                : 'bg-theme-elevated text-theme-muted group-hover/l2:text-primary group-hover/l2:bg-primary/10'
                                                            }`}
                                                    >
                                                        <DynamicIcon name={child.icon} size={14} />
                                                    </div>
                                                    <span
                                                        className={`flex-1 text-sm font-medium transition whitespace-nowrap ${isExpanded
                                                                ? 'text-theme'
                                                                : 'text-theme-muted group-hover/l2:text-theme'
                                                            }`}
                                                    >
                                                        {child.title || child.label}
                                                    </span>
                                                    {childIsLink ? (
                                                        <ExternalLink size={12} className="text-theme-muted/80 shrink-0" />
                                                    ) : hasSubLinks ? (
                                                        <ChevronDown
                                                            size={14}
                                                            className={`text-theme-muted/80 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
                                                                }`}
                                                        />
                                                    ) : null}
                                                </button>

                                                {/* Level 3 — Accordion (Grandchildren / subLinks) */}
                                                {isExpanded && hasSubLinks && (
                                                    <div className="mr-4 mb-1 border-r-2 border-primary/20">
                                                        {child.subLinks.map((link, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => handleLevel3Click(link)}
                                                                className="sidebar-nav-item w-full flex items-center gap-2 pr-4 pl-3 py-2 text-right transition-all hover:bg-theme-card-hover rounded-md group/l3"
                                                            >
                                                                <DynamicIcon
                                                                    name={link.icon}
                                                                    size={13}
                                                                    className="text-theme-muted/80 group-hover/l3:text-primary transition shrink-0"
                                                                />
                                                                <span className="text-[13px] text-theme-muted group-hover/l3:text-theme transition flex-1 whitespace-nowrap">
                                                                    {link.label}
                                                                </span>
                                                                {link.url && (
                                                                    <ExternalLink
                                                                        size={10}
                                                                        className="text-theme-muted/60 shrink-0"
                                                                    />
                                                                )}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </aside>
    );
}
