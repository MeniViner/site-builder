import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Copy,
    Download,
    Eye,
    FileText,
    Loader2,
    RefreshCw,
    Search,
    Shield,
    ShieldCheck,
    Trash2,
    User,
    UserPlus,
    Users,
    X,
} from 'lucide-react';
import {
    addSiteCollectionAdminByIdentity,
    ensureUserByIdentity,
    getCurrentSharePointUser,
    listSiteCollectionAdmins,
    normalizeSharePointIdentityInput,
    removeSiteCollectionAdmin,
} from '../services/sharePointSiteCollectionAdminsService';
import {
    addUserToAssociatedOwnersGroupByLoginName,
    listAssociatedOwnersGroupUsers,
    removeUserFromAssociatedOwnersGroup,
} from '../services/sharePointOwnersGroupService';
import { normalizeAdminRecord } from '../services/adminSourcesSyncService';
import { addAdminLogEntry, mapSharePointErrorToHebrewMessage } from '../services/adminManagementLogger';
import { addTxtAdminFromSharePointUser, listTxtAdmins, syncSiteCollectionAdminsToTxtAdmins } from '../services/txtAdminsService';

const defaultPermissionSource = {
    loading: false,
    rows: [],
    error: '',
    updatedAt: null,
    logs: [],
    extra: {},
};

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'owners', label: 'Site Owners' },
    { key: 'site-admins', label: 'Site Collection Admins' },
    { key: 'current', label: 'Current SharePoint Managers' },
    { key: 'groups', label: 'Groups' },
    { key: 'system', label: 'System Accounts' },
    { key: 'warnings', label: 'Errors/Warnings' },
];

const TARGET_OPTIONS = [
    { value: 'site-admin', label: 'Site Collection Admin', description: 'הוספה למנהלי אוסף אתרים' },
    { value: 'owner', label: 'Site Owner', description: 'הוספה לקבוצת בעלי האתר' },
    { value: 'both', label: 'Both', description: 'הוספה לשני היעדים' },
];

const TYPE_META = {
    user: {
        label: 'User',
        icon: User,
        className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200',
    },
    group: {
        label: 'Group',
        icon: Users,
        className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200',
    },
    system: {
        label: 'System',
        icon: Shield,
        className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100',
    },
    diagnostic: {
        label: 'System',
        icon: AlertTriangle,
        className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100',
    },
};

const STATUS_CLASSES = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100',
    error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200',
};

const SOURCE_LABELS = {
    'site-admins': 'Site Collection Admins',
    owners: 'Site Owners',
    current: 'Current SharePoint Managers',
};

const normalizeText = (value) => String(value ?? '').trim().toLowerCase();

const extractEmail = (value) => String(value ?? '').match(/[^\s|\\]+@[^\s|\\]+\.[^\s|\\]+/i)?.[0]?.toLowerCase() || '';

const extractPersonalNumber = (value) => String(value ?? '').match(/s\d{6,8}/i)?.[0]?.toLowerCase() || '';

const unique = (values) => Array.from(new Set(values.filter(Boolean)));

const formatDateTime = (dateValue) => {
    if (!dateValue) return '-';
    const timestamp = Date.parse(String(dateValue));
    if (!Number.isFinite(timestamp)) return String(dateValue);
    return new Date(timestamp).toLocaleString('he-IL');
};

const formatJson = (value) => {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

const formatAdminLogsAsText = (logs) => {
    if (!Array.isArray(logs) || logs.length === 0) return '';
    return logs
        .map((entry) => {
            const header = [entry.time, entry.prefix, entry.level, entry.step].filter(Boolean).join(' | ');
            const body = entry.message || '';
            const data = entry.data !== undefined ? `\n${formatJson(entry.data)}` : '';
            return `${header}\n${body}${data}`.trim();
        })
        .join('\n\n');
};

const downloadTextFile = (fileName, text) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
};

const getSharePointPersonLabel = (row, fallback = 'משתמש') =>
    String(row?.Title || row?.Email || row?.LoginName || row?.name || row?.email || row?.loginName || fallback).trim();

const getRawId = (row) => {
    const raw = row?.Id ?? row?.id ?? '';
    const match = String(raw).match(/^sp_(\d+)$/i);
    if (match) return Number(match[1]);
    return Number(raw || 0) || 0;
};

const isGroupPrincipal = (row) => {
    const principalType = Number(row?.PrincipalType ?? row?.principalType ?? 0);
    if ((principalType & 2) === 2 || (principalType & 4) === 4 || (principalType & 8) === 8) return true;
    const loginName = normalizeText(row?.LoginName || row?.loginName);
    return /^c:0|spo-grid-all-users|rolemanager|membership provider/i.test(loginName);
};

const isSystemPrincipal = (row) => {
    const searchable = [
        row?.Title,
        row?.name,
        row?.Email,
        row?.email,
        row?.LoginName,
        row?.loginName,
    ].map(normalizeText).join(' ');

    return /system account|sharepoint\\system|nt authority|app@sharepoint|spoapp|service account|svc[_-]|_layouts|\\system\b/i.test(searchable);
};

const getPrincipalKind = (row) => {
    if (isSystemPrincipal(row)) return 'system';
    if (isGroupPrincipal(row)) return 'group';
    return 'user';
};

const makeIdentityKeys = (draft) => {
    const keys = [];
    const loginName = normalizeText(draft.loginName);
    const email = normalizeText(draft.email || extractEmail(draft.loginName));
    const personalNumber = normalizeText(draft.personalNumber || extractPersonalNumber(draft.loginName) || extractPersonalNumber(draft.email));
    const displayName = normalizeText(draft.displayName);
    const rawId = String(draft.rawId || '').trim();

    if (draft.type === 'group') {
        if (rawId) keys.push(`group-id:${rawId}`);
        if (loginName) keys.push(`group-login:${loginName}`);
        if (displayName) keys.push(`group-name:${displayName}`);
        return keys.length ? keys : [`group-fallback:${draft.sourceKey}:${draft.fallbackIndex}`];
    }

    if (loginName) keys.push(`login:${loginName}`);
    if (email) keys.push(`mail:${email}`);
    if (personalNumber) keys.push(`pn:${personalNumber}`);
    if (draft.type === 'system' && displayName) keys.push(`system-name:${displayName}`);
    if (draft.type === 'system' && rawId) keys.push(`system-id:${rawId}`);
    if (!keys.length && displayName) keys.push(`name:${displayName}`);
    return keys.length ? keys : [`idx:${draft.sourceKey}:${draft.fallbackIndex}`];
};

const createDraftRow = ({ raw, sourceKey, roleLabel, updatedAt, fallbackIndex, ownersGroupTitle }) => {
    const normalized = normalizeAdminRecord(raw || {}, fallbackIndex);
    const loginName = String(raw?.LoginName ?? raw?.loginName ?? normalized.loginName ?? '').trim();
    const email = String(raw?.Email ?? raw?.email ?? normalized.email ?? extractEmail(loginName) ?? '').trim();
    const personalNumber = String(normalized.personalNumber || extractPersonalNumber(loginName) || extractPersonalNumber(email) || '').trim();
    const rawId = getRawId(raw);
    const type = getPrincipalKind(raw || normalized);
    const displayName = String(raw?.Title ?? raw?.name ?? normalized.name ?? '').trim()
        || email
        || loginName
        || (type === 'group' ? 'SharePoint Group' : 'משתמש');

    return {
        key: '',
        type,
        displayName,
        email,
        personalNumber,
        loginName,
        rawId,
        sourceKey,
        fallbackIndex,
        sources: [SOURCE_LABELS[sourceKey] || sourceKey],
        sourceKeys: [sourceKey],
        roles: [roleLabel],
        status: [],
        warnings: [],
        errors: [],
        rawBySource: { [sourceKey]: raw },
        idsBySource: { [sourceKey]: rawId },
        lastChecked: updatedAt,
        ownersGroupTitle,
        duplicateCount: 1,
    };
};

const typeRank = { user: 1, group: 2, system: 3, diagnostic: 4 };

const mergeDraftRows = (drafts) => {
    const rows = [];
    const keyIndex = new Map();

    drafts.forEach((draft) => {
        const keys = makeIdentityKeys(draft);
        const existingIndex = keys.map((key) => keyIndex.get(key)).find((index) => index !== undefined);

        if (existingIndex === undefined) {
            const next = {
                ...draft,
                key: keys[0],
                identityKeys: keys,
            };
            rows.push(next);
            keys.forEach((key) => keyIndex.set(key, rows.length - 1));
            return;
        }

        const existing = rows[existingIndex];
        const nextKeys = unique([...(existing.identityKeys || []), ...keys]);
        rows[existingIndex] = {
            ...existing,
            type: typeRank[draft.type] > typeRank[existing.type] ? draft.type : existing.type,
            displayName: existing.displayName && existing.displayName !== 'משתמש' ? existing.displayName : draft.displayName,
            email: existing.email || draft.email,
            personalNumber: existing.personalNumber || draft.personalNumber,
            loginName: existing.loginName || draft.loginName,
            rawId: existing.rawId || draft.rawId,
            sources: unique([...existing.sources, ...draft.sources]),
            sourceKeys: unique([...existing.sourceKeys, ...draft.sourceKeys]),
            roles: unique([...existing.roles, ...draft.roles]),
            rawBySource: { ...existing.rawBySource, ...draft.rawBySource },
            idsBySource: { ...existing.idsBySource, ...draft.idsBySource },
            lastChecked: existing.lastChecked || draft.lastChecked,
            ownersGroupTitle: existing.ownersGroupTitle || draft.ownersGroupTitle,
            duplicateCount: existing.duplicateCount + 1,
            identityKeys: nextKeys,
        };
        nextKeys.forEach((key) => keyIndex.set(key, existingIndex));
    });

    return rows.map((row) => {
        const status = [];
        const warnings = [...row.warnings];

        if (row.sourceKeys.includes('site-admins')) status.push({ tone: 'ok', label: 'Site Collection Admin' });
        if (row.sourceKeys.includes('owners')) status.push({ tone: 'ok', label: 'Site Owner' });
        if (row.sourceKeys.includes('current')) status.push({ tone: 'neutral', label: 'Current Manager' });
        if (row.type === 'group') status.push({ tone: 'neutral', label: 'Group principal' });
        if (row.type === 'system') status.push({ tone: 'warn', label: 'System account' });
        if (row.sourceKeys.includes('site-admins') && !row.sourceKeys.includes('current') && row.type === 'user') {
            status.push({ tone: 'warn', label: 'Missing from current managers' });
            warnings.push('Site Collection Admin not present in current managers list');
        }
        if (row.duplicateCount > 1) {
            status.push({ tone: 'neutral', label: 'Deduplicated' });
        }

        return {
            ...row,
            status,
            warnings,
            hasWarnings: warnings.length > 0 || row.errors.length > 0,
        };
    });
};

function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-2xl' }) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className={`flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#171b24]`}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:text-slate-300"
                        aria-label="סגור"
                    >
                        <X size={16} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

function TypeBadge({ type }) {
    const meta = TYPE_META[type] || TYPE_META.user;
    const Icon = meta.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${meta.className}`}>
            <Icon size={13} />
            {meta.label}
        </span>
    );
}

function StatusBadges({ statuses }) {
    if (!statuses?.length) {
        return <span className="text-slate-400">-</span>;
    }
    return (
        <div className="flex flex-wrap gap-1.5">
            {statuses.map((status) => (
                <span key={`${status.tone}-${status.label}`} className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_CLASSES[status.tone] || STATUS_CLASSES.neutral}`}>
                    {status.label}
                </span>
            ))}
        </div>
    );
}

export default function AdminAdminsSync() {
    const [currentManagersSource, setCurrentManagersSource] = useState(defaultPermissionSource);
    const [siteCollectionAdminsSource, setSiteCollectionAdminsSource] = useState(defaultPermissionSource);
    const [ownersSource, setOwnersSource] = useState(defaultPermissionSource);
    const [currentUser, setCurrentUser] = useState(null);
    const [actionBusyKey, setActionBusyKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [logsModalOpen, setLogsModalOpen] = useState(false);
    const [addTarget, setAddTarget] = useState('site-admin');
    const [addIdentity, setAddIdentity] = useState('');
    const [resolvedPreview, setResolvedPreview] = useState(null);
    const [resolvedPreviewInput, setResolvedPreviewInput] = useState('');
    const [resolvingPreview, setResolvingPreview] = useState(false);
    const [actionLogs, setActionLogs] = useState([]);

    const appendActionLogs = useCallback((logs) => {
        if (!Array.isArray(logs) || logs.length === 0) return;
        setActionLogs((prev) => [...prev, ...logs].slice(-300));
    }, []);

    const refreshSiteCollectionAdmins = useCallback(async () => {
        setSiteCollectionAdminsSource((prev) => ({ ...prev, loading: true, error: '' }));
        const logs = [];
        try {
            const rows = await listSiteCollectionAdmins(logs);
            const safeRows = Array.isArray(rows) ? rows : [];
            setSiteCollectionAdminsSource({
                loading: false,
                rows: safeRows,
                error: '',
                updatedAt: new Date().toISOString(),
                logs,
                extra: {},
            });
            return safeRows;
        } catch (err) {
            setSiteCollectionAdminsSource((prev) => ({
                ...prev,
                loading: false,
                error: err?.message || 'טעינת מנהלי אוסף אתרים נכשלה.',
                logs,
            }));
            return [];
        }
    }, []);

    const refreshCurrentSiteAdmins = useCallback(async () => {
        setCurrentManagersSource((prev) => ({ ...prev, loading: true, error: '' }));
        const logs = [];
        try {
            const rows = await listTxtAdmins(logs);
            const safeRows = Array.isArray(rows) ? rows : [];
            setCurrentManagersSource({
                loading: false,
                rows: safeRows,
                error: '',
                updatedAt: new Date().toISOString(),
                logs,
                extra: {},
            });
            return safeRows;
        } catch (err) {
            setCurrentManagersSource((prev) => ({
                ...prev,
                loading: false,
                error: err?.message || 'טעינת מנהלי האתר הנוכחיים נכשלה.',
                logs,
            }));
            return [];
        }
    }, []);

    const refreshOwners = useCallback(async () => {
        setOwnersSource((prev) => ({ ...prev, loading: true, error: '' }));
        const logs = [];
        try {
            const result = await listAssociatedOwnersGroupUsers(logs);
            if (!result?.ok) {
                setOwnersSource((prev) => ({
                    ...prev,
                    loading: false,
                    error: result?.userMessage || 'טעינת בעלי האתר נכשלה.',
                    logs: result?.logs || logs,
                    extra: {},
                }));
                return [];
            }

            const rows = Array.isArray(result.users) ? result.users : [];
            setOwnersSource({
                loading: false,
                rows,
                error: '',
                updatedAt: new Date().toISOString(),
                logs: result.logs || logs,
                extra: {
                    ownersGroupId: result.ownersGroupId,
                    ownersGroupTitle: result.ownersGroupTitle,
                },
            });
            return rows;
        } catch (err) {
            setOwnersSource((prev) => ({
                ...prev,
                loading: false,
                error: err?.message || 'טעינת בעלי האתר נכשלה.',
                logs,
            }));
            return [];
        }
    }, []);

    const refreshCurrentUser = useCallback(async () => {
        const logs = [];
        try {
            const user = await getCurrentSharePointUser(logs);
            setCurrentUser(user || null);
        } catch {
            setCurrentUser(null);
        } finally {
            appendActionLogs(logs);
        }
    }, [appendActionLogs]);

    const loadAdmins = useCallback(async () => {
        setLoading(true);
        setError('');
        await Promise.all([
            refreshSiteCollectionAdmins(),
            refreshCurrentSiteAdmins(),
            refreshOwners(),
            refreshCurrentUser(),
        ]);
        setLoading(false);
    }, [refreshCurrentSiteAdmins, refreshCurrentUser, refreshOwners, refreshSiteCollectionAdmins]);

    useEffect(() => {
        loadAdmins();
    }, [loadAdmins]);

    const sourceErrors = useMemo(() => [
        currentManagersSource.error && { source: SOURCE_LABELS.current, message: currentManagersSource.error },
        siteCollectionAdminsSource.error && { source: SOURCE_LABELS['site-admins'], message: siteCollectionAdminsSource.error },
        ownersSource.error && { source: SOURCE_LABELS.owners, message: ownersSource.error },
    ].filter(Boolean), [currentManagersSource.error, ownersSource.error, siteCollectionAdminsSource.error]);

    const tableRows = useMemo(() => {
        const drafts = [
            ...currentManagersSource.rows.map((row, index) => createDraftRow({
                raw: row,
                sourceKey: 'current',
                roleLabel: 'Current SharePoint Manager',
                updatedAt: currentManagersSource.updatedAt,
                fallbackIndex: index,
            })),
            ...siteCollectionAdminsSource.rows.map((row, index) => createDraftRow({
                raw: row,
                sourceKey: 'site-admins',
                roleLabel: 'Site Collection Admin',
                updatedAt: siteCollectionAdminsSource.updatedAt,
                fallbackIndex: index,
            })),
            ...ownersSource.rows.map((row, index) => createDraftRow({
                raw: row,
                sourceKey: 'owners',
                roleLabel: 'Site Owner',
                updatedAt: ownersSource.updatedAt,
                fallbackIndex: index,
                ownersGroupTitle: ownersSource.extra?.ownersGroupTitle,
            })),
        ];

        return mergeDraftRows(drafts).sort((a, b) => {
            const rankDiff = typeRank[b.type] - typeRank[a.type];
            if (rankDiff) return rankDiff;
            return a.displayName.localeCompare(b.displayName, 'he');
        });
    }, [currentManagersSource.rows, currentManagersSource.updatedAt, ownersSource.extra?.ownersGroupTitle, ownersSource.rows, ownersSource.updatedAt, siteCollectionAdminsSource.rows, siteCollectionAdminsSource.updatedAt]);

    const warningRows = useMemo(() => [
        ...tableRows.filter((row) => row.hasWarnings),
        ...sourceErrors.map((entry, index) => ({
            key: `source-error-${index}`,
            type: 'diagnostic',
            displayName: entry.source,
            email: '',
            personalNumber: '',
            loginName: '',
            roles: ['Error/Warning'],
            sources: [entry.source],
            sourceKeys: ['warnings'],
            status: [{ tone: 'error', label: entry.message }],
            warnings: [entry.message],
            errors: [entry.message],
            rawBySource: {},
            idsBySource: {},
            lastChecked: new Date().toISOString(),
            hasWarnings: true,
        })),
    ], [sourceErrors, tableRows]);

    const filterCounts = useMemo(() => ({
        all: tableRows.length,
        owners: tableRows.filter((row) => row.sourceKeys.includes('owners')).length,
        'site-admins': tableRows.filter((row) => row.sourceKeys.includes('site-admins')).length,
        current: tableRows.filter((row) => row.sourceKeys.includes('current')).length,
        groups: tableRows.filter((row) => row.type === 'group').length,
        system: tableRows.filter((row) => row.type === 'system').length,
        warnings: warningRows.length,
    }), [tableRows, warningRows.length]);

    const visibleRows = useMemo(() => {
        const baseRows = filter === 'warnings'
            ? warningRows
            : tableRows.filter((row) => {
                if (filter === 'owners') return row.sourceKeys.includes('owners');
                if (filter === 'site-admins') return row.sourceKeys.includes('site-admins');
                if (filter === 'current') return row.sourceKeys.includes('current');
                if (filter === 'groups') return row.type === 'group';
                if (filter === 'system') return row.type === 'system';
                return true;
            });

        const query = normalizeText(searchTerm);
        if (!query) return baseRows;
        return baseRows.filter((row) => [
            row.displayName,
            row.email,
            row.personalNumber,
            row.loginName,
            row.sources?.join(' '),
            row.roles?.join(' '),
            row.status?.map((status) => status.label).join(' '),
        ].some((value) => normalizeText(value).includes(query)));
    }, [filter, searchTerm, tableRows, warningRows]);

    const missingFromSite = useMemo(
        () => tableRows.filter((row) => row.type === 'user' && row.sourceKeys.includes('site-admins') && !row.sourceKeys.includes('current')),
        [tableRows],
    );

    const isSynced = filterCounts['site-admins'] > 0 && missingFromSite.length === 0;
    const actionBusy = syncing || Boolean(actionBusyKey);
    const combinedLogs = useMemo(
        () => [
            ...currentManagersSource.logs,
            ...siteCollectionAdminsSource.logs,
            ...ownersSource.logs,
            ...actionLogs,
        ].slice(-500),
        [actionLogs, currentManagersSource.logs, ownersSource.logs, siteCollectionAdminsSource.logs],
    );

    const normalizedAddIdentity = useMemo(() => normalizeSharePointIdentityInput(addIdentity), [addIdentity]);

    const resetAddModal = () => {
        setAddIdentity('');
        setAddTarget('site-admin');
        setResolvedPreview(null);
        setResolvedPreviewInput('');
    };

    const handleOpenAddModal = () => {
        setError('');
        setMessage('');
        setAddModalOpen(true);
    };

    const handleCloseAddModal = () => {
        if (actionBusyKey === 'add-admin' || resolvingPreview) return;
        setAddModalOpen(false);
        resetAddModal();
    };

    const handleSync = async () => {
        setSyncing(true);
        setError('');
        setMessage('');
        const logs = [];
        addAdminLogEntry(logs, '[AdminAdminsSync]', 'info', 'sync-start', 'Admin sync started', {
            source: 'Site Collection Admins',
            target: 'Current SharePoint Managers',
        });
        try {
            const result = await syncSiteCollectionAdminsToTxtAdmins(logs);
            addAdminLogEntry(logs, '[AdminAdminsSync]', 'info', 'sync-end', 'Admin sync completed', {
                changed: result?.changed,
                beforeCount: result?.beforeCount,
                afterCount: result?.afterCount,
            });
            appendActionLogs(logs);
            await loadAdmins();
            setMessage(result?.changed ? 'הסנכרון הושלם ורשימת מנהלי האתר עודכנה.' : 'הסנכרון אושר. לא נדרשו שינויים.');
        } catch (err) {
            addAdminLogEntry(logs, '[AdminAdminsSync]', 'error', 'sync-end', 'Admin sync failed', {
                error: err?.message || String(err),
            });
            appendActionLogs(logs);
            setError(err?.message || 'סנכרון המנהלים נכשל.');
            setLogsModalOpen(true);
        } finally {
            setSyncing(false);
        }
    };

    const handleResolvePreview = async () => {
        const normalized = normalizeSharePointIdentityInput(addIdentity);
        if (!normalized.ok) {
            setError(normalized.message);
            return;
        }

        setResolvingPreview(true);
        setError('');
        setMessage('');
        const logs = [];
        try {
            const ensured = await ensureUserByIdentity(addIdentity, logs);
            appendActionLogs(logs);
            setResolvedPreview(ensured);
            setResolvedPreviewInput(addIdentity);
            setMessage('המשתמש זוהה ב-SharePoint. ניתן להמשיך להוספה.');
        } catch (err) {
            appendActionLogs(logs);
            setResolvedPreview(null);
            setResolvedPreviewInput('');
            setError(mapSharePointErrorToHebrewMessage(err));
            setLogsModalOpen(true);
        } finally {
            setResolvingPreview(false);
        }
    };

    const handleAddAdmin = async (event) => {
        event.preventDefault();
        const normalized = normalizeSharePointIdentityInput(addIdentity);
        if (!normalized.ok) {
            setError(normalized.message);
            return;
        }

        setActionBusyKey('add-admin');
        setError('');
        setMessage('');
        const logs = [];
        const successes = [];
        const failures = [];
        let ensuredUser = resolvedPreviewInput === addIdentity ? resolvedPreview : null;

        try {
            const shouldAddSiteAdmin = addTarget === 'site-admin' || addTarget === 'both';
            const shouldAddOwner = addTarget === 'owner' || addTarget === 'both';

            if (shouldAddSiteAdmin) {
                const siteResult = await addSiteCollectionAdminByIdentity(addIdentity, logs);
                if (!siteResult?.ok) {
                    failures.push(siteResult?.userMessage || 'הוספה למנהלי אוסף אתרים נכשלה.');
                } else {
                    successes.push('נוסף למנהלי אוסף אתרים');
                    ensuredUser = siteResult.ensuredUser || ensuredUser;
                }
            }

            if (shouldAddOwner) {
                if (!ensuredUser?.LoginName) {
                    ensuredUser = await ensureUserByIdentity(addIdentity, logs);
                }
                const loginName = String(ensuredUser?.LoginName || '').trim();
                if (!loginName) {
                    failures.push('SharePoint זיהה משתמש אך לא החזיר LoginName.');
                } else {
                    const ownerResult = await addUserToAssociatedOwnersGroupByLoginName(loginName, logs);
                    if (!ownerResult?.ok) {
                        failures.push(ownerResult?.userMessage || 'הוספה לבעלי האתר נכשלה.');
                    } else {
                        successes.push('נוסף לבעלי האתר');
                    }
                }
            }

            appendActionLogs(logs);
            if (failures.length && successes.length) {
                setMessage(`הצלחה חלקית: ${successes.join(', ')}`);
                setError(`שגיאות: ${failures.join(' | ')}`);
                setLogsModalOpen(true);
            } else if (failures.length) {
                setError(failures.join(' | '));
                setLogsModalOpen(true);
            } else {
                setMessage(`בוצע בהצלחה: ${successes.join(', ')}`);
                setAddModalOpen(false);
                resetAddModal();
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'הוספת מנהל נכשלה.');
            setLogsModalOpen(true);
        } finally {
            await Promise.all([refreshSiteCollectionAdmins(), refreshOwners(), refreshCurrentSiteAdmins(), refreshCurrentUser()]);
            setActionBusyKey('');
        }
    };

    const handleRemoveSiteCollectionAdmin = async (row) => {
        const raw = row.rawBySource?.['site-admins'] || row;
        const userId = Number(row.idsBySource?.['site-admins'] || raw?.Id || 0);
        if (!userId) return;

        setError('');
        setMessage('');
        const currentUserId = Number(currentUser?.Id || 0);
        if (currentUserId && currentUserId === userId) {
            setError('לא ניתן להסיר את עצמך ממנהלי אוסף אתרים.');
            return;
        }
        if ((siteCollectionAdminsSource.rows || []).length <= 1) {
            setError('לא ניתן להסיר את מנהל אוסף האתרים האחרון.');
            return;
        }
        if (!window.confirm(`האם להסיר את ${getSharePointPersonLabel(raw)} ממנהלי אוסף אתרים?`)) return;

        const busyKey = `remove-site-admin-${userId}`;
        const logs = [];
        setActionBusyKey(busyKey);
        try {
            const result = await removeSiteCollectionAdmin(userId, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'הסרת מנהל אוסף אתרים נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש הוסר ממנהלי אוסף אתרים.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'הסרת מנהל אוסף אתרים נכשלה.');
            setLogsModalOpen(true);
        } finally {
            await Promise.all([refreshSiteCollectionAdmins(), refreshCurrentUser()]);
            setActionBusyKey('');
        }
    };

    const handleRemoveOwner = async (row) => {
        const raw = row.rawBySource?.owners || row;
        const userId = Number(row.idsBySource?.owners || raw?.Id || 0);
        if (!userId) return;

        setError('');
        setMessage('');
        if (!window.confirm(`האם להסיר את ${getSharePointPersonLabel(raw)} מבעלי האתר?`)) return;

        const busyKey = `remove-owner-${userId}`;
        const logs = [];
        setActionBusyKey(busyKey);
        try {
            const result = await removeUserFromAssociatedOwnersGroup(userId, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'הסרת המשתמש מבעלי האתר נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש הוסר מבעלי האתר.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'הסרת המשתמש מבעלי האתר נכשלה.');
            setLogsModalOpen(true);
        } finally {
            await refreshOwners();
            setActionBusyKey('');
        }
    };

    const handleSyncRowToTxt = async (row) => {
        if (row.type !== 'user') {
            setError('קבוצות וחשבונות מערכת אינם מסונכרנים לקובץ המנהלים.');
            return;
        }

        const raw = row.rawBySource?.['site-admins'] || row.rawBySource?.owners || row;
        const logs = [];
        setActionBusyKey(`sync-txt-${row.key}`);
        setError('');
        setMessage('');
        try {
            const result = await addTxtAdminFromSharePointUser(raw, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError('סנכרון לקובץ המנהלים נכשל.');
                setLogsModalOpen(true);
            } else if (!result.changed) {
                setMessage('המשתמש כבר קיים בקובץ המנהלים.');
            } else {
                setMessage('המשתמש נוסף לקובץ המנהלים.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'סנכרון לקובץ המנהלים נכשל.');
            setLogsModalOpen(true);
        } finally {
            await refreshCurrentSiteAdmins();
            setActionBusyKey('');
        }
    };

    const getPreferredIdentityForRow = (row) => row.loginName || row.email || row.personalNumber || '';

    const handleAddRowToSiteAdmins = async (row) => {
        const identity = getPreferredIdentityForRow(row);
        if (!identity) {
            setError('לא נמצא מזהה מתאים למשתמש.');
            return;
        }

        const logs = [];
        setActionBusyKey(`add-site-admin-${row.key}`);
        setError('');
        setMessage('');
        try {
            const result = await addSiteCollectionAdminByIdentity(identity, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'הוספה למנהלי אוסף אתרים נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש נוסף למנהלי אוסף אתרים.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'הוספה למנהלי אוסף אתרים נכשלה.');
            setLogsModalOpen(true);
        } finally {
            await refreshSiteCollectionAdmins();
            setActionBusyKey('');
        }
    };

    const handleAddRowToOwners = async (row) => {
        if (row.type !== 'user') {
            setError('ניתן להוסיף לבעלי האתר משתמשים בלבד דרך פעולה זו.');
            return;
        }
        const identity = getPreferredIdentityForRow(row);
        if (!identity) {
            setError('לא נמצא LoginName או מזהה מתאים למשתמש.');
            return;
        }

        const logs = [];
        setActionBusyKey(`add-owner-${row.key}`);
        setError('');
        setMessage('');
        try {
            const ensured = row.loginName ? { LoginName: row.loginName } : await ensureUserByIdentity(identity, logs);
            const loginName = String(ensured?.LoginName || '').trim();
            if (!loginName) throw new Error('SharePoint לא החזיר LoginName למשתמש.');
            const result = await addUserToAssociatedOwnersGroupByLoginName(loginName, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'הוספה לבעלי האתר נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש נוסף לבעלי האתר.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'הוספה לבעלי האתר נכשלה.');
            setLogsModalOpen(true);
        } finally {
            await refreshOwners();
            setActionBusyKey('');
        }
    };

    const handleCopyLogs = async () => {
        if (!combinedLogs.length) return;
        try {
            await navigator.clipboard.writeText(formatAdminLogsAsText(combinedLogs));
            setMessage('הלוגים הועתקו ללוח.');
            setError('');
        } catch {
            setError('העתקת הלוגים נכשלה.');
        }
    };

    const handleExportLogs = () => {
        downloadTextFile(`sharepoint-admin-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.log`, formatAdminLogsAsText(combinedLogs));
    };

    const clearLogs = () => {
        setActionLogs([]);
        setCurrentManagersSource((prev) => ({ ...prev, logs: [] }));
        setSiteCollectionAdminsSource((prev) => ({ ...prev, logs: [] }));
        setOwnersSource((prev) => ({ ...prev, logs: [] }));
    };

    const renderActions = (row) => {
        if (row.type === 'diagnostic') {
            return <span className="text-xs text-slate-400">פתח לוגים</span>;
        }

        const isBusy = actionBusyKey.includes(row.key)
            || actionBusyKey === `remove-site-admin-${row.idsBySource?.['site-admins']}`
            || actionBusyKey === `remove-owner-${row.idsBySource?.owners}`;
        const disableUserWrite = actionBusy || row.type !== 'user';
        return (
            <div className="flex min-w-[260px] flex-wrap gap-1.5">
                {row.sourceKeys.includes('site-admins') && row.idsBySource?.['site-admins'] ? (
                    <button
                        type="button"
                        onClick={() => handleRemoveSiteCollectionAdmin(row)}
                        disabled={actionBusy}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                    >
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        הסר SCA
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => handleAddRowToSiteAdmins(row)}
                        disabled={disableUserWrite}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                    >
                        <Shield size={13} />
                        הוסף SCA
                    </button>
                )}

                {row.sourceKeys.includes('owners') && row.idsBySource?.owners ? (
                    <button
                        type="button"
                        onClick={() => handleRemoveOwner(row)}
                        disabled={actionBusy}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-wait disabled:opacity-60 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20"
                    >
                        {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        הסר בעלים
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => handleAddRowToOwners(row)}
                        disabled={disableUserWrite}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                    >
                        <Users size={13} />
                        הוסף בעלים
                    </button>
                )}

                {!row.sourceKeys.includes('current') && row.type === 'user' && (
                    <button
                        type="button"
                        onClick={() => handleSyncRowToTxt(row)}
                        disabled={actionBusy}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                    >
                        <FileText size={13} />
                        הוסף לקובץ
                    </button>
                )}
            </div>
        );
    };

    return (
        <div dir="rtl" className="min-h-full bg-slate-100/70 px-4 py-5 font-heebo text-slate-900 dark:bg-[#0f172a] dark:text-slate-100 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <section className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-white/10 dark:bg-[#171b24] sm:px-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white shadow-md shadow-primary/25">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">סנכרון מנהלי SharePoint</h1>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                        טבלת ניהול אחת למנהלי אוסף אתרים, בעלי האתר, קבוצות, חשבונות מערכת ומנהלי האתר הנוכחיים.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                                    Owners group: <span className="font-bold text-slate-700 dark:text-slate-200">{ownersSource.extra?.ownersGroupTitle || '-'}</span>
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                                    Group ID: <span className="font-bold text-slate-700 dark:text-slate-200">{ownersSource.extra?.ownersGroupId || '-'}</span>
                                </span>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={handleOpenAddModal}
                                disabled={loading || actionBusy}
                                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                            >
                                <UserPlus size={16} />
                                הוסף מנהל
                            </button>
                            <button
                                type="button"
                                onClick={loadAdmins}
                                disabled={loading || actionBusy}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                            >
                                {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                רענון
                            </button>
                            <button
                                type="button"
                                onClick={handleSync}
                                disabled={loading || actionBusy}
                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-70 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100"
                            >
                                {syncing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                אשר סנכרון
                            </button>
                            <button
                                type="button"
                                onClick={() => setLogsModalOpen(true)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                            >
                                <Eye size={16} />
                                View logs
                            </button>
                        </div>
                    </div>
                </section>

                {(message || error) && (
                    <div className={`rounded-xl border px-4 py-3 shadow-sm ${
                        error
                            ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100'
                    }`}>
                        <div className="flex items-start gap-2">
                            {error ? <AlertTriangle className="mt-0.5 shrink-0" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={18} />}
                            <span className="text-sm font-semibold">{error || message}</span>
                        </div>
                    </div>
                )}

                <section className={`rounded-xl border px-4 py-3 shadow-sm ${
                    isSynced
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100'
                        : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100'
                }`}>
                    <div className="flex items-start gap-2">
                        {isSynced ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <AlertTriangle className="mt-0.5 shrink-0" size={18} />}
                        <div className="text-sm font-semibold">
                            {loading
                                ? 'בודק סטטוס סנכרון...'
                                : isSynced
                                    ? 'כל מנהלי אוסף האתרים קיימים גם ברשימת המנהלים הנוכחית.'
                                    : `נמצאו ${missingFromSite.length} מנהלי אוסף אתרים שאינם מופיעים ברשימת המנהלים הנוכחית.`}
                        </div>
                    </div>
                </section>

                <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#171b24]">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap gap-2">
                                {FILTERS.map((item) => {
                                    const active = filter === item.key;
                                    const count = filterCounts[item.key] || 0;
                                    return (
                                        <button
                                            key={item.key}
                                            type="button"
                                            onClick={() => setFilter(item.key)}
                                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-black transition ${
                                                active
                                                    ? 'border-primary bg-primary text-white shadow-sm shadow-primary/20'
                                                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-primary/40 hover:text-primary dark:border-white/10 dark:bg-white/5 dark:text-slate-200'
                                            }`}
                                        >
                                            {item.label}
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] ${active ? 'bg-white/20 text-white' : 'bg-white text-slate-500 dark:bg-slate-900 dark:text-slate-300'}`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <label className="relative block min-w-0 xl:w-72">
                                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="search"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="חיפוש לפי שם, מייל, LoginName או מקור"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-9 pl-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-white/10"
                                />
                            </label>
                        </div>
                    </div>

                    <div className="overflow-auto">
                        <table className="w-full min-w-[1180px] text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                                    <th className="px-4 py-3 text-right">Type</th>
                                    <th className="px-4 py-3 text-right">Display name</th>
                                    <th className="px-4 py-3 text-right">Personal number / email</th>
                                    <th className="px-4 py-3 text-right">Login name</th>
                                    <th className="px-4 py-3 text-right">Source / Role</th>
                                    <th className="px-4 py-3 text-right">Status</th>
                                    <th className="px-4 py-3 text-right">Last synced / checked</th>
                                    <th className="px-4 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/10">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                                            <div className="inline-flex items-center gap-2">
                                                <Loader2 className="animate-spin text-primary" size={20} />
                                                טוען נתונים מ-SharePoint ומהמערכת...
                                            </div>
                                        </td>
                                    </tr>
                                ) : visibleRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
                                            לא נמצאו רשומות להצגה במסנן הנוכחי.
                                        </td>
                                    </tr>
                                ) : visibleRows.map((row) => (
                                    <tr key={row.key} className="align-top transition hover:bg-primary/5 dark:hover:bg-primary/10">
                                        <td className="px-4 py-3">
                                            <TypeBadge type={row.type} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-bold text-slate-900 dark:text-white">{row.displayName || '-'}</div>
                                            {row.duplicateCount > 1 && (
                                                <div className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                    מוזג מ-{row.duplicateCount} מקורות/רשומות
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300" dir="ltr">
                                            <div>{row.personalNumber || '-'}</div>
                                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{row.email || '-'}</div>
                                        </td>
                                        <td className="max-w-[280px] px-4 py-3 text-slate-600 dark:text-slate-300" dir="ltr">
                                            <div className="whitespace-normal break-words text-left">{row.loginName || '-'}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="space-y-1">
                                                <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{row.sources.join(' + ') || '-'}</div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400">{row.roles.join(' + ') || '-'}</div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusBadges statuses={row.status} />
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400" dir="ltr">
                                            {formatDateTime(row.lastChecked)}
                                        </td>
                                        <td className="px-4 py-3">
                                            {renderActions(row)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            <Modal isOpen={addModalOpen} onClose={handleCloseAddModal} title="הוספת מנהל SharePoint">
                <form onSubmit={handleAddAdmin} className="flex-1 overflow-y-auto p-5">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="admin-identity-input" className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                מספר אישי, מייל צבאי או LoginName
                            </label>
                            <input
                                id="admin-identity-input"
                                type="text"
                                value={addIdentity}
                                onChange={(event) => {
                                    setAddIdentity(event.target.value);
                                    setResolvedPreview(null);
                                    setResolvedPreviewInput('');
                                }}
                                placeholder="s1234567 / s1234567@army.idf.il / i:0#.f|membership|..."
                                disabled={actionBusyKey === 'add-admin' || resolvingPreview}
                                dir="ltr"
                                className="mt-2 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-white/10"
                            />
                            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                                {normalizedAddIdentity.ok ? (
                                    <div className="space-y-1">
                                        <div>Normalized: <span dir="ltr" className="font-bold">{normalizedAddIdentity.label}</span></div>
                                        <div>Type: <span className="font-bold">{normalizedAddIdentity.kind}</span></div>
                                    </div>
                                ) : (
                                    <span>{normalizedAddIdentity.message}</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Target type</div>
                            <div className="grid gap-2 sm:grid-cols-3">
                                {TARGET_OPTIONS.map((option) => (
                                    <label
                                        key={option.value}
                                        className={`cursor-pointer rounded-lg border p-3 transition ${
                                            addTarget === option.value
                                                ? 'border-primary bg-primary/10 text-primary dark:border-primary/60 dark:bg-primary/15'
                                                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-primary/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-200'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            className="sr-only"
                                            checked={addTarget === option.value}
                                            onChange={() => setAddTarget(option.value)}
                                            disabled={actionBusyKey === 'add-admin'}
                                        />
                                        <div className="text-sm font-black">{option.label}</div>
                                        <div className="mt-1 text-xs opacity-80">{option.description}</div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-sm font-black text-slate-900 dark:text-white">Resolved identity preview</div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        הבדיקה משתמשת ב-SharePoint ensureuser ומציגה את המשתמש שיתווסף.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleResolvePreview}
                                    disabled={!normalizedAddIdentity.ok || resolvingPreview || actionBusyKey === 'add-admin'}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                                >
                                    {resolvingPreview ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                                    בדוק זיהוי
                                </button>
                            </div>
                            {resolvedPreview ? (
                                <div className="mt-3 grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100 sm:grid-cols-2">
                                    <span>Title: <span className="font-bold">{resolvedPreview.Title || '-'}</span></span>
                                    <span>Email: <span dir="ltr" className="font-bold">{resolvedPreview.Email || '-'}</span></span>
                                    <span>Id: <span dir="ltr" className="font-bold">{resolvedPreview.Id || '-'}</span></span>
                                    <span className="sm:col-span-2">LoginName: <span dir="ltr" className="font-bold">{resolvedPreview.LoginName || '-'}</span></span>
                                </div>
                            ) : (
                                <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                                    עדיין אין זיהוי מאומת.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
                        <button
                            type="button"
                            onClick={handleCloseAddModal}
                            disabled={actionBusyKey === 'add-admin' || resolvingPreview}
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                            ביטול
                        </button>
                        <button
                            type="submit"
                            disabled={!normalizedAddIdentity.ok || actionBusyKey === 'add-admin' || resolvingPreview}
                            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-wait disabled:opacity-70"
                        >
                            {actionBusyKey === 'add-admin' ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                            הוסף
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal isOpen={logsModalOpen} onClose={() => setLogsModalOpen(false)} title="SharePoint admin sync logs" maxWidth="max-w-5xl">
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-white/10">
                        <button
                            type="button"
                            onClick={handleCopyLogs}
                            disabled={!combinedLogs.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                            <Copy size={14} />
                            Copy logs
                        </button>
                        <button
                            type="button"
                            onClick={handleExportLogs}
                            disabled={!combinedLogs.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                            <Download size={14} />
                            Export logs
                        </button>
                        <button
                            type="button"
                            onClick={clearLogs}
                            disabled={!combinedLogs.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                        >
                            <Trash2 size={14} />
                            Clear
                        </button>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{combinedLogs.length} entries</span>
                    </div>
                    <div className="max-h-[68vh] flex-1 overflow-auto bg-slate-950 p-4 text-left text-xs text-slate-100" dir="ltr">
                        {combinedLogs.length === 0 ? (
                            <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-slate-300">No logs yet.</p>
                        ) : combinedLogs.map((entry, index) => (
                            <div key={`${entry.time}-${entry.step}-${index}`} className="mb-4 border-b border-white/10 pb-4 last:mb-0 last:border-b-0 last:pb-0">
                                <div className="flex flex-wrap gap-2 font-semibold text-slate-300">
                                    <span>{entry.time}</span>
                                    <span>{entry.prefix}</span>
                                    <span className={
                                        entry.level === 'error'
                                            ? 'text-red-300'
                                            : entry.level === 'warn'
                                                ? 'text-amber-200'
                                                : 'text-emerald-200'
                                    }>
                                        {entry.level}
                                    </span>
                                    <span>{entry.step}</span>
                                </div>
                                <div className="mt-1 text-slate-100">{entry.message}</div>
                                {entry.data !== undefined && (
                                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/5 p-3 text-slate-300">{formatJson(entry.data)}</pre>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </Modal>
        </div>
    );
}
