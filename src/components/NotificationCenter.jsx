import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bell, X } from 'lucide-react';
import {
    filterNotificationsForUser,
    getNotificationDismissalStorageKey,
} from '../utils/notificationData';
import SmartTextRenderer from './SmartTextRenderer';

function readDismissed(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
        return new Set();
    }
}

function NotificationCard({ item, onClose, remaining }) {
    return (
        <div dir="rtl" className="relative w-full rounded-[28px] border border-theme-subtle bg-theme-card p-6 text-right text-theme shadow-2xl">
            <button type="button" onClick={onClose} aria-label="סגירת התראה" className="absolute left-4 top-4 rounded-xl p-2 text-theme-muted hover:bg-theme-card-hover hover:text-theme">
                <X size={18} />
            </button>
            <div className="flex items-center gap-2">
                <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl ${item.isUrgent ? 'bg-red-500/15 text-red-500' : 'bg-primary/10 text-primary'}`}>
                    {item.isUrgent ? <AlertTriangle size={20} /> : <Bell size={20} />}
                </span>
                <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-theme-muted">{item.source === 'boom-assignment' ? 'BOOM' : 'התראה'}</div>
                    <h2 className="text-xl font-black">{item.title || 'התראה'}</h2>
                </div>
            </div>
            <SmartTextRenderer text={item.text} richText={item.richContent} className="mt-5 block whitespace-pre-wrap text-sm leading-7" />
            {remaining > 1 && <div className="mt-5 text-xs font-black text-theme-muted">{remaining} התראות ממתינות</div>}
        </div>
    );
}

export default function NotificationCenter({ items, currentUser, autoOpen = true }) {
    const siteIdentity = typeof window === 'undefined'
        ? 'server'
        : `${window.location.origin}${window.location.pathname}`;
    const storageKey = useMemo(
        () => getNotificationDismissalStorageKey(siteIdentity, currentUser),
        [currentUser, siteIdentity]
    );
    const notifications = useMemo(
        () => filterNotificationsForUser(items, currentUser),
        [currentUser, items]
    );
    const [panelOpen, setPanelOpen] = useState(false);
    const [selected, setSelected] = useState(null);
    const [dismissed, setDismissed] = useState(() => readDismissed(storageKey));

    useEffect(() => {
        setDismissed(readDismissed(storageKey));
    }, [storageKey]);

    const pendingPopups = notifications.filter((item) => item.popupActive && !dismissed.has(item.id));
    const popup = autoOpen ? pendingPopups[0] : null;

    const dismissPopup = () => {
        if (!popup) return;
        const next = new Set(dismissed);
        next.add(popup.id);
        setDismissed(next);
        try {
            localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
            // Dismissal remains effective for this page load when local storage is unavailable.
        }
    };

    return (
        <>
            <div dir="rtl" className="fixed left-5 top-24 z-[80]">
                <button
                    type="button"
                    onClick={() => setPanelOpen((current) => !current)}
                    aria-label="מרכז ההתראות"
                    className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-theme-subtle bg-theme-card text-primary shadow-xl transition hover:-translate-y-0.5"
                >
                    <Bell size={21} />
                    {notifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 min-w-6 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-black text-white">
                            {Math.min(99, notifications.length)}
                        </span>
                    )}
                </button>
                {panelOpen && (
                    <div className="absolute left-0 mt-3 w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-3xl border border-theme-subtle bg-theme-card text-theme shadow-2xl">
                        <div className="border-b border-theme-subtle px-5 py-4">
                            <h2 className="font-black">מרכז ההתראות</h2>
                            <p className="text-xs text-theme-muted">הודעות ועדכונים אחרונים</p>
                        </div>
                        <div className="max-h-[55vh] overflow-y-auto p-3">
                            {notifications.length === 0 ? (
                                <div className="p-6 text-center text-sm text-theme-muted">אין התראות להצגה.</div>
                            ) : notifications.map((item) => (
                                <button
                                    type="button"
                                    key={item.id}
                                    onClick={() => {
                                        setSelected(item);
                                        setPanelOpen(false);
                                    }}
                                    className="mb-2 block w-full rounded-2xl border border-theme-subtle p-3 text-right transition hover:bg-theme-card-hover"
                                >
                                    <div className="flex items-center gap-2">
                                        {item.isUrgent && <AlertTriangle size={14} className="text-red-500" />}
                                        <span className="truncate text-sm font-black">{item.title || 'התראה'}</span>
                                    </div>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-theme-muted">{item.text}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {selected && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl">
                        <NotificationCard item={selected} onClose={() => setSelected(null)} remaining={1} />
                    </div>
                </div>
            )}

            {popup && !selected && (
                <div className="fixed inset-0 z-[105] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                    <div className="relative w-full max-w-xl">
                        {pendingPopups.length > 2 && <div className="absolute inset-x-8 -top-4 h-full rounded-[28px] border border-theme-subtle bg-theme-card/55" />}
                        {pendingPopups.length > 1 && <div className="absolute inset-x-4 -top-2 h-full rounded-[28px] border border-theme-subtle bg-theme-card/80" />}
                        <NotificationCard item={popup} onClose={dismissPopup} remaining={pendingPopups.length} />
                    </div>
                </div>
            )}
        </>
    );
}
