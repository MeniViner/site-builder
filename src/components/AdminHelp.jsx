import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X } from 'lucide-react';
import { getAdminPageHelp } from '../config/adminHelpContent';
import { useTheme } from '../context/ThemeContext';

function useCloseOnOutside({ isOpen, refs, onClose }) {
    useEffect(() => {
        if (!isOpen) return undefined;

        const handlePointerDown = (event) => {
            const clickedInside = refs.some((ref) => ref.current?.contains(event.target));
            if (!clickedInside) onClose();
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('touchstart', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('touchstart', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose, refs]);
}

function HelpCopy({ title, description, items = [], isDark = false }) {
    const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];
    const titleClass = isDark ? 'text-sm font-black text-white' : 'text-sm font-black text-slate-900';
    const bodyClass = isDark ? 'text-xs leading-6 text-slate-300' : 'text-xs leading-6 text-slate-600';

    return (
        <div className="space-y-2 text-right">
            {title && <div className={titleClass}>{title}</div>}
            {description && <p className={bodyClass}>{description}</p>}
            {normalizedItems.length > 0 && (
                <div className="space-y-1.5">
                    {normalizedItems.map((item) => (
                        <p key={item} className={bodyClass}>
                            {item}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

export function HelpTooltipButton({
    title = 'הסבר קצר',
    description,
    items = [],
    buttonClassName = '',
    panelClassName = '',
    iconSize = 14,
    ariaLabel,
}) {
    const { effectiveMode } = useTheme();
    const isDark = effectiveMode === 'dark';
    const [isOpen, setIsOpen] = useState(false);
    const [panelStyle, setPanelStyle] = useState(null);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);

    useCloseOnOutside({
        isOpen,
        refs: [buttonRef, panelRef],
        onClose: () => setIsOpen(false),
    });

    const resolvedAriaLabel = ariaLabel || `הסבר על ${title}`;

    useEffect(() => {
        if (!isOpen) {
            setPanelStyle(null);
            return undefined;
        }

        const updatePosition = () => {
            if (!buttonRef.current || !panelRef.current) return;

            const buttonRect = buttonRef.current.getBoundingClientRect();
            const panelRect = panelRef.current.getBoundingClientRect();
            const viewportPadding = 12;
            const preferredWidth = Math.min(352, window.innerWidth - (viewportPadding * 2));
            const panelWidth = Math.min(preferredWidth, panelRect.width || preferredWidth);

            let left = buttonRect.right - panelWidth;
            left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelWidth - viewportPadding));

            let top = buttonRect.bottom + 10;
            if (top + panelRect.height > window.innerHeight - viewportPadding) {
                top = Math.max(viewportPadding, buttonRect.top - panelRect.height - 10);
            }

            setPanelStyle({
                top: `${top}px`,
                left: `${left}px`,
                width: `${panelWidth}px`,
            });
        };

        const rafId = window.requestAnimationFrame(updatePosition);
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [isOpen]);

    return (
        <span className="inline-flex shrink-0">
            <button
                ref={buttonRef}
                type="button"
                aria-label={resolvedAriaLabel}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((prev) => !prev)}
                className={[
                    isDark
                        ? 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-[#0f172a] text-slate-200 shadow-sm transition hover:border-primary/50 hover:text-primary'
                        : 'inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/90 bg-white text-slate-500 shadow-sm transition hover:border-primary/50 hover:text-primary',
                    buttonClassName,
                ].join(' ')}
            >
                <CircleHelp size={iconSize} strokeWidth={2.2} />
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    className={[
                        isDark
                            ? 'fixed z-[10050] rounded-2xl border border-white/10 bg-[#111827]/97 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.45)] backdrop-blur'
                            : 'fixed z-[10050] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur',
                        panelClassName,
                    ].join(' ')}
                    style={{
                        ...panelStyle,
                        width: panelStyle?.width || 'min(22rem, calc(100vw - 2rem))',
                        visibility: panelStyle ? 'visible' : 'hidden',
                    }}
                >
                    <HelpCopy title={title} description={description} items={items} isDark={isDark} />
                </div>,
                document.body
            )}
        </span>
    );
}

export function HelpLabel({
    as: Tag = 'label',
    children,
    className = '',
    wrapperClassName = 'mb-2 flex items-center gap-2',
    helpTitle,
    helpDescription,
    helpItems = [],
    helpButtonClassName = '',
    ...props
}) {
    return (
        <div className={wrapperClassName}>
            <Tag className={className} {...props}>{children}</Tag>
            <HelpTooltipButton
                title={helpTitle}
                description={helpDescription}
                items={helpItems}
                buttonClassName={helpButtonClassName}
            />
        </div>
    );
}

function PageHelpModal({ pageHelp, onClose, isDark }) {
    const sections = pageHelp?.sections || [];

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className={`fixed inset-0 z-[10040] overflow-y-auto p-4 backdrop-blur-sm ${isDark ? 'bg-slate-950/70' : 'bg-slate-950/55'}`}
            onClick={onClose}
        >
            <div className="flex min-h-full items-center justify-center py-[max(1rem,4vh)]">
                <div
                    className={`flex max-h-[min(88vh,calc(100vh-4rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border text-right shadow-[0_28px_70px_rgba(15,23,42,0.35)] ${isDark ? 'border-white/10 bg-[#111827] text-white' : 'border-slate-200 bg-white text-slate-900'}`}
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className={`flex items-start justify-between gap-4 border-b px-6 py-5 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                {pageHelp.pill || 'הסבר על המסך'}
                            </div>
                            <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{pageHelp.title}</h2>
                            {pageHelp.summary && (
                                <p className={`max-w-2xl text-sm leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{pageHelp.summary}</p>
                            )}
                        </div>

                        <button
                            type="button"
                            aria-label="סגור חלון עזרה"
                            onClick={onClose}
                            className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition hover:border-primary/40 hover:text-primary ${isDark ? 'border-white/10 bg-white/5 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="overflow-y-auto px-6 py-6">
                        <div className="space-y-5">
                            {sections.map((section) => (
                                <section
                                    key={section.title}
                                    className={`rounded-2xl border p-5 ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50/90'}`}
                                >
                                    <h3 className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{section.title}</h3>
                                    {section.description && (
                                        <p className={`mt-2 text-sm leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{section.description}</p>
                                    )}
                                    {Array.isArray(section.items) && section.items.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {section.items.map((item) => (
                                                <p key={item} className={`text-sm leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    {item}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

/** tabId — מזהה טאב פעיל במסכי עיצוב / תוכן; משפיע על תוכן העזרה כש־pageId הוא theme או site-content */
export function AdminPageHelpButton({
    pageId,
    tabId,
    label = 'הסבר על המסך',
    className = '',
    iconOnly = false,
}) {
    const { effectiveMode } = useTheme();
    const isDark = effectiveMode === 'dark';
    const [isOpen, setIsOpen] = useState(false);
    const pageHelp = useMemo(() => getAdminPageHelp(pageId, tabId), [pageId, tabId]);

    if (!pageHelp) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={[
                    isDark
                        ? 'inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-slate-200 shadow-sm transition hover:border-primary/40 hover:text-primary'
                        : 'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-primary/40 hover:text-primary',
                    iconOnly ? 'h-11 w-11 rounded-full px-0 py-0' : '',
                    className,
                ].join(' ')}
            >
                <CircleHelp size={18} />
                {!iconOnly && <span>{label}</span>}
            </button>

            {isOpen && <PageHelpModal pageHelp={pageHelp} onClose={() => setIsOpen(false)} isDark={isDark} />}
        </>
    );
}
