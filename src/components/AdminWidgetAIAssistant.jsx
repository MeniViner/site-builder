import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bot, Loader2, Redo2, RotateCcw, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import AIService from '../services/AIService';
import { getSafeAiRuntimeConfig } from '../config/ai.config';
import { UI_FEATURES } from '../config/uiFeatures.config';
import { parseJsonFromModel } from '../utils/aiJson';
import {
    applyAdminAiActionSemantics,
    buildAdminAiPrompt,
    extractAdminAiCandidates,
    getAdminAiAction,
    getAdminAiCapability,
    isAdminAiReadOnly,
    normalizeAdminAiCandidate,
    sanitizeAdminAiSnapshot,
} from '../utils/adminAiCapabilities';

const RUNTIME_CONFIG = getSafeAiRuntimeConfig();

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return '';
    }
}

function uniqueCandidates(candidates, baseline) {
    const seen = new Set([stableStringify(baseline)]);
    return candidates.filter((candidate) => {
        const key = stableStringify(candidate);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

const AdminWidgetAIAssistant = forwardRef(function AdminWidgetAIAssistant({ widgetKey, value, onChange }, ref) {
    const capability = useMemo(() => getAdminAiCapability(widgetKey), [widgetKey]);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedActionId, setSelectedActionId] = useState(capability.actions[0]?.id || '');
    const [instruction, setInstruction] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [answer, setAnswer] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [modelUsed, setModelUsed] = useState('');
    const [history, setHistory] = useState(null);
    const [historyBusy, setHistoryBusy] = useState(false);
    const [historyVisible, setHistoryVisible] = useState(false);

    const selectedAction = useMemo(
        () => getAdminAiAction(widgetKey, selectedActionId),
        [selectedActionId, widgetKey]
    );
    const readOnly = useMemo(
        () => isAdminAiReadOnly(widgetKey, selectedActionId),
        [selectedActionId, widgetKey]
    );
    const aiEnabled = AIService.isEnabled();

    const applyValue = useCallback(async (nextValue) => {
        const result = onChange?.(clone(nextValue));
        const resolved = result && typeof result.then === 'function' ? await result : result;
        if (resolved === false) throw new Error('שמירת שינוי ה-AI נכשלה');
    }, [onChange]);

    const recordAndApply = useCallback(async (candidates, baseline, label) => {
        await applyValue(candidates[0]);
        setHistory((currentHistory) => {
            const currentHistoryValue = currentHistory?.entries?.[currentHistory.index]?.value;
            const baseEntries = currentHistory && stableStringify(currentHistoryValue) === stableStringify(baseline)
                ? currentHistory.entries.slice(0, currentHistory.index + 1)
                : [{ value: clone(baseline), label: 'לפני AI', createdAt: Date.now() }];
            const firstCandidateIndex = baseEntries.length;
            const entries = [
                ...baseEntries,
                ...candidates.map((candidate, index) => ({
                    value: clone(candidate),
                    label: candidates.length > 1 ? `חלופה ${index + 1}` : label || 'שינוי AI',
                    createdAt: Date.now() + index + 1,
                })),
            ];
            return { entries, index: firstCandidateIndex };
        });
        setHistoryVisible(true);
    }, [applyValue]);

    useImperativeHandle(ref, () => ({
        async applyExternalResult(nextValue, options = {}) {
            const baseline = clone(options.baseline === undefined ? value : options.baseline);
            const candidate = clone(nextValue);
            if (stableStringify(candidate) === stableStringify(baseline)) return false;
            await recordAndApply([candidate], baseline, options.label || 'ייבוא עם AI');
            return true;
        },
    }), [recordAndApply, value]);

    if (!UI_FEATURES.showAiUi || (!UI_FEATURES.showWidgetAiButtons && !historyVisible)) return null;

    const applyHistoryIndex = async (nextIndex) => {
        if (!history?.entries?.length) return;
        const safeIndex = Math.max(0, Math.min(Number(nextIndex) || 0, history.entries.length - 1));
        if (safeIndex === history.index) return;
        setHistoryBusy(true);
        try {
            await applyValue(history.entries[safeIndex].value);
            setHistory((current) => current ? { ...current, index: safeIndex } : current);
        } catch (error) {
            toast.error(error?.message || 'החזרת שינוי AI נכשלה');
        } finally {
            setHistoryBusy(false);
        }
    };

    const generate = async () => {
        if (!aiEnabled) {
            toast.error('AI כבוי כרגע בהגדרות האתר');
            return;
        }

        const effectiveInstruction = instruction.trim() || selectedAction?.hint || '';
        if (!effectiveInstruction) {
            toast.error('יש להזין בקשה');
            return;
        }

        setIsGenerating(true);
        setAnswer('');
        setErrorMessage('');
        setModelUsed('');

        try {
            const baseline = clone(value);
            const prompt = buildAdminAiPrompt({
                tab: widgetKey,
                actionId: selectedActionId,
                instruction: effectiveInstruction,
                currentSnapshot: sanitizeAdminAiSnapshot(widgetKey, baseline),
            });
            let streamed = '';
            const result = await AIService.ask(prompt, {
                model: RUNTIME_CONFIG.defaultModel,
                onToken: (token) => {
                    streamed += token;
                    if (readOnly) setAnswer((previous) => previous + token);
                },
            });
            const content = String(result?.content || streamed || '').trim();
            setModelUsed(result?.modelUsed || result?.model || RUNTIME_CONFIG.defaultModel || '');

            if (readOnly) {
                setAnswer(content || 'לא התקבלה תשובה מה-AI.');
                return;
            }

            const parsed = parseJsonFromModel(content);
            const candidates = uniqueCandidates(
                extractAdminAiCandidates(parsed)
                    .map((candidate) => normalizeAdminAiCandidate(widgetKey, candidate, baseline, {
                        instruction: effectiveInstruction,
                        actionId: selectedActionId,
                    }))
                    .map((candidate) => applyAdminAiActionSemantics(widgetKey, selectedActionId, baseline, candidate))
                    .filter((candidate) => candidate !== undefined && candidate !== null),
                baseline
            );

            if (!candidates.length) {
                setAnswer('לא נמצא שינוי שימושי לבצע. התוכן הקיים נשאר ללא שינוי.');
                return;
            }

            await recordAndApply(candidates, baseline, selectedAction?.label || 'שינוי AI');
            setInstruction('');
            setIsOpen(false);
        } catch (error) {
            const message = error?.message || 'פעולת AI נכשלה';
            setErrorMessage(message);
            toast.error(message);
        } finally {
            setIsGenerating(false);
        }
    };

    const index = history?.index || 0;
    const aiCount = Math.max(0, (history?.entries?.length || 1) - 1);
    const canUndo = Boolean(history?.entries?.length && index > 0);
    const canRedo = Boolean(history?.entries?.length && index < history.entries.length - 1);

    const modal = isOpen && typeof document !== 'undefined' ? createPortal(
        <div dir="rtl" className="fixed inset-0 z-[12100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onClick={() => !isGenerating && setIsOpen(false)} data-admin-ai-ui>
            <div className="w-full max-w-3xl overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl dark:border-white/15 dark:bg-[#12151b]" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-white/10">
                    <div>
                        <div className="flex items-center gap-2 text-lg font-black text-gray-950 dark:text-white"><Sparkles size={18} className="text-primary" />AI — {capability.title}</div>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{capability.description}</p>
                    </div>
                    <button type="button" onClick={() => setIsOpen(false)} disabled={isGenerating} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 dark:border-white/10" aria-label="סגור"><X size={16} /></button>
                </div>
                <div className="max-h-[78vh] overflow-y-auto px-5 py-5">
                    <div className="flex flex-wrap gap-2">
                        {capability.actions.map((item) => (
                            <button key={item.id} type="button" onClick={() => { setSelectedActionId(item.id); setAnswer(''); setErrorMessage(''); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${item.id === selectedActionId ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 dark:border-white/10 dark:text-gray-300'}`}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${readOnly ? 'border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10'}`}>
                        <div className="font-black">{selectedAction?.label}</div>
                        <div className="mt-1 text-xs leading-5">{selectedAction?.hint}</div>
                    </div>
                    <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={6} placeholder={selectedAction?.hint || 'כתוב בקשה או הדבק טקסט...'} className="mt-4 w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 outline-none dark:border-white/10 dark:bg-white/5" disabled={isGenerating} />
                    {!aiEnabled && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"><AlertTriangle size={15} className="ml-2 inline" />AI כבוי כרגע</div>}
                    {errorMessage && <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{errorMessage}</div>}
                    {answer && (
                        <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                            <div className="mb-2 flex items-center gap-2 text-xs font-black text-gray-500"><Bot size={13} />תשובת AI {modelUsed ? `· ${modelUsed}` : ''}</div>
                            <div className="whitespace-pre-wrap text-sm leading-7">{answer}</div>
                        </div>
                    )}
                    <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-white/10">
                        <span className="text-xs text-gray-500">{readOnly ? 'ניתוח בלבד — התוכן לא ישתנה.' : 'התוצאה תוחל מיד ותישמר דרך המסך.'}</span>
                        <button type="button" onClick={generate} disabled={!aiEnabled || isGenerating} className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white disabled:opacity-50">
                            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                            {isGenerating ? 'עובד...' : readOnly ? 'נתח והצג תשובה' : 'צור והחל מיד'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <div className="inline-flex items-center gap-1">
                {UI_FEATURES.showWidgetAiButtons && (
                    <button type="button" onClick={() => setIsOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/20 bg-white px-3 text-sm font-bold text-black transition hover:bg-black hover:text-white dark:border-white/20 dark:bg-[#111] dark:text-white" title={`AI — ${capability.title}`}>
                        <Sparkles size={15} />AI
                    </button>
                )}
                {historyVisible && history?.entries?.length > 1 && (
                    <div className="inline-flex h-10 items-center gap-0.5 rounded-xl border border-primary/25 bg-primary/5 p-1">
                        <button type="button" onClick={() => applyHistoryIndex(0)} disabled={historyBusy || index === 0} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-bold text-primary disabled:opacity-35" title="לפני AI"><RotateCcw size={13} />לפני AI</button>
                        <button type="button" onClick={() => applyHistoryIndex(index - 1)} disabled={historyBusy || !canUndo} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary disabled:opacity-35" aria-label="הקודם"><Undo2 size={14} /></button>
                        <span className="min-w-10 text-center text-[10px] font-black text-primary">{index === 0 ? 'מקור' : `${index}/${aiCount}`}</span>
                        <button type="button" onClick={() => applyHistoryIndex(index + 1)} disabled={historyBusy || !canRedo} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary disabled:opacity-35" aria-label="הבא"><Redo2 size={14} /></button>
                        <button type="button" onClick={() => setHistoryVisible(false)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary" aria-label="הסתר היסטוריית AI"><X size={13} /></button>
                    </div>
                )}
            </div>
            {modal}
        </>
    );
});

export default AdminWidgetAIAssistant;
