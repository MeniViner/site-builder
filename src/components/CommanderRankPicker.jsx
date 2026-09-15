import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Shield, X } from 'lucide-react';
import CommanderRankInsignia from './CommanderRankInsignia';
import { RANK_GROUPS } from './commanderRanks/rankCatalog';

export default function CommanderRankPicker({ value, styleId, orientation = 'native', rotation = 0, mirrored = false, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const triggerRef = useRef(null);
    const dialogRef = useRef(null);

    const closePicker = () => {
        setIsOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
    };

    useEffect(() => {
        if (!isOpen) return undefined;
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            setIsOpen(false);
            requestAnimationFrame(() => triggerRef.current?.focus());
        };
        document.addEventListener('keydown', closeOnEscape);
        requestAnimationFrame(() => dialogRef.current?.querySelector('[aria-pressed="true"]')?.focus());
        return () => document.removeEventListener('keydown', closeOnEscape);
    }, [isOpen]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setIsOpen(true)}
                aria-label="בחירת דרגה"
                className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-white px-4 text-right text-sm font-bold text-gray-800 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.1),0_4px_14px_rgba(15,23,42,0.06)] transition-[box-shadow,transform] hover:shadow-[inset_0_0_0_1px_rgba(59,130,246,0.5),0_6px_18px_rgba(15,23,42,0.09)] active:scale-[0.96] dark:bg-white/5 dark:text-white dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
            >
                <CommanderRankInsignia rank={value} styleId={styleId} orientation={orientation} rotation={rotation} mirrored={mirrored} className="h-12 w-24 shrink-0" />
                <span>בחירת דרגה</span>
                <Shield size={18} className="mr-auto text-primary" aria-hidden="true" />
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/45 p-3 sm:p-5" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePicker()}>
                    <div ref={dialogRef} className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white text-right shadow-[0_24px_70px_rgba(15,23,42,0.28)] dark:bg-[#1b1f2a]" role="dialog" aria-modal="true" aria-labelledby="commander-rank-picker-title" dir="rtl">
                        <div className="flex items-start gap-4">
                            <div className="px-5 pt-5 sm:px-6 sm:pt-6">
                                <h3 id="commander-rank-picker-title" className="text-lg font-black text-gray-950 dark:text-white">בחירת דרגה</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">הסמל יוצג בכרטיס המפקד בסגנון שנבחר.</p>
                            </div>
                            <button type="button" onClick={closePicker} className="ml-5 mr-auto mt-5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,transform] hover:bg-gray-100 hover:text-gray-900 active:scale-[0.96] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white sm:ml-6 sm:mt-6" aria-label="סגירת בחירת דרגה">
                                <X size={20} aria-hidden="true" />
                            </button>
                        </div>
                        <div className="mt-4 min-h-0 overflow-y-auto border-t border-gray-200 px-4 py-5 dark:border-white/10 sm:px-6">
                            {RANK_GROUPS.map((group) => (
                                <section key={group.id} className="mb-6 last:mb-0" aria-labelledby={`rank-group-${group.id}`}>
                                    <h4 id={`rank-group-${group.id}`} className="mb-2 text-xs font-black text-gray-500 dark:text-gray-400">{group.label}</h4>
                                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                                        {group.ranks.map((rank) => {
                                            const selected = rank === value;
                                            return (
                                                <button
                                                    key={rank}
                                                    type="button"
                                                    onClick={() => {
                                                        onChange(rank);
                                                        closePicker();
                                                    }}
                                                    aria-label={rank}
                                                    aria-pressed={selected}
                                                    className={`relative flex min-h-24 flex-col items-center justify-center rounded-lg px-2 py-2.5 text-center text-sm font-bold transition-[box-shadow,transform,background-color] active:scale-[0.96] ${selected ? 'bg-primary/5 text-gray-950 shadow-[inset_0_0_0_1.5px_var(--color-primary-hex)] dark:text-white' : 'bg-gray-50/80 text-gray-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.07)] hover:bg-white hover:shadow-[inset_0_0_0_1px_rgba(15,23,42,0.2),0_5px_14px_rgba(15,23,42,0.07)] dark:bg-white/5 dark:text-gray-200 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] dark:hover:bg-white/[0.08]'}`}
                                                >
                                                    {selected && <span className="absolute left-2 top-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"><Check size={12} aria-hidden="true" /></span>}
                                                    <CommanderRankInsignia rank={rank} styleId={styleId} orientation={orientation} rotation={rotation} mirrored={mirrored} className="h-auto w-full max-w-32" />
                                                    <span className="mt-1.5 leading-tight">{rank}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}