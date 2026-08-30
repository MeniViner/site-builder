import React from 'react';

export function AdminAddonTabs({ tabs, activeTab, onChange, ariaLabel }) {
    return (
        <nav className="flex w-full items-center gap-2 overflow-x-auto p-1 custom-scrollbar" role="tablist" aria-label={ariaLabel}>
            {tabs.map((tab) => {
                const selected = activeTab === tab.id;
                const Icon = tab.icon;
                return (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        onClick={() => onChange(tab.id)}
                        className={`inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-bold transition-[background-color,color,box-shadow,transform] active:scale-[0.96] ${
                            selected
                                ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                : 'border border-gray-200 bg-white text-gray-600 shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-transparent dark:bg-white/5 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                        }`}
                    >
                        {Icon && <Icon size={16} />}
                        {tab.label}
                    </button>
                );
            })}
        </nav>
    );
}

export function AdminAddonToggle({ checked, onChange, label, ariaLabel, className = '' }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel || label}
            onClick={() => onChange(!checked)}
            className={`inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm transition-[border-color,background-color,transform] hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:border-white/10 dark:bg-white/5 dark:text-gray-200 ${className}`}
        >
            <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/20'}`}>
                <span className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? '-translate-x-5' : '-translate-x-1'}`} />
            </span>
            {label && <span>{label}</span>}
        </button>
    );
}
