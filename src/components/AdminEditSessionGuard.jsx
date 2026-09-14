import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import {
    ADMIN_STALE_THRESHOLD_MS,
    STALE_ADMIN_EDIT_EVENT,
    beginAdminEditSession,
    endAdminEditSession,
    isAdminEditSessionStale,
    recordAdminActivity,
    recordAdminVisibility,
} from '../utils/adminEditSession';

export default function AdminEditSessionGuard() {
    const [stale, setStale] = useState(false);

    useEffect(() => {
        beginAdminEditSession();
        const onMutationInteraction = (event) => {
            recordAdminActivity();
            if (!isAdminEditSessionStale()) return;
            event.preventDefault();
            event.stopPropagation();
            setStale(true);
        };
        const onScroll = () => recordAdminActivity();
        const onVisibility = () => {
            recordAdminVisibility(document.hidden);
            setStale(isAdminEditSessionStale());
        };
        const onStale = () => setStale(true);
        const mutationEvents = ['pointerdown', 'click', 'keydown'];
        mutationEvents.forEach((eventName) => window.addEventListener(eventName, onMutationInteraction, true));
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        window.addEventListener(STALE_ADMIN_EDIT_EVENT, onStale);
        const timer = window.setInterval(() => {
            if (isAdminEditSessionStale()) setStale(true);
        }, Math.min(60_000, ADMIN_STALE_THRESHOLD_MS));

        return () => {
            window.clearInterval(timer);
            mutationEvents.forEach((eventName) => window.removeEventListener(eventName, onMutationInteraction, true));
            window.removeEventListener('scroll', onScroll);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onVisibility);
            window.removeEventListener(STALE_ADMIN_EDIT_EVENT, onStale);
            endAdminEditSession();
        };
    }, []);

    if (!stale) return null;
    return (
        <div dir="rtl" className="fixed inset-0 z-[300] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md">
            <div role="alertdialog" aria-modal="true" className="w-full max-w-lg rounded-[30px] border border-amber-300/40 bg-white p-7 text-right shadow-2xl dark:bg-[#1b1f2a]">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-gray-900 dark:text-white">נדרשת טעינה מחדש</h2>
                        <p className="mt-2 leading-7 text-gray-600 dark:text-gray-300">זוהה חוסר פעילות. כדי להמשיך בעריכה חייבים לרענן את הדף.</p>
                    </div>
                </div>
                <button type="button" onClick={() => window.location.reload()} className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-black text-white">
                    <RefreshCw size={18} />רענן עכשיו
                </button>
            </div>
        </div>
    );
}
