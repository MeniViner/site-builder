import {
    ensureUserByIdentity,
    normalizeSharePointIdentityInput,
    searchSharePointUsers,
} from './sharePointSiteCollectionAdminsService';
import { mapSharePointErrorToHebrewMessage, type AdminLogEntry } from './adminManagementLogger';
import { getStableUserIdentities } from '../utils/notificationData';

/**
 * Shared identity resolution used by BOOM assignee selection, notification
 * audience targets and any other place that needs a single, confirmed
 * SharePoint user principal. It exists so every caller performs the same
 * "exact identity" and "explicit final resolve" checks and returns the same
 * safe, actionable Hebrew error copy instead of raw SharePoint payloads.
 */

const CONFIRMED_USER_PRINCIPAL_TYPE = 1;

export type SharePointPrincipalCandidate = {
    Id?: number;
    Title?: string;
    Email?: string;
    LoginName?: string;
    PrincipalType?: number;
};

export type ResolvedSharePointPrincipal = {
    identityKey: string;
    identities: string[];
    displayName: string;
    sharePointUserId?: number;
    loginName?: string;
    email?: string;
    personalNumber?: string;
};

export type IdentityResolutionResult =
    | { ok: true; principal: ResolvedSharePointPrincipal }
    | { ok: false; error: string };

export type CandidateSelectionResult =
    | { ok: true; candidate: SharePointPrincipalCandidate }
    | { ok: false; error: string };

export type IdentitySearchResult =
    | { ok: true; candidates: SharePointPrincipalCandidate[] }
    | { ok: false; error: string };

const GROUP_REJECTION_MESSAGE = 'ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.';
const UNRESOLVED_MESSAGE = 'לא ניתן לזהות משתמש מאומת יחיד עבור הערך שהוזן.';
const MISSING_IDENTITY_MESSAGE = 'למשתמש שנבחר חסרים פרטי זיהוי של SharePoint.';
const NO_MATCH_MESSAGE = 'לא נמצא משתמש מתאים. נסו לחדד את החיפוש.';
const AMBIGUOUS_MATCH_MESSAGE = 'נמצאו מספר משתמשים תואמים. יש לצמצם את החיפוש ולבחור אדם אחד בלבד.';
const STALE_RESULT_MESSAGE = 'תוצאת החיפוש אינה עדכנית. חפשו את המשתמש מחדש ובחרו שוב.';

export function isExactSharePointIdentityInput(value: unknown) {
    const input = String(value || '').trim();
    return /^\d{6,8}$/.test(input)
        || /^s\d{6,8}$/i.test(input)
        || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)
        || /[|\\]/.test(input)
        || /^[ic]:/i.test(input);
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function unwrapPrincipalValues(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    const source = asRecord(payload);
    if (!source) return [];
    if (Array.isArray(source.value)) return source.value;
    if (Array.isArray(source.results)) return source.results;

    const data = asRecord(source.d);
    if (data) {
        if (Array.isArray(data.results)) return data.results;
        if (Array.isArray(data.value)) return data.value;
        return [data];
    }

    return [source];
}

function normalizePrincipalType(value: unknown, entityType: unknown, loginName: string, email: string) {
    const numeric = Number(value);
    if (Number.isInteger(numeric) && numeric > 0) return numeric;

    const typeLabel = String(value || entityType || '').trim().toLowerCase();
    if (typeLabel === 'user' || typeLabel === 'person') return CONFIRMED_USER_PRINCIPAL_TYPE;
    if (typeLabel.includes('group')) return 8;
    if (/^c:0/i.test(loginName)) return 8;
    if (email || /^i:0/i.test(loginName) || loginName.includes('\\')) return CONFIRMED_USER_PRINCIPAL_TYPE;
    return undefined;
}

function normalizePrincipalCandidate(value: unknown): SharePointPrincipalCandidate | null {
    const source = asRecord(value);
    if (!source) return null;
    const entityData = asRecord(source.EntityData) || {};
    const loginName = String(source.LoginName ?? source.Key ?? entityData.LoginName ?? '').trim();
    const email = String(source.Email ?? entityData.Email ?? '').trim();
    const id = Number(source.Id ?? source.ID ?? entityData.SPUserID ?? entityData.SPUserId);
    const principalType = normalizePrincipalType(
        source.PrincipalType ?? entityData.PrincipalType,
        source.EntityType ?? entityData.EntityType,
        loginName,
        email,
    );

    return {
        ...(Number.isInteger(id) && id > 0 ? { Id: id } : {}),
        ...(String(source.Title ?? source.DisplayText ?? entityData.DisplayName ?? '').trim()
            ? { Title: String(source.Title ?? source.DisplayText ?? entityData.DisplayName).trim() }
            : {}),
        ...(email ? { Email: email } : {}),
        ...(loginName ? { LoginName: loginName } : {}),
        ...(principalType ? { PrincipalType: principalType } : {}),
    };
}

function parsePrincipalCandidates(payload: unknown) {
    return unwrapPrincipalValues(payload)
        .map(normalizePrincipalCandidate)
        .filter((candidate): candidate is SharePointPrincipalCandidate => Boolean(candidate));
}

export function isConfirmedUserPrincipal(candidate: SharePointPrincipalCandidate | null | undefined) {
    return Number(candidate?.Id) > 0
        && Number(candidate?.PrincipalType) === CONFIRMED_USER_PRINCIPAL_TYPE;
}

function toResolvedPrincipal(
    raw: SharePointPrincipalCandidate | null | undefined,
    normalizedIdentity: { personalNumber?: string } = {}
): ResolvedSharePointPrincipal | null {
    if (!isConfirmedUserPrincipal(raw)) return null;
    const sharePointUserId = Number(raw?.Id);
    const loginName = String(raw?.LoginName || '').trim();
    const email = String(raw?.Email || '').trim().toLowerCase();
    const personalNumber = String(normalizedIdentity?.personalNumber || '').replace(/\D/g, '');
    const identities = getStableUserIdentities({ sharePointUserId, loginName, email, personalNumber });
    if (identities.length === 0) return null;

    return {
        identityKey: identities[0],
        identities,
        displayName: String(raw?.Title || email || loginName || identities[0]).trim(),
        ...(Number.isInteger(sharePointUserId) && sharePointUserId > 0 ? { sharePointUserId } : {}),
        ...(loginName ? { loginName } : {}),
        ...(email ? { email } : {}),
        ...(personalNumber ? { personalNumber } : {}),
    };
}

/**
 * Resolves an exact SharePoint identity (personal number, email or LoginName)
 * to exactly one confirmed user principal. Rejects groups, unresolved/empty
 * responses and maps any SharePoint failure to a safe, actionable Hebrew
 * message (no raw server payloads reach the caller).
 */
export async function resolveExactSharePointIdentity(
    identityInput: string,
    logs: AdminLogEntry[] = []
): Promise<IdentityResolutionResult> {
    const normalized = normalizeSharePointIdentityInput(identityInput);
    if (!normalized.ok) {
        return { ok: false, error: normalized.message };
    }

    let ensured: unknown;
    try {
        ensured = await ensureUserByIdentity(identityInput, logs);
    } catch (error) {
        return { ok: false, error: mapSharePointErrorToHebrewMessage(error) };
    }

    const candidates = parsePrincipalCandidates(ensured);
    if (candidates.some((candidate) => Number(candidate.Id) > 0 && Number(candidate.PrincipalType) !== CONFIRMED_USER_PRINCIPAL_TYPE)) {
        return { ok: false, error: GROUP_REJECTION_MESSAGE };
    }

    const selected = ensureSingleConfirmedCandidate(candidates);
    if (!selected.ok) {
        return {
            ok: false,
            error: selected.error === NO_MATCH_MESSAGE ? UNRESOLVED_MESSAGE : selected.error,
        };
    }

    const principal = toResolvedPrincipal(selected.candidate, normalized);
    if (!principal) {
        return { ok: false, error: UNRESOLVED_MESSAGE };
    }

    return { ok: true, principal };
}

/**
 * Given a set of picker/search candidates, ensures exactly one confirmed
 * user principal is present: rejects empty results, ambiguous (multiple)
 * matches, and filters out group principals before selecting a single user.
 */
export function ensureSingleConfirmedCandidate(
    candidates: unknown
): CandidateSelectionResult {
    const users = parsePrincipalCandidates(candidates).filter(isConfirmedUserPrincipal);
    if (users.length === 0) {
        return { ok: false, error: NO_MATCH_MESSAGE };
    }
    if (users.length > 1) {
        return { ok: false, error: AMBIGUOUS_MATCH_MESSAGE };
    }
    return { ok: true, candidate: users[0] };
}

export async function searchSharePointIdentityCandidates(
    query: string,
    logs: AdminLogEntry[] = []
): Promise<IdentitySearchResult> {
    const result = await searchSharePointPrincipalCandidates(query, logs);
    return result.ok
        ? { ok: true, candidates: result.candidates.filter(isConfirmedUserPrincipal) }
        : result;
}

export async function searchSharePointPrincipalCandidates(
    query: string,
    logs: AdminLogEntry[] = []
): Promise<IdentitySearchResult> {
    try {
        const response = await searchSharePointUsers(query, logs);
        return {
            ok: true,
            candidates: parsePrincipalCandidates(response),
        };
    } catch (error) {
        return { ok: false, error: mapSharePointErrorToHebrewMessage(error) };
    }
}

/**
 * Explicit final resolve step for a candidate picked from a display
 * query/search list: re-confirms the candidate against SharePoint via
 * ensureUserByIdentity so a stale or since-removed/changed search result
 * cannot be persisted as a confirmed principal.
 */
export async function resolveConfirmedSinglePrincipalFromCandidate(
    candidate: SharePointPrincipalCandidate | null | undefined,
    logs: AdminLogEntry[] = []
): Promise<IdentityResolutionResult> {
    const normalizedCandidate = normalizePrincipalCandidate(candidate);
    if (!normalizedCandidate) {
        return { ok: false, error: MISSING_IDENTITY_MESSAGE };
    }
    if (!isConfirmedUserPrincipal(normalizedCandidate)) {
        return { ok: false, error: GROUP_REJECTION_MESSAGE };
    }

    const identityToResolve = String(normalizedCandidate.LoginName || normalizedCandidate.Email || '').trim();
    if (!identityToResolve) {
        return { ok: false, error: MISSING_IDENTITY_MESSAGE };
    }

    const resolution = await resolveExactSharePointIdentity(identityToResolve, logs);
    if (!resolution.ok) return resolution;

    if (
        Number(normalizedCandidate.Id) > 0
        && Number(resolution.principal.sharePointUserId) > 0
        && Number(normalizedCandidate.Id) !== Number(resolution.principal.sharePointUserId)
    ) {
        return { ok: false, error: STALE_RESULT_MESSAGE };
    }

    return resolution;
}
