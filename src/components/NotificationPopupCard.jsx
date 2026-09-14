import React from 'react';
import { Bell, X } from 'lucide-react';
import SmartTextRenderer from './SmartTextRenderer';

export default function NotificationPopupCard({
    item,
    onClose,
    remaining = 1,
    preview = false,
}) {
    const requiresAcknowledgement = item?.requiresAcknowledgement === true;
    const hasCta = Boolean(item?.ctaLabel && item?.ctaUrl);

    return (
        <div
            dir="rtl"
            className="relative w-full rounded-[28px] bg-theme-card p-6 text-right text-theme shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_24px_70px_-24px_rgba(15,23,42,0.45)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_24px_70px_-24px_rgba(0,0,0,0.75)]"
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="סגירת התראה"
                disabled={requiresAcknowledgement && !preview}
                title={requiresAcknowledgement && !preview ? 'יש לאשר קריאה לפני סגירת ההתראה' : undefined}
                className="absolute left-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-theme-muted transition-[background-color,color,opacity,transform] hover:bg-theme-card-hover hover:text-theme active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-35"
            >
                <X size={18} />
            </button>

            <div className="flex items-center gap-3 pl-12">
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Bell size={21} />
                </span>
                <div className="min-w-0">
                    <div className="text-[11px] font-black uppercase tracking-[0.16em] text-theme-muted">
                        {item?.source === 'boom-assignment' ? 'BOOM' : 'התראה חדשה'}
                    </div>
                    <h2 className="mt-0.5 text-balance text-xl font-black">
                        {item?.title || (preview ? 'כותרת ההתראה' : 'התראה')}
                    </h2>
                </div>
            </div>

            <SmartTextRenderer
                text={item?.text}
                richText={item?.richContent}
                className="mt-5 block whitespace-pre-wrap text-pretty text-sm leading-7"
                fallback={preview ? 'התוכן שתקלידו יוצג כאן בדיוק כפי שהמשתמש יראה אותו.' : ''}
            />

            {(requiresAcknowledgement || hasCta) && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-theme-subtle pt-4">
                    <div className="flex flex-wrap items-center gap-2">
                    {requiresAcknowledgement && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"
                        >
                            קראתי ואישרתי
                        </button>
                    )}
                    {hasCta && (
                        <a
                            href={item.ctaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-black text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]"
                        >
                            {item.ctaLabel}
                        </a>
                    )}
                    </div>
                    {requiresAcknowledgement && (
                        <span className="text-xs font-bold text-theme-muted">לא ניתן לסגור ללא אישור</span>
                    )}
                </div>
            )}

            {remaining > 1 && (
                <div className="mt-5 flex items-center justify-between border-t border-theme-subtle pt-4 text-xs font-bold text-theme-muted">
                    <span>התראות נוספות ממתינות</span>
                    <span className="tabular-nums rounded-full bg-primary/10 px-2.5 py-1 font-black text-primary">{remaining}</span>
                </div>
            )}
        </div>
    );
}
