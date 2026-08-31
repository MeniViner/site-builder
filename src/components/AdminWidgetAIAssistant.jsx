import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Redo2, RotateCcw, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import AIService from '../services/AIService';
import { formatAiEngineLabel, getSafeAiRuntimeConfig } from '../config/ai.config';
import { isWidgetAiButtonEnabled, UI_FEATURES } from '../config/uiFeatures.config';
import { useAdminAiHistory } from '../hooks/useAdminAiHistory';
import AiPromptSuggestionButton from './AiPromptSuggestionButton';
import AdminAIResponsePanel from './AdminAIResponsePanel';
import {
    buildAdminAiPrompt,
    getAdminAiAction,
    getAdminAiActionMode,
    getAdminAiCapability,
    getAdminAiInstructionIssue,
    isAdminAiReadOnly,
    sanitizeAdminAiSnapshot,
} from '../utils/adminAiCapabilities';
import {
    ADMIN_AI_EXECUTION_OUTCOMES,
    buildAdminAiChangeSummary,
    didAdminAiApplyChange,
    executeAdminAiResponse,
} from '../utils/adminAiExecution';

const RUNTIME_CONFIG = getSafeAiRuntimeConfig();

function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

const AdminWidgetAIAssistant = forwardRef(function AdminWidgetAIAssistant({
    widgetKey,
    surfaceKey = `widget:${widgetKey}`,
    value,
    onChange,
    showLauncher = true,
}, ref) {
    const capability = useMemo(() => getAdminAiCapability(widgetKey), [widgetKey]);
    const [isOpen, setIsOpen] = useState(false);
    const [selectedActionId, setSelectedActionId] = useState(capability.actions[0]?.id || '');
    const [instruction, setInstruction] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [answer, setAnswer] = useState('');
    const [answerNotice, setAnswerNotice] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [modelUsed, setModelUsed] = useState('');
    const [executionOutcome, setExecutionOutcome] = useState('');
    const [historyBusy, setHistoryBusy] = useState(false);

    const selectedAction = useMemo(
        () => getAdminAiAction(widgetKey, selectedActionId),
        [selectedActionId, widgetKey]
    );
    const readOnly = useMemo(
        () => isAdminAiReadOnly(widgetKey, selectedActionId),
        [selectedActionId, widgetKey]
    );
    const aiEnabled = AIService.isEnabled();

    useEffect(() => {
        setSelectedActionId(capability.actions[0]?.id || '');
        setInstruction('');
        setAnswer('');
        setAnswerNotice('');
        setErrorMessage('');
        setExecutionOutcome('');
        setIsOpen(false);
    }, [capability.actions, widgetKey]);

    const applyValue = useCallback(async (nextValue) => {
        const result = onChange?.(clone(nextValue));
        const resolved = result && typeof result.then === 'function' ? await result : result;
        if (resolved === false) throw new Error('שמירת שינוי ה-AI נכשלה');
    }, [onChange]);
    const {
        history,
        recordAndApply,
        applyIndex: applyStoredHistoryIndex,
        hide: hideHistory,
    } = useAdminAiHistory(surfaceKey, applyValue);

    useImperativeHandle(ref, () => ({
        async applyExternalResult(nextValue, options = {}) {
            const baseline = clone(options.baseline === undefined ? value : options.baseline);
            const candidate = clone(nextValue);
            if (!didAdminAiApplyChange(baseline, candidate, widgetKey)) return false;
            const summary = buildAdminAiChangeSummary(
                baseline,
                candidate,
                widgetKey,
                options.actionId || 'external-import'
            );
            await recordAndApply(
                [candidate],
                baseline,
                options.label || 'ייבוא עם AI',
                { summaries: [summary] }
            );
            return true;
        },
    }), [recordAndApply, value, widgetKey]);

    const showAiButton = showLauncher && isWidgetAiButtonEnabled(widgetKey);
    const showHistoryOnly = UI_FEATURES.showAiUi && history.visible && history.entries.length > 1;
    if (!showAiButton && !showHistoryOnly) return null;

    const applyHistoryIndex = async (nextIndex) => {
        if (!history.entries.length) return;
        const safeIndex = Math.max(0, Math.min(Number(nextIndex) || 0, history.entries.length - 1));
        if (safeIndex === history.index) return;
        setHistoryBusy(true);
        try {
            await applyStoredHistoryIndex(safeIndex);
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
        const instructionIssue = getAdminAiInstructionIssue(widgetKey, selectedActionId, effectiveInstruction);
        if (instructionIssue) {
            setAnswer(instructionIssue);
            setAnswerNotice('לא הוחל שינוי. נדרשת הבהרה לפני שליחת בקשת AI.');
            setExecutionOutcome(ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE);
            setErrorMessage('');
            setModelUsed('');
            return;
        }

        setIsGenerating(true);
        setAnswer('');
        setAnswerNotice('');
        setErrorMessage('');
        setModelUsed('');
        setExecutionOutcome('');

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
            setModelUsed(formatAiEngineLabel(result) || RUNTIME_CONFIG.defaultModel || '');

            const execution = await executeAdminAiResponse({
                mode: getAdminAiActionMode(widgetKey, selectedActionId),
                rawResponseText: content,
                surfaceKey: widgetKey,
                actionId: selectedActionId,
                instruction: effectiveInstruction,
                baseline,
                applyCandidates: async ({ candidates, summaries }) => {
                    const applied = await recordAndApply(
                        candidates,
                        baseline,
                        selectedAction?.label || 'שינוי AI',
                        { summaries }
                    );
                    return {
                        changed: applied === true,
                        persistenceTriggered: applied === true,
                        historyEntryCreated: applied === true,
                        appliedSnapshot: candidates[0],
                        appliedChangeSummary: summaries[0],
                    };
                },
            });
            setExecutionOutcome(execution.outcome);

            if (execution.outcome === ADMIN_AI_EXECUTION_OUTCOMES.APPLIED) {
                setInstruction('');
                setIsOpen(false);
                toast.success(execution.appliedChangeSummary?.join(' · ') || 'שינוי ה-AI הוחל ונשמר');
                return;
            }

            setAnswer(execution.rawResponseText || execution.userMessage || 'לא התקבלה תשובה מה-AI.');
            setAnswerNotice(execution.userMessage || '');
            if (execution.outcome === ADMIN_AI_EXECUTION_OUTCOMES.ERROR) {
                setErrorMessage(execution.userMessage || 'החלת תוצאת ה-AI נכשלה');
            }
        } catch (error) {
            const message = error?.message || 'פעולת AI נכשלה';
            setExecutionOutcome(ADMIN_AI_EXECUTION_OUTCOMES.ERROR);
            setErrorMessage(message);
            toast.error(message);
        } finally {
            setIsGenerating(false);
        }
    };

    const index = history.index || 0;
    const aiCount = Math.max(0, history.entries.length - 1);
    const canUndo = Boolean(history.entries.length && index > 0);
    const canRedo = Boolean(history.entries.length && index < history.entries.length - 1);

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
                            <button key={item.id} type="button" onClick={() => { setSelectedActionId(item.id); setErrorMessage(''); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${item.id === selectedActionId ? 'border-primary bg-primary/10 text-primary' : 'border-gray-200 text-gray-600 dark:border-white/10 dark:text-gray-300'}`}>
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${readOnly ? 'border-sky-200 bg-sky-50 dark:border-sky-500/25 dark:bg-sky-500/10' : 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/25 dark:bg-emerald-500/10'}`}>
                        <div className="font-black">{selectedAction?.label}</div>
                        <div className="mt-1 text-xs leading-5">{selectedAction?.hint}</div>
                    </div>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <span className="text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">הנחיה</span>
                        <AiPromptSuggestionButton
                            surfaceKey={surfaceKey}
                            actionKey={selectedActionId}
                            currentValue={instruction}
                            onChange={setInstruction}
                            disabled={isGenerating}
                        />
                    </div>
                    <textarea aria-label="הנחיית AI" value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={6} placeholder={selectedAction?.hint || 'כתוב בקשה או הדבק טקסט...'} className="mt-2 w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 outline-none dark:border-white/10 dark:bg-white/5" disabled={isGenerating} />
                    {!aiEnabled && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"><AlertTriangle size={15} className="ml-2 inline" />AI כבוי כרגע</div>}
                    {errorMessage && <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">{errorMessage}</div>}
                    <AdminAIResponsePanel
                        content={answer}
                        isLoading={readOnly && isGenerating}
                        modelLabel={modelUsed}
                        notice={answerNotice}
                        outcome={executionOutcome}
                        onClear={() => { setAnswer(''); setAnswerNotice(''); setExecutionOutcome(''); }}
                    />
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
                {showAiButton && (
                    <button type="button" onClick={() => setIsOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-black/20 bg-white px-3 text-sm font-bold text-black transition hover:bg-black hover:text-white dark:border-white/20 dark:bg-[#111] dark:text-white" title={`AI — ${capability.title}`}>
                        <Sparkles size={15} />AI
                    </button>
                )}
                {history.visible && history.entries.length > 1 && (
                    <div className="inline-flex h-10 items-center gap-0.5 rounded-xl border border-primary/25 bg-primary/5 p-1">
                        <button type="button" onClick={() => applyHistoryIndex(0)} disabled={historyBusy || index === 0} className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[10px] font-bold text-primary disabled:opacity-35" title="לפני AI"><RotateCcw size={13} />לפני AI</button>
                        <button type="button" onClick={() => applyHistoryIndex(index - 1)} disabled={historyBusy || !canUndo} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary disabled:opacity-35" aria-label="הקודם"><Undo2 size={14} /></button>
                        <span className="min-w-10 text-center text-[10px] font-black text-primary">{index === 0 ? 'מקור' : `${index}/${aiCount}`}</span>
                        {index > 0 && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                השינוי הוחל
                            </span>
                        )}
                        <button type="button" onClick={() => applyHistoryIndex(index + 1)} disabled={historyBusy || !canRedo} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary disabled:opacity-35" aria-label="הבא"><Redo2 size={14} /></button>
                        {history.entries[index]?.summary?.length > 0 && (
                            <span className="max-w-52 truncate px-1 text-[10px] font-bold text-primary" title={history.entries[index].summary.join(' · ')}>
                                {history.entries[index].summary.join(' · ')}
                            </span>
                        )}
                        <button type="button" onClick={hideHistory} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary" aria-label="הסתר היסטוריית AI"><X size={13} /></button>
                    </div>
                )}
            </div>
            {modal}
        </>
    );
});

export default AdminWidgetAIAssistant;
