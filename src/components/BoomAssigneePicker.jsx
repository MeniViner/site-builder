import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Search, UserRound, X } from 'lucide-react';
import {
    isExactSharePointIdentityInput,
    isConfirmedUserPrincipal,
    resolveExactSharePointIdentity,
    resolveConfirmedSinglePrincipalFromCandidate,
    searchSharePointIdentityCandidates,
} from '../services/sharePointIdentityResolver';

function toLinkedAssignee(principal) {
    if (!principal) return null;
    const {
        identityKey,
        identities,
        displayName,
        sharePointUserId,
        loginName,
        email,
        personalNumber,
    } = principal;
    return {
        identityKey,
        ...(Array.isArray(identities) && identities.length > 0 ? { identities: [...identities] } : {}),
        displayName,
        ...(Number.isInteger(sharePointUserId) && sharePointUserId > 0 ? { sharePointUserId } : {}),
        ...(loginName ? { loginName } : {}),
        ...(email ? { email } : {}),
        ...(personalNumber ? { personalNumber } : {}),
    };
}

export default function BoomAssigneePicker({ taskKey, linkedAssignee, onAssigneeChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState('');
    const requestVersionRef = useRef(0);

    const resetPicker = (open) => {
        requestVersionRef.current += 1;
        setIsOpen(open);
        setQuery('');
        setResults([]);
        setError('');
        setIsSearching(false);
        setIsResolving(false);
    };

    const close = () => resetPicker(false);
    const open = () => resetPicker(true);

    useEffect(() => {
        resetPicker(false);
    }, [taskKey]);

    useEffect(() => () => {
        requestVersionRef.current += 1;
    }, []);

    const search = async () => {
        const exactIdentity = isExactSharePointIdentityInput(query);
        if (!exactIdentity && query.trim().length < 2) {
            setError('יש להזין לפחות שני תווים לחיפוש.');
            setResults([]);
            return;
        }
        const requestVersion = ++requestVersionRef.current;
        setIsSearching(true);
        setError('');
        try {
            if (exactIdentity) {
                const resolution = await resolveExactSharePointIdentity(query, []);
                if (requestVersion !== requestVersionRef.current) return;
                if (!resolution.ok) {
                    setResults([]);
                    setError(resolution.error);
                    return;
                }
                onAssigneeChange?.(toLinkedAssignee(resolution.principal));
                close();
                return;
            }
            const searchResult = await searchSharePointIdentityCandidates(query, []);
            if (requestVersion !== requestVersionRef.current) return;
            if (!searchResult.ok) {
                setResults([]);
                setError(searchResult.error);
                return;
            }
            setResults(searchResult.candidates);
            if (searchResult.candidates.length === 0) setError('לא נמצאו משתמשים תואמים באתר SharePoint.');
        } finally {
            if (requestVersion === requestVersionRef.current) setIsSearching(false);
        }
    };

    const selectAssignee = async (candidate) => {
        const requestVersion = ++requestVersionRef.current;
        setError('');
        if (!isConfirmedUserPrincipal(candidate)) {
            setError('ניתן לבחור משתמש יחיד ומאומת בלבד. לא ניתן לשייך קבוצה כאחראי.');
            return;
        }
        setIsResolving(true);
        try {
            const resolution = await resolveConfirmedSinglePrincipalFromCandidate(candidate, []);
            if (requestVersion !== requestVersionRef.current) return;
            if (!resolution.ok) {
                setError(resolution.error);
                return;
            }
            const assignee = toLinkedAssignee(resolution.principal);
            if (!assignee) {
                setError('למשתמש שנבחר חסרים פרטי זיהוי של SharePoint.');
                return;
            }
            onAssigneeChange?.(assignee);
            setIsResolving(false);
            close();
        } finally {
            if (requestVersion === requestVersionRef.current) setIsResolving(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={open}
                className="absolute left-1 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,transform] hover:bg-primary/10 hover:text-primary active:scale-[0.96] dark:text-gray-300"
                title="בחירת אחראי משימה"
                aria-label="בחירת אחראי משימה"
            >
                <UserRound size={18} />
            </button>

            {isOpen ? (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
                    <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 text-right shadow-2xl dark:border-white/10 dark:bg-[#1b1f2a]" role="dialog" aria-modal="true" aria-labelledby="boom-assignee-picker-title" dir="rtl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 id="boom-assignee-picker-title" className="text-lg font-black text-gray-900 dark:text-white">בחירת אחראי משימה</h3>
                                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">חפשו לפי שם או מייל ובחרו אדם אחד כאחראי.</p>
                            </div>
                            <button type="button" onClick={close} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-[background-color,color,transform] hover:bg-gray-100 hover:text-gray-900 active:scale-[0.96] dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white" aria-label="סגירת בחירת אחראי">
                                <X size={18} />
                            </button>
                        </div>

                        {linkedAssignee ? (
                            <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
                                <CheckCircle2 size={18} className="shrink-0" aria-hidden="true" />
                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-black">האחראי הנוכחי: {linkedAssignee.displayName}</div>
                                    <div dir="ltr" className="truncate text-xs">{linkedAssignee.email || linkedAssignee.loginName}</div>
                                </div>
                                <button type="button" onClick={() => onAssigneeChange?.(null)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-800 transition hover:bg-emerald-600/10 dark:text-emerald-100" title="הסרת אחראי" aria-label="הסרת אחראי">
                                    <X size={15} />
                                </button>
                            </div>
                        ) : null}

                        <div className="mt-4 flex gap-2">
                            <input
                                autoFocus
                                value={query}
                                onChange={(event) => {
                                    requestVersionRef.current += 1;
                                    setQuery(event.target.value);
                                    setError('');
                                    setResults([]);
                                    setIsSearching(false);
                                    setIsResolving(false);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') close();
                                    if (event.key === 'Enter') {
                                        event.preventDefault();
                                        void search();
                                    }
                                }}
                                className="min-h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition-[border-color,box-shadow] focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/5 dark:text-white"
                                placeholder="שם, מספר אישי, מייל או LoginName"
                                aria-label="חיפוש אחראי משימה"
                                disabled={isSearching}
                            />
                            <button type="button" onClick={() => void search()} disabled={isSearching} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] disabled:cursor-wait disabled:opacity-60" title="חיפוש" aria-label="חיפוש">
                                {isSearching ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                            </button>
                        </div>

                        {error ? <p className="mt-3 text-xs font-bold text-red-600 dark:text-red-300">{error}</p> : null}

                        {results.length > 0 ? (
                            <ul className="mt-4 overflow-hidden rounded-xl border border-gray-200 divide-y divide-gray-200 dark:border-white/10 dark:divide-white/10">
                                {results.map((user) => (
                                    <li key={user.Id}>
                                        <button
                                            type="button"
                                            onClick={() => void selectAssignee(user)}
                                            disabled={isResolving}
                                            className="flex w-full items-center gap-3 px-3 py-3 text-right transition hover:bg-primary/5 disabled:cursor-wait disabled:opacity-60"
                                        >
                                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                {isResolving ? <Loader2 size={16} className="animate-spin" /> : <UserRound size={16} />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-black text-gray-900 dark:text-white">{user.Title || user.Email || user.LoginName}</span>
                                                <span dir="ltr" className="block truncate text-xs text-gray-500 dark:text-gray-400">{user.Email || user.LoginName}</span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}