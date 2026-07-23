import React, { useState, useRef, useEffect } from 'react';
import { useNavigation } from '../context/NavigationContext';
import { useTheme } from '../context/ThemeContext';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { normalizeBorderStyle, panelStyle } from '../utils/borderStyles';
import Tooltip from './Tooltip';
import NavVisual from './NavVisual';
import { getLinkTargetAttributes, openLinkTarget } from '../utils/linkTargets';
import { getNavigationNodeModel } from '../utils/navigationModel';

function SidebarTopLevelTrigger({ item, itemModel, isOpen, onClick, setTriggerRef, borderStyle }) {
    const labelRef = useRef(null);
    const [isLabelClipped, setIsLabelClipped] = useState(false);
    const label = String(item?.label || '');

    useEffect(() => {
        const labelElement = labelRef.current;
        if (!labelElement) return undefined;

        const updateClippedState = () => {
            const isClipped = labelElement.scrollWidth > labelElement.clientWidth + 1
                || labelElement.scrollHeight > labelElement.clientHeight + 1;
            setIsLabelClipped(isClipped);
        };

        updateClippedState();
        window.addEventListener('resize', updateClippedState);

        const resizeObserver = typeof ResizeObserver === 'function'
            ? new ResizeObserver(updateClippedState)
            : null;
        resizeObserver?.observe(labelElement);

        return () => {
            resizeObserver?.disconnect();
            window.removeEventListener('resize', updateClippedState);
        };
    }, [label]);

    const content = (
        <>
            <span className="sidebar-nav-item__icon-box">
                <NavVisual item={item} size={18} imageClassName="h-[18px] w-[18px] object-contain" />
            </span>
            <span
                ref={labelRef}
                data-testid={`sidebar-trigger-label-${item.id}`}
                className="sidebar-nav-item__label"
            >
                {label}
            </span>
        </>
    );
    const nativeTooltip = isLabelClipped ? label : undefined;

    if (itemModel.canOpen && !itemModel.canExplore) {
        return (
            <a
                {...getLinkTargetAttributes(itemModel.url)}
                title={nativeTooltip}
                className={`sidebar-nav-item sidebar-nav-item--top-level ${isOpen ? 'is-active' : ''}`.trim()}
                style={panelStyle(borderStyle, 10)}
            >
                {content}
            </a>
        );
    }

        return (
            <button
                ref={setTriggerRef}
                onClick={onClick}
                title={nativeTooltip}
                className={`sidebar-nav-item sidebar-nav-item--top-level ${isOpen ? 'is-active' : ''}`.trim()}
                aria-expanded={isOpen}
                style={panelStyle(borderStyle, 10)}
            >
                {content}
            </button>
    );
}

/**
 * RightSidebarNav — Tactical right sidebar navigation.
 *
 * Level 1 opens on CLICK (useState), closes on click-outside.
 * Level 2→3 accordion uses useState for expandedLevel2.
 * Fixed flyouts remain viewport-positioned while the trigger rail scrolls independently.
 */
export default function RightSidebarNav() {
    const { navItems } = useNavigation();
    const { theme, borderTargets } = useTheme();
    const [activeLevel1, setActiveLevel1] = useState(null);
    const [expandedLevel2, setExpandedLevel2] = useState(null);
    const [headerOffset, setHeaderOffset] = useState(88);
    const [flyoutStyleMap, setFlyoutStyleMap] = useState({});
    const sidebarRef = useRef(null);
    const triggerRefs = useRef({});
    const topLevelBorderStyle = borderTargets?.sideNav
        ? normalizeBorderStyle(theme?.borderStyle || 'cyber')
        : 'standard';

    // Close on click outside
    useEffect(() => {
        const resolveHeaderOffset = () => {
            const headerElement = document.querySelector('nav');
            if (!headerElement) return 88;

            const headerBottom = Math.round(headerElement.getBoundingClientRect().bottom);
            if (!Number.isFinite(headerBottom) || headerBottom <= 0) return 88;
            return headerBottom;
        };

        const updateLayoutOffsets = () => {
            const nextHeaderOffset = resolveHeaderOffset();
            setHeaderOffset((prev) => (prev === nextHeaderOffset ? prev : nextHeaderOffset));
        };

        const handleViewportChange = () => {
            updateLayoutOffsets();
            setActiveLevel1(null);
            setExpandedLevel2(null);
        };

        const handleClickOutside = (e) => {
            if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
                setActiveLevel1(null);
                setExpandedLevel2(null);
            }
        };
        updateLayoutOffsets();
        window.addEventListener('resize', handleViewportChange);
        window.addEventListener('orientationchange', handleViewportChange);
        window.visualViewport?.addEventListener('resize', handleViewportChange);
        window.visualViewport?.addEventListener('scroll', handleViewportChange);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('resize', handleViewportChange);
            window.removeEventListener('orientationchange', handleViewportChange);
            window.visualViewport?.removeEventListener('resize', handleViewportChange);
            window.visualViewport?.removeEventListener('scroll', handleViewportChange);
            document.removeEventListener('mousedown', handleClickOutside);
        };
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

        const availableBelow = viewportHeight - rect.bottom;
        const availableAbove = rect.top;
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
        const model = getNavigationNodeModel(item);
        if (!model.canExplore && model.canOpen) {
            openLinkTarget(model.url);
            return;
        }
        setFlyoutStyleMap((prev) => ({ ...prev, [item.id]: calculateFlyoutStyle(item.id) }));
        setActiveLevel1((prev) => (prev === item.id ? null : item.id));
        setExpandedLevel2(null);
    };

    const handleLevel2Click = (child) => {
        const model = getNavigationNodeModel(child);
        if (!model.canExplore && model.canOpen) {
            openLinkTarget(model.url);
            return;
        }
        setExpandedLevel2((prev) => (prev === child.id ? null : child.id));
    };

    const handleRailScroll = () => {
        setActiveLevel1(null);
        setExpandedLevel2(null);
    };

    return (
        <aside
            ref={sidebarRef}
            className="right-sidebar-nav"
            style={{ '--right-sidebar-header-offset': `${headerOffset}px` }}
        >
            <div className="right-sidebar-nav__viewport">
                <div className="right-sidebar-nav__scroll" onScroll={handleRailScroll}>
                    <div className="right-sidebar-nav__group">
                        {categories.map((item) => {
                        const itemModel = getNavigationNodeModel(item);
                        const hasChildren = itemModel.canExplore;
                        const isOpen = activeLevel1 === item.id;

                        return (
                            <div className="relative" key={item.id}>
                                {/* Level 1 Button */}
                                <SidebarTopLevelTrigger
                                    item={item}
                                    itemModel={itemModel}
                                    isOpen={isOpen}
                                    onClick={() => handleLevel1Click(item)}
                                    setTriggerRef={(element) => {
                                        triggerRefs.current[item.id] = element;
                                    }}
                                    borderStyle={topLevelBorderStyle}
                                />

                                {/* Level 2 Flyout — click-controlled, absolutely free over the page */}
                                {hasChildren && (
                                    <div
                                        data-testid={`sidebar-flyout-${item.id}`}
                                        style={flyoutStyleMap[item.id] || {}}
                                        className={`fixed max-h-[calc(100dvh-1rem)] w-auto min-w-[300px] overflow-y-auto origin-right rounded-l-xl border border-theme-subtle bg-theme-card p-4 shadow-2xl backdrop-blur-md z-[10000] transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${isOpen
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
                                            {itemModel.canOpen && (
                                                <a
                                                    {...getLinkTargetAttributes(itemModel.url)}
                                                    onClick={(event) => event.stopPropagation()}
                                                    className="mr-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-xs font-bold text-primary transition-[background-color,transform] hover:bg-primary/20 active:scale-[0.96]"
                                                >
                                                    <ExternalLink size={12} />
                                                    פתח יעד
                                                </a>
                                            )}
                                        </div>

                                        {/* Level 2 Items (Parents) */}
                                        <div className="flex flex-col gap-0.5">
                                            {item.children.map((child) => {
                                                const isExpanded = expandedLevel2 === child.id;
                                                const childModel = getNavigationNodeModel(child);
                                                const hasSubLinks = childModel.canExplore;
                                                const childIsLink = childModel.canOpen;

                                                return (
                                                    <div key={child.id}>
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleLevel2Click(child)}
                                                                className="sidebar-nav-item group/l2 flex min-h-10 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-right transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-x-1 hover:bg-theme-card-hover active:scale-[0.96]"
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
                                                                {hasSubLinks ? (
                                                                    <ChevronDown
                                                                        size={14}
                                                                        className={`text-theme-muted/80 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''
                                                                            }`}
                                                                    />
                                                                ) : childIsLink ? (
                                                                    <ExternalLink size={12} className="text-theme-muted/80 shrink-0" />
                                                                ) : null}
                                                            </button>
                                                            {childModel.isHybrid && (
                                                                <Tooltip text="פתח יעד תיקייה">
                                                                    <a
                                                                        {...getLinkTargetAttributes(childModel.url)}
                                                                        onClick={(event) => event.stopPropagation()}
                                                                        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-[background-color,transform] hover:bg-primary/20 active:scale-[0.96]"
                                                                        aria-label={`פתח יעד ${child.title || child.label}`}
                                                                    >
                                                                        <ExternalLink size={13} />
                                                                    </a>
                                                                </Tooltip>
                                                            )}
                                                        </div>

                                                        {/* Level 3 — Accordion (Grandchildren / subLinks) */}
                                                        {isExpanded && hasSubLinks && (
                                                            <div className="mr-4 mb-1 border-r-2 border-primary/20">
                                                                {childModel.children.map((link, idx) => {
                                                                    const linkModel = getNavigationNodeModel(link);
                                                                    const LinkElement = linkModel.canOpen ? 'a' : 'div';
                                                                    return (
                                                                        <LinkElement
                                                                            key={link.id || `${link.label || 'link'}-${idx}`}
                                                                            {...(linkModel.canOpen ? getLinkTargetAttributes(linkModel.url) : {})}
                                                                            className="sidebar-nav-item group/l3 flex min-h-10 w-full items-center gap-2 rounded-md py-2 pr-4 pl-3 text-right transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.2,0,0,1)] hover:-translate-x-1 hover:bg-theme-card-hover active:scale-[0.96]"
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
                                                                            {linkModel.canOpen && (
                                                                                <ExternalLink
                                                                                    size={10}
                                                                                    className="text-theme-muted/60 shrink-0"
                                                                                />
                                                                            )}
                                                                        </LinkElement>
                                                                    );
                                                                })}
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
                    </div>
                </div>
            </div>
        </aside>
    );
}
