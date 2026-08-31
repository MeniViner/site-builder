import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Bot, Redo2, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import { toast } from 'react-toastify';
import AIService from '../services/AIService';
import { parseJsonFromModel } from '../utils/aiJson';
import { formatAiEngineLabel, getSafeAiRuntimeConfig } from '../config/ai.config';
import DismissibleNotice from './DismissibleNotice';
import AiPromptSuggestionButton from './AiPromptSuggestionButton';
import AdminAIResponsePanel from './AdminAIResponsePanel';
import {
    ADMIN_AI_EXECUTION_MODES,
    ADMIN_AI_EXECUTION_OUTCOMES,
    createAdminAiErrorResult,
    createAdminAiExecutionResult,
    createAdminAiNoChangeResult,
    normalizeAdminAiApplyResult,
} from '../utils/adminAiExecution';

export default function AdminAIActionCard({
    title = 'עוזר AI',
    description = '',
    inputLabel = 'מה תרצה שאציע?',
    inputPlaceholder = 'תאר בקצרה מה צריך לייצר...',
    defaultInput = '',
    buildPrompt,
    onApply,
    mode = 'json',
    applyButtonLabel = 'החל הצעה',
    generateButtonLabel = 'צור עם AI',
    className = '',
    compact = false,
    compactLabel = 'AI',
    compactButtonClassName = '',
    autoApplyLatest = true,
    autoCloseOnApply = true,
    canUndo = false,
    canRedo = false,
    onUndo,
    onRedo,
    secondaryPanel = null,
    secondaryPanelTitle = '',
    primaryPanelTabLabel = 'יצירת תוכן',
    secondaryPanelTabLabel = 'עוזר תפעולי',
    suggestedActions = [],
    suggestionSurfaceKey,
}) {
    const runtimeConfig = useMemo(() => getSafeAiRuntimeConfig(), []);
    const [instruction, setInstruction] = useState(defaultInput);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [rawOutput, setRawOutput] = useState('');
    const [parsedOutput, setParsedOutput] = useState(null);
    const [modelUsed, setModelUsed] = useState('');
    const [parseError, setParseError] = useState('');
    const [, setAutoApplyStatus] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [activePanelView, setActivePanelView] = useState('primary');
    const [hasAppliedResult, setHasAppliedResult] = useState(false);
    const [selectedSuggestedActionId, setSelectedSuggestedActionId] = useState(suggestedActions[0]?.id || '');
    const [resultReadOnly, setResultReadOnly] = useState(
        suggestedActions[0]?.mode === 'analysis' || suggestedActions[0]?.readOnly === true
    );
    const [responseNotice, setResponseNotice] = useState('');
    const [executionResult, setExecutionResult] = useState(null);
    const [appliedSummary, setAppliedSummary] = useState([]);
    const lastAutoAppliedKeyRef = useRef('');
    const autoApplyingRef = useRef(false);
    const instructionInputId = useId();

    const isEnabled = AIService.isEnabled();

    useEffect(() => {
        if (!isOpen) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };

        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            setActivePanelView('primary');
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        const userInstruction = instruction.trim();
        if (!userInstruction) {
            toast.error('יש להזין בקשה לפני יצירת תוכן ב-AI');
            return;
        }
        if (typeof buildPrompt !== 'function') {
            toast.error('הוגדרה תבנית בקשה לא תקינה למסך זה');
            return;
        }

        setIsGenerating(true);
        setParseError('');
        setAutoApplyStatus('');
        setRawOutput('');
        setParsedOutput(null);
        setResponseNotice('');
        setExecutionResult(null);

        try {
            const selectedSuggestedAction = suggestedActions.find(
                (action) => action.id === selectedSuggestedActionId
            );
            const readOnlyRequest = selectedSuggestedAction?.mode === 'analysis'
                || selectedSuggestedAction?.readOnly === true;
            setResultReadOnly(readOnlyRequest);
            const prompt = buildPrompt(userInstruction, {
                action: selectedSuggestedAction,
                readOnly: readOnlyRequest,
            });
            let streamed = '';
            const result = await AIService.ask(prompt, {
                model: runtimeConfig.defaultModel,
                onToken: (token) => {
                    streamed += token;
                    setRawOutput((prev) => prev + token);
                },
            });
            const content = String(result?.content || streamed || '').trim();

            setRawOutput(content);
            setModelUsed(formatAiEngineLabel(result));

            if (readOnlyRequest || mode !== 'json') {
                setParsedOutput(content);
                if (readOnlyRequest) {
                    setExecutionResult(createAdminAiExecutionResult({
                        mode: ADMIN_AI_EXECUTION_MODES.ANALYSIS,
                        outcome: ADMIN_AI_EXECUTION_OUTCOMES.ANALYSIS,
                        rawResponseText: content,
                        userMessage: 'תוצאה: נותח בלבד',
                    }));
                }
            } else {
                try {
                    const parsed = parseJsonFromModel(content);
                    setParsedOutput(parsed);
                } catch {
                    setParsedOutput(null);
                    const noChange = createAdminAiNoChangeResult({
                        rawResponseText: content,
                        errorCode: 'INVALID_JSON',
                        reason: 'תשובת המודל אינה JSON תקין.',
                    });
                    setExecutionResult(noChange);
                    setResponseNotice(noChange.userMessage);
                }
            }
        } catch (error) {
            const msg = error?.message || 'יצירת תוכן ב-AI נכשלה';
            setExecutionResult(createAdminAiErrorResult(error, {
                mode: resultReadOnly ? ADMIN_AI_EXECUTION_MODES.ANALYSIS : ADMIN_AI_EXECUTION_MODES.MUTATING,
                rawResponseText: rawOutput,
            }));
            setParseError(msg);
            setParsedOutput(null);
            toast.error(msg);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleApply = async () => {
        if (typeof onApply !== 'function') {
            toast.error('פעולת Apply לא הוגדרה למסך זה');
            return;
        }
        if (resultReadOnly) return;
        if (parsedOutput === null || parsedOutput === undefined) {
            toast.error('אין פלט מוכן ליישום');
            return;
        }

        setIsApplying(true);
        try {
            const applied = normalizeAdminAiApplyResult(
                await onApply(parsedOutput, rawOutput),
                { parsedPayload: parsedOutput, rawResponseText: rawOutput }
            );
            setExecutionResult(applied);
            if (applied.outcome !== ADMIN_AI_EXECUTION_OUTCOMES.APPLIED) {
                setResponseNotice(applied.userMessage || 'לא זוהה שינוי שניתן להחיל.');
                return;
            }
            setHasAppliedResult(true);
            setAppliedSummary(applied.appliedChangeSummary || []);
            if (compact && autoCloseOnApply) {
                setIsOpen(false);
            }
        } catch (error) {
            const msg = error?.message || 'החלת תוצאות AI נכשלה';
            setExecutionResult(createAdminAiErrorResult(error, {
                rawResponseText: rawOutput,
            }));
            toast.error(msg);
        } finally {
            setIsApplying(false);
        }
    };

    useEffect(() => {
        if (!autoApplyLatest || resultReadOnly) return undefined;
        if (!isEnabled || isGenerating || autoApplyingRef.current) return undefined;
        if (typeof onApply !== 'function') return undefined;
        if (parsedOutput === null || parsedOutput === undefined) return undefined;
        if (parseError) return undefined;

        const applyKey = `${rawOutput}::${JSON.stringify(parsedOutput)}`;
        if (!applyKey || lastAutoAppliedKeyRef.current === applyKey) return undefined;
        lastAutoAppliedKeyRef.current = applyKey;

        let cancelled = false;
        const run = async () => {
            setIsApplying(true);
            autoApplyingRef.current = true;
            setAutoApplyStatus('מחיל הצעת AI אוטומטית...');
            try {
                const applied = normalizeAdminAiApplyResult(
                    await onApply(parsedOutput, rawOutput),
                    { parsedPayload: parsedOutput, rawResponseText: rawOutput }
                );
                if (!cancelled) {
                    setExecutionResult(applied);
                    if (applied.outcome !== ADMIN_AI_EXECUTION_OUTCOMES.APPLIED) {
                        setResponseNotice(applied.userMessage || 'לא זוהה שינוי שניתן להחיל.');
                        return;
                    }
                    setHasAppliedResult(true);
                    setAppliedSummary(applied.appliedChangeSummary || []);
                    if (compact && autoCloseOnApply) {
                        setIsOpen(false);
                    }
                    setAutoApplyStatus('הצעת ה-AI הוחלה אוטומטית. ניתן לחזור אחורה או קדימה עם החצים.');
                }
            } catch (error) {
                if (!cancelled) {
                    const msg = error?.message || 'החלת תוצאות AI נכשלה';
                    setExecutionResult(createAdminAiErrorResult(error, {
                        rawResponseText: rawOutput,
                    }));
                    setAutoApplyStatus('');
                    setParseError(msg);
                    toast.error(msg);
                }
            } finally {
                if (!cancelled) {
                    setIsApplying(false);
                }
                autoApplyingRef.current = false;
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [autoApplyLatest, autoCloseOnApply, compact, isEnabled, isGenerating, onApply, parseError, parsedOutput, rawOutput, resultReadOnly]);

    const panel = (
        <section className={`rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5 ${className}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                    <h3 className="flex items-center gap-2 text-lg font-black text-theme">
                        <Sparkles size={18} className="text-primary" />
                        {title}
                    </h3>
                    {description && <p className="text-sm text-theme-muted">{description}</p>}
                </div>
                <div className="text-xs text-theme-muted">
                    {modelUsed ? (
                        <span className="inline-flex items-center gap-1">
                            <Bot size={12} />
                            מודל: {modelUsed}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1">
                            <Bot size={12} />
                            AI פעיל
                        </span>
                    )}
                </div>
            </div>

            {!isEnabled && (
                <DismissibleNotice dismissKey={`ai-disabled:${runtimeConfig.apiBase}`} className="mt-4 rounded-xl border border-amber-300/40 bg-amber-100/60 px-3 py-2 text-sm text-amber-900">
                    <div className="font-bold">AI כבוי כרגע</div>
                    <div className="mt-1">
                        כדי להפעיל: הגדר `VITE_ALPHA_AI_ENABLED=true` וודא ש-`VITE_ALPHA_AI_API_BASE` תקין.
                    </div>
                    <div className="mt-1 text-xs">apiBase: {runtimeConfig.apiBase}</div>
                </DismissibleNotice>
            )}

            <div className="mt-4 space-y-3">
                {suggestedActions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {suggestedActions.map((action) => (
                            <button
                                key={action.id}
                                type="button"
                                onClick={() => {
                                    setSelectedSuggestedActionId(action.id);
                                    setInstruction(action.prompt);
                                    setParsedOutput(null);
                                    setParseError('');
                                    setExecutionResult(null);
                                    setResponseNotice('');
                                    setResultReadOnly(action.mode === 'analysis' || action.readOnly === true);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                                    selectedSuggestedActionId === action.id
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-theme-subtle bg-theme-card text-theme-muted hover:border-primary/40 hover:text-primary'
                                }`}
                            >
                                {action.label}
                            </button>
                        ))}
                    </div>
                )}
                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <label htmlFor={instructionInputId} className="text-xs font-bold uppercase tracking-wide text-theme-muted">
                            {inputLabel}
                        </label>
                        <AiPromptSuggestionButton
                            surfaceKey={suggestionSurfaceKey}
                            actionKey={selectedSuggestedActionId}
                            currentValue={instruction}
                            onChange={setInstruction}
                            disabled={isGenerating}
                        />
                    </div>
                    <textarea
                        id={instructionInputId}
                        value={instruction}
                        onChange={(e) => setInstruction(e.target.value)}
                        rows={3}
                        placeholder={inputPlaceholder}
                        className="w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-3 text-theme outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={!isEnabled || isGenerating}
                        className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Wand2 size={14} />
                        {isGenerating ? 'יוצר...' : resultReadOnly ? 'נתח והצג תשובה' : generateButtonLabel}
                    </button>

                    {autoApplyLatest ? (
                        <span className="hidden">
                            {/* {autoApplyStatus || 'ההצעה האחרונה תוחל אוטומטית'} */}
                        </span>
                    ) : !resultReadOnly ? (
                        <button
                            type="button"
                            onClick={handleApply}
                            disabled={!isEnabled || isGenerating || isApplying || parsedOutput === null}
                            className="inline-flex h-10 items-center gap-2 rounded-xl border border-theme-subtle bg-theme-card px-4 text-sm font-bold text-theme transition hover:bg-theme-card-hover disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isApplying ? 'מחיל...' : applyButtonLabel}
                        </button>
                    ) : null}

                    {!resultReadOnly && (typeof onUndo === 'function' || typeof onRedo === 'function') && (
                        <div className="inline-flex items-center gap-1 rounded-xl border border-theme-subtle bg-theme-card p-1">
                            <button
                                type="button"
                                onClick={onUndo}
                                disabled={!canUndo || isGenerating || isApplying}
                                aria-label="בטל שינוי AI"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme transition hover:bg-theme-card-hover disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Undo2 size={15} />
                            </button>
                            <button
                                type="button"
                                onClick={onRedo}
                                disabled={!canRedo || isGenerating || isApplying}
                                aria-label="בצע מחדש שינוי AI"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-theme transition hover:bg-theme-card-hover disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Redo2 size={15} />
                            </button>
                        </div>
                    )}
                </div>

                {parseError && (
                    <DismissibleNotice dismissKey={parseError} className="rounded-xl border border-red-300/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300">
                        <div className="inline-flex items-center gap-2 font-bold">
                            <AlertTriangle size={14} />
                            שגיאה בתגובה
                        </div>
                        <div className="mt-1">{parseError}</div>
                    </DismissibleNotice>
                )}

                {(resultReadOnly || responseNotice || [
                    ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE,
                    ADMIN_AI_EXECUTION_OUTCOMES.ERROR,
                ].includes(executionResult?.outcome)) ? (
                    <AdminAIResponsePanel
                        content={rawOutput}
                        isLoading={resultReadOnly && isGenerating}
                        modelLabel={modelUsed}
                        notice={responseNotice}
                        outcome={executionResult?.outcome || ''}
                        onClear={() => { setRawOutput(''); setResponseNotice(''); setExecutionResult(null); }}
                    />
                ) : rawOutput ? (
                    <div className="rounded-xl border border-theme-subtle bg-theme-card p-3">
                        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-theme-muted">פלט AI</div>
                        <pre dir="ltr" className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-left font-mono text-xs text-theme">
                            {rawOutput}
                        </pre>
                    </div>
                ) : null}
            </div>
        </section>
    );

    if (!compact) {
        return panel;
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border border-black/20 bg-white px-3 text-sm font-bold text-black transition hover:bg-black hover:text-white dark:border-white/20 dark:bg-[#111] dark:text-white dark:hover:bg-white dark:hover:text-black ${compactButtonClassName}`}
            >
                <Sparkles size={15} />
                {compactLabel}
            </button>

            {hasAppliedResult && !resultReadOnly && (typeof onUndo === 'function' || typeof onRedo === 'function') && (
                <div className="inline-flex h-10 items-center gap-1 rounded-xl border border-primary/25 bg-primary/5 p-1" title="שינוי AI הוחל. אפשר לדפדף אחורה וקדימה.">
                    <button
                        type="button"
                        onClick={onUndo}
                        disabled={!canUndo || isGenerating || isApplying}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="חזור לשינוי AI קודם"
                        title="חזור לשינוי AI קודם"
                    >
                        <Undo2 size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={onRedo}
                        disabled={!canRedo || isGenerating || isApplying}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="עבור לשינוי AI הבא"
                        title="עבור לשינוי AI הבא"
                    >
                        <Redo2 size={15} />
                    </button>
                    <span className="px-1 text-[10px] font-black text-primary">AI הוחל</span>
                    {appliedSummary.length > 0 && (
                        <span className="max-w-56 truncate px-1 text-[10px] font-bold text-primary" title={appliedSummary.join(' · ')}>
                            {appliedSummary.join(' · ')}
                        </span>
                    )}
                </div>
            )}

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
                    onClick={() => setIsOpen(false)}
                >
                    <div
                        className={`w-full max-h-[88vh] overflow-auto rounded-2xl border border-black/15 bg-white p-4 shadow-2xl dark:border-white/15 dark:bg-[#111] sm:p-5 ${secondaryPanel ? 'max-w-4xl' : 'max-w-3xl'}`}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between gap-3 border-b border-black/10 pb-3 dark:border-white/10">
                            <h2 className="text-lg font-black text-black dark:text-white">AI Assistant</h2>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white text-black transition hover:bg-black hover:text-white dark:border-white/15 dark:bg-[#161616] dark:text-white dark:hover:bg-white dark:hover:text-black"
                                aria-label="סגור חלון AI"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        {secondaryPanel ? (
                            <div className="space-y-4">
                                <div className="inline-flex rounded-xl border border-black/15 bg-white p-1 dark:border-white/15 dark:bg-[#151515]">
                                    <button
                                        type="button"
                                        onClick={() => setActivePanelView('primary')}
                                        className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${activePanelView === 'primary' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/10'}`}
                                    >
                                        {primaryPanelTabLabel}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActivePanelView('secondary')}
                                        className={`rounded-lg px-3 py-1.5 text-sm font-bold transition ${activePanelView === 'secondary' ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/10'}`}
                                    >
                                        {secondaryPanelTabLabel || secondaryPanelTitle}
                                    </button>
                                </div>
                                {activePanelView === 'primary' ? (
                                    <div>{panel}</div>
                                ) : (
                                    <section className="rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-[#171717] sm:p-5">
                                        {secondaryPanelTitle && (
                                            <h3 className="mb-3 text-base font-black text-black dark:text-white">{secondaryPanelTitle}</h3>
                                        )}
                                        {secondaryPanel}
                                    </section>
                                )}
                            </div>
                        ) : (
                            panel
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
