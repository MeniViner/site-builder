import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, Trash2, Users } from 'lucide-react';
import {
    listSharePointGroupMembersByIdentity,
    normalizeSharePointIdentityInput,
} from '../services/sharePointSiteCollectionAdminsService';
import {
    isConfirmedUserPrincipal,
    resolveExactSharePointIdentity,
} from '../services/sharePointIdentityResolver';
import { getStableUserIdentities } from '../utils/notificationData';

function toAudienceTargetFromPrincipal(principal, group = null) {
    if (!principal) return null;
    const { identityKey, identities, displayName, sharePointUserId, loginName, email, personalNumber } = principal;
    return {
        identityKey,
        identities,
        displayName,
        ...(Number.isInteger(sharePointUserId) && sharePointUserId > 0 ? { sharePointUserId } : {}),
        ...(loginName ? { loginName } : {}),
        ...(email ? { email } : {}),
        ...(personalNumber ? { personalNumber } : {}),
        ...(group?.id ? { groupId: group.id } : {}),
        ...(group?.title ? { groupTitle: group.title } : {}),
    };
}

function toAudienceTargetFromGroupMember(member, group) {
    if (!isConfirmedUserPrincipal(member)) return null;
    const sharePointUserId = Number(member?.Id);
    const loginName = String(member?.LoginName || '').trim();
    const email = String(member?.Email || '').trim().toLowerCase();
    const identities = getStableUserIdentities({ sharePointUserId, loginName, email });
    if (identities.length === 0) return null;

    return toAudienceTargetFromPrincipal({
        identityKey: identities[0],
        identities,
        displayName: String(member?.Title || email || loginName || identities[0]).trim(),
        sharePointUserId,
        loginName,
        email,
    }, group);
}

function mergeAudienceTargets(currentTargets, incomingTargets) {
    return incomingTargets.reduce((nextTargets, target) => {
        if (!target || nextTargets.some((current) => current.identities.some((identity) => target.identities.includes(identity)))) {
            return nextTargets;
        }
        return [...nextTargets, target];
    }, currentTargets);
}

export default function NotificationAudienceTargets({ selectedTargets = [], onSelectedTargetsChange }) {
    const [targetKind, setTargetKind] = useState('user');
    const [identityInput, setIdentityInput] = useState('');
    const [resolving, setResolving] = useState(false);
    const [error, setError] = useState('');
    const normalizedIdentity = useMemo(
        () => normalizeSharePointIdentityInput(identityInput),
        [identityInput],
    );

    const addTargets = (targets) => {
        const mergedTargets = mergeAudienceTargets(selectedTargets, targets);
        onSelectedTargetsChange?.(mergedTargets);
    };

    const addUser = async () => {
        if (!normalizedIdentity.ok) {
            setError(normalizedIdentity.message);
            return;
        }
        setResolving(true);
        setError('');
        try {
            const resolution = await resolveExactSharePointIdentity(identityInput, []);
            if (!resolution.ok) {
                setError(resolution.error);
                return;
            }
            const target = toAudienceTargetFromPrincipal(resolution.principal);
            if (!target) {
                setError('למשתמש שנבחר חסרים פרטי זיהוי של SharePoint.');
                return;
            }
            addTargets([target]);
            setIdentityInput('');
        } finally {
            setResolving(false);
        }
    };

    const addGroup = async () => {
        const groupInput = identityInput.trim();
        if (!groupInput) {
            setError('יש להזין שם או מזהה של קבוצת SharePoint.');
            return;
        }
        setResolving(true);
        setError('');
        try {
            const group = await listSharePointGroupMembersByIdentity(groupInput, []);
            const targets = group.members
                .map((member) => toAudienceTargetFromGroupMember(member, group))
                .filter(Boolean);
            if (targets.length === 0) {
                setError('לא נמצאו חברים שניתן לשלוח להם התראה בקבוצה זו.');
                return;
            }
            addTargets(targets);
            setIdentityInput('');
        } catch {
            setError('לא ניתן לטעון את חברי הקבוצה מ־SharePoint. בדוק את השם או המזהה ואת ההרשאות.');
        } finally {
            setResolving(false);
        }
    };

    const removeTarget = (identityKey) => {
        onSelectedTargetsChange?.(selectedTargets.filter((target) => target.identityKey !== identityKey));
    };

    const isUserTarget = targetKind === 'user';
    const canAdd = isUserTarget ? normalizedIdentity.ok : Boolean(identityInput.trim());

    return (
        <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(150px,0.38fr)_minmax(0,1fr)_auto]">
                <label>
                    <span className="mb-1.5 block text-xs font-black text-theme-muted">סוג יעד</span>
                    <select
                        aria-label="סוג יעד"
                        value={targetKind}
                        onChange={(event) => {
                            setTargetKind(event.target.value);
                            setIdentityInput('');
                            setError('');
                        }}
                        disabled={resolving}
                        className="min-h-11 w-full rounded-xl border border-theme-subtle bg-theme-elevated px-3 text-sm font-semibold text-theme outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                    >
                        <option value="user">משתמש</option>
                        <option value="group">קבוצת SharePoint</option>
                    </select>
                </label>
                <label>
                    <span className="mb-1.5 block text-xs font-black text-theme-muted">
                        {isUserTarget ? 'מספר אישי / זהות SharePoint' : 'שם או מזהה קבוצת SharePoint'}
                    </span>
                    <input
                        dir={isUserTarget ? 'ltr' : 'auto'}
                        className="min-h-11 w-full rounded-xl border border-theme-subtle bg-theme-elevated px-3 text-sm text-theme outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                        value={identityInput}
                        onChange={(event) => {
                            setIdentityInput(event.target.value);
                            setError('');
                        }}
                        placeholder={isUserTarget ? 's1234567 / email / LoginName' : 'לדוגמה: צוות מבצעים או 12'}
                        disabled={resolving}
                    />
                </label>
                <button
                    type="button"
                    onClick={isUserTarget ? addUser : addGroup}
                    disabled={!canAdd || resolving}
                    className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-black text-primary transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {resolving ? <Loader2 size={16} className="animate-spin" /> : isUserTarget ? <Search size={16} /> : <Users size={16} />}
                    {isUserTarget ? 'הוסף משתמש' : 'הוסף קבוצה'}
                </button>
            </div>

            {error ? <p className="text-xs font-bold text-red-600 dark:text-red-300">{error}</p> : null}

            {selectedTargets.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-theme-subtle">
                    <div className="flex items-center justify-between border-b border-theme-subtle bg-theme-elevated px-3 py-2">
                        <span className="text-xs font-black text-theme">משתמשים שנבחרו</span>
                        <span className="text-xs font-bold tabular-nums text-theme-muted">{selectedTargets.length}</span>
                    </div>
                    <ul className="divide-y divide-theme-subtle">
                        {selectedTargets.map((target) => (
                            <li key={target.identityKey} className="flex items-center gap-3 px-3 py-2.5">
                                <CheckCircle2 size={16} className="shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-bold text-theme">{target.displayName}</div>
                                    <div dir="ltr" className="truncate text-xs text-theme-muted">{target.email || target.loginName || target.identityKey}</div>
                                    {target.groupTitle ? <div className="mt-0.5 truncate text-[11px] font-bold text-primary">קבוצה: {target.groupTitle}</div> : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeTarget(target.identityKey)}
                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-theme-muted transition hover:bg-red-500/10 hover:text-red-600"
                                    title={`הסרת ${target.displayName}`}
                                    aria-label={`הסרת ${target.displayName}`}
                                >
                                    <Trash2 size={15} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="text-xs text-theme-muted">
                    הוסיפו משתמשים בנפרד או בחרו קבוצה כדי להוסיף ולהציג את כל חבריה.
                </p>
            )}
        </div>
    );
}