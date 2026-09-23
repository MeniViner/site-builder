export const ADMIN_STALE_THRESHOLD_MS = Math.max(
    60_000,
    Number(import.meta.env.VITE_ADMIN_STALE_EDIT_THRESHOLD_MS) || 60 * 60 * 1000
);

export const STALE_ADMIN_EDIT_EVENT = 'site-builder:stale-admin-edit';
export const ADMIN_RECOVERY_STATE_EVENT = 'site-builder:admin-recovery-state';
export const ADMIN_RECOVERY_DRAFT_STORAGE_KEY = 'siteBuilder.adminRecoveryDraft.v1';
export const ADMIN_RECOVERY_DRAFT_STORAGE_PREFIX = 'siteBuilder.adminRecoveryDraft.v2';
export const ADMIN_RECOVERY_SCHEMA_VERSION = 2;
export const ADMIN_RECOVERY_DRAIN_TIMEOUT_MS = 15_000;

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
let recoveryScope = null;

function normalizeScopePart(value) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeRecoveryScope(scope) {
    const backend = normalizeScopePart(scope?.backend);
    const target = normalizeScopePart(scope?.target);
    const user = normalizeScopePart(scope?.user);
    if (!backend || !target || !user) return null;
    return { backend, target, user };
}

function scopesEqual(left, right) {
    return Boolean(
        left
        && right
        && left.backend === right.backend
        && left.target === right.target
        && left.user === right.user
    );
}

function scopeStorageKey(scope = recoveryScope) {
    if (!scope) return null;
    return `${ADMIN_RECOVERY_DRAFT_STORAGE_PREFIX}:${encodeURIComponent(scope.backend)}:${encodeURIComponent(scope.target)}:${encodeURIComponent(scope.user)}`;
}

export function setAdminRecoveryScope(scope) {
    const nextScope = normalizeRecoveryScope(scope);
    if (scopesEqual(recoveryScope, nextScope)) return;
    recoveryScope = nextScope;
    reloadApproved = false;
    emitState();
}

export function getAdminRecoveryStorageKey() {
    return scopeStorageKey();
}

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

function safeParticipantState(participant) {
    const state = participant?.getState?.();
    return state && typeof state === 'object' ? state : {};
}

export function isAdminRecoveryActionTarget(target) {
    if (!target || typeof target !== 'object') return false;
    if (typeof target.closest === 'function') {
        return Boolean(target.closest('[data-admin-recovery-control="true"]'));
    }

    let current = target.parentElement;
    while (current) {
        if (current.getAttribute?.('data-admin-recovery-control') === 'true') return true;
        current = current.parentElement;
    }
    return false;
}

function safePersistenceState(controller) {
    const state = controller?.getState?.();
    return state && typeof state === 'object' ? state : {};
}

function writeRecoveryDraft() {
    const storageKey = scopeStorageKey();
    if (!storageKey || !recoveryScope) {
        return { verified: false, participants: {}, blocked: true, reason: 'missing-recovery-scope' };
    }
    const captured = {};
    const blockers = [];

    participants.forEach((participant, id) => {
        const state = safeParticipantState(participant);
        if (state.recoveryBlocked) blockers.push({ id, reason: String(state.recoveryBlockReason || 'unrecoverable-state') });
        if (!safeParticipantDirty(participant) || typeof participant.captureDraft !== 'function') return;
        const draft = participant.captureDraft();
        if (draft !== undefined) captured[id] = draft;
    });
    persistenceControllers.forEach((controller, id) => {
        const state = safePersistenceState(controller);
        if (state.recoveryBlocked) blockers.push({ id: `persistence:${id}`, reason: String(state.recoveryBlockReason || 'unrecoverable-state') });
        if (!state.dirty || typeof controller.captureDraft !== 'function') return;
        const draft = controller.captureDraft();
        if (draft !== undefined) captured[`persistence:${id}`] = draft;
    });

    if (blockers.length > 0) {
        return { verified: false, participants: captured, blocked: true, blockers };
    }

    if (Object.keys(captured).length === 0) {
        try {
            sessionStorage.removeItem(storageKey);
        } catch {
            // No draft needs to be persisted.
        }
        return { verified: false, participants: captured };
    }

    const envelope = {
        version: ADMIN_RECOVERY_SCHEMA_VERSION,
        capturedAt: new Date().toISOString(),
        scope: recoveryScope,
        participants: captured,
    };
    try {
        const serialized = JSON.stringify(envelope);
        sessionStorage.setItem(storageKey, serialized);
        const verified = sessionStorage.getItem(storageKey) === serialized;
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

export function getAdminExclusiveOperation() {
    return exclusiveOperation;
}

export function assertAdminEditSessionFresh({ recoveryOperation = null } = {}) {
    const approvedRecoveryOperation = Boolean(
        recoveryOperation
        && frozen
        && exclusiveOperation
        && recoveryOperation === exclusiveOperation
    );
    if (frozen && !approvedRecoveryOperation) {
        const error = new Error('העריכה מוקפאת עד לסיום השחזור או הרענון הבטוח.');
        error.code = FROZEN_ERROR_CODE;
        throw error;
    }
    if (approvedRecoveryOperation || !isAdminEditSessionStale()) return;
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
    if (participants.has(id) && participants.get(id) !== participant) {
        throw new Error(`Recovery participant "${id}" is already registered.`);
    }
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
    if (persistenceControllers.has(id) && persistenceControllers.get(id) !== controller) {
        throw new Error(`Persistence controller "${id}" is already registered.`);
    }
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
        editors: [...participants.values()].map((participant) => ({
            id: participant.id,
            dirty: safeParticipantDirty(participant),
            ...safeParticipantState(participant),
        })),
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
        const storageKey = scopeStorageKey();
        if (!storageKey || !recoveryScope) return null;
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed?.version !== ADMIN_RECOVERY_SCHEMA_VERSION || !scopesEqual(parsed?.scope, recoveryScope)) return null;
        return parsed?.participants?.[participantId] ?? null;
    } catch {
        return null;
    }
}

export function clearAdminRecoveryDraft(participantId) {
    try {
        const storageKey = scopeStorageKey();
        if (!storageKey || !recoveryScope) return;
        const raw = sessionStorage.getItem(storageKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.version !== ADMIN_RECOVERY_SCHEMA_VERSION || !scopesEqual(parsed?.scope, recoveryScope)) return;
        if (!parsed?.participants || !(participantId in parsed.participants)) return;
        delete parsed.participants[participantId];
        if (Object.keys(parsed.participants).length === 0) {
            sessionStorage.removeItem(storageKey);
        } else {
            sessionStorage.setItem(storageKey, JSON.stringify(parsed));
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
        const storageKey = scopeStorageKey();
        if (storageKey) sessionStorage.removeItem(storageKey);
    } catch {
        // The recovery state is already unusable when storage is unavailable.
    }
}

function withDrainTimeout(promise, id) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const error = new Error(`שמירת "${id}" לא הסתיימה בזמן.`);
            error.code = 'ADMIN_PERSISTENCE_DRAIN_TIMEOUT';
            reject(error);
        }, ADMIN_RECOVERY_DRAIN_TIMEOUT_MS);
        Promise.resolve(promise).then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

function cancelPendingAdminWork() {
    participants.forEach((participant) => participant.cancelPending?.());
    persistenceControllers.forEach((controller) => controller.cancelPending?.());
}

export async function prepareAdminSafeReload({ allowLocalOnly = false } = {}) {
    reloadApproved = false;
    frozen = true;
    exclusiveOperation = 'reload';
    emitState();

    cancelPendingAdminWork();
    const hasDirtyEditors = [...participants.values()].some(safeParticipantDirty);
    const draft = writeRecoveryDraft();
    if (draft.blocked) {
        exclusiveOperation = null;
        emitState();
        throw new Error('קיים מידע שלא ניתן לשחזר אוטומטית. יש להשלים או לבטל את הפעולה לפני רענון.');
    }
    const results = await Promise.allSettled(
        [...persistenceControllers.entries()].map(([id, controller]) => (
            withDrainTimeout(
                typeof controller.flush === 'function' ? controller.flush() : Promise.resolve(),
                id,
            )
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

    const localOnly = Boolean(failed || !allClean);
    if (localOnly && !allowLocalOnly) {
        exclusiveOperation = null;
        emitState();
        return {
            reloadApproved: false,
            persisted: false,
            draftVerified: true,
            localOnly: true,
            requiresLocalOnlyApproval: true,
        };
    }

    reloadApproved = true;
    emitState();
    return {
        reloadApproved: true,
        persisted: allClean && !failed,
        draftVerified: draft.verified,
        localOnly,
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
    cancelPendingAdminWork();
    const recoveryRequired = shouldWarnBeforeAdminUnload();
    const draft = writeRecoveryDraft();
    emitState();
    return { ...draft, recoveryRequired };
}

export async function quiesceAdminPersistence() {
    const results = await Promise.allSettled(
        [...persistenceControllers.entries()].map(([id, controller]) => (
            withDrainTimeout(
                typeof controller.flush === 'function' ? controller.flush() : Promise.resolve(),
                id,
            )
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
    recoveryScope = null;
    participants.clear();
    persistenceControllers.clear();
}
