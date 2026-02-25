import React from 'react';
import { ChevronLeft, Undo2 } from 'lucide-react';
import { DynamicIcon } from './DynamicIcon';

export const FlipCard = ({ id, title, icon: iconName, subLinks = [], url, isFlipped, onFlip }) => {
    const handleLinkClick = (e) => {
        e.stopPropagation();
    };

    const handleCardClick = () => {
        if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
        }
        onFlip(isFlipped ? null : id);
    };

    const handleClose = (e) => {
        e.stopPropagation();
        onFlip(null);
    };

    return (
        <div
            className="relative w-full h-56 cursor-pointer [perspective:1000px] group"
            onClick={handleCardClick}
        >
            <div
                className={`w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
            >
                <div className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-[#1a1c23] to-[#111318] border border-gray-800 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(220,38,38,0.15)] transition-all rounded-xl p-6 flex flex-col items-center justify-center text-gray-200">
                    <div className="bg-black/40 border border-gray-800/50 p-4 rounded-xl mb-4 text-red-500 group-hover:scale-110 transition-transform duration-300">
                        <DynamicIcon name={iconName} size={36} strokeWidth={1.5} />
                    </div>
                    <h3 className="text-xl font-bold text-white tracking-wide">{title}</h3>
                    <div className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-500 font-medium tracking-wider uppercase">
                        <span>לכניסה</span>
                        <ChevronLeft size={12} className="-rotate-90" aria-hidden />
                    </div>
                </div>

                <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-[#111318] to-[#0a0c0f] border border-gray-800 rounded-xl p-5 flex flex-col shadow-2xl">
                    <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-3">
                        <h3 className="text-base font-bold text-white/90">{title}</h3>
                        <button
                            type="button"
                            className="text-gray-500 hover:text-red-500 transition-colors bg-gray-900/50 rounded-md p-1"
                            onClick={handleClose}
                            aria-label="סגור"
                        >
                            <Undo2 size={16} />
                        </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 flex-1 content-center">
                        {(subLinks || []).map((link, idx) => {
                            const LinkIcon = link.icon;
                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={handleLinkClick}
                                    className="flex items-center gap-1.5 text-right bg-white/5 hover:bg-red-500/10 hover:text-red-400 px-3 py-2 rounded-lg transition-all text-sm text-gray-300 group/btn whitespace-nowrap"
                                >
                                    <DynamicIcon name={link.icon} size={14} className="text-gray-500 group-hover/btn:text-red-400 shrink-0" />
                                    <span>{link.label}</span>
                                    {link.url ? (
                                        <a href={link.url} target="_blank" rel="noreferrer" className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
                                    ) : null}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
