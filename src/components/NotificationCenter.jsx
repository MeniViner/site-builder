import React, { useEffect, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import {
    filterNotificationsForUser,
    getNotificationDismissalStorageKey,
} from '../utils/notificationData';
import NotificationPopupCard from './NotificationPopupCard';

function readDismissed(key) {
    try {
        const parsed = JSON.parse(localStorage.getItem(key) || '[]');
        return new Set(Array.isArray(parsed) ? parsed.map(String) : []);
    } catch {
        return new Set();
    }
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

    const unreadNotifications = notifications.filter((item) => !dismissed.has(item.id));
    const pendingPopups = unreadNotifications.filter((item) => item.popupActive);
    const popup = autoOpen ? pendingPopups[0] : null;

    const markAsRead = (notificationId) => {
        if (!notificationId) return;
        const next = new Set(dismissed);
        next.add(notificationId);
        setDismissed(next);
        try {
            localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
            // Dismissal remains effective for this page load when local storage is unavailable.
        }
    };

    const dismissPopup = () => markAsRead(popup?.id);

    const closeSelected = () => {
        markAsRead(selected?.id);
        setSelected(null);
    };

    return (
        <>
            <div dir="rtl" className="fixed left-5 top-24 z-[80]">
                <button
                    type="button"
                    onClick={() => setPanelOpen((current) => !current)}
                    aria-label="מרכז ההתראות"
                    className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-theme-card text-primary shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_12px_35px_-14px_rgba(15,23,42,0.5)] transition-transform hover:-translate-y-0.5 active:scale-[0.96] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_12px_35px_-14px_rgba(0,0,0,0.8)]"
                >
                    <Bell size={21} />
                    {unreadNotifications.length > 0 && (
                        <span className="absolute -right-2 -top-2 min-w-6 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-black tabular-nums text-white">
                            {Math.min(99, unreadNotifications.length)}
                        </span>
                    )}
                </button>
                {panelOpen && (
                    <div className="absolute left-0 mt-3 w-[min(360px,calc(100vw-2.5rem))] overflow-hidden rounded-3xl border border-theme-subtle bg-theme-card text-theme shadow-2xl">
                        <div className="border-b border-theme-subtle px-5 py-4">
                            <h2 className="font-black">מרכז ההתראות</h2>
                            <p className="text-xs text-theme-muted">
                                {unreadNotifications.length > 0
                                    ? `${unreadNotifications.length} התראות שלא נקראו`
                                    : 'כל ההתראות נקראו'}
                            </p>
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
                                        {!dismissed.has(item.id) && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="לא נקראה" />}
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
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-xl">
                        <NotificationPopupCard item={selected} onClose={closeSelected} remaining={1} />
                    </div>
                </div>
            )}

            {popup && !selected && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
                    <div className="relative w-full max-w-xl">
                        {pendingPopups.length > 2 && <div className="absolute inset-x-8 -top-4 h-full rounded-[28px] border border-theme-subtle bg-theme-card/55" />}
                        {pendingPopups.length > 1 && <div className="absolute inset-x-4 -top-2 h-full rounded-[28px] border border-theme-subtle bg-theme-card/80" />}
                        <NotificationPopupCard item={popup} onClose={dismissPopup} remaining={pendingPopups.length} />
                    </div>
                </div>
            )}
        </>
    );
}
