import React, { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Vote } from 'lucide-react';
import WidgetEmptyState from './WidgetEmptyState';
import { useRotatingWidgetItems } from '../../utils/widgetDisplay';

export default function WidgetPolls({ data = [], settings = {} }) {
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState(null);

  const activePoll = useMemo(() => data.find((item) => item.active === true), [data]);
  const options = activePoll?.options || [];
  const { visibleItems, page, totalPages } = useRotatingWidgetItems(options, settings, 5000);

  if (!activePoll) {
    return <WidgetEmptyState icon={Vote} title="אין סקר פעיל כרגע" description="כאשר יופעל סקר יחידתי חדש, הוא יוצג כאן להצבעה מהירה." />;
  }

  const totalVotes = options.reduce((sum, option) => sum + (option.votes || 0), 0) || 1;

  const handleVote = (optionId) => {
    setSelectedOptionId(optionId);
    setHasVoted(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="bg-themeBg-card text-themeText-primary border-themeBorder rounded-[24px] border border-gray-200 bg-white p-5 shadow-[0_18px_45px_-30px_rgba(15,23,42,0.55)] dark:border-white/10 dark:bg-[#232733]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
            {hasVoted ? <BarChart3 size={22} /> : <Vote size={22} />}
          </div>
          <div>
            <div className="text-xs font-black uppercase tracking-[0.24em] text-primary/80">
              {hasVoted ? 'תוצאות הסקר' : 'סקר יחידתי'}
            </div>
            <h3 className="mt-2 text-lg font-black leading-7 text-themeText-primary text-gray-900 dark:text-white">
              {activePoll.question}
            </h3>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 custom-scrollbar">
        <div className="space-y-3">
          {!hasVoted ? (
            visibleItems.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => handleVote(option.id)}
                className="bg-themeBg-card hover:bg-themeBg-elevated text-themeText-primary border-themeBorder w-full rounded-[20px] border border-gray-200 bg-white px-4 py-4 text-right transition hover:bg-gray-50 hover:border-primary/20 dark:border-white/10 dark:bg-[#232733] dark:hover:bg-[#2a2e38]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-themeText-primary text-gray-900 dark:text-white">
                    {option.text}
                  </span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                    הצבע
                  </span>
                </div>
              </button>
            ))
          ) : (
            visibleItems.map((option) => {
              const percentage = Math.round(((option.votes || 0) / totalVotes) * 100);
              const isSelected = selectedOptionId === option.id;

              return (
                <div
                  key={option.id}
                  className="bg-themeBg-card border-themeBorder rounded-[20px] border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#232733]"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {isSelected && <CheckCircle2 size={16} className="text-primary" />}
                      <span className="text-sm font-bold text-themeText-primary text-gray-900 dark:text-white">
                        {option.text}
                      </span>
                    </div>
                    <span className="text-xs font-black text-primary">{percentage}%</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-primary/10">
                    <div
                      className="h-full rounded-full bg-primary/20"
                      style={{ width: `${Math.max(percentage, 8)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: totalPages }).map((_, index) => (
            <span
              key={index}
              className={`transition-all ${index === page ? 'h-2.5 w-7 rounded-full bg-primary shadow-[0_0_16px_hsl(var(--color-primary)/0.35)]' : 'h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-white/15'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
