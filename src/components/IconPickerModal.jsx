import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, Check, RotateCcw } from 'lucide-react';
import { DynamicIcon } from './DynamicIcon';
import Tooltip from './Tooltip';
import { ICON_CATEGORIES } from '../utils/iconsData';
import { getIconHebrewLabel, getIconSearchHaystack } from '../utils/iconSearchHe';

export default function IconPickerModal({ isOpen, onClose, onSelect, currentIcon, defaultSearchTerm = '' }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const searchEditedRef = useRef(false);

    const resetFilters = () => {
        searchEditedRef.current = true;
        setSearchTerm('');
        setActiveCategory('all');
    };

    useEffect(() => {
        if (!isOpen) {
            searchEditedRef.current = false;
            return;
        }
        if (searchEditedRef.current) return;
        setSearchTerm(typeof defaultSearchTerm === 'string' ? defaultSearchTerm.trim() : '');
    }, [defaultSearchTerm, isOpen]);

    const filteredIcons = useMemo(() => {
        let result = [];
        if (activeCategory === 'all') {
            result = ICON_CATEGORIES.flatMap(cat => cat.icons);
        } else {
            const category = ICON_CATEGORIES.find(cat => cat.id === activeCategory);
            result = category ? category.icons : [];
        }

        if (searchTerm) {
            const needle = searchTerm.trim().toLowerCase();
            result = result.filter((iconName) => {
                // Match English name or Hebrew keywords/label
                if (iconName.toLowerCase().includes(needle)) return true;
                return getIconSearchHaystack(iconName).includes(needle);
            });
        }

        // Remove duplicates if any
        return [...new Set(result)];
    }, [searchTerm, activeCategory]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" dir="rtl">
            <div
                className="bg-white dark:bg-[#12141a] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-white/10 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1a1d24]">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">בחירת סמל (אייקון)</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-gray-500 hover:bg-gray-200 dark:hover:bg-white/10 dark:text-gray-400 transition"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Search & Filters */}
                <div className="p-4 border-b border-gray-200 dark:border-white/10 space-y-4" >
                    <div className="relative" >
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="חפש אייקון בעברית או באנגלית (למשל: בית / Home, תיקייה / Folder, משתמש / User)..."
                            value={searchTerm}
                            onChange={(e) => {
                                searchEditedRef.current = true;
                                setSearchTerm(e.target.value);
                            }}
                            className="w-full bg-gray-100 dark:bg-[#1e212b] border border-transparent focus:border-primary focus:bg-white dark:focus:bg-[#12141a] rounded-xl pl-4 pr-10 py-3 text-gray-900 dark:text-white transition outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setActiveCategory('all')}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${activeCategory === 'all' ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-gray-100 dark:bg-[#1e212b] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                        >
                            הכל
                        </button>
                        {ICON_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setActiveCategory(cat.id)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${activeCategory === cat.id ? 'bg-primary text-white shadow-md shadow-primary/30' : 'bg-gray-100 dark:bg-[#1e212b] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10'}`}
                            >
                                {cat.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={resetFilters}
                            className="mr-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition"
                        >
                            <RotateCcw size={14} />
                            אפס פילטרים
                        </button>
                    </div>
                </div>

                {/* Icon Grid */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50 dark:bg-[#0f1115] custom-scrollbar">
                    {filteredIcons.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 py-12">
                            <Search size={48} className="mb-4 opacity-20" />
                            <p className="text-lg">לא נמצאו אייקונים התואמים לחיפוש שלך.</p>
                            <button
                                type="button"
                                onClick={resetFilters}
                                className="mt-5 inline-flex items-center gap-2 rounded-xl border border-primary/40 bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-primary/25 hover:opacity-90 transition"
                            >
                                <RotateCcw size={16} />
                                אפס פילטרים והצג הכל
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                            {filteredIcons.map(iconName => {
                                const isSelected = currentIcon === iconName;
                                const heLabel = getIconHebrewLabel(iconName);
                                const tooltipText = heLabel ? `${heLabel} · ${iconName}` : iconName;
                                return (
                                    <Tooltip key={iconName} text={tooltipText}>
                                        <button
                                            onClick={() => {
                                                onSelect(iconName);
                                                onClose();
                                            }}
                                            className={[
                                                'relative flex flex-col items-center justify-center gap-2 p-3 rounded-xl transition group',
                                                'aspect-square w-full',
                                                'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 dark:focus-visible:ring-offset-[#0f1115]',
                                                isSelected
                                                    ? 'bg-primary/10 border-2 border-primary shadow-md shadow-primary/10'
                                                    : 'bg-white dark:bg-[#1a1d24] border border-gray-200 dark:border-white/5 hover:border-primary/50 hover:shadow-md',
                                            ].join(' ')}
                                        >
                                            <DynamicIcon
                                                name={iconName}
                                                size={28}
                                                className={isSelected ? 'text-primary' : 'text-gray-600 dark:text-gray-300 group-hover:text-primary transition-colors'}
                                            />
                                            <span className={`text-[10px] sm:text-xs truncate w-full text-center leading-tight ${isSelected ? 'font-bold text-primary' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {heLabel || iconName}
                                            </span>
                                            {isSelected && (
                                                <div className="absolute top-1 right-1 bg-primary text-white rounded-full p-0.5 shadow-sm">
                                                    <Check size={12} strokeWidth={3} />
                                                </div>
                                            )}
                                        </button>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
