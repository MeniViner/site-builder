import React, { useState, useRef, useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useTheme } from '../context/ThemeContext';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { normalizeBorderStyle, panelStyle } from '../utils/borderStyles';
import Tooltip from './Tooltip';
import NavVisual from './NavVisual';
import { getLinkTargetAttributes, openLinkTarget } from '../utils/linkTargets';

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
    const [flyoutStyleMap, setFlyoutStyleMap] = useState({});
    const sidebarRef = useRef(null);
    const triggerRefs = useRef({});
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

    const PANEL_ESTIMATED_HEIGHT = 440;
    const OPEN_UPWARD_FROM_VIEWPORT_RATIO = 0.62;

    const shouldOpenUpward = (itemId) => {
        const triggerEl = triggerRefs.current[itemId];
        if (!triggerEl) return false;

        const rect = triggerEl.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const triggerMidY = rect.top + (rect.height / 2);
        const belowThreshold = triggerMidY > (viewportHeight * OPEN_UPWARD_FROM_VIEWPORT_RATIO);

        const availableBelow = viewportHeight - rect.top;
        const availableAbove = rect.bottom;
        const lacksSpaceBelow = availableBelow < PANEL_ESTIMATED_HEIGHT;
        const hasMoreSpaceAbove = availableAbove > availableBelow;

        return belowThreshold || (lacksSpaceBelow && hasMoreSpaceAbove);
    };

    const calculateFlyoutStyle = (itemId) => {
        const triggerEl = triggerRefs.current[itemId];
        if (!triggerEl) return {};

        const rect = triggerEl.getBoundingClientRect();
        const panelWidth = 320;
        const gap = 16;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const left = Math.max(8, rect.left - panelWidth - gap);
        const openUpward = shouldOpenUpward(itemId);

        if (openUpward) {
            const bottom = Math.max(8, viewportHeight - rect.bottom);
            return { position: 'fixed', left: `${left}px`, top: 'auto', bottom: `${bottom}px` };
        }

        const top = Math.max(8, rect.top);
        return { position: 'fixed', left: `${left}px`, top: `${top}px`, bottom: 'auto' };
    };

    const handleLevel1Click = (item) => {
        if (item.url || item.isDirectLink) {
            if (item.url) openLinkTarget(item.url);
            return;
        }
        setFlyoutStyleMap((prev) => ({ ...prev, [item.id]: calculateFlyoutStyle(item.id) }));
        setActiveLevel1((prev) => (prev === item.id ? null : item.id));
        setExpandedLevel2(null);
    };

    const handleLevel2Click = (child) => {
        if (child.url) {
            openLinkTarget(child.url);
            return;
        }
        setExpandedLevel2((prev) => (prev === child.id ? null : child.id));
    };

    const handleLevel3Click = (link) => {
        if (link.url) {
            openLinkTarget(link.url);
        }
    };

    return (
        <aside ref={sidebarRef} className="right-sidebar-nav fixed right-0 top-24 bottom-4 z-[9999] w-[84px] overflow-y-auto overflow-x-visible flex flex-col items-center gap-2 p-2">
            {categories.map((item) => {
                const hasChildren = item.children && item.children.length > 0;
                const isDirectLink = item.url || item.isDirectLink;
                const isOpen = activeLevel1 === item.id;

                return (
                    <div className="relative" key={item.id}>
                        {/* Level 1 Button */}
                        {isDirectLink ? (
                            <Tooltip text={item.label}>
                                <a
                                    {...getLinkTargetAttributes(item.url)}
                                    className="sidebar-nav-item sidebar-trigger flex flex-col items-center justify-center text-center cursor-pointer"
                                    style={panelStyle(topLevelBorderStyle, 10)}
                                >
                                    <span className="sidebar-trigger__icon">
                                        <NavVisual item={item} size={18} imageClassName="h-[18px] w-[18px] object-contain" />
                                    </span>
                                    <span className="sidebar-trigger__label max-w-[64px] truncate">
                                        {item.label}
                                    </span>
                                </a>
                            </Tooltip>
                        ) : (
                            <button
                                ref={(el) => {
                                    triggerRefs.current[item.id] = el;
                                }}
                                onClick={() => handleLevel1Click(item)}
                                className={`gap-2 sidebar-nav-item sidebar-trigger flex flex-col items-center justify-center text-center cursor-pointer ${isOpen ? 'is-active' : ''}`}
                                aria-expanded={isOpen}
                                style={panelStyle(topLevelBorderStyle, 10)}
                            >
                                <span className="sidebar-trigger__icon">
                                    <NavVisual item={item} size={18} imageClassName="h-[18px] w-[18px] object-contain" />
                                </span>
                                <span className="sidebar-trigger__label max-w-[64px] truncate ">
                                    {item.label}
                                </span>
                            </button>
                        )}

                        {/* Level 2 Flyout — click-controlled, absolutely free over the page */}
                        {hasChildren && !isDirectLink && (
                            <div
                                style={flyoutStyleMap[item.id] || {}}
                                className={`w-auto min-w-[300px] origin-right rounded-l-xl border border-theme-subtle bg-theme-card p-4 shadow-2xl backdrop-blur-md z-[10000] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${isOpen
                                        ? 'translate-x-0 scale-100 opacity-100 visible pointer-events-auto'
                                        : 'translate-x-3 scale-[0.98] opacity-0 invisible pointer-events-none'
                                    }`}
                            >
                                {/* Panel Header */}
                                <div className="flex items-center gap-2 px-1 pb-3 mb-2 border-b border-theme-subtle">
                                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                                        <NavVisual item={item} size={15} className="text-primary" imageClassName="h-[15px] w-[15px] object-contain" />
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
                                                    className="sidebar-nav-item group/l2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-right transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-x-1 hover:bg-theme-card-hover active:scale-[0.96]"
                                                    aria-expanded={hasSubLinks ? isExpanded : undefined}
                                                >
                                                    <div
                                                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover/l2:-translate-x-0.5 ${isExpanded
                                                                ? 'bg-primary/15 text-primary'
                                                                : 'bg-theme-elevated text-theme-muted group-hover/l2:text-primary group-hover/l2:bg-primary/10'
                                                            }`}
                                                    >
                                                        <NavVisual item={child} size={14} imageClassName="h-3.5 w-3.5 object-contain" />
                                                    </div>
                                                    <span
                                                        className={`flex-1 whitespace-nowrap text-sm font-medium transition-colors duration-200 ${isExpanded
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
                                                                className="sidebar-nav-item group/l3 flex w-full items-center gap-2 rounded-md py-2 pr-4 pl-3 text-right transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-x-1 hover:bg-theme-card-hover active:scale-[0.96]"
                                                            >
                                                                <NavVisual
                                                                    item={link}
                                                                    size={13}
                                                                    className="shrink-0 text-theme-muted/80 transition-colors duration-200 group-hover/l3:text-primary"
                                                                    imageClassName="h-[13px] w-[13px] object-contain shrink-0"
                                                                />
                                                                <span className="flex-1 whitespace-nowrap text-[13px] text-theme-muted transition-colors duration-200 group-hover/l3:text-theme">
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
