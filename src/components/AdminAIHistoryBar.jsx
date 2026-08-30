import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, History, RotateCcw, Sparkles, X } from 'lucide-react';

export default function AdminAIHistoryBar({
  pageTitle,
  history,
  busy = false,
  onPrevious,
  onNext,
  onReset,
  onSelect,
}) {
  const [dismissedKey, setDismissedKey] = useState('');
  if (!history || !Array.isArray(history.entries) || history.entries.length <= 1) return null;

  const lastEntry = history.entries[history.entries.length - 1];
  const historyKey = `${history.entries.length}:${lastEntry?.createdAt || ''}`;
  if (dismissedKey === historyKey) return null;

  const index = Math.max(0, Math.min(history.index || 0, history.entries.length - 1));
  const current = history.entries[index];
  const resultCount = history.entries.length - 1;
  const displayPosition = index === 0 ? 'לפני AI' : `תוצאה ${index} מתוך ${resultCount}`;

  return (
    <div
      dir="rtl"
      className="fixed bottom-20 left-4 z-[11920] w-[min(540px,calc(100vw-2rem))] rounded-2xl border border-primary/25 bg-white/95 p-3 shadow-2xl backdrop-blur-xl dark:border-white/15 dark:bg-[#15171d]/95"
      data-admin-ai-history
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <History size={17} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-black text-gray-900 dark:text-white">
              <Sparkles size={12} className="text-primary" />
              שינויי AI — {pageTitle}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
              {displayPosition}{current?.label && index > 0 ? ` · ${current.label}` : ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onReset}
            disabled={busy || index === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2.5 text-xs font-bold text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            title="חזור למצב שהיה לפני השינוי הראשון של AI"
          >
            <RotateCcw size={13} />
            לפני AI
          </button>

          <button
            type="button"
            onClick={onPrevious}
            disabled={busy || index <= 0}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            aria-label="תוצאה קודמת"
            title="תוצאה קודמת"
          >
            <ChevronRight size={16} />
          </button>

          <select
            value={index}
            disabled={busy}
            onChange={(event) => onSelect?.(Number(event.target.value))}
            className="h-9 max-w-[150px] rounded-xl border border-gray-200 bg-white px-2 text-xs font-bold text-gray-700 outline-none transition focus:border-primary/50 dark:border-white/10 dark:bg-[#20232b] dark:text-gray-200"
            aria-label="בחירת גרסת AI"
          >
            {history.entries.map((entry, entryIndex) => (
              <option key={`${entryIndex}-${entry?.createdAt || ''}`} value={entryIndex}>
                {entryIndex === 0 ? 'לפני AI' : `תוצאה ${entryIndex}`}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onNext}
            disabled={busy || index >= history.entries.length - 1}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            aria-label="תוצאה הבאה"
            title="תוצאה הבאה"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setDismissedKey(historyKey)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-gray-200"
            aria-label="הסתר את סרגל שינויי AI"
            title="הסתר את סרגל שינויי AI"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
