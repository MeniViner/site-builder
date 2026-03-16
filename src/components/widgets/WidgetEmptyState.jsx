import React from 'react';

export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function WidgetEmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="w-full rounded-[24px] border border-gray-200/80 bg-gradient-to-br from-white via-white to-gray-100/80 p-6 text-center shadow-[0_18px_45px_-28px_rgba(15,23,42,0.5)] dark:border-white/10 dark:from-white/5 dark:via-white/[0.04] dark:to-white/[0.02]">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_0_24px_hsl(var(--color-primary)/0.18)]">
          <Icon size={28} strokeWidth={1.8} />
        </div>
        <div className="text-base font-black text-gray-900 dark:text-white">{title}</div>
        <div className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{description}</div>
      </div>
    </div>
  );
}
