import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp, X } from 'lucide-react';
import { getAdminPageHelp } from '../config/adminHelpContent';

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

function HelpCopy({ title, description, items = [] }) {
    const normalizedItems = Array.isArray(items) ? items.filter(Boolean) : [];

    return (
        <div className="space-y-2 text-right">
            {title && <div className="text-sm font-black text-slate-900 dark:text-white">{title}</div>}
            {description && <p className="text-xs leading-6 text-slate-600 dark:text-slate-300">{description}</p>}
            {normalizedItems.length > 0 && (
                <div className="space-y-1.5">
                    {normalizedItems.map((item) => (
                        <p key={item} className="text-xs leading-6 text-slate-600 dark:text-slate-300">
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
                    'inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300/90 bg-white text-slate-500 shadow-sm transition hover:border-primary/50 hover:text-primary dark:border-white/15 dark:bg-slate-900/90 dark:text-slate-300 dark:hover:border-primary/50 dark:hover:text-primary',
                    buttonClassName,
                ].join(' ')}
            >
                <CircleHelp size={iconSize} strokeWidth={2.2} />
            </button>

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    ref={panelRef}
                    className={[
                        'fixed z-[10050] rounded-2xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.28)] backdrop-blur dark:border-white/10 dark:bg-[#111827]/97',
                        panelClassName,
                    ].join(' ')}
                    style={{
                        ...panelStyle,
                        width: panelStyle?.width || 'min(22rem, calc(100vw - 2rem))',
                        visibility: panelStyle ? 'visible' : 'hidden',
                    }}
                >
                    <HelpCopy title={title} description={description} items={items} />
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

function PageHelpModal({ pageHelp, onClose }) {
    const sections = pageHelp?.sections || [];

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[10040] overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div className="flex min-h-full items-center justify-center py-[max(1rem,4vh)]">
                <div
                    className="flex max-h-[min(88vh,calc(100vh-4rem))] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/10 bg-white text-right shadow-[0_28px_70px_rgba(15,23,42,0.35)] dark:bg-[#111827] dark:text-white"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-white/10">
                        <div className="space-y-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                                הסבר על המסך
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">{pageHelp.title}</h2>
                            {pageHelp.summary && (
                                <p className="max-w-2xl text-sm leading-7 text-slate-600 dark:text-slate-300">{pageHelp.summary}</p>
                            )}
                        </div>

                        <button
                            type="button"
                            aria-label="סגור חלון עזרה"
                            onClick={onClose}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="overflow-y-auto px-6 py-6">
                        <div className="space-y-5">
                            {sections.map((section) => (
                                <section
                                    key={section.title}
                                    className="rounded-2xl border border-slate-200 bg-slate-50/90 p-5 dark:border-white/10 dark:bg-white/5"
                                >
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">{section.title}</h3>
                                    {section.description && (
                                        <p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{section.description}</p>
                                    )}
                                    {Array.isArray(section.items) && section.items.length > 0 && (
                                        <div className="mt-3 space-y-2">
                                            {section.items.map((item) => (
                                                <p key={item} className="text-sm leading-7 text-slate-600 dark:text-slate-300">
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

export function AdminPageHelpButton({
    pageId,
    label = 'הסבר על המסך',
    className = '',
    iconOnly = false,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const pageHelp = useMemo(() => getAdminPageHelp(pageId), [pageId]);

    if (!pageHelp) return null;

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={[
                    'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/90 px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-primary/40 dark:hover:text-primary',
                    iconOnly ? 'h-11 w-11 rounded-full px-0 py-0' : '',
                    className,
                ].join(' ')}
            >
                <CircleHelp size={18} />
                {!iconOnly && <span>{label}</span>}
            </button>

            {isOpen && <PageHelpModal pageHelp={pageHelp} onClose={() => setIsOpen(false)} />}
        </>
    );
}
