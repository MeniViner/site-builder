import React, { useCallback, useEffect, useRef, useState } from 'react';
import kasharDraftStore from '../services/KasharDraftStore';

function downloadRawDiagnostic({ key, metadata, raw }) {
    const capturedAt = new Date().toISOString();
    const payload = JSON.stringify({
        kind: 'site-builder-kashar-draft-diagnostic',
        capturedAt,
        key,
        metadata,
        raw,
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kashar-draft-diagnostic-${capturedAt.replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

/**
 * Development-only startup recovery UI. It deliberately does not consume the
 * ConfigProvider so it still works while the main configuration is unavailable.
 */
export default function KasharDraftRecoveryPanel({ store = kasharDraftStore, onRetry }) {
    const importInputRef = useRef(null);
    const [inspection, setInspection] = useState(null);
    const [actionError, setActionError] = useState(null);
    const [busy, setBusy] = useState(false);

    const refreshInspection = useCallback(async () => {
        try {
            setActionError(null);
            setInspection(await store.inspect());
        } catch (error) {
            setActionError(error?.message || 'Unable to inspect Kashar draft storage.');
        }
    }, [store]);

    useEffect(() => {
        refreshInspection();
    }, [refreshInspection]);

    const runRecovery = async (action) => {
        setBusy(true);
        try {
            await action();
            await refreshInspection();
            onRetry?.();
        } catch (error) {
            setActionError(error?.message || 'Kashar draft recovery action failed.');
        } finally {
            setBusy(false);
        }
    };

    const reset = () => {
        if (!window.confirm('Reset Kashar demo data? This replaces the active draft with the fixture. Existing readable data is backed up first.')) {
            return;
        }
        runRecovery(() => store.reset());
    };

    const importDraft = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        if (!window.confirm('Import this Kashar draft? The current active draft will be backed up first.')) return;
        await runRecovery(async () => store.importDraftText(await file.text()));
    };

    const records = inspection?.records || [];

    return (
        <section className="mt-6 rounded-lg border border-amber-300/50 bg-amber-950/30 p-4 text-right text-sm text-amber-50" aria-label="Kashar draft recovery">
            <h2 className="font-bold">Kashar draft recovery (development only)</h2>
            <p className="mt-1 text-xs text-amber-100">
                The records below are read directly from the Kashar draft namespace. Download before resetting if the draft may contain edits.
            </p>
            {actionError && <p role="alert" className="mt-3 rounded bg-red-950/70 p-2 text-red-100">{actionError}</p>}
            <div className="mt-3 space-y-2 text-left" dir="ltr">
                {records.map((record) => (
                    <div key={record.key} className="rounded border border-amber-200/30 bg-black/20 p-2">
                        <div className="break-all font-mono text-[11px]">{record.key}</div>
                        <div className="mt-1 text-[11px] text-amber-100">
                            {record.byteSize} bytes · JSON {record.jsonParseResult} · {record.topLevelType || 'unknown'} · {record.classification} ({record.reason})
                        </div>
                        {record.topLevelKeys.length > 0 && <div className="mt-1 break-all text-[11px] text-amber-100">keys: {record.topLevelKeys.join(', ')}</div>}
                        <button
                            type="button"
                            className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-950 disabled:opacity-50"
                            disabled={busy}
                            onClick={() => {
                                try {
                                    downloadRawDiagnostic({ key: record.key, metadata: record, raw: store.getRawForRecovery(record.key) });
                                } catch (error) {
                                    setActionError(error?.message || 'Unable to download this raw draft record.');
                                }
                            }}
                        >
                            Download raw diagnostic
                        </button>
                    </div>
                ))}
                {inspection && records.length === 0 && <p className="text-xs text-amber-100">No Kashar draft records were found.</p>}
            </div>
            <input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={importDraft} />
            <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={refreshInspection} disabled={busy} className="rounded border border-amber-100/50 px-3 py-1.5 text-xs font-bold disabled:opacity-50">Refresh diagnostics</button>
                <button type="button" onClick={() => importInputRef.current?.click()} disabled={busy} className="rounded border border-amber-100/50 px-3 py-1.5 text-xs font-bold disabled:opacity-50">Import Kashar draft</button>
                <button type="button" onClick={reset} disabled={busy} className="rounded bg-red-200 px-3 py-1.5 text-xs font-bold text-red-950 disabled:opacity-50">Reset Kashar demo data</button>
                <button type="button" onClick={() => onRetry?.()} disabled={busy} className="rounded bg-white px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-50">Retry load</button>
            </div>
        </section>
    );
}
