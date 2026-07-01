import React, { useState } from 'react';
import { X } from 'lucide-react';

export default function DismissibleNotice({
  children,
  className = '',
  contentClassName = '',
  dismissKey,
  onDismiss,
  role = 'status',
}) {
  const [dismissedKey, setDismissedKey] = useState(null);
  const currentDismissKey = dismissKey ?? '__default_notice__';

  if (dismissedKey === currentDismissKey) return null;

  const handleDismiss = () => {
    setDismissedKey(currentDismissKey);
    onDismiss?.();
  };

  return (
    <div className={className} role={role}>
      <div className={`flex items-start justify-between gap-3 ${contentClassName}`}>
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-current opacity-65 transition-[opacity,transform] hover:bg-black/5 hover:opacity-100 active:scale-[0.96] dark:hover:bg-white/10"
          aria-label="סגור הודעה"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
