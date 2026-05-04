import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { ensureUsersDbFolderPermissionsReady } from '../services/sharePointPermissionsSetup';

const RUNNING_PANEL_DELAY_MS = 700;

function getTechnicalStatus(result) {
  const technical = result?.technicalError;
  if (!technical || typeof technical !== 'object') return null;
  return technical.status ?? null;
}

function getFailedStep(result) {
  const technical = result?.technicalError;
  if (!technical || typeof technical !== 'object') return result?.status || 'setup-failed';
  return technical.step || result?.status || 'setup-failed';
}

function formatLogData(data) {
  if (data === undefined) return '';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function SharePointPermissionsSetupStatus() {
  const [result, setResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showRunning, setShowRunning] = useState(false);

  useEffect(() => {
    if (SHAREPOINT_CONFIG.useMock) {
      return undefined;
    }

    let alive = true;
    let delayTimer = null;

    setIsRunning(true);
    delayTimer = window.setTimeout(() => {
      if (alive) setShowRunning(true);
    }, RUNNING_PANEL_DELAY_MS);

    ensureUsersDbFolderPermissionsReady()
      .then((setupResult) => {
        if (!alive) return;
        setResult(setupResult);
      })
      .catch((error) => {
        if (!alive) return;
        setResult({
          ok: false,
          status: 'setup-failed',
          userMessage: 'הגדרת ההרשאות הראשונית נכשלה. ניתן להמשיך להשתמש באתר, אך יש לפנות למנהל האתר.',
          technicalError: error,
          logs: [],
        });
      })
      .finally(() => {
        if (!alive) return;
        setIsRunning(false);
        setShowRunning(false);
      });

    return () => {
      alive = false;
      if (delayTimer) window.clearTimeout(delayTimer);
    };
  }, []);

  const latestLogs = useMemo(() => {
    const logs = Array.isArray(result?.logs) ? result.logs : [];
    return logs.slice(-8);
  }, [result]);

  if (SHAREPOINT_CONFIG.useMock) return null;
  if (isRunning && !showRunning) return null;
  if (isRunning) {
    return (
      <div dir="rtl" className="fixed left-4 top-4 z-[120] w-[min(420px,calc(100vw-2rem))] rounded-xl border border-primary/35 bg-theme-card/95 p-4 text-theme shadow-2xl backdrop-blur">
        <div className="flex items-start gap-3">
          <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" />
          <div>
            <p className="text-sm font-bold">בודק הגדרת הרשאות SharePoint</p>
            <p className="mt-1 text-xs leading-5 text-theme-muted">
              מתבצעת בדיקה חד-פעמית לתיקיית מסד הנתונים. האתר ממשיך להיטען כרגיל.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!result || result.ok) return null;

  return (
    <div dir="rtl" className="fixed left-4 top-4 z-[120] w-[min(520px,calc(100vw-2rem))] rounded-xl border border-red-400/45 bg-theme-card/95 p-4 text-theme shadow-2xl backdrop-blur">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">נדרשת הגדרת הרשאות SharePoint</p>
          <p className="mt-1 text-sm leading-6 text-theme-muted">{result.userMessage}</p>
          <div className="mt-3 grid gap-1 text-xs text-theme-muted">
            {result.folderUrl && <div><span className="font-bold text-theme">תיקייה:</span> {result.folderUrl}</div>}
            <div><span className="font-bold text-theme">שלב שנכשל:</span> {getFailedStep(result)}</div>
            {getTechnicalStatus(result) && (
              <div><span className="font-bold text-theme">סטטוס טכני:</span> {getTechnicalStatus(result)}</div>
            )}
          </div>

          <details className="mt-3 rounded-lg border border-theme-subtle bg-theme-elevated/70 p-3">
            <summary className="cursor-pointer text-xs font-bold text-theme">פרטי בדיקה אחרונים</summary>
            <div className="mt-3 max-h-64 overflow-auto text-left" dir="ltr">
              {latestLogs.length === 0 ? (
                <p className="text-xs text-theme-muted">No setup logs captured.</p>
              ) : latestLogs.map((entry) => (
                <div key={`${entry.time}-${entry.step}-${entry.message}`} className="mb-3 border-b border-theme-subtle pb-2 last:mb-0 last:border-b-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                    <span>{entry.time}</span>
                    <span>{entry.level}</span>
                    <span>{entry.step}</span>
                  </div>
                  <div className="mt-1 text-xs">{entry.message}</div>
                  {entry.data !== undefined && (
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-black/30 p-2 text-[11px] text-gray-100">
                      {formatLogData(entry.data)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

export function SharePointPermissionsSetupSuccessNote({ result }) {
  if (!result?.ok || result.status === 'already-configured') return null;
  return (
    <div className="flex items-center gap-2 text-sm text-emerald-600">
      <CheckCircle2 size={16} />
      <span>SharePoint permissions setup completed.</span>
    </div>
  );
}
