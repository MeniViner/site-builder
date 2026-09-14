export const ADMIN_STALE_THRESHOLD_MS = Math.max(
    60_000,
    Number(import.meta.env.VITE_ADMIN_STALE_EDIT_THRESHOLD_MS) || 60 * 60 * 1000
);

export const STALE_ADMIN_EDIT_EVENT = 'site-builder:stale-admin-edit';
const STALE_ERROR_CODE = 'STALE_ADMIN_EDIT_SESSION';

let active = false;
let stale = false;
let lastActivityAt = Date.now();
let hiddenAt = null;

function emitStaleEvent() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(STALE_ADMIN_EDIT_EVENT));
}

function markStaleIfExpired(now = Date.now()) {
    if (!active || stale) return stale;
    const inactiveFor = now - lastActivityAt;
    const hiddenFor = hiddenAt === null ? 0 : now - hiddenAt;
    if (inactiveFor >= ADMIN_STALE_THRESHOLD_MS || hiddenFor >= ADMIN_STALE_THRESHOLD_MS) {
        stale = true;
        emitStaleEvent();
    }
    return stale;
}

export function beginAdminEditSession(now = Date.now()) {
    active = true;
    stale = false;
    lastActivityAt = now;
    hiddenAt = typeof document !== 'undefined' && document.hidden ? now : null;
}

export function endAdminEditSession() {
    active = false;
    hiddenAt = null;
}

export function recordAdminActivity(now = Date.now()) {
    if (!active || stale) return;
    if (markStaleIfExpired(now)) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    lastActivityAt = now;
}

export function recordAdminVisibility(hidden, now = Date.now()) {
    if (!active || stale) return;
    if (hidden) {
        hiddenAt = now;
        return;
    }
    markStaleIfExpired(now);
    hiddenAt = null;
    if (!stale) lastActivityAt = now;
}

export function isAdminEditSessionStale(now = Date.now()) {
    return markStaleIfExpired(now);
}

export function assertAdminEditSessionFresh() {
    if (!isAdminEditSessionStale()) return;
    const error = new Error('זוהה חוסר פעילות. כדי להמשיך בעריכה חייבים לרענן את הדף.');
    error.code = STALE_ERROR_CODE;
    emitStaleEvent();
    throw error;
}

export function isStaleAdminEditError(error) {
    return error?.code === STALE_ERROR_CODE;
}
