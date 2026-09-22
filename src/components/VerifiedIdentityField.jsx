import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Search, Trash2 } from 'lucide-react';
import { normalizeSharePointIdentityInput } from '../services/sharePointSiteCollectionAdminsService';
import { resolveExactSharePointIdentity } from '../services/sharePointIdentityResolver';

function toLinkedSharePointUser(principal) {
    if (!principal?.sharePointUserId || !principal?.loginName) return null;
    return {
        displayName: principal.displayName,
        personalNumber: String(principal.personalNumber || ''),
        loginName: principal.loginName,
        email: principal.email || '',
        sharePointUserId: principal.sharePointUserId,
        identityKey: principal.identityKey,
    };
}

export default function VerifiedIdentityField({ identityInput, linkedUser, onIdentityChange, onLinkedUserChange }) {
    const [resolving, setResolving] = useState(false);
    const [error, setError] = useState('');
    const normalized = useMemo(
        () => normalizeSharePointIdentityInput(identityInput),
        [identityInput]
    );

    const resolveIdentity = async () => {
        if (!normalized.ok) {
            setError(normalized.message);
            return;
        }
        setResolving(true);
        setError('');
        try {
            const resolution = await resolveExactSharePointIdentity(identityInput, []);
            if (!resolution.ok) {
                onLinkedUserChange(null);
                setError(resolution.error);
                return;
            }
            const linked = toLinkedSharePointUser(resolution.principal);
            if (!linked) {
                onLinkedUserChange(null);
                setError('לא ניתן לזהות משתמש מאומת יחיד עבור הערך שהוזן.');
                return;
            }
            onLinkedUserChange(linked);
        } finally {
            setResolving(false);
        }
    };

    return (
        <div className="sm:col-span-2 rounded-2xl border border-gray-200 bg-gray-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
            <label>
                <span className="mb-1.5 block text-xs font-black text-gray-600 dark:text-gray-300">מספר אישי / זהות SharePoint</span>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                        dir="ltr"
                        className="min-h-11 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-left text-sm font-semibold text-gray-800 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/5 dark:text-white"
                        value={identityInput}
                        onChange={(event) => {
                            onIdentityChange(event.target.value);
                            onLinkedUserChange(null);
                            setError('');
                        }}
                        placeholder="s1234567 / email / LoginName"
                        disabled={resolving}
                    />
                    <button
                        type="button"
                        onClick={resolveIdentity}
                        disabled={!normalized.ok || resolving}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 text-sm font-black text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {resolving ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                        בדוק זיהוי
                    </button>
                    {linkedUser && (
                        <button
                            type="button"
                            onClick={() => {
                                onIdentityChange('');
                                onLinkedUserChange(null);
                            }}
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 dark:border-red-400/30 dark:text-red-300"
                        >
                            <Trash2 size={15} />
                            נקה קישור
                        </button>
                    )}
                </div>
            </label>
            {linkedUser ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
                    <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
                    <div>
                        <div className="font-black">זהות אומתה: {linkedUser.displayName}</div>
                        <div dir="ltr" className="mt-1 text-xs">{linkedUser.email || linkedUser.loginName}</div>
                    </div>
                </div>
            ) : (
                <div className="mt-2 text-xs text-gray-500">
                    {error || (normalized.ok ? `ערך מזוהה: ${normalized.label}` : normalized.message)}
                </div>
            )}
        </div>
    );
}
