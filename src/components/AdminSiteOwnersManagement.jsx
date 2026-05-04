import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { addUserToAssociatedOwnersGroup } from '../services/sharePointOwnersService';
import { OWNERS_LOGS_ENABLED } from '../services/sharePointOwnersLogger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getLatestErrorLog(logs = []) {
  return [...logs].reverse().find((entry) => entry.level === 'error') || [...logs].reverse()[0] || null;
}

function getTechnicalField(result, field) {
  const technical = result?.technicalError;
  if (!technical || typeof technical !== 'object') return undefined;
  return technical[field];
}

function getDisplayError(result) {
  if (!result || result.ok) return '';
  if (result.status === 'access-denied') return 'רק בעל אתר קיים יכול להוסיף בעל אתר נוסף.';
  if (result.status === 'user-not-found-or-not-resolvable') return 'לא ניתן היה לאתר או לזהות את המשתמש ב־SharePoint.';
  if (result.status === 'missing-email') return 'יש להזין כתובת מייל.';
  if (result.status === 'invalid-email') return 'כתובת המייל אינה תקינה.';
  return 'הפעולה נכשלה. ניתן לפתוח את פרטי השגיאה לבדיקה טכנית.';
}

function formatLogData(data) {
  if (data === undefined) return '';
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export default function AdminSiteOwnersManagement() {
  const [email, setEmail] = useState('');
  const [result, setResult] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clientError, setClientError] = useState('');

  const trimmedEmail = email.trim();
  const latestLog = useMemo(() => getLatestErrorLog(result?.logs || []), [result]);
  const recentLogs = useMemo(() => (result?.logs || []).slice(-10), [result]);
  const showDebug = Boolean(!result?.ok && result?.logs?.length) || OWNERS_LOGS_ENABLED;

  const handleEmailChange = (event) => {
    setEmail(event.target.value);
    setResult(null);
    setClientError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setResult(null);
    setClientError('');

    if (!trimmedEmail) {
      setClientError('יש להזין כתובת מייל.');
      return;
    }

    if (!EMAIL_RE.test(trimmedEmail)) {
      setClientError('כתובת המייל אינה תקינה.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await addUserToAssociatedOwnersGroup(trimmedEmail);
      setResult(response);
    } catch (error) {
      setResult({
        ok: false,
        status: 'unknown-error',
        userMessage: 'הפעולה נכשלה. ניתן לפתוח את פרטי השגיאה לבדיקה טכנית.',
        technicalError: error,
        logs: [],
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-full bg-gray-50 px-6 py-8 text-gray-900 dark:bg-[#12141a] dark:text-white sm:px-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#232733] sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
              <ShieldCheck size={24} />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">ניהול מנהלים</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500 dark:text-gray-400">
              במסך זה ניתן להוסיף משתמש כבעל אתר SharePoint עבור האתר הנוכחי בלבד.
            </p>
          </div>
          <div className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200">
            הפעולה מוסיפה משתמש רק לקבוצת בעלי האתר המשויכת לאתר הנוכחי.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#232733]">
          <label htmlFor="site-owner-email" className="block text-sm font-bold text-gray-800 dark:text-gray-100">
            כתובת מייל של המשתמש
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              id="site-owner-email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="user@domain.com"
              disabled={isSubmitting}
              className="min-h-12 flex-1 rounded-lg border border-gray-300 bg-white px-4 text-left text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#1b1f2a] dark:text-white"
              dir="ltr"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
              {isSubmitting ? 'מוסיף מנהל...' : 'הוסף כבעל אתר'}
            </button>
          </div>

          {(clientError || (!result?.ok && result)) && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              <AlertTriangle className="mt-0.5 shrink-0" size={18} />
              <span>{clientError || getDisplayError(result)}</span>
            </div>
          )}

          {result?.ok && (
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
              <div>
                <p>{result.status === 'already-owner' ? 'המשתמש כבר מוגדר כבעל אתר.' : 'המשתמש נוסף בהצלחה כבעל אתר.'}</p>
                {result.ownersGroupTitle && (
                  <p className="mt-1 text-xs opacity-80">קבוצה: {result.ownersGroupTitle}</p>
                )}
              </div>
            </div>
          )}
        </form>

        {showDebug && (
          <details className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#232733]">
            <summary className="cursor-pointer text-sm font-bold text-gray-800 dark:text-gray-100">פרטי לוג טכניים</summary>
            <div className="mt-4 grid gap-3 text-sm text-gray-600 dark:text-gray-300">
              <div className="grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-[#1b1f2a]">
                <div><span className="font-bold text-gray-900 dark:text-white">שלב אחרון:</span> {latestLog?.step || getTechnicalField(result, 'step') || '-'}</div>
                <div dir="ltr" className="break-all text-left"><span className="font-bold text-gray-900 dark:text-white">endpoint:</span> {getTechnicalField(result, 'endpoint') || latestLog?.data?.endpoint || '-'}</div>
                <div><span className="font-bold text-gray-900 dark:text-white">status:</span> {getTechnicalField(result, 'status') || latestLog?.data?.status || '-'}</div>
                <div><span className="font-bold text-gray-900 dark:text-white">statusText:</span> {getTechnicalField(result, 'statusText') || latestLog?.data?.statusText || '-'}</div>
                <div><span className="font-bold text-gray-900 dark:text-white">durationMs:</span> {getTechnicalField(result, 'durationMs') || latestLog?.data?.durationMs || '-'}</div>
                <div><span className="font-bold text-gray-900 dark:text-white">message:</span> {getTechnicalField(result, 'message') || result?.userMessage || '-'}</div>
              </div>

              <div className="max-h-80 overflow-auto rounded-lg border border-gray-200 bg-gray-950 p-3 text-left text-xs text-gray-100 dark:border-white/10" dir="ltr">
                {recentLogs.length === 0 ? (
                  <p className="text-gray-400">No log entries captured.</p>
                ) : recentLogs.map((entry) => (
                  <div key={`${entry.time}-${entry.step}-${entry.message}`} className="mb-3 border-b border-white/10 pb-3 last:mb-0 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap gap-2 font-bold">
                      <span>{entry.time}</span>
                      <span>{entry.level}</span>
                      <span>{entry.step}</span>
                    </div>
                    <div className="mt-1">{entry.message}</div>
                    {entry.data !== undefined && (
                      <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-white/5 p-2">
                        {formatLogData(entry.data)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
