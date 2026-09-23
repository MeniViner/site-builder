import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
    ADMIN_STALE_THRESHOLD_MS,
    STALE_ADMIN_EDIT_EVENT,
    STALE_INACTIVITY_BODY,
    staleInactivityTitle,
    beginAdminEditSession,
    endAdminEditSession,
    getAdminRecoveryState,
    isAdminRecoveryActionTarget,
    isAdminEditSessionStale,
    prepareAdminSafeReload,
    recordAdminActivity,
    recordAdminVisibility,
    shouldWarnBeforeAdminUnload,
} from '../utils/adminEditSession';

export default function AdminEditSessionGuard({ reloadPage = () => window.location.reload() }) {
    const [stale, setStale] = useState(false);
    const [reloading, setReloading] = useState(false);
    const [reloadError, setReloadError] = useState('');
    const [localOnlyApproval, setLocalOnlyApproval] = useState(false);
    const refreshRef = useRef(null);

    // The dialog is blocking on purpose: stale state must not be edited behind
    // it. It is dismissed only by the visible Refresh button, so Escape is
    // swallowed and focus is kept on that button rather than escaping into the
    // stale page behind. This is presentation only; it does not touch the
    // safe-reload contract below.
    useEffect(() => {
        if (!stale) return undefined;
        refreshRef.current?.focus();
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.key === 'Tab') {
                event.preventDefault();
                refreshRef.current?.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [stale]);

    useEffect(() => {
        beginAdminEditSession();
        const onMutationInteraction = (event) => {
            recordAdminActivity();
            if (!isAdminEditSessionStale()) return;
            if (isAdminRecoveryActionTarget(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();
            setStale(true);
        };
        const onScroll = () => recordAdminActivity();
        const onVisibility = () => {
            recordAdminVisibility(document.hidden);
            setStale(isAdminEditSessionStale());
        };
        const onStale = () => setStale(true);
        const onBeforeUnload = (event) => {
            if (!shouldWarnBeforeAdminUnload()) return;
            event.preventDefault();
            event.returnValue = '';
        };
        const mutationEvents = ['pointerdown', 'click', 'keydown'];
        mutationEvents.forEach((eventName) => window.addEventListener(eventName, onMutationInteraction, true));
        window.addEventListener('scroll', onScroll, { passive: true });
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onVisibility);
        window.addEventListener(STALE_ADMIN_EDIT_EVENT, onStale);
        window.addEventListener('beforeunload', onBeforeUnload);
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
            window.removeEventListener('beforeunload', onBeforeUnload);
            endAdminEditSession();
        };
    }, []);

    const handleSafeReload = async () => {
        if (reloading) return;
        setReloading(true);
        setReloadError('');
        try {
            const result = await prepareAdminSafeReload({ allowLocalOnly: localOnlyApproval });
            if (result.requiresLocalOnlyApproval) {
                setReloadError('השמירה בשרת לא הושלמה. הטיוטה נשמרה מקומית בלבד; אפשר לנסות שוב או לאשר רענון מהטיוטה המקומית.');
                setLocalOnlyApproval(true);
                setReloading(false);
                return;
            }
            reloadPage();
        } catch (error) {
            setReloadError(error?.message || 'לא ניתן לאבטח את השינויים לפני הרענון.');
            setReloading(false);
        }
    };

    if (!stale) return null;
    const title = staleInactivityTitle(ADMIN_STALE_THRESHOLD_MS);
    return (
        <div
            dir="rtl"
            // A light, translucent backdrop: the operator should still recognise
            // the application behind the dialog. This is not a failure state.
            className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[2px]"
            // Blocking: clicking the backdrop must not dismiss or reach the page.
            onMouseDown={(event) => event.preventDefault()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="admin-stale-title"
                aria-describedby="admin-stale-body"
                className="w-full max-w-lg rounded-[30px] border border-gray-200/70 bg-white p-7 text-right shadow-xl dark:border-white/10 dark:bg-[#1b1f2a]"
            >
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <RefreshCw size={24} />
                    </div>
                    <div>
                        <h2 id="admin-stale-title" className="text-xl font-black text-gray-900 dark:text-white">{title}</h2>
                        <p id="admin-stale-body" className="mt-2 leading-7 text-gray-600 dark:text-gray-300">{STALE_INACTIVITY_BODY}</p>
                        {/* Red is reserved for an actual failure, never for the idle notice itself. */}
                        {reloadError && <p role="alert" className="mt-2 text-sm font-bold text-red-600">{reloadError}</p>}
                    </div>
                </div>
                <button
                    ref={refreshRef}
                    type="button"
                    data-admin-recovery-control="true"
                    onClick={handleSafeReload}
                    disabled={reloading || getAdminRecoveryState().reloadApproved}
                    className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-black text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60"
                >
                    <RefreshCw size={18} className={reloading ? 'animate-spin' : ''} />
                    {localOnlyApproval ? 'רענון עם טיוטה מקומית' : 'ריענון'}
                </button>
            </div>
        </div>
    );
}
