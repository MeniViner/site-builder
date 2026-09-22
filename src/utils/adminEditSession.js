export const ADMIN_STALE_THRESHOLD_MS = Math.max(
    60_000,
    Number(import.meta.env.VITE_ADMIN_STALE_EDIT_THRESHOLD_MS) || 60 * 60 * 1000
);

export const STALE_ADMIN_EDIT_EVENT = 'site-builder:stale-admin-edit';
export const ADMIN_RECOVERY_STATE_EVENT = 'site-builder:admin-recovery-state';
export const ADMIN_RECOVERY_DRAFT_STORAGE_KEY = 'siteBuilder.adminRecoveryDraft.v1';

const STALE_ERROR_CODE = 'STALE_ADMIN_EDIT_SESSION';
const FROZEN_ERROR_CODE = 'ADMIN_EDITS_FROZEN';
const participants = new Map();
const persistenceControllers = new Map();

let active = false;
let initialized = false;
let stale = false;
let frozen = false;
let reloadApproved = false;
let exclusiveOperation = null;
let lastActivityAt = Date.now();
let hiddenAt = null;

function emit(name) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(name));
}

function emitState() {
    emit(ADMIN_RECOVERY_STATE_EVENT);
}

function emitStaleEvent() {
    emit(STALE_ADMIN_EDIT_EVENT);
}

function markStaleIfExpired(now = Date.now()) {
    if (!active || stale) return stale;
    const inactiveFor = now - lastActivityAt;
    const hiddenFor = hiddenAt === null ? 0 : now - hiddenAt;
    if (inactiveFor >= ADMIN_STALE_THRESHOLD_MS || hiddenFor >= ADMIN_STALE_THRESHOLD_MS) {
        stale = true;
        emitStaleEvent();
        emitState();
    }
    return stale;
}

function safeParticipantDirty(participant) {
    return participant?.isDirty?.() === true;
}

function safePersistenceState(controller) {
    const state = controller?.getState?.();
    return state && typeof state === 'object' ? state : {};
}

function writeRecoveryDraft() {
    const captured = {};

    participants.forEach((participant, id) => {
        if (!safeParticipantDirty(participant) || typeof participant.captureDraft !== 'function') return;
        const draft = participant.captureDraft();
        if (draft !== undefined) captured[id] = draft;
    });
    persistenceControllers.forEach((controller, id) => {
        const state = safePersistenceState(controller);
        if (!state.dirty || typeof controller.captureDraft !== 'function') return;
        const draft = controller.captureDraft();
        if (draft !== undefined) captured[`persistence:${id}`] = draft;
    });

    if (Object.keys(captured).length === 0) {
        try {
            sessionStorage.removeItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY);
        } catch {
            // No draft needs to be persisted.
        }
        return { verified: false, participants: captured };
    }

    const envelope = {
        version: 1,
        capturedAt: new Date().toISOString(),
        participants: captured,
    };
    try {
        const serialized = JSON.stringify(envelope);
        sessionStorage.setItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY, serialized);
        const verified = sessionStorage.getItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY) === serialized;
        return { verified, participants: captured };
    } catch {
        return { verified: false, participants: captured };
    }
}

export function beginAdminEditSession(now = Date.now()) {
    active = true;
    if (!initialized) {
        initialized = true;
        stale = false;
        lastActivityAt = now;
    }
    hiddenAt = typeof document !== 'undefined' && document.hidden ? now : null;
    emitState();
}

export function endAdminEditSession() {
    active = false;
    hiddenAt = null;
    emitState();
}

export function completeAdminRecoveryRevalidation(now = Date.now()) {
    stale = false;
    frozen = false;
    reloadApproved = false;
    exclusiveOperation = null;
    initialized = true;
    lastActivityAt = now;
    hiddenAt = typeof document !== 'undefined' && document.hidden ? now : null;
    emitState();
}

export function recordAdminActivity(now = Date.now()) {
    if (!active || stale || frozen) return;
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
    if (!stale && !frozen) lastActivityAt = now;
}

export function isAdminEditSessionStale(now = Date.now()) {
    return markStaleIfExpired(now);
}

export function assertAdminEditSessionFresh({ allowFrozen = false, allowStale = false } = {}) {
    if (frozen && !allowFrozen) {
        const error = new Error('העריכה מוקפאת עד לסיום השחזור או הרענון הבטוח.');
        error.code = FROZEN_ERROR_CODE;
        throw error;
    }
    if (allowStale || !isAdminEditSessionStale()) return;
    const error = new Error('זוהה חוסר פעילות. כדי להמשיך בעריכה חייבים לרענן את הדף.');
    error.code = STALE_ERROR_CODE;
    emitStaleEvent();
    throw error;
}

export function isStaleAdminEditError(error) {
    return error?.code === STALE_ERROR_CODE || error?.code === FROZEN_ERROR_CODE;
}

export function registerAdminRecoveryParticipant(participant) {
    const id = String(participant?.id || '').trim();
    if (!id) throw new Error('Recovery participant requires a stable id.');
    participants.set(id, participant);
    emitState();
    return () => {
        if (participants.get(id) === participant) participants.delete(id);
        emitState();
    };
}

export function registerAdminPersistenceController(controller) {
    const id = String(controller?.id || '').trim();
    if (!id) throw new Error('Persistence controller requires a stable id.');
    persistenceControllers.set(id, controller);
    emitState();
    return () => {
        if (persistenceControllers.get(id) === controller) persistenceControllers.delete(id);
        emitState();
    };
}

export function getAdminRecoveryState() {
    return {
        active,
        stale: isAdminEditSessionStale(),
        frozen,
        reloadApproved,
        exclusiveOperation,
        dirtyEditors: [...participants.values()].filter(safeParticipantDirty).length,
        persistence: [...persistenceControllers.values()].map(safePersistenceState),
    };
}

export function shouldWarnBeforeAdminUnload() {
    if (reloadApproved) return false;
    if ([...participants.values()].some(safeParticipantDirty)) return true;
    return [...persistenceControllers.values()].some((controller) => {
        const state = safePersistenceState(controller);
        return state.dirty === true || state.saving === true;
    });
}

export function readAdminRecoveryDraft(participantId) {
    try {
        const raw = sessionStorage.getItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed?.participants?.[participantId] ?? null;
    } catch {
        return null;
    }
}

export function clearAdminRecoveryDraft(participantId) {
    try {
        const raw = sessionStorage.getItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!parsed?.participants || !(participantId in parsed.participants)) return;
        delete parsed.participants[participantId];
        if (Object.keys(parsed.participants).length === 0) {
            sessionStorage.removeItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY);
        } else {
            sessionStorage.setItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY, JSON.stringify(parsed));
        }

    } catch {
        try {
            sessionStorage.removeItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY);
        } catch {
            // The recovery state is already unusable when storage is unavailable.
        }
    }
}

export function clearAllAdminRecoveryDrafts() {
    try {
        sessionStorage.removeItem(ADMIN_RECOVERY_DRAFT_STORAGE_KEY);
    } catch {
        // The recovery state is already unusable when storage is unavailable.
    }
}

export async function prepareAdminSafeReload() {
    reloadApproved = false;
    frozen = true;
    exclusiveOperation = 'reload';
    emitState();

    const hasDirtyEditors = [...participants.values()].some(safeParticipantDirty);
    const draft = writeRecoveryDraft();
    const results = await Promise.allSettled(
        [...persistenceControllers.values()].map((controller) => (
            typeof controller.flush === 'function' ? controller.flush() : Promise.resolve()
        )),
    );
    const failed = results.find((result) => result.status === 'rejected');
    const allClean = [...persistenceControllers.values()].every((controller) => {
        const state = safePersistenceState(controller);
        return state.dirty !== true && state.saving !== true;
    });

    if (failed && !draft.verified) {
        exclusiveOperation = null;
        emitState();
        throw failed.reason;
    }

    if ((hasDirtyEditors || !allClean) && !draft.verified) {
        exclusiveOperation = null;
        emitState();
        throw new Error('השמירה טרם אומתה ואין טיוטה מקומית לשחזור.');
    }

    reloadApproved = true;
    emitState();
    return {
        reloadApproved: true,
        persisted: allClean && !failed,
        draftVerified: draft.verified,
    };
}

export function approveAdminReload(reason = 'verified-operation') {
    frozen = true;
    reloadApproved = true;
    exclusiveOperation = reason;
    emitState();
}

export function beginAdminPersistenceSuspension(operation = 'restore') {
    reloadApproved = false;
    frozen = true;
    exclusiveOperation = operation;
    const recoveryRequired = shouldWarnBeforeAdminUnload();
    const draft = writeRecoveryDraft();
    emitState();
    return { ...draft, recoveryRequired };
}

export async function quiesceAdminPersistence() {
    const results = await Promise.allSettled(
        [...persistenceControllers.values()].map((controller) => (
            typeof controller.flush === 'function' ? controller.flush() : Promise.resolve()
        )),
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
}

export function endAdminPersistenceSuspension({ revalidated = false } = {}) {
    if (revalidated) {
        completeAdminRecoveryRevalidation();
        return;
    }
    frozen = false;
    exclusiveOperation = null;
    emitState();
}

export function resetAdminEditSessionForTests() {
    active = false;
    initialized = false;
    stale = false;
    frozen = false;
    reloadApproved = false;
    exclusiveOperation = null;
    lastActivityAt = Date.now();
    hiddenAt = null;
    participants.clear();
    persistenceControllers.clear();
}
