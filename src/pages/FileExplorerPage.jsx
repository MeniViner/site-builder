import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronLeft,
  CircleAlert,
  Download,
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  Grid3X3,
  HardDrive,
  KeyRound,
  Link2,
  List,
  LoaderCircle,
  PlugZap,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSearchParams } from 'react-router-dom';
import BrowserFileSystemAdapter from '../services/fileExplorer/BrowserFileSystemAdapter';
import {
  decodeFileExplorerTarget,
  FILE_EXPLORER_TARGET_PARAM,
} from '../utils/fileExplorerTargets';

const defaultAdapter = new BrowserFileSystemAdapter();
const KIND_LABELS = {
  archive: 'ארכיון',
  audio: 'שמע',
  code: 'קובץ קוד',
  document: 'מסמך',
  file: 'קובץ',
  folder: 'תיקייה',
  image: 'תמונה',
  pdf: 'מסמך PDF',
  presentation: 'מצגת',
  sheet: 'גיליון',
  text: 'קובץ טקסט',
  video: 'וידאו',
};
const KIND_ICONS = {
  archive: FileArchive,
  audio: FileMusic,
  code: FileCode2,
  document: FileText,
  file: File,
  folder: Folder,
  image: FileImage,
  pdf: FileText,
  presentation: FileText,
  sheet: FileSpreadsheet,
  text: FileText,
  video: FileVideo,
};
const PERMISSION_LABELS = {
  denied: 'הגישה נחסמה',
  granted: 'הגישה פעילה',
  prompt: 'נדרשת הרשאה',
};

function formatSize(size) {
  if (!Number.isFinite(size)) return '—';
  if (size < 1_024) return `${size} בייט`;
  if (size < 1_048_576) return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 }).format(size / 1_024)} ק״ב`;
  if (size < 1_073_741_824) return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 }).format(size / 1_048_576)} מ״ב`;
  return `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 }).format(size / 1_073_741_824)} ג״ב`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function currentDisplayPath(connection, relativeSegments) {
  if (!connection) return '';
  return [connection.displayPrefix, ...relativeSegments].join('\\');
}

function TechnicalDetails({ error }) {
  if (!error) return null;
  return (
    <details className="file-explorer-diagnostics" dir="ltr">
      <summary>פרטים טכניים</summary>
      <code>{error.name || 'Error'}: {error.message || String(error)}</code>
    </details>
  );
}

function StateCard({
  action,
  actionIcon = PlugZap,
  children,
  error,
  icon = HardDrive,
  secondaryActions = [],
  title,
}) {
  return (
    <section className="file-explorer-state-card" aria-live="polite">
      <span className="file-explorer-state-icon">{createElement(icon, { 'aria-hidden': true, size: 26 })}</span>
      <h1>{title}</h1>
      <div className="file-explorer-state-copy">{children}</div>
      {action && (
        <button className="file-explorer-primary-button" type="button" onClick={action.onClick} disabled={action.disabled}>
          {action.busy
            ? <LoaderCircle className="file-explorer-spin" size={18} aria-hidden="true" />
            : createElement(actionIcon, { 'aria-hidden': true, size: 18 })}
          {action.label}
        </button>
      )}
      {secondaryActions.length > 0 && (
        <div className="file-explorer-state-actions">
          {secondaryActions.map((secondaryAction) => (
            <button
              className="file-explorer-text-button"
              disabled={secondaryAction.disabled}
              key={secondaryAction.label}
              onClick={secondaryAction.onClick}
              type="button"
            >
              {secondaryAction.icon && createElement(secondaryAction.icon, { 'aria-hidden': true, size: 16 })}
              {secondaryAction.label}
            </button>
          ))}
        </div>
      )}
      <TechnicalDetails error={error} />
    </section>
  );
}

function EntryIcon({ kind, size = 21 }) {
  const Icon = KIND_ICONS[kind] || File;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

function ConnectionDialog({
  adapter,
  connections,
  onClose,
  onConnectionsChanged,
  onReconnectResult,
}) {
  const [states, setStates] = useState({});
  const [busyId, setBusyId] = useState('');

  const updateState = (id, next) => setStates((current) => ({ ...current, [id]: next }));

  useEffect(() => {
    let active = true;
    Promise.allSettled(connections.map(async (connection) => {
      const permission = await adapter.queryPermission(connection.directoryHandle);
      if (active) updateState(connection.id, permission);
    }));
    return () => { active = false; };
  }, [adapter, connections]);

  const test = async (connection) => {
    setBusyId(connection.id);
    try {
      const result = await adapter.testConnection(connection);
      updateState(connection.id, result.status);
      await onConnectionsChanged();
    } finally {
      setBusyId('');
    }
  };

  const requestPermission = async (connection) => {
    setBusyId(connection.id);
    try {
      const permission = await adapter.requestPermission(connection.directoryHandle);
      updateState(connection.id, permission === 'granted' ? 'available' : permission);
      await onConnectionsChanged();
    } finally {
      setBusyId('');
    }
  };

  const reconnect = async (connection) => {
    setBusyId(connection.id);
    try {
      const result = await adapter.reconnectConnection(connection);
      await onReconnectResult(result);
    } finally {
      setBusyId('');
    }
  };

  const remove = async (connection) => {
    setBusyId(connection.id);
    try {
      await adapter.removeConnection(connection);
      await onConnectionsChanged();
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="file-explorer-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="file-explorer-dialog" role="dialog" aria-modal="true" aria-labelledby="connections-title">
        <header>
          <div>
            <span className="file-explorer-eyebrow">חיבורים שמורים בדפדפן זה</span>
            <h2 id="connections-title">ניהול חיבורים</h2>
          </div>
          <button className="file-explorer-icon-button" type="button" onClick={onClose} aria-label="סגירת חלון החיבורים">
            <X size={20} />
          </button>
        </header>
        <div className="file-explorer-connections-list">
          {connections.length === 0 && <p className="file-explorer-empty-copy">עדיין לא נשמרו חיבורים.</p>}
          {connections.map((connection) => {
            const state = states[connection.id];
            const permission = state === 'available' ? 'granted' : state;
            return (
              <article className="file-explorer-connection-card" key={connection.id}>
                <div className="file-explorer-connection-main">
                  <span className="file-explorer-connection-icon"><HardDrive size={19} /></span>
                  <div>
                    <strong>{connection.label || connection.displayPrefix}</strong>
                    <code dir="ltr">{connection.displayPrefix}</code>
                    <small>שימוש אחרון: {formatDate(connection.lastUsedAt)}</small>
                  </div>
                </div>
                {permission && (
                  <span className={`file-explorer-status-pill is-${permission}`}>
                    {PERMISSION_LABELS[permission] || (permission === 'available' ? 'החיבור זמין' : 'החיבור אינו זמין')}
                  </span>
                )}
                <div className="file-explorer-connection-actions">
                  <button type="button" onClick={() => test(connection)} disabled={Boolean(busyId)}>בדיקה</button>
                  <button type="button" onClick={() => requestPermission(connection)} disabled={Boolean(busyId)}>
                    הרשאה
                  </button>
                  <button type="button" onClick={() => reconnect(connection)} disabled={Boolean(busyId)}>
                    חיבור מחדש
                  </button>
                  <button className="is-danger" type="button" onClick={() => remove(connection)} disabled={Boolean(busyId)}>
                    <Trash2 size={15} /> הסרה
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function MappingDialog({ pending, onCancel, onConfirm }) {
  const candidates = pending?.candidates || (pending?.candidate ? [pending.candidate] : []);
  return (
    <div className="file-explorer-modal-backdrop">
      <section className="file-explorer-dialog is-compact" role="dialog" aria-modal="true" aria-labelledby="mapping-title">
        <header>
          <div>
            <span className="file-explorer-eyebrow">אישור התאמת התיקייה</span>
            <h2 id="mapping-title">{candidates.length > 1 ? 'איזו תיקייה נבחרה?' : 'האם זו התיקייה המבוקשת?'}</h2>
          </div>
        </header>
        <p>
          הדפדפן אינו חושף את הנתיב המלא של הבחירה. בחרו את הנתיב המתאים כדי שנוכל לשמור את החיבור הנכון.
        </p>
        <div className="file-explorer-mapping-options">
          {candidates.map((candidate) => (
            <button key={`${candidate.canonicalPrefix}-${candidate.connectionMode}`} type="button" onClick={() => onConfirm(candidate)}>
              <FolderOpen size={18} />
              <span>{candidate.displayPrefix}</span>
              <ChevronLeft size={17} />
            </button>
          ))}
        </div>
        <button className="file-explorer-text-button" type="button" onClick={onCancel}>ביטול</button>
      </section>
    </div>
  );
}

export function FileExplorerView({ adapter = defaultAdapter, target }) {
  const [phase, setPhase] = useState('loading');
  const [error, setError] = useState(null);
  const [connections, setConnections] = useState([]);
  const [connection, setConnection] = useState(null);
  const [directoryHandle, setDirectoryHandle] = useState(null);
  const [relativeSegments, setRelativeSegments] = useState([]);
  const [entries, setEntries] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [viewMode, setViewMode] = useState('list');
  const [query, setQuery] = useState('');
  const [recursiveSearch, setRecursiveSearch] = useState(false);
  const [searchState, setSearchState] = useState({ progress: null, results: [], searching: false, truncated: false });
  const [busy, setBusy] = useState(false);
  const [pendingMapping, setPendingMapping] = useState(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const searchAbortRef = useRef(null);

  const refreshConnections = useCallback(async () => {
    const loaded = await adapter.loadConnections();
    setConnections(loaded);
    return loaded;
  }, [adapter]);

  const activate = useCallback(async (result, { noticeText = '', resetHistory = true } = {}) => {
    const listed = await adapter.listDirectory(result.directoryHandle);
    setConnection(result.connection);
    setDirectoryHandle(result.directoryHandle);
    setRelativeSegments(result.remainingSegments || []);
    setEntries(listed);
    setError(null);
    setNotice(noticeText);
    setPhase('ready');
    if (resetHistory) {
      setHistory([result.remainingSegments || []]);
      setHistoryIndex(0);
    }
    await refreshConnections();
  }, [adapter, refreshConnections]);

  const loadTarget = useCallback(async () => {
    setError(null);
    if (!target || target.kind !== 'unc') {
      setPhase('invalid');
      return;
    }
    if (!adapter.isSupported()) {
      setPhase('unsupported');
      return;
    }
    setPhase('loading');
    try {
      const result = await adapter.resolveTarget(target);
      setConnections(result.connections || []);
      if (result.status === 'connected') {
        await activate(result, { noticeText: 'החיבור השמור נטען בהצלחה.' });
        return;
      }
      setConnection(result.connection || null);
      setError(result.error || null);
      setPhase(result.status);
    } catch (cause) {
      setError(cause);
      setPhase('connection-error');
    }
  }, [activate, adapter, target]);

  useEffect(() => {
    loadTarget();
    return () => searchAbortRef.current?.abort();
  }, [loadTarget]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adapter.connectDirectory(target);
      if (result.status === 'mapping-choice' || result.status === 'mapping-confirmation') {
        setPendingMapping(result);
      } else if (result.status === 'connected') {
        await activate(result, { noticeText: 'החיבור נשמר ונפתח בהצלחה.' });
      }
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const completeMapping = async (candidate) => {
    setBusy(true);
    try {
      const result = await adapter.completeConnection(
        pendingMapping.target || target,
        pendingMapping.directoryHandle,
        candidate,
      );
      setPendingMapping(null);
      await activate(result, { noticeText: 'החיבור נשמר ונפתח בהצלחה.' });
    } catch (cause) {
      setPendingMapping(null);
      setError(cause);
      setPhase('directory-not-found');
    } finally {
      setBusy(false);
    }
  };

  const grantPermission = async () => {
    setBusy(true);
    try {
      await adapter.requestPermission(connection.directoryHandle);
      await loadTarget();
    } catch (cause) {
      if (cause?.name !== 'AbortError') setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const removeCurrentConnection = async () => {
    if (!connection) return;
    setBusy(true);
    try {
      await adapter.removeConnection(connection);
      setConnection(null);
      setNotice('החיבור השמור הוסר.');
      setPhase('no-connection');
      await refreshConnections();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  const navigateTo = useCallback(async (segments, { addHistory = true } = {}) => {
    if (!connection) return;
    setBusy(true);
    setError(null);
    try {
      const nextHandle = await adapter.resolveDirectory(connection.directoryHandle, segments);
      const listed = await adapter.listDirectory(nextHandle);
      setDirectoryHandle(nextHandle);
      setRelativeSegments(segments);
      setEntries(listed);
      setQuery('');
      setRecursiveSearch(false);
      setSearchState({ progress: null, results: [], searching: false, truncated: false });
      if (addHistory) {
        const nextHistory = history.slice(0, historyIndex + 1);
        nextHistory.push(segments);
        setHistory(nextHistory);
        setHistoryIndex(nextHistory.length - 1);
      }
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }, [adapter, connection, history, historyIndex]);

  const moveHistory = async (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= history.length) return;
    await navigateTo(history[nextIndex], { addHistory: false });
    setHistoryIndex(nextIndex);
  };

  const refresh = async () => {
    if (!directoryHandle) return;
    setBusy(true);
    try {
      setEntries(await adapter.listDirectory(directoryHandle));
      setError(null);
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    searchAbortRef.current?.abort();
    if (!recursiveSearch || !query.trim() || !directoryHandle) {
      setSearchState({ progress: null, results: [], searching: false, truncated: false });
      return undefined;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchState({ progress: { results: 0, visited: 0 }, results: [], searching: true, truncated: false });
    adapter.searchDirectory(directoryHandle, query, {
      onProgress: (progress) => setSearchState((current) => ({ ...current, progress })),
      recursive: true,
      signal: controller.signal,
    }).then((result) => {
      setSearchState({
        progress: { results: result.results.length, visited: result.visited },
        results: result.results,
        searching: false,
        truncated: result.truncated,
      });
    }).catch((cause) => {
      if (cause?.name !== 'AbortError') {
        setError(cause);
        setSearchState((current) => ({ ...current, searching: false }));
      }
    });
    return () => controller.abort();
  }, [adapter, directoryHandle, query, recursiveSearch]);

  const visibleEntries = useMemo(() => {
    if (recursiveSearch && query.trim()) return searchState.results;
    const normalized = query.trim().toLocaleLowerCase('he');
    if (!normalized) return entries;
    return entries.filter((entry) => entry.name.toLocaleLowerCase('he').includes(normalized));
  }, [entries, query, recursiveSearch, searchState.results]);

  const openEntry = async (entry) => {
    if (entry.isDirectory) {
      const segments = recursiveSearch && entry.relativeSegments
        ? [...relativeSegments, ...entry.relativeSegments]
        : [...relativeSegments, entry.name];
      await navigateTo(segments);
      return;
    }
    try {
      await adapter.openFile(entry.fileHandle);
    } catch (cause) {
      setError(cause);
    }
  };

  const handleReconnectResult = async (result) => {
    if (result.status === 'mapping-choice' || result.status === 'mapping-confirmation') {
      setConnectionsOpen(false);
      setPendingMapping(result);
    } else if (result.status === 'connected') {
      await refreshConnections();
    }
  };

  if (phase !== 'ready') {
    let state = {
      icon: HardDrive,
      title: 'פתיחת תיקיית רשת',
      body: <p>מכינים את הסייר…</p>,
    };
    if (phase === 'invalid') {
      state = {
        icon: CircleAlert,
        title: 'הקישור אינו תקין',
        body: <p>לא נמצא בקישור נתיב רשת תקין לפתיחה.</p>,
      };
    } else if (phase === 'unsupported') {
      state = {
        icon: CircleAlert,
        title: 'הדפדפן אינו תומך בפתיחת תיקיות',
        body: <p>יש לפתוח את הקישור בגרסה ארגונית עדכנית של Chrome או Edge, בחיבור מאובטח.</p>,
      };
    } else if (phase === 'no-connection') {
      state = {
        action: { busy, disabled: busy, label: 'בחירת תיקיית הרשת', onClick: connect },
        icon: Link2,
        title: 'נדרש חיבור חד־פעמי',
        body: (
          <>
            <p>בחרו את תיקיית הרשת המתאימה. החיבור נשמר רק בדפדפן הזה ובמצב קריאה בלבד.</p>
            {notice && <strong className="file-explorer-state-notice">{notice}</strong>}
            <code className="file-explorer-requested-path" dir="ltr">{target.displayPath}</code>
          </>
        ),
      };
    } else if (phase === 'permission-prompt') {
      state = {
        action: { busy, disabled: busy, label: 'מתן הרשאת קריאה', onClick: grantPermission },
        actionIcon: KeyRound,
        icon: KeyRound,
        title: 'נדרשת הרשאת קריאה',
        body: <p>הדפדפן זוכר את החיבור, אך נדרש אישור כדי לקרוא ממנו כעת.</p>,
      };
    } else if (phase === 'permission-denied') {
      state = {
        action: { busy, disabled: busy, label: 'חיבור מחדש', onClick: connect },
        icon: KeyRound,
        secondaryActions: [{
          disabled: busy,
          icon: Trash2,
          label: 'הסרת החיבור השמור',
          onClick: removeCurrentConnection,
        }],
        title: 'הגישה לתיקייה נחסמה',
        body: <p>אפשר לבחור שוב את תיקיית הרשת או להסיר את החיבור השמור בדפדפן הזה.</p>,
      };
    } else if (phase === 'directory-not-found') {
      state = {
        action: { busy, disabled: busy, label: 'בחירת תיקייה מחדש', onClick: connect },
        icon: CircleAlert,
        title: 'הנתיב המבוקש לא נמצא בחיבור',
        body: <p>בחרו תיקיית רשת שמכילה את הנתיב המוצג ונסו שוב.</p>,
      };
    } else if (phase === 'connection-error') {
      state = {
        action: { busy, disabled: busy, label: 'ניסיון חוזר', onClick: loadTarget },
        actionIcon: RefreshCw,
        icon: CircleAlert,
        title: 'לא הצלחנו לקרוא את התיקייה',
        body: <p>ייתכן שהרשת אינה זמינה כרגע או שהגישה לתיקייה השתנתה.</p>,
      };
    }
    return (
      <main className="file-explorer-page" dir="rtl">
        <StateCard
          action={state.action}
          actionIcon={state.actionIcon}
          error={error}
          icon={state.icon}
          secondaryActions={state.secondaryActions}
          title={state.title}
        >
          {state.body}
        </StateCard>
        {pendingMapping && (
          <MappingDialog pending={pendingMapping} onCancel={() => setPendingMapping(null)} onConfirm={completeMapping} />
        )}
      </main>
    );
  }

  const breadcrumbs = relativeSegments.map((segment, index) => ({
    label: segment,
    segments: relativeSegments.slice(0, index + 1),
  }));

  return (
    <main className="file-explorer-page" dir="rtl">
      <section className="file-explorer-shell">
        <header className="file-explorer-header">
          <div className="file-explorer-brand">
            <span className="file-explorer-brand-icon"><FolderOpen size={24} /></span>
            <div>
              <span className="file-explorer-eyebrow">גישה מאובטחת במצב קריאה</span>
              <h1>סייר קבצים</h1>
            </div>
          </div>
          <button className="file-explorer-secondary-button" type="button" onClick={() => setConnectionsOpen(true)}>
            <Settings2 size={17} />
            ניהול חיבורים
            <span className="file-explorer-count">{connections.length}</span>
          </button>
        </header>

        <div className="file-explorer-toolbar">
          <div className="file-explorer-navigation">
            <button className="file-explorer-icon-button" type="button" aria-label="אחורה" disabled={historyIndex <= 0 || busy} onClick={() => moveHistory(historyIndex - 1)}>
              <ArrowRight size={19} />
            </button>
            <button className="file-explorer-icon-button" type="button" aria-label="קדימה" disabled={historyIndex >= history.length - 1 || busy} onClick={() => moveHistory(historyIndex + 1)}>
              <ArrowLeft size={19} />
            </button>
            <button className="file-explorer-icon-button" type="button" aria-label="תיקיית אב" disabled={!relativeSegments.length || busy} onClick={() => navigateTo(relativeSegments.slice(0, -1))}>
              <ArrowUp size={19} />
            </button>
            <button className="file-explorer-icon-button" type="button" aria-label="רענון" disabled={busy} onClick={refresh}>
              <RefreshCw className={busy ? 'file-explorer-spin' : ''} size={18} />
            </button>
          </div>
          <nav className="file-explorer-breadcrumbs" aria-label="נתיב התיקייה">
            <button type="button" onClick={() => navigateTo([])} title={connection.displayPrefix}>
              <HardDrive size={16} />
              <span>{connection.label || connection.share}</span>
            </button>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.segments.join('\\')}>
                <ChevronLeft size={15} />
                <button type="button" onClick={() => navigateTo(crumb.segments)}>{crumb.label}</button>
              </span>
            ))}
          </nav>
        </div>

        <div className="file-explorer-commandbar">
          <label className="file-explorer-search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">חיפוש קבצים ותיקיות</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="חיפוש בתיקייה הנוכחית" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="ניקוי החיפוש"><X size={16} /></button>}
          </label>
          <label className="file-explorer-recursive-toggle">
            <input type="checkbox" checked={recursiveSearch} onChange={(event) => setRecursiveSearch(event.target.checked)} />
            <span>כולל תיקיות משנה</span>
          </label>
          <div className="file-explorer-view-toggle" aria-label="תצוגה">
            <button type="button" className={viewMode === 'list' ? 'is-active' : ''} onClick={() => setViewMode('list')} aria-label="תצוגת רשימה"><List size={18} /></button>
            <button type="button" className={viewMode === 'grid' ? 'is-active' : ''} onClick={() => setViewMode('grid')} aria-label="תצוגת אריחים"><Grid3X3 size={18} /></button>
          </div>
        </div>

        <div className="file-explorer-location-row">
          <code dir="ltr" title={currentDisplayPath(connection, relativeSegments)}>
            {currentDisplayPath(connection, relativeSegments)}
          </code>
          <span><ShieldCheck size={15} /> קריאה בלבד</span>
        </div>

        {notice && (
          <div className="file-explorer-inline-notice" role="status">
            <Check size={18} />
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="סגירת ההודעה"><X size={17} /></button>
          </div>
        )}

        {error && (
          <div className="file-explorer-inline-error" role="alert">
            <CircleAlert size={18} />
            <div>
              <strong>הפעולה לא הושלמה.</strong>
              <TechnicalDetails error={error} />
            </div>
            <button type="button" onClick={() => setError(null)} aria-label="סגירת ההודעה"><X size={17} /></button>
          </div>
        )}

        {recursiveSearch && query.trim() && (
          <div className="file-explorer-search-progress" aria-live="polite">
            {searchState.searching
              ? <><LoaderCircle className="file-explorer-spin" size={16} /> החיפוש מתבצע… נסרקו {searchState.progress?.visited || 0} פריטים</>
              : <>נמצאו {searchState.results.length} תוצאות לאחר סריקת {searchState.progress?.visited || 0} פריטים</>}
            {searchState.truncated && <span>החיפוש נעצר בגבול הבטיחות. אפשר לצמצם את הביטוי.</span>}
          </div>
        )}

        <div className={`file-explorer-content is-${viewMode}`}>
          {viewMode === 'list' && visibleEntries.length > 0 && (
            <div className="file-explorer-list-header" aria-hidden="true">
              <span>שם</span><span>סוג</span><span>גודל</span><span>תאריך שינוי</span><span />
            </div>
          )}
          <div className="file-explorer-entries" role="list">
            {visibleEntries.map((entry) => (
              <button
                className="file-explorer-entry"
                key={`${entry.isDirectory ? 'directory' : 'file'}-${entry.relativeSegments?.join('/') || entry.name}`}
                type="button"
                role="listitem"
                onClick={() => openEntry(entry)}
                title={entry.isDirectory ? `פתיחת ${entry.name}` : `פתיחה או הורדה של ${entry.name}`}
              >
                <span className="file-explorer-entry-primary">
                  <span className={`file-explorer-entry-icon is-${entry.kind}`}><EntryIcon kind={entry.kind} size={viewMode === 'grid' ? 32 : 20} /></span>
                  <span className="file-explorer-entry-name">
                    <strong>{entry.name}</strong>
                    {entry.relativeSegments?.length > 1 && <small>{entry.relativeSegments.slice(0, -1).join(' ← ')}</small>}
                  </span>
                </span>
                <span>{KIND_LABELS[entry.kind] || KIND_LABELS.file}</span>
                <span className="file-explorer-number">{entry.isDirectory ? '—' : formatSize(entry.size)}</span>
                <span className="file-explorer-number">{formatDate(entry.modifiedIso)}</span>
                <span className="file-explorer-entry-action">
                  {entry.isDirectory ? <ChevronLeft size={18} /> : entry.kind === 'pdf' || entry.kind === 'image' || entry.kind === 'text' ? <FolderOpen size={17} /> : <Download size={17} />}
                </span>
              </button>
            ))}
          </div>
          {!visibleEntries.length && !searchState.searching && (
            <div className="file-explorer-empty">
              <Folder size={38} strokeWidth={1.4} />
              <strong>{query ? 'לא נמצאו פריטים מתאימים' : 'התיקייה ריקה'}</strong>
              <p>{query ? 'נסו ביטוי אחר או הפעילו חיפוש בתיקיות משנה.' : 'אין קבצים או תיקיות להצגה במיקום הזה.'}</p>
            </div>
          )}
        </div>

        <footer className="file-explorer-footer">
          <span>{visibleEntries.length} פריטים</span>
          <span><Check size={14} /> החיבור נשמר בדפדפן זה בלבד</span>
        </footer>
      </section>

      {connectionsOpen && (
        <ConnectionDialog
          adapter={adapter}
          connections={connections}
          onClose={() => setConnectionsOpen(false)}
          onConnectionsChanged={refreshConnections}
          onReconnectResult={handleReconnectResult}
        />
      )}
      {pendingMapping && (
        <MappingDialog pending={pendingMapping} onCancel={() => setPendingMapping(null)} onConfirm={completeMapping} />
      )}
    </main>
  );
}

export default function FileExplorerPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(FILE_EXPLORER_TARGET_PARAM);
  const target = useMemo(() => decodeFileExplorerTarget(token), [token]);
  return <FileExplorerView target={target} />;
}
