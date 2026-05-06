import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FileText, Inbox, Loader2, RefreshCw, Shield, ShieldCheck, Trash2, Users, UserPlus, X } from 'lucide-react';
import {
  addSiteCollectionAdminByEmail,
  addSiteCollectionAdminByPersonalNumber,
  ensureUserByPersonalNumber,
  getCurrentSharePointUser,
  listSiteCollectionAdmins,
  normalizePersonalNumberInput,
  removeSiteCollectionAdmin,
} from '../services/sharePointSiteCollectionAdminsService';
import {
  addUserToAssociatedOwnersGroupByLoginName,
  listAssociatedOwnersGroupUsers,
  removeUserFromAssociatedOwnersGroup,
} from '../services/sharePointOwnersGroupService';
import { addUserToAssociatedOwnersGroup } from '../services/sharePointOwnersService';
import {
  addTxtAdminFromSharePointUser,
  listTxtAdmins,
  removeTxtAdmin,
  syncSiteCollectionAdminsToTxtAdmins,
} from '../services/txtAdminsService';
import { isAdminManagementVerboseLogsEnabled, mergeSharePointOwnersLogsToAdminLogs } from '../services/adminManagementLogger';

function toNiceTime(dateValue) {
  if (!dateValue) return '—';
  try {
    return new Date(dateValue).toLocaleString('he-IL');
  } catch {
    return String(dateValue);
  }
}

function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatAdminLogsAsText(logs) {
  if (!Array.isArray(logs) || !logs.length) return '';
  return logs
    .map((entry) => {
      const header = [entry.time, entry.prefix, entry.level, entry.step].filter(Boolean).join(' | ');
      const body = entry.message || '';
      const data = entry.data !== undefined ? `\n${formatJson(entry.data)}` : '';
      return `${header}\n${body}${data}`.trim();
    })
    .join('\n\n');
}

const defaultSourceState = {
  loading: false,
  rows: [],
  error: '',
  updatedAt: null,
  logs: [],
  extra: {},
};

const shellClass = 'min-h-full bg-slate-100/70 px-4 py-6 text-slate-900 dark:bg-[#0f172a] dark:text-slate-100 sm:px-6';
const containerClass = 'mx-auto flex max-w-6xl flex-col gap-5';
const panelClass = 'rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm shadow-slate-200/60 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/20';
const headerPanelClass = 'rounded-xl border border-primary-200/70 bg-gradient-to-br from-primary-50 via-white to-white p-5 shadow-sm shadow-primary-100/60 dark:border-primary-500/30 dark:from-primary-500/10 dark:via-slate-900 dark:to-slate-900';
const panelTitleClass = 'text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100';
const softTextClass = 'text-sm text-slate-600 dark:text-slate-300';
const subtleButtonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700';
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm shadow-primary-500/30 transition hover:bg-primary-500 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-500 dark:hover:bg-primary-400';
const dangerButtonClass = 'rounded-lg border border-primary-300 bg-primary-50 px-2.5 py-1.5 text-[11px] font-semibold text-primary-700 transition hover:border-primary-400 hover:bg-primary-100 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 dark:border-primary-500/40 dark:bg-primary-500/10 dark:text-primary-200 dark:hover:bg-primary-500/20';
const dangerActionButtonClass = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:border-red-400 hover:bg-red-100 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 dark:hover:bg-red-500/20';
const neutralActionButtonClass = 'rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 active:translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700';
const textInputClass = 'min-h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-primary-400 dark:focus:ring-primary-500/30 dark:disabled:bg-slate-800';
const checkboxClass = 'h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 dark:border-slate-500 dark:bg-slate-800';
const tableWrapClass = 'overflow-auto rounded-lg border border-slate-200/90 shadow-sm shadow-slate-200/40 dark:border-slate-700 dark:shadow-black/20';
const tableClass = 'w-full text-[13px]';
const tableHeadRowClass = 'bg-slate-100/90 text-slate-700 dark:bg-slate-800/90 dark:text-slate-200';
const thClass = 'px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide';
const tdClass = 'px-3 py-2.5 align-middle';
const tableRowClass = 'border-t border-slate-200/80 odd:bg-white even:bg-slate-50/70 transition hover:bg-primary-50/80 dark:border-slate-700 dark:odd:bg-slate-900 dark:even:bg-slate-900/70 dark:hover:bg-primary-500/10';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-5 text-center dark:border-slate-600 dark:bg-slate-800/30">
      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-300">
        <Inbox size={18} />
      </div>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{message}</p>
    </div>
  );
}

function StatsCard({ icon: Icon, title, count, loading, iconBg, iconColor }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p className="mt-2 text-3xl font-bold text-slate-800 dark:text-slate-100">
            {loading ? <Loader2 size={24} className="animate-spin text-slate-400" /> : count}
          </p>
        </div>
        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
      </div>
    </div>
  );
}

function SourceHeader({ title, count, updatedAt, loading, onRefresh }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/90 pb-3 dark:border-slate-700">
      <div>
        <h2 className={panelTitleClass}>{title}</h2>
        <p className={`mt-1 ${softTextClass}`}>
          כמות: <span className="font-bold">{count}</span> | עודכן לאחרונה: <span className="font-bold">{toNiceTime(updatedAt)}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className={subtleButtonClass}
        aria-busy={loading}
      >
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        {loading ? 'מרענן...' : 'רענן'}
      </button>
    </div>
  );
}

export default function AdminSiteOwnersManagement() {
  const [inputValue, setInputValue] = useState('');
  const [addSiteAdmin, setAddSiteAdmin] = useState(true);
  const [addOwnersGroup, setAddOwnersGroup] = useState(false);
  const [addTxt, setAddTxt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionLogs, setActionLogs] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [txtSource, setTxtSource] = useState(defaultSourceState);
  const [siteAdminsSource, setSiteAdminsSource] = useState(defaultSourceState);
  const [ownersSource, setOwnersSource] = useState(defaultSourceState);
  const [rowActionBusyKey, setRowActionBusyKey] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const combinedLogs = useMemo(
    () => [...txtSource.logs, ...siteAdminsSource.logs, ...ownersSource.logs, ...actionLogs].slice(-300),
    [actionLogs, ownersSource.logs, siteAdminsSource.logs, txtSource.logs],
  );

  const [technicalLogsOpen, setTechnicalLogsOpen] = useState(() => isAdminManagementVerboseLogsEnabled());

  useEffect(() => {
    if (combinedLogs.length > 0) setTechnicalLogsOpen(true);
  }, [combinedLogs.length]);

  const dismissPageActionFeedback = () => {
    setActionMessage('');
    setActionError('');
    setActionLogs([]);
  };

  const clearTechnicalLogs = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setActionLogs([]);
    setTxtSource((prev) => ({ ...prev, logs: [] }));
    setSiteAdminsSource((prev) => ({ ...prev, logs: [] }));
    setOwnersSource((prev) => ({ ...prev, logs: [] }));
    setActionError('');
    setActionMessage('הלוגים נוקו.');
  };

  const copyTechnicalLogs = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (!combinedLogs.length) return;
    const text = formatAdminLogsAsText(combinedLogs);

    try {
      await navigator.clipboard.writeText(text);
      setActionError('');
      setActionMessage('הלוגים הועתקו ללוח.');
    } catch {
      setActionMessage('');
      setActionError('העתקת הלוגים נכשלה.');
    }
  };

  const refreshTxt = async () => {
    setTxtSource((prev) => ({ ...prev, loading: true, error: '' }));
    const logs = [];
    try {
      const rows = await listTxtAdmins(logs);
      setTxtSource({ loading: false, rows, error: '', updatedAt: new Date().toISOString(), logs, extra: {} });
    } catch {
      setTxtSource((prev) => ({
        ...prev,
        loading: false,
        error: 'טעינת מנהלים מקובץ המערכת נכשלה.',
        logs,
      }));
    }
  };

  const refreshSiteAdmins = async () => {
    setSiteAdminsSource((prev) => ({ ...prev, loading: true, error: '' }));
    const logs = [];
    try {
      const rows = await listSiteCollectionAdmins(logs);
      setSiteAdminsSource({ loading: false, rows, error: '', updatedAt: new Date().toISOString(), logs, extra: {} });
    } catch {
      setSiteAdminsSource((prev) => ({
        ...prev,
        loading: false,
        error: 'טעינת מנהלי אוסף אתרים נכשלה.',
        logs,
      }));
    }
  };

  const refreshOwners = async () => {
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
        }));
        return;
      }
      setOwnersSource({
        loading: false,
        rows: result.users || [],
        error: '',
        updatedAt: new Date().toISOString(),
        logs: result.logs || logs,
        extra: {
          ownersGroupId: result.ownersGroupId,
          ownersGroupTitle: result.ownersGroupTitle,
        },
      });
    } catch {
      setOwnersSource((prev) => ({
        ...prev,
        loading: false,
        error: 'טעינת בעלי האתר נכשלה.',
        logs,
      }));
    }
  };

  const refreshCurrentUser = async () => {
    const logs = [];
    try {
      const user = await getCurrentSharePointUser(logs);
      setCurrentUser(user || null);
    } catch {
      setCurrentUser(null);
    }
  };

  const refreshAllSources = async () => {
    await Promise.all([refreshTxt(), refreshSiteAdmins(), refreshOwners(), refreshCurrentUser()]);
  };

  useEffect(() => {
    refreshAllSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAddManager = async (event) => {
    event.preventDefault();
    setActionMessage('');
    setActionError('');
    setActionLogs([]);

    if (!addSiteAdmin && !addOwnersGroup && !addTxt) {
      setActionError('יש לבחור לפחות יעד אחד להוספה.');
      return;
    }

    const normalized = normalizePersonalNumberInput(inputValue);
    if (!normalized.ok) {
      setActionError(normalized.message);
      return;
    }

    setIsSubmitting(true);
    const logs = [];
    const failures = [];
    const successes = [];
    let ensuredUser = null;

    try {
      if (addSiteAdmin) {
        const siteResult = await addSiteCollectionAdminByPersonalNumber(inputValue, logs);
        if (!siteResult.ok) {
          failures.push(siteResult.userMessage || 'הוספה למנהלי אוסף אתרים נכשלה.');
        } else {
          successes.push('נוסף למנהלי אוסף אתרים');
          ensuredUser = siteResult.ensuredUser || null;
        }
      } else {
        ensuredUser = await ensureUserByPersonalNumber(inputValue, logs);
      }

      if (addOwnersGroup) {
        const ownerRes = await addUserToAssociatedOwnersGroup(normalized.email);
        mergeSharePointOwnersLogsToAdminLogs(logs, ownerRes.logs || []);
        if (!ownerRes.ok) {
          failures.push(ownerRes.userMessage || 'הוספה לבעלי האתר נכשלה.');
        } else {
          successes.push('נוסף לבעלי האתר');
        }
      }

      if (addTxt && ensuredUser) {
        const txtResult = await addTxtAdminFromSharePointUser(ensuredUser, logs);
        if (!txtResult.ok) {
          failures.push('הוספה לקובץ המנהלים נכשלה.');
        } else {
          successes.push('נוסף לקובץ המנהלים');
        }
      }

      setActionLogs(logs);
      if (failures.length && successes.length) {
        setActionMessage(`הצלחה חלקית: ${successes.join(', ')}`);
        setActionError(`שגיאות: ${failures.join(' | ')}`);
        setTechnicalLogsOpen(true);
      } else if (failures.length) {
        setActionError(failures.join(' | '));
        setTechnicalLogsOpen(true);
      } else {
        setActionMessage(`בוצע בהצלחה: ${successes.join(', ')}`);
        setInputValue('');
        setTimeout(() => setIsModalOpen(false), 1500);
      }
    } catch {
      setActionLogs(logs);
      setActionError('הפעולה נכשלה. ניתן לפתוח את פרטי הלוג הטכני.');
      setTechnicalLogsOpen(true);
    } finally {
      await refreshAllSources();
      setIsSubmitting(false);
    }
  };

  const removeSiteAdminWithSafety = async (row) => {
    const userId = Number(row?.Id || 0);
    if (!userId) return;

    const currentUserId = Number(currentUser?.Id || 0);
    if (currentUserId && currentUserId === userId) {
      setActionError('לא ניתן להסיר את עצמך ממנהלי אוסף אתרים.');
      return;
    }
    if ((siteAdminsSource.rows || []).length <= 1) {
      setActionError('לא ניתן להסיר את מנהל אוסף האתרים האחרון.');
      return;
    }
    if (!window.confirm('האם להסיר את המשתמש ממנהלי אוסף אתרים?')) return;

    const logs = [];
    setRowActionBusyKey(`remove-site-admin-${userId}`);
    const result = await removeSiteCollectionAdmin(userId, logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError(result.userMessage || 'הסרת מנהל אוסף אתרים נכשלה.');
      setTechnicalLogsOpen(true);
    } else {
      setActionError('');
      setActionMessage('המשתמש הוסר ממנהלי אוסף אתרים.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  const removeFromOwnersGroup = async (row) => {
    const userId = Number(row?.Id || 0);
    if (!userId) return;
    if (!window.confirm('האם להסיר את המשתמש מבעלי האתר?')) return;
    const logs = [];
    setRowActionBusyKey(`remove-owner-${userId}`);
    const result = await removeUserFromAssociatedOwnersGroup(userId, logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError(result.userMessage || 'הסרת המשתמש מבעלי האתר נכשלה.');
      setTechnicalLogsOpen(true);
    } else {
      setActionError('');
      setActionMessage('המשתמש הוסר מבעלי האתר.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  const syncRowToTxt = async (row) => {
    const logs = [];
    setRowActionBusyKey(`sync-txt-${row?.Id || row?.id || row?.LoginName || ''}`);
    const result = await addTxtAdminFromSharePointUser(row, logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError('סנכרון לקובץ המנהלים נכשל.');
      setTechnicalLogsOpen(true);
    } else if (!result.changed) {
      setActionError('');
      setActionMessage('המשתמש כבר קיים בקובץ המנהלים — לא בוצע שינוי.');
    } else {
      setActionError('');
      setActionMessage('המשתמש נוסף לקובץ המנהלים.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  const removeFromTxt = async (row) => {
    const token = row?.personalNumber || row?.id || row?.loginName || row?.email;
    if (!token) return;
    if (!window.confirm('האם להסיר את המשתמש מקובץ המנהלים?')) return;
    const logs = [];
    setRowActionBusyKey(`remove-txt-${token}`);
    const result = await removeTxtAdmin(String(token), logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError('הסרה מקובץ המנהלים נכשלה.');
      setTechnicalLogsOpen(true);
    } else {
      setActionError('');
      setActionMessage('המשתמש הוסר מקובץ המנהלים.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  const syncTxtToSiteAdmins = async (row) => {
    const emailFromRow = String(row?.email || '').trim().toLowerCase();
    const fallbackPersonal = String(row?.personalNumber || '').trim().toLowerCase();
    const email = emailFromRow || (fallbackPersonal ? `${fallbackPersonal}@army.idf.il` : '');
    if (!email) {
      setActionError('לא נמצא מייל תקין למשתמש.');
      return;
    }
    const logs = [];
    setRowActionBusyKey(`sync-site-admin-${row?.id || row?.Id || email}`);
    const result = await addSiteCollectionAdminByEmail(email, logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError(result.userMessage || 'סנכרון למנהלי אוסף אתרים נכשל.');
      setTechnicalLogsOpen(true);
    } else {
      setActionError('');
      setActionMessage('המשתמש נוסף למנהלי אוסף אתרים.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  const addRowToOwners = async (row) => {
    const loginName = String(row?.LoginName || row?.loginName || '').trim();
    if (!loginName) {
      setActionError('לא נמצא LoginName למשתמש.');
      return;
    }
    const logs = [];
    setRowActionBusyKey(`sync-owner-${row?.Id || row?.id || loginName}`);
    const result = await addUserToAssociatedOwnersGroupByLoginName(loginName, logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError(result.userMessage || 'הוספה לבעלי האתר נכשלה.');
      setTechnicalLogsOpen(true);
    } else {
      setActionError('');
      setActionMessage('המשתמש נוסף לבעלי האתר.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  const syncAllSiteAdminsToTxt = async () => {
    const logs = [];
    setRowActionBusyKey('sync-all-site-admins');
    const result = await syncSiteCollectionAdminsToTxtAdmins(logs);
    setActionLogs(logs);
    if (!result.ok) {
      setActionError('סנכרון כללי נכשל.');
      setTechnicalLogsOpen(true);
    } else if (result.changed) {
      setActionError('');
      setActionMessage(`סנכרון הושלם. נוספו/עודכנו מנהלים בקובץ (${result.afterCount}).`);
    } else {
      setActionError('');
      setActionMessage('סנכרון הושלם ללא שינויים.');
    }
    await refreshAllSources();
    setRowActionBusyKey('');
  };

  return (
    <div dir="rtl" className={shellClass}>
      <div className={containerClass}>
        {/* Header with Add Manager Button */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/30">
                <ShieldCheck size={20} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">ניהול מנהלים</h1>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              קונסולה לניהול מנהלים משלושה מקורות: קובץ מערכת, מנהלי אוסף אתרים, ובעלי האתר
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:bg-primary-500 hover:shadow-xl active:translate-y-[1px]"
          >
            <UserPlus size={18} />
            הוסף מנהל
          </button>
        </div>

        {(actionMessage || actionError) && (
          <div
            className={`rounded-xl border px-4 py-3 shadow-sm ${
              actionMessage && actionError
                ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-50'
                : actionError
                  ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-100'
            }`}
            role="status"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-start gap-2">
                {actionError && !actionMessage ? (
                  <AlertTriangle className="mt-0.5 shrink-0 text-red-600 dark:text-red-300" size={18} aria-hidden />
                ) : actionMessage && actionError ? (
                  <AlertTriangle className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" size={18} aria-hidden />
                ) : (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-300" size={18} aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {actionMessage && actionError ? 'תוצאה מעורבת' : actionError ? 'נכשל' : 'הצלחה'}
                  </p>
                  {actionMessage ? (
                    <p className="mt-1 text-sm leading-relaxed">{actionMessage}</p>
                  ) : null}
                  {actionError ? (
                    <p className={`mt-1 text-sm leading-relaxed ${actionMessage ? 'text-red-800 dark:text-red-200' : ''}`}>
                      {actionError}
                    </p>
                  ) : null}
                  {actionError && (
                    <details
                      className={`mt-3 rounded-lg border p-2 text-left ${
                        actionMessage && actionError
                          ? 'border-amber-200/90 bg-white/80 dark:border-amber-500/30 dark:bg-slate-950/50'
                          : 'border-red-200/80 bg-white/80 dark:border-red-500/30 dark:bg-slate-950/50'
                      }`}
                      open
                    >
                      <summary className="cursor-pointer select-none text-xs font-medium text-slate-800 dark:text-slate-200">
                        לוג טכני (פעולה אחרונה)
                      </summary>
                      <pre
                        className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-950 p-3 text-left text-[11px] leading-snug text-slate-100 dark:bg-black/60"
                        dir="ltr"
                      >
                        {formatAdminLogsAsText(actionLogs) || '— אין רשומות לוג לפעולה זו —'}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={dismissPageActionFeedback}
                className="shrink-0 rounded-lg p-1.5 text-current opacity-70 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
                aria-label="סגור הודעה"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <StatsCard
            icon={FileText}
            title="מנהלים בקובץ המערכת"
            count={txtSource.rows.length}
            loading={txtSource.loading}
            iconBg="bg-primary-50 dark:bg-primary-500/10"
            iconColor="text-primary-600 dark:text-primary-400"
          />
          <StatsCard
            icon={Shield}
            title="מנהלי אוסף אתרים"
            count={siteAdminsSource.rows.length}
            loading={siteAdminsSource.loading}
            iconBg="bg-primary-50 dark:bg-primary-500/10"
            iconColor="text-primary-600 dark:text-primary-400"
          />
          <StatsCard
            icon={Users}
            title="בעלי האתר"
            count={ownersSource.rows.length}
            loading={ownersSource.loading}
            iconBg="bg-primary-50 dark:bg-primary-500/10"
            iconColor="text-primary-600 dark:text-primary-400"
          />
        </div>

        {/* Add Manager Modal */}
        <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">הוספת מנהל</h2>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X size={20} />
            </button>
          </div>
          
          <form onSubmit={onAddManager} className="p-6">
            <label htmlFor="personal-number-input" className="block text-sm font-medium text-slate-700 dark:text-slate-200">
              מספר אישי
            </label>
            <input
              id="personal-number-input"
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="s1234567"
              disabled={isSubmitting}
              className={`${textInputClass} mt-2 w-full`}
              dir="ltr"
            />

            <div className="mt-5 space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">בחר יעדים להוספה</p>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                <input 
                  className={checkboxClass} 
                  type="checkbox" 
                  checked={addSiteAdmin} 
                  onChange={(event) => setAddSiteAdmin(event.target.checked)} 
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">הוסף כמנהל אוסף אתרים</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                <input 
                  className={checkboxClass} 
                  type="checkbox" 
                  checked={addOwnersGroup} 
                  onChange={(event) => setAddOwnersGroup(event.target.checked)} 
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">הוסף גם לבעלי האתר</span>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                <input 
                  className={checkboxClass} 
                  type="checkbox" 
                  checked={addTxt} 
                  onChange={(event) => setAddTxt(event.target.checked)} 
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">הוסף גם לקובץ המנהלים</span>
              </label>
            </div>

            {(actionError || actionMessage) && (
              <div className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${actionError ? 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200' : 'border-primary-200 bg-primary-50 text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-200'}`}>
                {actionError ? <AlertTriangle className="mt-0.5 shrink-0" size={16} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={16} />}
                <span>{actionError || actionMessage}</span>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                {isSubmitting ? 'מוסיף...' : 'הוסף מנהל'}
              </button>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                ביטול
              </button>
            </div>
          </form>
        </Modal>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <SourceHeader
            title="מנהלים בקובץ המערכת"
            count={txtSource.rows.length}
            updatedAt={txtSource.updatedAt}
            loading={txtSource.loading}
            onRefresh={refreshTxt}
          />
          <div className="mt-4">
            {txtSource.loading && <p className="text-sm text-slate-500 dark:text-slate-400">טוען...</p>}
            {!txtSource.loading && txtSource.error && <p className="text-sm text-primary-600 dark:text-primary-300">{txtSource.error}</p>}
            {!txtSource.loading && !txtSource.error && txtSource.rows.length === 0 && <EmptyState message="אין מנהלים בקובץ המערכת." />}
            {!txtSource.loading && txtSource.rows.length > 0 && (
              <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">שם</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מספר אישי</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מייל</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">LoginName</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מקור</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {txtSource.rows.map((row) => (
                      <tr key={`txt-${row.id}-${row.loginName}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{row.name || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.personalNumber || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.email || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.loginName || '-'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">TXT</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button 
                              type="button" 
                              onClick={() => syncTxtToSiteAdmins(row)} 
                              disabled={Boolean(rowActionBusyKey)} 
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              הוסף למנהלי אוסף
                            </button>
                            <button 
                              type="button" 
                              onClick={() => removeFromTxt(row)} 
                              disabled={Boolean(rowActionBusyKey)} 
                              className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                            >
                              הסר
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <SourceHeader
            title="מנהלי אוסף אתרים"
            count={siteAdminsSource.rows.length}
            updatedAt={siteAdminsSource.updatedAt}
            loading={siteAdminsSource.loading}
            onRefresh={refreshSiteAdmins}
          />
          <div className="mt-4">
            <button 
              type="button" 
              onClick={syncAllSiteAdminsToTxt} 
              disabled={Boolean(rowActionBusyKey)} 
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RefreshCw size={14} />
              סנכרן מנהלי אוסף אתרים לקובץ המנהלים
            </button>
          </div>
          <div className="mt-4">
            {siteAdminsSource.loading && <p className="text-sm text-slate-500 dark:text-slate-400">טוען...</p>}
            {!siteAdminsSource.loading && siteAdminsSource.error && <p className="text-sm text-primary-600 dark:text-primary-300">{siteAdminsSource.error}</p>}
            {!siteAdminsSource.loading && !siteAdminsSource.error && siteAdminsSource.rows.length === 0 && <EmptyState message="אין מנהלי אוסף אתרים." />}
            {!siteAdminsSource.loading && siteAdminsSource.rows.length > 0 && (
              <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">שם</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מייל</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">LoginName</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מזהה</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Admin</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מקור</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {siteAdminsSource.rows.map((row) => (
                      <tr key={`sca-${row.Id}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{row.Title || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.Email || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.LoginName || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.Id}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">
                          {row.IsSiteAdmin && <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">כן</span>}
                          {!row.IsSiteAdmin && <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">Site Admin</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button 
                              type="button" 
                              onClick={() => removeSiteAdminWithSafety(row)} 
                              disabled={rowActionBusyKey === `remove-site-admin-${row.Id}`} 
                              className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                            >
                              הסר
                            </button>
                            <button 
                              type="button" 
                              onClick={() => syncRowToTxt(row)} 
                              disabled={Boolean(rowActionBusyKey)} 
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              הוסף לקובץ
                            </button>
                            <button 
                              type="button" 
                              onClick={() => addRowToOwners(row)} 
                              disabled={Boolean(rowActionBusyKey)} 
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              הוסף לבעלים
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <SourceHeader
            title="בעלי האתר / אנשים וקבוצות"
            count={ownersSource.rows.length}
            updatedAt={ownersSource.updatedAt}
            loading={ownersSource.loading}
            onRefresh={refreshOwners}
          />
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>קבוצה: <span className="font-medium text-slate-700 dark:text-slate-300">{ownersSource.extra?.ownersGroupTitle || '-'}</span></span>
            <span>מזהה: <span className="font-medium text-slate-700 dark:text-slate-300">{ownersSource.extra?.ownersGroupId || '-'}</span></span>
          </div>
          <div className="mt-4">
            {ownersSource.loading && <p className="text-sm text-slate-500 dark:text-slate-400">טוען...</p>}
            {!ownersSource.loading && ownersSource.error && <p className="text-sm text-primary-600 dark:text-primary-300">{ownersSource.error}</p>}
            {!ownersSource.loading && !ownersSource.error && ownersSource.rows.length === 0 && <EmptyState message="אין משתמשים בקבוצת בעלי האתר." />}
            {!ownersSource.loading && ownersSource.rows.length > 0 && (
              <div className="overflow-auto rounded-lg border border-slate-200 shadow-sm dark:border-slate-700">
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">שם</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מייל</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">LoginName</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מזהה</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Admin</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">מקור</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {ownersSource.rows.map((row) => (
                      <tr key={`owner-${row.Id}`} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3 text-slate-800 dark:text-slate-200">{row.Title || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.Email || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.LoginName || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">{row.Id}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400" dir="ltr">
                          {row.IsSiteAdmin && <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">כן</span>}
                          {!row.IsSiteAdmin && <span className="text-slate-400">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">Owners</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <button 
                              type="button" 
                              onClick={() => removeFromOwnersGroup(row)} 
                              disabled={rowActionBusyKey === `remove-owner-${row.Id}`} 
                              className="rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100 disabled:opacity-50 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-300 dark:hover:bg-primary-500/20"
                            >
                              הסר
                            </button>
                            <button 
                              type="button" 
                              onClick={() => syncTxtToSiteAdmins(row)} 
                              disabled={Boolean(rowActionBusyKey)} 
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              הוסף למנהלי אוסף
                            </button>
                            <button 
                              type="button" 
                              onClick={() => syncRowToTxt(row)} 
                              disabled={Boolean(rowActionBusyKey)} 
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              הוסף לקובץ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setTechnicalLogsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 px-6 py-4 text-right text-base font-semibold text-slate-800 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800/80"
            aria-expanded={technicalLogsOpen}
          >
            <span>לוגים טכניים</span>
            <ChevronDown
              size={20}
              className={`shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${technicalLogsOpen ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </button>
          {technicalLogsOpen && (
            <div className="space-y-4 border-t border-slate-200 px-6 pb-6 pt-2 dark:border-slate-700">
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={copyTechnicalLogs}
                  disabled={!combinedLogs.length}
                  className={subtleButtonClass}
                >
                  <Copy size={14} />
                  העתק לוגים
                </button>
                <button
                  type="button"
                  onClick={clearTechnicalLogs}
                  disabled={!combinedLogs.length}
                  className={dangerActionButtonClass}
                >
                  <Trash2 size={14} />
                  נקה לוגים
                </button>
              </div>
              <div
                className="max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-4 text-left text-xs text-slate-100 dark:border-slate-700"
                dir="ltr"
              >
                {combinedLogs.length === 0 && (
                  <p className="rounded-md border border-white/10 bg-white/5 p-3 text-slate-300">אין לוגים.</p>
                )}
                {combinedLogs.map((entry, idx) => (
                  <div key={`${entry.time}-${entry.step}-${idx}`} className="mb-4 border-b border-white/10 pb-4 last:mb-0 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap gap-2 font-semibold text-slate-300">
                      <span>{entry.time}</span>
                      <span>{entry.prefix}</span>
                      <span>{entry.level}</span>
                      <span>{entry.step}</span>
                    </div>
                    <div className="mt-1 text-slate-200">{entry.message}</div>
                    {entry.data !== undefined && (
                      <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-white/5 p-3 text-slate-300">{formatJson(entry.data)}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
