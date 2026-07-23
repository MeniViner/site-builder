import { Link, useSearchParams } from 'react-router-dom';
import { decodeFileExplorerTarget, FILE_EXPLORER_TARGET_PARAM } from '../utils/fileExplorerTargets';
import { getLocalFileBridgeHref, isLocalFileBridgeEnabled } from '../utils/linkTargets';
import { getRuntimeValue } from '../services/storage/runtimeConfig';

function getProductionExplorerUrl(token) {
  try {
    const configuredUrl = getRuntimeValue('fileExplorerApiUrl', import.meta.env.VITE_FILE_EXPLORER_API_URL || '');
    const apiUrl = new URL(configuredUrl);
    if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password) return null;
    return `${apiUrl.toString().replace(/\/+$/, '')}/api/file-explorer?${FILE_EXPLORER_TARGET_PARAM}=${encodeURIComponent(token)}`;
  } catch {
    return null;
  }
}

export default function FileExplorerPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(FILE_EXPLORER_TARGET_PARAM);
  const target = decodeFileExplorerTarget(token);
  const localBridgeUrl = target && isLocalFileBridgeEnabled() ? getLocalFileBridgeHref(target.canonicalHref) : null;
  const explorerUrl = localBridgeUrl || (target && token ? getProductionExplorerUrl(token) : null);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50 px-4 py-6 text-slate-900 sm:px-8" dir="rtl">
      <section className="mx-auto flex w-full max-w-[1500px] flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-sm backdrop-blur">
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-cyan-700">SITE BUILDER</p>
            <h1 className="mt-1 text-xl font-bold">סייר הקבצים הארגוני</h1>
            {target && <p className="mt-1 max-w-4xl truncate text-sm text-slate-600" title={target.displayPath}>{target.displayPath}</p>}
          </div>
          <Link className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold transition hover:border-cyan-600 hover:text-cyan-700" to="/">חזרה לאתר</Link>
        </div>
        {!target && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">הנתיב אינו תקין או שהקישור אינו מורשה.</div>}
        {target && !explorerUrl && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">סייר הקבצים אינו מוגדר בסביבה זו. יש להגדיר כתובת API בצד הלקוח ושורשי גישה מורשים בצד השרת.</div>}
        {explorerUrl && <iframe className="min-h-[calc(100vh-170px)] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg" src={explorerUrl} title={`סייר קבצים: ${target.displayPath}`} />}
      </section>
    </main>
  );
}
