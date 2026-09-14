import React from 'react';
import { Bell, X } from 'lucide-react';
import SmartTextRenderer from './SmartTextRenderer';

export default function NotificationPopupCard({
    item,
    onClose,
    remaining = 1,
    preview = false,
}) {
    return (
        <div
            dir="rtl"
            className="relative w-full rounded-[28px] bg-theme-card p-6 text-right text-theme shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_24px_70px_-24px_rgba(15,23,42,0.45)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_24px_70px_-24px_rgba(0,0,0,0.75)]"
        >
            <button
                type="button"
                onClick={onClose}
                aria-label="סגירת התראה"
                className="absolute left-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-xl text-theme-muted transition-[background-color,color,transform] hover:bg-theme-card-hover hover:text-theme active:scale-[0.96]"
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

            {remaining > 1 && (
                <div className="mt-5 flex items-center justify-between border-t border-theme-subtle pt-4 text-xs font-bold text-theme-muted">
                    <span>התראות נוספות ממתינות</span>
                    <span className="tabular-nums rounded-full bg-primary/10 px-2.5 py-1 font-black text-primary">{remaining}</span>
                </div>
            )}
        </div>
    );
}
