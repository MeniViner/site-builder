import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BadgeCheck,
    CheckCircle2,
    Clock3,
    Copy,
    Database,
    Download,
    Eye,
    FileText,
    FolderKey,
    Info,
    KeyRound,
    Loader2,
    Mail,
    MoreVertical,
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
import DismissibleNotice from './DismissibleNotice';
import Tooltip from './Tooltip';

const defaultPermissionSource = {
    loading: false,
    rows: [],
    error: '',
    updatedAt: null,
    logs: [],
    extra: {},
};

const FILTERS = [
    { key: 'all', label: 'הכול' },
    { key: 'site-admins', label: 'בעלי האתר' },
    { key: 'owners', label: 'מנהלי תיקיות' },
    { key: 'current', label: 'מנהלים נוכחיים' },
    { key: 'groups', label: 'קבוצות' },
    { key: 'system', label: 'מערכת' },
    { key: 'warnings', label: 'מידע', iconOnly: true },
];

const TARGET_OPTIONS = [
    { value: 'site-admin', label: 'בעלי האתר', description: 'הוספה לרשימת בעלי האתר' },
    { value: 'owner', label: 'מנהלי תיקיות', description: 'הוספה לקבוצת מנהלי התיקיות' },
    { value: 'both', label: 'שניהם', description: 'הוספה לשתי הקבוצות' },
];

const TYPE_META = {
    user: {
        label: 'משתמש',
        icon: User,
        className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-200',
    },
    group: {
        label: 'קבוצה',
        icon: Users,
        className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-200',
    },
    system: {
        label: 'מערכת',
        icon: Shield,
        className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100',
    },
    diagnostic: {
        label: 'מידע',
        icon: Info,
        className: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100',
    },
};

const STATUS_CLASSES = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100',
    warn: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100',
    error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-100',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200',
};

const SOURCE_LABELS = {
    'site-admins': 'בעלי האתר',
    owners: 'מנהלי תיקיות',
    current: 'מנהלים נוכחיים',
};

const LOG_LEVEL_LABELS = {
    error: 'שגיאה',
    warn: 'אזהרה',
    warning: 'אזהרה',
    info: 'מידע',
    success: 'הצלחה',
};

const IDENTITY_KIND_LABELS = {
    email: 'דוא״ל',
    personalNumber: 'מספר אישי',
    loginName: 'שם כניסה',
};

const localizeUiText = (value) => String(value ?? '')
    .replaceAll('Site Collection Admins', 'בעלי האתר')
    .replaceAll('Site Collection Admin', 'בעל האתר')
    .replaceAll('Site Owners', 'מנהלי תיקיות')
    .replaceAll('Site Owner', 'מנהל תיקיות')
    .replaceAll('Current SharePoint Managers', 'מנהלים נוכחיים')
    .replaceAll('LoginName', 'שם כניסה')
    .replaceAll('Warnings', 'מידע');

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

const getEmailLabel = (row) => row.email || '-';

const getSourceRoleLabel = (row) => [row.sources?.join(' + '), row.roles?.join(' + ')].filter(Boolean).join(' · ') || '-';

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
        || (type === 'group' ? 'קבוצת SharePoint' : 'משתמש');

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

        if (row.sourceKeys.includes('site-admins')) status.push({ tone: 'ok', label: 'בעל האתר' });
        if (row.sourceKeys.includes('owners')) status.push({ tone: 'ok', label: 'מנהל תיקיות' });
        if (row.sourceKeys.includes('current')) status.push({ tone: 'neutral', label: 'מנהל נוכחי' });
        if (row.type === 'group') status.push({ tone: 'neutral', label: 'קבוצת SharePoint' });
        if (row.type === 'system') status.push({ tone: 'warn', label: 'חשבון מערכת' });
        if (row.sourceKeys.includes('site-admins') && !row.sourceKeys.includes('current') && row.type === 'user') {
            status.push({ tone: 'warn', label: 'חסר ברשימת המנהלים' });
            warnings.push('בעל האתר אינו מופיע ברשימת המנהלים הנוכחיים');
        }
        if (row.duplicateCount > 1) {
            status.push({ tone: 'neutral', label: 'רשומה מאוחדת' });
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
    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                className={`flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_24px_70px_-20px_rgba(15,23,42,0.45)] dark:bg-[#171b24] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_24px_70px_-20px_rgba(0,0,0,0.8)]`}
                onMouseDown={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={title}
            >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-white/10">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_1px_2px_rgba(15,23,42,0.05)] transition-[color,transform,box-shadow] hover:text-primary hover:shadow-[0_0_0_1px_hsl(var(--color-primary)/0.35),0_2px_6px_rgba(15,23,42,0.08)] active:scale-[0.96] dark:text-slate-300 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
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
        <span className={`inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs font-bold leading-none ${meta.className}`}>
            <Icon size={13} />
            {meta.label}
        </span>
    );
}

function StatusBadges({ statuses }) {
    if (!statuses?.length) {
        return <span className="text-slate-400">-</span>;
    }
    const [primaryStatus, ...extraStatuses] = statuses;
    const fullLabel = statuses.map((status) => status.label).join(' | ');

    return (
        <div className="flex min-w-0 items-center gap-1.5 overflow-hidden" title={fullLabel}>
            <span className={`inline-flex h-7 min-w-0 max-w-[155px] shrink items-center rounded-full border px-2 text-[11px] font-bold leading-none ${STATUS_CLASSES[primaryStatus.tone] || STATUS_CLASSES.neutral}`}>
                <span className="truncate">{primaryStatus.label}</span>
            </span>
            {extraStatuses.length > 0 && (
                <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-slate-200 bg-white px-2 text-[11px] font-black leading-none text-slate-500 tabular-nums dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                    +{extraStatuses.length}
                </span>
            )}
        </div>
    );
}

function DetailField({ icon, label, value, dir = 'rtl', wide = false }) {
    const Icon = icon;
    return (
        <div className={`rounded-xl bg-slate-50 p-3.5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:bg-white/[0.04] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] ${wide ? 'sm:col-span-2' : ''}`}>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                <Icon size={15} className="text-primary" />
                <span>{label}</span>
            </div>
            <div dir={dir} className={`min-h-5 break-words text-sm font-bold text-slate-900 dark:text-white ${dir === 'ltr' ? 'text-left' : ''}`}>
                {value || '-'}
            </div>
        </div>
    );
}

function RowActionButton({ icon, children, onClick, disabled = false, destructive = false }) {
    const Icon = icon;
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            disabled={disabled}
            className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-right text-sm font-bold transition-[background-color,color,transform] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-45 ${
                destructive
                    ? 'text-red-700 hover:bg-red-50 dark:text-red-200 dark:hover:bg-red-500/10'
                    : 'text-slate-700 hover:bg-primary/10 hover:text-primary dark:text-slate-200 dark:hover:bg-primary/15'
            }`}
        >
            <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${destructive ? 'bg-red-100 dark:bg-red-500/15' : 'bg-slate-100 dark:bg-white/[0.06]'}`}>
                <Icon size={16} />
            </span>
            <span>{children}</span>
        </button>
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
    const [selectedRow, setSelectedRow] = useState(null);
    const [openActionsMenu, setOpenActionsMenu] = useState(null);
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
                error: err?.message || 'טעינת בעלי האתר נכשלה.',
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
                error: err?.message || 'טעינת המנהלים הנוכחיים נכשלה.',
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
                    error: result?.userMessage || 'טעינת מנהלי התיקיות נכשלה.',
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
                error: err?.message || 'טעינת מנהלי התיקיות נכשלה.',
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

    useEffect(() => {
        if (!openActionsMenu) return undefined;
        const closeMenu = () => setOpenActionsMenu(null);
        window.addEventListener('resize', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
        return () => {
            window.removeEventListener('resize', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
        };
    }, [openActionsMenu]);

    const sourceErrors = useMemo(() => [
        currentManagersSource.error && { source: SOURCE_LABELS.current, message: localizeUiText(currentManagersSource.error) },
        siteCollectionAdminsSource.error && { source: SOURCE_LABELS['site-admins'], message: localizeUiText(siteCollectionAdminsSource.error) },
        ownersSource.error && { source: SOURCE_LABELS.owners, message: localizeUiText(ownersSource.error) },
    ].filter(Boolean), [currentManagersSource.error, ownersSource.error, siteCollectionAdminsSource.error]);

    const tableRows = useMemo(() => {
        const drafts = [
            ...currentManagersSource.rows.map((row, index) => createDraftRow({
                raw: row,
                sourceKey: 'current',
                roleLabel: 'מנהל נוכחי',
                updatedAt: currentManagersSource.updatedAt,
                fallbackIndex: index,
            })),
            ...siteCollectionAdminsSource.rows.map((row, index) => createDraftRow({
                raw: row,
                sourceKey: 'site-admins',
                roleLabel: 'בעל האתר',
                updatedAt: siteCollectionAdminsSource.updatedAt,
                fallbackIndex: index,
            })),
            ...ownersSource.rows.map((row, index) => createDraftRow({
                raw: row,
                sourceKey: 'owners',
                roleLabel: 'מנהל תיקיות',
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
            roles: ['מידע מערכת'],
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
    const syncStatusKey = `${loading ? 'loading' : 'ready'}:${isSynced ? 'synced' : 'missing'}:${missingFromSite.length}`;

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
        addAdminLogEntry(logs, '[סנכרון מנהלים]', 'info', 'תחילת סנכרון', 'סנכרון המנהלים התחיל', {
            מקור: 'בעלי האתר',
            יעד: 'מנהלים נוכחיים',
        });
        try {
            const result = await syncSiteCollectionAdminsToTxtAdmins(logs);
            addAdminLogEntry(logs, '[סנכרון מנהלים]', 'info', 'סיום סנכרון', 'סנכרון המנהלים הושלם', {
                בוצע_שינוי: result?.changed,
                כמות_לפני: result?.beforeCount,
                כמות_אחרי: result?.afterCount,
            });
            appendActionLogs(logs);
            await loadAdmins();
            setMessage(result?.changed ? 'הסנכרון הושלם ורשימת מנהלי האתר עודכנה.' : 'הסנכרון אושר. לא נדרשו שינויים.');
        } catch (err) {
            addAdminLogEntry(logs, '[סנכרון מנהלים]', 'error', 'סיום סנכרון', 'סנכרון המנהלים נכשל', {
                שגיאה: err?.message || String(err),
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
                    failures.push(siteResult?.userMessage || 'ההוספה לבעלי האתר נכשלה.');
                } else {
                    successes.push('נוסף לבעלי האתר');
                    ensuredUser = siteResult.ensuredUser || ensuredUser;
                }
            }

            if (shouldAddOwner) {
                if (!ensuredUser?.LoginName) {
                    ensuredUser = await ensureUserByIdentity(addIdentity, logs);
                }
                const loginName = String(ensuredUser?.LoginName || '').trim();
                if (!loginName) {
                    failures.push('SharePoint זיהה משתמש אך לא החזיר שם כניסה.');
                } else {
                    const ownerResult = await addUserToAssociatedOwnersGroupByLoginName(loginName, logs);
                    if (!ownerResult?.ok) {
                        failures.push(ownerResult?.userMessage || 'ההוספה למנהלי התיקיות נכשלה.');
                    } else {
                        successes.push('נוסף למנהלי התיקיות');
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
            setError('לא ניתן להסיר את עצמך מבעלי האתר.');
            return;
        }
        if ((siteCollectionAdminsSource.rows || []).length <= 1) {
            setError('לא ניתן להסיר את בעל האתר האחרון.');
            return;
        }
        if (!window.confirm(`האם להסיר את ${getSharePointPersonLabel(raw)} מבעלי האתר?`)) return;

        const busyKey = `remove-site-admin-${userId}`;
        const logs = [];
        setActionBusyKey(busyKey);
        try {
            const result = await removeSiteCollectionAdmin(userId, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'ההסרה מבעלי האתר נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש הוסר מבעלי האתר.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'ההסרה מבעלי האתר נכשלה.');
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
        if (!window.confirm(`האם להסיר את ${getSharePointPersonLabel(raw)} ממנהלי התיקיות?`)) return;

        const busyKey = `remove-owner-${userId}`;
        const logs = [];
        setActionBusyKey(busyKey);
        try {
            const result = await removeUserFromAssociatedOwnersGroup(userId, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'הסרת המשתמש ממנהלי התיקיות נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש הוסר ממנהלי התיקיות.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'הסרת המשתמש ממנהלי התיקיות נכשלה.');
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
                setError(result?.userMessage || 'ההוספה לבעלי האתר נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש נוסף לבעלי האתר.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'ההוספה לבעלי האתר נכשלה.');
            setLogsModalOpen(true);
        } finally {
            await refreshSiteCollectionAdmins();
            setActionBusyKey('');
        }
    };

    const handleAddRowToOwners = async (row) => {
        if (row.type !== 'user') {
            setError('ניתן להוסיף למנהלי התיקיות משתמשים בלבד דרך פעולה זו.');
            return;
        }
        const identity = getPreferredIdentityForRow(row);
        if (!identity) {
            setError('לא נמצא שם כניסה או מזהה מתאים למשתמש.');
            return;
        }

        const logs = [];
        setActionBusyKey(`add-owner-${row.key}`);
        setError('');
        setMessage('');
        try {
            const ensured = row.loginName ? { LoginName: row.loginName } : await ensureUserByIdentity(identity, logs);
            const loginName = String(ensured?.LoginName || '').trim();
            if (!loginName) throw new Error('SharePoint לא החזיר שם כניסה למשתמש.');
            const result = await addUserToAssociatedOwnersGroupByLoginName(loginName, logs);
            appendActionLogs(logs);
            if (!result?.ok) {
                setError(result?.userMessage || 'ההוספה למנהלי התיקיות נכשלה.');
                setLogsModalOpen(true);
            } else {
                setMessage('המשתמש נוסף למנהלי התיקיות.');
            }
        } catch (err) {
            appendActionLogs(logs);
            setError(err?.message || 'ההוספה למנהלי התיקיות נכשלה.');
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

    const openRowActions = (event, row) => {
        if (openActionsMenu?.row?.key === row.key) {
            setOpenActionsMenu(null);
            return;
        }

        const rect = event.currentTarget.getBoundingClientRect();
        const menuWidth = 248;
        const estimatedMenuHeight = row.type === 'diagnostic' ? 116 : 258;
        const left = Math.max(12, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 12));
        const top = rect.bottom + 8 + estimatedMenuHeight > window.innerHeight
            ? Math.max(12, rect.top - estimatedMenuHeight - 8)
            : rect.bottom + 8;

        setOpenActionsMenu({ row, left, top });
    };

    const handleMenuAction = (callback) => {
        const row = openActionsMenu?.row;
        setOpenActionsMenu(null);
        if (row) callback(row);
    };

    const renderActions = (row) => {
        const isBusy = actionBusyKey.includes(row.key)
            || actionBusyKey === `remove-site-admin-${row.idsBySource?.['site-admins']}`
            || actionBusyKey === `remove-owner-${row.idsBySource?.owners}`;

        return (
            <button
                type="button"
                onClick={(event) => openRowActions(event, row)}
                disabled={actionBusy && !isBusy}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_1px_2px_-1px_rgba(15,23,42,0.08),0_2px_4px_rgba(15,23,42,0.04)] transition-[color,transform,box-shadow] hover:text-primary hover:shadow-[0_0_0_1px_hsl(var(--color-primary)/0.32),0_2px_7px_rgba(15,23,42,0.1)] active:scale-[0.96] disabled:cursor-wait disabled:opacity-50 dark:text-slate-200 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
                aria-label={`פעולות עבור ${row.displayName}`}
                aria-haspopup="menu"
                aria-expanded={openActionsMenu?.row?.key === row.key}
            >
                {isBusy ? <Loader2 size={18} className="animate-spin" /> : <MoreVertical size={19} />}
            </button>
        );
    };

    return (
        <div dir="rtl" className="min-h-full bg-slate-100/70 px-4 py-5 font-heebo text-slate-900 antialiased dark:bg-[#0f172a] dark:text-slate-100 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <section className="rounded-2xl bg-white px-4 py-4 shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_1px_2px_-1px_rgba(15,23,42,0.06),0_5px_16px_-8px_rgba(15,23,42,0.14)] dark:bg-[#171b24] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] sm:px-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white shadow-md shadow-primary/25">
                                    <ShieldCheck size={20} />
                                </div>
                                <div>
                                    <h1 className="text-balance text-2xl font-black tracking-tight text-slate-900 dark:text-white">סנכרון מנהלי האתר</h1>
                                    <p className="mt-1 max-w-3xl text-pretty text-sm text-slate-500 dark:text-slate-400">
                                        ניהול מרוכז של בעלי האתר, מנהלי תיקיות, קבוצות, חשבונות מערכת והמנהלים הנוכחיים.
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                                    קבוצת מנהלי התיקיות: <span className="font-bold text-slate-700 dark:text-slate-200">{ownersSource.extra?.ownersGroupTitle || '-'}</span>
                                </span>
                                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 dark:border-white/10 dark:bg-white/5">
                                    מזהה הקבוצה: <span className="font-bold text-slate-700 dark:text-slate-200">{ownersSource.extra?.ownersGroupId || '-'}</span>
                                </span>
                            </div>
                        </div>

                        <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto xl:max-w-[520px] xl:justify-end xl:shrink-0">
                            <Tooltip text="הוסף מנהל" position="bottom" wrapperClassName="shrink-0">
                                <button
                                    type="button"
                                    onClick={handleOpenAddModal}
                                    disabled={loading || actionBusy}
                                    className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-4 text-sm font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96] disabled:cursor-wait disabled:opacity-70"
                                    aria-label="הוסף מנהל"
                                >
                                    <UserPlus size={16} />
                                    הוסף מנהל
                                </button>
                            </Tooltip>
                            <Tooltip text="רענון נתונים" position="bottom" wrapperClassName="shrink-0">
                                <button
                                    type="button"
                                    onClick={loadAdmins}
                                    disabled={loading || actionBusy}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-[border-color,color,transform] hover:border-primary/40 hover:text-primary active:scale-[0.96] disabled:cursor-wait disabled:opacity-70 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                                    aria-label="רענון נתונים"
                                >
                                    {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                </button>
                            </Tooltip>
                            <Tooltip text="סנכרן פערים" position="bottom" wrapperClassName="shrink-0">
                                <button
                                    type="button"
                                    onClick={handleSync}
                                    disabled={loading || actionBusy}
                                    className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-bold text-emerald-700 transition-[background-color,transform] hover:bg-emerald-100 active:scale-[0.96] disabled:cursor-wait disabled:opacity-70 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100"
                                    aria-label="סנכרן פערים"
                                >
                                    {syncing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                    סנכרן פערים
                                </button>
                            </Tooltip>
                            <Tooltip text="פתיחת לוגים" position="bottom" wrapperClassName="shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setLogsModalOpen(true)}
                                    className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 transition-[border-color,color,transform] hover:border-primary/40 hover:text-primary active:scale-[0.96] dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                                    aria-label="פתיחת לוגים"
                                >
                                    <Eye size={16} />
                                    יומן פעולות
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                </section>

                {(message || error) && (
                    <DismissibleNotice
                        dismissKey={`${error ? 'error' : 'message'}:${error || message}`}
                        onDismiss={() => {
                            setMessage('');
                            setError('');
                        }}
                        className={`rounded-xl border px-4 py-3 shadow-sm ${
                            error
                                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100'
                        }`}
                    >
                        <div className="flex min-w-0 items-start gap-2">
                            {error ? <Info className="mt-0.5 shrink-0" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={18} />}
                            <span className="text-sm font-semibold">{localizeUiText(error || message)}</span>
                        </div>
                    </DismissibleNotice>
                )}

                <DismissibleNotice
                    dismissKey={syncStatusKey}
                    className={`rounded-xl border px-4 py-3 shadow-sm ${
                        isSynced
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100'
                            : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100'
                    }`}
                >
                    <div className="flex min-w-0 items-start gap-2">
                        {isSynced ? <CheckCircle2 className="mt-0.5 shrink-0" size={18} /> : <Info className="mt-0.5 shrink-0" size={18} />}
                        <div className="text-sm font-semibold">
                            {loading
                                ? 'בודק סטטוס סנכרון...'
                                : isSynced
                                    ? 'כל בעלי האתר קיימים גם ברשימת המנהלים הנוכחיים.'
                                    : `נמצאו ${missingFromSite.length} בעלי אתר שאינם מופיעים ברשימת המנהלים הנוכחיים.`}
                        </div>
                    </div>
                </DismissibleNotice>

                <section className="overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.06),0_1px_2px_-1px_rgba(15,23,42,0.06),0_5px_16px_-8px_rgba(15,23,42,0.14)] dark:bg-[#171b24] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
                    <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <div className="inline-flex min-w-0 flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)] dark:bg-white/5 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]" role="tablist" aria-label="סינון מנהלים">
                                    {FILTERS.map((item) => {
                                        const active = filter === item.key;
                                        const count = filterCounts[item.key] || 0;
                                        return (
                                            <button
                                                key={item.key}
                                                type="button"
                                                onClick={() => setFilter(item.key)}
                                                className={`inline-flex h-10 max-w-[154px] shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-black transition-[background-color,color,transform,box-shadow] active:scale-[0.96] ${
                                                    active
                                                        ? 'bg-primary text-white shadow-sm shadow-primary/20'
                                                        : 'text-slate-700 hover:bg-white hover:text-primary dark:text-slate-200 dark:hover:bg-white/10'
                                                }`}
                                                aria-pressed={active}
                                                aria-label={item.iconOnly ? 'מידע והתראות' : item.label}
                                                title={item.iconOnly ? 'מידע והתראות' : undefined}
                                            >
                                                {item.iconOnly ? <Info size={17} aria-hidden="true" /> : <span className="truncate">{item.label}</span>}
                                                <span className={`inline-flex min-w-6 justify-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${active ? 'bg-white/20 text-white' : 'bg-white text-slate-500 shadow-sm dark:bg-slate-950/40 dark:text-slate-300'}`}>
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <label className="relative block min-w-0 xl:w-80">
                                <Search className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input
                                    type="search"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="חיפוש לפי שם, דוא״ל, שם כניסה או מקור"
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-9 pl-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/15 dark:border-white/10 dark:bg-white/5 dark:text-white dark:focus:bg-white/10"
                                />
                            </label>
                        </div>

                    </div>

                    <div className="overflow-auto">
                        <table className="w-full min-w-[920px] table-fixed text-[13px]">
                            <colgroup>
                                <col style={{ width: '8%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '17%' }} />
                                <col style={{ width: '14%' }} />
                                <col style={{ width: '15%' }} />
                                <col style={{ width: '12%' }} />
                                <col style={{ width: '13%' }} />
                                <col style={{ width: '5%' }} />
                            </colgroup>
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-black tracking-wide text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                                    <th className="whitespace-nowrap px-3 py-3 text-right">סוג</th>
                                    <th className="whitespace-nowrap px-3 py-3 text-right">שם תצוגה</th>
                                    <th className="whitespace-nowrap px-3 py-3 text-right">דוא״ל</th>
                                    <th className="whitespace-nowrap px-3 py-3 text-right">שם כניסה</th>
                                    <th className="whitespace-nowrap px-3 py-3 text-right">מקור ותפקיד</th>
                                    <th className="whitespace-nowrap px-3 py-3 text-right">מצב</th>
                                    <th className="whitespace-nowrap px-3 py-3 text-right">בדיקה אחרונה</th>
                                    <th className="px-2 py-3 text-center"><span className="sr-only">פעולות</span></th>
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
                                    <tr key={row.key} className="h-16 align-middle transition-colors hover:bg-primary/5 dark:hover:bg-primary/10">
                                        <td className="px-3 py-2 align-middle">
                                            <TypeBadge type={row.type} />
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                            <div className="flex min-w-0 items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedRow(row)}
                                                    className="min-h-10 min-w-0 flex-1 truncate rounded-lg px-2 text-right font-bold text-slate-900 transition-[background-color,color,transform] hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 active:scale-[0.96] dark:text-white dark:hover:bg-primary/15"
                                                    title={`${row.displayName || '-'} — הצגת פרטים`}
                                                >
                                                    {row.displayName || '-'}
                                                </button>
                                                {row.duplicateCount > 1 && (
                                                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500 tabular-nums dark:bg-white/5 dark:text-slate-300" title={`מוזג מ-${row.duplicateCount} מקורות/רשומות`}>
                                                        x{row.duplicateCount}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-middle text-slate-600 dark:text-slate-300" dir="ltr">
                                            <div className="truncate text-left" title={getEmailLabel(row)}>
                                                {getEmailLabel(row)}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-middle text-slate-600 dark:text-slate-300" dir="ltr">
                                            <div className="truncate text-left" title={row.loginName || '-'}>
                                                {row.loginName || '-'}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                            <div className="truncate text-xs font-bold text-slate-700 dark:text-slate-200" title={getSourceRoleLabel(row)}>
                                                {getSourceRoleLabel(row)}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2 align-middle">
                                            <StatusBadges statuses={row.status} />
                                        </td>
                                        <td className="px-3 py-2 align-middle text-xs text-slate-500 tabular-nums dark:text-slate-400" dir="ltr">
                                            <div className="truncate text-left" title={formatDateTime(row.lastChecked)}>
                                                {formatDateTime(row.lastChecked)}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2 text-center align-middle">
                                            {renderActions(row)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </div>

            {openActionsMenu && (
                <>
                    <button
                        type="button"
                        className="fixed inset-0 z-[11000] cursor-default"
                        onClick={() => setOpenActionsMenu(null)}
                        aria-label="סגירת תפריט הפעולות"
                    />
                    <div
                        role="menu"
                        aria-label={`פעולות עבור ${openActionsMenu.row.displayName}`}
                        className="fixed z-[11001] w-[248px] rounded-xl bg-white p-2 shadow-[0_0_0_1px_rgba(15,23,42,0.08),0_12px_36px_-8px_rgba(15,23,42,0.32)] dark:bg-[#1d2330] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_16px_40px_-10px_rgba(0,0,0,0.8)]"
                        style={{ left: openActionsMenu.left, top: openActionsMenu.top }}
                    >
                        <RowActionButton icon={Eye} onClick={() => handleMenuAction(setSelectedRow)}>
                            הצג פרטים מלאים
                        </RowActionButton>

                        {openActionsMenu.row.type === 'diagnostic' ? (
                            <RowActionButton icon={FileText} onClick={() => handleMenuAction(() => setLogsModalOpen(true))}>
                                פתח את יומן הפעולות
                            </RowActionButton>
                        ) : (
                            <>
                                <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />
                                {openActionsMenu.row.sourceKeys.includes('site-admins') && openActionsMenu.row.idsBySource?.['site-admins'] ? (
                                    <RowActionButton
                                        icon={Trash2}
                                        destructive
                                        disabled={actionBusy}
                                        onClick={() => handleMenuAction(handleRemoveSiteCollectionAdmin)}
                                    >
                                        הסר מבעלי האתר
                                    </RowActionButton>
                                ) : (
                                    <RowActionButton
                                        icon={Shield}
                                        disabled={actionBusy || openActionsMenu.row.type !== 'user'}
                                        onClick={() => handleMenuAction(handleAddRowToSiteAdmins)}
                                    >
                                        הוסף לבעלי האתר
                                    </RowActionButton>
                                )}

                                {openActionsMenu.row.sourceKeys.includes('owners') && openActionsMenu.row.idsBySource?.owners ? (
                                    <RowActionButton
                                        icon={Trash2}
                                        destructive
                                        disabled={actionBusy}
                                        onClick={() => handleMenuAction(handleRemoveOwner)}
                                    >
                                        הסר ממנהלי התיקיות
                                    </RowActionButton>
                                ) : (
                                    <RowActionButton
                                        icon={FolderKey}
                                        disabled={actionBusy || openActionsMenu.row.type !== 'user'}
                                        onClick={() => handleMenuAction(handleAddRowToOwners)}
                                    >
                                        הוסף למנהלי התיקיות
                                    </RowActionButton>
                                )}

                                {!openActionsMenu.row.sourceKeys.includes('current') && openActionsMenu.row.type === 'user' && (
                                    <RowActionButton
                                        icon={FileText}
                                        disabled={actionBusy}
                                        onClick={() => handleMenuAction(handleSyncRowToTxt)}
                                    >
                                        הוסף לקובץ המנהלים
                                    </RowActionButton>
                                )}
                            </>
                        )}
                    </div>
                </>
            )}

            <Modal isOpen={Boolean(selectedRow)} onClose={() => setSelectedRow(null)} title="פרטי הרשומה" maxWidth="max-w-4xl">
                {selectedRow && (
                    <div className="flex-1 overflow-y-auto">
                        <div className="relative overflow-hidden bg-gradient-to-l from-primary/15 via-primary/5 to-transparent px-5 py-6 sm:px-7">
                            <div className="absolute -left-12 -top-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
                            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center">
                                <div className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-black text-white shadow-[0_10px_24px_-10px_hsl(var(--color-primary)/0.65)]">
                                    {Array.from(selectedRow.displayName || '?')[0]}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <h3 className="text-balance text-2xl font-black text-slate-950 dark:text-white">
                                            {selectedRow.displayName || 'ללא שם'}
                                        </h3>
                                        <TypeBadge type={selectedRow.type} />
                                    </div>
                                    <p className="text-pretty text-sm text-slate-600 dark:text-slate-300">
                                        כל פרטי הזהות, ההרשאות ומקורות המידע של הרשומה במקום אחד.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-5 p-5 sm:p-7">
                            <section>
                                <h4 className="mb-3 text-sm font-black text-slate-900 dark:text-white">פרטי זיהוי</h4>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <DetailField icon={Mail} label="דוא״ל" value={selectedRow.email} dir="ltr" />
                                    <DetailField icon={BadgeCheck} label="מספר אישי" value={selectedRow.personalNumber} dir="ltr" />
                                    <DetailField icon={KeyRound} label="שם כניסה" value={selectedRow.loginName} dir="ltr" wide />
                                    <DetailField icon={Clock3} label="בדיקה אחרונה" value={formatDateTime(selectedRow.lastChecked)} dir="ltr" />
                                    <DetailField icon={Database} label="כמות רשומות שאוחדו" value={String(selectedRow.duplicateCount || 1)} />
                                </div>
                            </section>

                            <section className="grid gap-3 lg:grid-cols-2">
                                <div className="rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_4px_14px_-8px_rgba(15,23,42,0.2)] dark:bg-white/[0.03] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                                        <Database size={17} className="text-primary" />
                                        מקורות ותפקידים
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedRow.sources || []).map((source) => (
                                            <span key={`source-${source}`} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                                                {source}
                                            </span>
                                        ))}
                                        {(selectedRow.roles || []).map((role) => (
                                            <span key={`role-${role}`} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 dark:bg-white/[0.07] dark:text-slate-200">
                                                {role}
                                            </span>
                                        ))}
                                    </div>
                                    {selectedRow.ownersGroupTitle && (
                                        <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                                            קבוצת מנהלי התיקיות: <span className="font-bold text-slate-700 dark:text-slate-200">{selectedRow.ownersGroupTitle}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(15,23,42,0.07),0_4px_14px_-8px_rgba(15,23,42,0.2)] dark:bg-white/[0.03] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.09)]">
                                    <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                                        <ShieldCheck size={17} className="text-primary" />
                                        מצב הרשאות
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(selectedRow.status || []).length > 0 ? selectedRow.status.map((status, index) => (
                                            <span key={`${status.label}-${index}`} className={`inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold ${STATUS_CLASSES[status.tone] || STATUS_CLASSES.neutral}`}>
                                                {status.label}
                                            </span>
                                        )) : <span className="text-sm text-slate-500">אין מצב הרשאה להצגה.</span>}
                                    </div>
                                </div>
                            </section>

                            {(selectedRow.warnings?.length > 0 || selectedRow.errors?.length > 0) && (
                                <section className="rounded-2xl bg-sky-50 p-4 text-sky-900 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.18)] dark:bg-sky-400/10 dark:text-sky-100">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-black">
                                        <Info size={17} />
                                        מידע נוסף
                                    </div>
                                    <ul className="space-y-1 text-sm">
                                        {unique([...(selectedRow.warnings || []), ...(selectedRow.errors || [])]).map((item) => (
                                            <li key={item} className="text-pretty">{item}</li>
                                        ))}
                                    </ul>
                                </section>
                            )}

                            <section className="grid gap-3 sm:grid-cols-2">
                                {Object.entries(selectedRow.idsBySource || {}).map(([sourceKey, id]) => (
                                    <DetailField
                                        key={sourceKey}
                                        icon={Database}
                                        label={`מזהה במקור: ${SOURCE_LABELS[sourceKey] || sourceKey}`}
                                        value={String(id || '-')}
                                        dir="ltr"
                                    />
                                ))}
                            </section>

                            <details className="group rounded-xl bg-slate-950 text-slate-100 shadow-[0_0_0_1px_rgba(15,23,42,0.15)]">
                                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold marker:hidden">
                                    <span>נתוני מקור טכניים</span>
                                    <span className="text-xs font-normal text-slate-400">לחיצה להצגה</span>
                                </summary>
                                <pre dir="ltr" className="max-h-72 overflow-auto border-t border-white/10 p-4 text-left text-xs text-slate-300">{formatJson(selectedRow.rawBySource || {})}</pre>
                            </details>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={addModalOpen} onClose={handleCloseAddModal} title="הוספת מנהל">
                <form onSubmit={handleAddAdmin} className="flex-1 overflow-y-auto p-5">
                    <div className="space-y-4">
                        <div>
                            <label htmlFor="admin-identity-input" className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                מספר אישי, דוא״ל צבאי או שם כניסה
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
                                        <div>ערך מזוהה: <span dir="ltr" className="font-bold">{normalizedAddIdentity.label}</span></div>
                                        <div>סוג זיהוי: <span className="font-bold">{IDENTITY_KIND_LABELS[normalizedAddIdentity.kind] || normalizedAddIdentity.kind}</span></div>
                                    </div>
                                ) : (
                                    <span>{localizeUiText(normalizedAddIdentity.message)}</span>
                                )}
                            </div>
                        </div>

                        <div>
                            <div className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">יעד ההוספה</div>
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
                                    <div className="text-sm font-black text-slate-900 dark:text-white">תצוגה מקדימה של הזהות</div>
                                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                        הבדיקה מאמתת את הזהות מול SharePoint ומציגה את המשתמש שיתווסף.
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
                                    <span>שם תצוגה: <span className="font-bold">{resolvedPreview.Title || '-'}</span></span>
                                    <span>דוא״ל: <span dir="ltr" className="font-bold">{resolvedPreview.Email || '-'}</span></span>
                                    <span>מזהה: <span dir="ltr" className="font-bold">{resolvedPreview.Id || '-'}</span></span>
                                    <span className="sm:col-span-2">שם כניסה: <span dir="ltr" className="font-bold">{resolvedPreview.LoginName || '-'}</span></span>
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

            <Modal isOpen={logsModalOpen} onClose={() => setLogsModalOpen(false)} title="יומן פעולות סנכרון המנהלים" maxWidth="max-w-5xl">
                <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-5 py-3 dark:border-white/10">
                        <button
                            type="button"
                            onClick={handleCopyLogs}
                            disabled={!combinedLogs.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                            <Copy size={14} />
                            העתק יומן
                        </button>
                        <button
                            type="button"
                            onClick={handleExportLogs}
                            disabled={!combinedLogs.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                        >
                            <Download size={14} />
                            ייצא יומן
                        </button>
                        <button
                            type="button"
                            onClick={clearLogs}
                            disabled={!combinedLogs.length}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200"
                        >
                            <Trash2 size={14} />
                            נקה יומן
                        </button>
                        <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{combinedLogs.length} רשומות</span>
                    </div>
                    <div className="max-h-[68vh] flex-1 overflow-auto bg-slate-950 p-4 text-xs text-slate-100">
                        {combinedLogs.length === 0 ? (
                            <p className="rounded-lg border border-white/10 bg-white/5 p-3 text-slate-300">עדיין אין רשומות ביומן.</p>
                        ) : combinedLogs.map((entry, index) => (
                            <div key={`${entry.time}-${entry.step}-${index}`} className="mb-4 border-b border-white/10 pb-4 last:mb-0 last:border-b-0 last:pb-0">
                                <div dir="ltr" className="flex flex-wrap justify-end gap-2 font-semibold text-slate-300">
                                    <span>{entry.time}</span>
                                    <span>{entry.prefix}</span>
                                    <span className={
                                        entry.level === 'error'
                                            ? 'text-red-300'
                                            : entry.level === 'warn'
                                                ? 'text-amber-200'
                                                : 'text-emerald-200'
                                    }>
                                        {LOG_LEVEL_LABELS[entry.level] || entry.level}
                                    </span>
                                    <span>{entry.step}</span>
                                </div>
                                <div dir="auto" className="mt-1 text-slate-100">{localizeUiText(entry.message)}</div>
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
