import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { decodeFileExplorerTarget, FILE_EXPLORER_TARGET_PARAM } from '../utils/fileExplorerTargets';
import { getLocalFileBridgeHref, isLocalFileBridgeEnabled } from '../utils/linkTargets';
import { getRuntimeValue } from '../services/storage/runtimeConfig';
import { buildFileExplorerUrl, resolveFileExplorerEndpoint } from '../utils/fileExplorerBridge';

function getExplorerEndpoint() {
  return resolveFileExplorerEndpoint({
    apiOverride: getRuntimeValue('fileExplorerApiUrl', import.meta.env.VITE_FILE_EXPLORER_API_URL || ''),
    bridgePath: getRuntimeValue('fileExplorerBridgePath', import.meta.env.VITE_FILE_EXPLORER_BRIDGE_PATH || ''),
  });
}

export default function FileExplorerPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const explorerFrameRef = useRef(null);
  const token = searchParams.get(FILE_EXPLORER_TARGET_PARAM);
  const target = decodeFileExplorerTarget(token);
  const localBridgeUrl = target && isLocalFileBridgeEnabled() ? getLocalFileBridgeHref(target.canonicalHref) : null;
  const endpoint = useMemo(() => getExplorerEndpoint(), []);
  const explorerUrl = localBridgeUrl || (target && token ? buildFileExplorerUrl(endpoint, token) : null);
  const [remoteBridgeState, setRemoteBridgeState] = useState('checking');
  const bridgeState = localBridgeUrl ? 'ready' : target ? remoteBridgeState : 'idle';

  useEffect(() => {
    if (!target || localBridgeUrl) return undefined;
    const controller = new AbortController();
    fetch(buildFileExplorerUrl(endpoint, '', 'readiness'), { credentials: endpoint.startsWith('/') ? 'same-origin' : 'include', signal: controller.signal })
      .then(async (response) => ({ body: await response.json().catch(() => ({})), ok: response.ok }))
      .then(({ body, ok }) => setRemoteBridgeState(ok && body?.ok && body?.readiness?.bridge?.routeAvailable ? 'ready' : 'unavailable'))
      .catch((cause) => { if (cause.name !== 'AbortError') setRemoteBridgeState('unavailable'); });
    return () => controller.abort();
  }, [endpoint, localBridgeUrl, target]);

  useEffect(() => {
    const handleExplorerMessage = (event) => {
      if (event.source !== explorerFrameRef.current?.contentWindow) return;
      if (event.data?.type === 'site-builder:navigate-home') navigate('/');
    };
    window.addEventListener('message', handleExplorerMessage);
    return () => window.removeEventListener('message', handleExplorerMessage);
  }, [navigate]);

  return (
    <main className="h-screen overflow-hidden bg-slate-100 p-2 text-slate-900 sm:p-3" dir="rtl">
      <section className="mx-auto flex h-full w-full max-w-[1800px] flex-col">
        {!target && <div className="m-auto rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm">הנתיב אינו תקין או שהקישור אינו מורשה.</div>}
        {target && bridgeState === 'checking' && <div className="m-auto rounded-xl border border-cyan-200 bg-cyan-50 px-5 py-4 text-cyan-950 shadow-sm">מתבצעת בדיקת זמינות של גשר סייר הקבצים...</div>}
        {target && (!explorerUrl || bridgeState === 'unavailable') && <div className="m-auto max-w-3xl rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm">גשר סייר הקבצים באותו אתר אינו זמין. יש לוודא שכלל IIS עבור <code>/_site-builder/file-explorer</code> פעיל, Windows Authentication מופעל, ו-Node זמין ב-loopback.</div>}
        {explorerUrl && bridgeState === 'ready' && (
          <iframe
            ref={explorerFrameRef}
            className="h-full min-h-0 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            src={explorerUrl}
            title={`סייר קבצים: ${target.displayPath}`}
          />
        )}
      </section>
    </main>
  );
}
