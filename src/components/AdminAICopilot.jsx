import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import AIService from '../services/AIService';
import { getSafeAiRuntimeConfig } from '../config/ai.config';
import { parseJsonFromModel } from '../utils/aiJson';
import { useSiteContent } from '../context/SiteContentContext';
import { useNavigation } from '../context/NavigationContext';
import { useEvents } from '../context/EventsContext';
import { useWidget } from '../context/WidgetContext';
import { useTheme } from '../context/ThemeContext';
import { useExternalLinks } from '../context/ExternalLinksContext';
import { useImageGalleries } from '../context/ImageGalleryContext';
import { useGantt } from '../context/GanttContext';
import { useOrgChart } from '../context/OrgChartContext';
import AdminAIHistoryBar from './AdminAIHistoryBar';
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
const SMALL_WIDGET_TABS = new Set([
  'alerts',
  'outstanding',
  'countdown',
  'news',
  'phonebook',
  'shuttles',
  'polls',
  'celebrations',
  'heritage',
  'tips',
]);

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function stableStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function captureVisibleAdminText() {
  if (typeof document === 'undefined') return '';
  const main = document.querySelector('[data-admin-main-content]');
  const bodyText = String(main?.innerText || document.body?.innerText || '');
  return bodyText
    .replace(/AI Assistant[\s\S]*?$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 10000);
}

function widgetCounts(widgetConfig) {
  const keys = ['events', 'alerts', 'outstanding', 'news', 'phonebook', 'shuttles', 'polls', 'celebrations', 'heritage', 'tips'];
  const counts = Object.fromEntries(keys.map((key) => [key, Array.isArray(widgetConfig?.[key]) ? widgetConfig[key].length : 0]));
  counts.countdown = Array.isArray(widgetConfig?.countdown?.items) ? widgetConfig.countdown.items.length : 0;
  return counts;
}

function currentWidgetsSnapshot(widgetConfig) {
  const activeWidgets = Array.isArray(widgetConfig?.activeWidgets) ? widgetConfig.activeWidgets.slice(0, 3) : [];
  return {
    activeWidgets,
    rotationInterval: widgetConfig?.rotationInterval,
    events: clone(widgetConfig?.events || []),
    displayCount: widgetConfig?.displayCount,
    displayMode: widgetConfig?.displayMode,
    intervalMs: widgetConfig?.intervalMs,
    alerts: clone(widgetConfig?.alerts || []),
    outstanding: clone(widgetConfig?.outstanding || []),
    countdown: clone(widgetConfig?.countdown || {}),
    news: clone(widgetConfig?.news || []),
    phonebook: clone(widgetConfig?.phonebook || []),
    shuttles: clone(widgetConfig?.shuttles || []),
    polls: clone(widgetConfig?.polls || []),
    celebrations: clone(widgetConfig?.celebrations || []),
    heritage: clone(widgetConfig?.heritage || []),
    tips: clone(widgetConfig?.tips || []),
  };
}

function getSafeSmallWidgetValue(tab, widgetConfig) {
  if (tab === 'countdown') return clone(widgetConfig?.countdown || {});
  return clone(widgetConfig?.[tab] || []);
}

function dedupeCandidates(candidates, baseline) {
  const seen = new Set([stableStringify(baseline)]);
  const result = [];
  candidates.forEach((candidate) => {
    const key = stableStringify(candidate);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(candidate);
  });
  return result;
}

function ensureSuccess(result, message) {
  if (result === false) throw new Error(message);
  return result;
}

export default function AdminAICopilot({ activeTab }) {
  const capability = useMemo(() => getAdminAiCapability(activeTab), [activeTab]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedActionId, setSelectedActionId] = useState(capability.actions[0]?.id || '');
  const [instruction, setInstruction] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [modelUsed, setModelUsed] = useState('');
  const historiesRef = useRef({});
  const [, setHistoryRevision] = useState(0);

  const { siteContent, saveSiteContent } = useSiteContent();
  const { navItems, saveNavigation } = useNavigation();
  const {
    events,
    displayCount,
    displayMode,
    intervalMs,
    saveEvents,
  } = useEvents();
  const { widgetConfig, saveWidgetConfig } = useWidget();
  const { theme, saveTheme } = useTheme();
  const { externalLinks, saveExternalLinks } = useExternalLinks();
  const { galleries, saveGalleries } = useImageGalleries();
  const { gantt, saveGantt } = useGantt();
  const { orgChart, saveOrgChart } = useOrgChart();

  const selectedAction = useMemo(
    () => getAdminAiAction(activeTab, selectedActionId),
    [activeTab, selectedActionId],
  );
  const readOnly = useMemo(
    () => isAdminAiReadOnly(activeTab, selectedActionId),
    [activeTab, selectedActionId],
  );
  const aiEnabled = AIService.isEnabled();

  useEffect(() => {
    setSelectedActionId(capability.actions[0]?.id || '');
    setInstruction('');
    setAnswer('');
    setErrorMessage('');
    setIsOpen(false);
  }, [activeTab, capability.actions]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isGenerating) setIsOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, isOpen]);

  const getSnapshot = useCallback(() => {
    if (activeTab === 'info') return clone(siteContent || {});
    if (activeTab === 'links') return clone(navItems || []);
    if (activeTab === 'events') {
      return {
        events: clone(events || []),
        displayCount,
        displayMode,
        intervalMs,
      };
    }
    if (activeTab === 'widgets') {
      return { activeWidgets: clone(widgetConfig?.activeWidgets || []) };
    }
    if (activeTab === 'current-widgets') return currentWidgetsSnapshot(widgetConfig || {});
    if (activeTab === 'theme') return clone(theme || {});
    if (activeTab === 'external-links') return clone(externalLinks || []);
    if (activeTab === 'galleries') return clone(galleries || []);
    if (activeTab === 'gantt') return clone(gantt || {});
    if (activeTab === 'org-chart') return clone(orgChart || {});
    if (SMALL_WIDGET_TABS.has(activeTab)) return getSafeSmallWidgetValue(activeTab, widgetConfig || {});
    return null;
  }, [
    activeTab,
    displayCount,
    displayMode,
    events,
    externalLinks,
    galleries,
    gantt,
    intervalMs,
    navItems,
    orgChart,
    siteContent,
    theme,
    widgetConfig,
  ]);

  const getModelSnapshot = useCallback(() => {
    const current = getSnapshot();
    if (activeTab === 'widgets') {
      return sanitizeAdminAiSnapshot(activeTab, {
        ...current,
        contentCounts: widgetCounts(widgetConfig || {}),
      });
    }
    if (activeTab === 'current-widgets') {
      const active = new Set(current?.activeWidgets || []);
      const onlyActive = {
        activeWidgets: current?.activeWidgets || [],
        rotationInterval: current?.rotationInterval,
      };
      active.forEach((id) => {
        if (Object.prototype.hasOwnProperty.call(current || {}, id)) onlyActive[id] = current[id];
      });
      if (active.has('events')) {
        onlyActive.displayCount = current?.displayCount;
        onlyActive.displayMode = current?.displayMode;
        onlyActive.intervalMs = current?.intervalMs;
      }
      return sanitizeAdminAiSnapshot(activeTab, onlyActive);
    }
    return sanitizeAdminAiSnapshot(activeTab, current);
  }, [activeTab, getSnapshot, widgetConfig]);

  const applySnapshot = useCallback(async (snapshot) => {
    if (activeTab === 'info') {
      ensureSuccess(await saveSiteContent(snapshot), 'שמירת תוכן האתר נכשלה');
      return;
    }
    if (activeTab === 'links') {
      ensureSuccess(await saveNavigation(snapshot), 'שמירת הניווט נכשלה');
      return;
    }
    if (activeTab === 'events') {
      ensureSuccess(
        await saveEvents(snapshot?.events || [], snapshot?.displayCount, snapshot?.displayMode, snapshot?.intervalMs),
        'שמירת האירועים נכשלה',
      );
      return;
    }
    if (activeTab === 'widgets') {
      ensureSuccess(
        await saveWidgetConfig({ ...widgetConfig, activeWidgets: snapshot?.activeWidgets || [] }),
        'שמירת בחירת הווידג׳טים נכשלה',
      );
      return;
    }
    if (activeTab === 'current-widgets') {
      ensureSuccess(await saveWidgetConfig({ ...widgetConfig, ...(snapshot || {}) }), 'שמירת הווידג׳טים נכשלה');
      return;
    }
    if (activeTab === 'theme') {
      ensureSuccess(await saveTheme(snapshot), 'שמירת העיצוב נכשלה');
      return;
    }
    if (activeTab === 'external-links') {
      ensureSuccess(await saveExternalLinks(snapshot || []), 'שמירת הקישורים החיצוניים נכשלה');
      return;
    }
    if (activeTab === 'galleries') {
      await saveGalleries(snapshot || []);
      return;
    }
    if (activeTab === 'gantt') {
      await saveGantt(snapshot || {});
      return;
    }
    if (activeTab === 'org-chart') {
      ensureSuccess(await saveOrgChart(snapshot || {}), 'שמירת עץ המבנה נכשלה');
      return;
    }
    if (SMALL_WIDGET_TABS.has(activeTab)) {
      ensureSuccess(
        await saveWidgetConfig({ ...widgetConfig, [activeTab]: snapshot }),
        `שמירת ${capability.title} נכשלה`,
      );
    }
  }, [
    activeTab,
    capability.title,
    saveEvents,
    saveExternalLinks,
    saveGalleries,
    saveGantt,
    saveNavigation,
    saveOrgChart,
    saveSiteContent,
    saveTheme,
    saveWidgetConfig,
    widgetConfig,
  ]);

  const getHistory = useCallback(() => historiesRef.current[activeTab] || null, [activeTab]);
  const activeHistory = getHistory();

  const commitHistory = useCallback((history) => {
    historiesRef.current = {
      ...historiesRef.current,
      [activeTab]: history,
    };
    setHistoryRevision((value) => value + 1);
  }, [activeTab]);

  const applyHistoryIndex = useCallback(async (targetIndex) => {
    const history = getHistory();
    if (!history?.entries?.length) return;
    const safeIndex = Math.max(0, Math.min(Number(targetIndex) || 0, history.entries.length - 1));
    if (safeIndex === history.index) return;

    setHistoryBusy(true);
    try {
      await applySnapshot(clone(history.entries[safeIndex].value));
      commitHistory({ ...history, index: safeIndex });
      toast.success(safeIndex === 0 ? 'חזרנו למצב שלפני ה-AI' : `הוחלה תוצאת AI ${safeIndex}`);
    } catch (error) {
      toast.error(error?.message || 'החזרת גרסת AI נכשלה');
    } finally {
      setHistoryBusy(false);
    }
  }, [applySnapshot, commitHistory, getHistory]);

  const recordCandidatesAndApply = useCallback(async (baseline, candidates, actionLabel) => {
    const existingHistory = getHistory();
    const currentHistoryValue = existingHistory?.entries?.[existingHistory?.index]?.value;
    let baseHistory;

    if (existingHistory && sameValue(currentHistoryValue, baseline)) {
      baseHistory = {
        ...existingHistory,
        entries: existingHistory.entries.slice(0, existingHistory.index + 1),
      };
    } else {
      baseHistory = {
        entries: [{ value: clone(baseline), label: 'לפני AI', kind: 'baseline', createdAt: Date.now() }],
        index: 0,
      };
    }

    const uniqueCandidates = dedupeCandidates(candidates, baseline);
    if (!uniqueCandidates.length) {
      return false;
    }

    const firstIndex = baseHistory.entries.length;
    const entries = [
      ...baseHistory.entries,
      ...uniqueCandidates.map((candidate, index) => ({
        value: clone(candidate),
        label: uniqueCandidates.length > 1 ? `${actionLabel} · חלופה ${index + 1}` : actionLabel,
        kind: 'ai',
        createdAt: Date.now() + index,
      })),
    ];

    await applySnapshot(clone(uniqueCandidates[0]));
    commitHistory({ entries, index: firstIndex });
    return true;
  }, [applySnapshot, commitHistory, getHistory]);

  const generate = useCallback(async () => {
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
      const baseline = getSnapshot();
      const modelSnapshot = getModelSnapshot();
      const visibleContext = readOnly && ['admins', 'site-owners', 'backups', 'ai-help'].includes(activeTab)
        ? captureVisibleAdminText()
        : '';
      const prompt = buildAdminAiPrompt({
        tab: activeTab,
        actionId: selectedActionId,
        instruction: effectiveInstruction,
        currentSnapshot: modelSnapshot,
        visibleContext,
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
        setAnswer(content);
        return;
      }

      const parsed = parseJsonFromModel(content);
      const rawCandidates = extractAdminAiCandidates(parsed);
      const normalized = rawCandidates
        .map((candidate) => normalizeAdminAiCandidate(activeTab, candidate, baseline, {
          instruction: effectiveInstruction,
          actionId: selectedActionId,
        }))
        .map((candidate) => applyAdminAiActionSemantics(activeTab, selectedActionId, baseline, candidate))
        .filter((candidate) => candidate !== undefined && candidate !== null);

      const changed = await recordCandidatesAndApply(baseline, normalized, selectedAction?.label || 'שינוי AI');
      if (changed) {
        setIsOpen(false);
        setInstruction('');
        toast.success(normalized.length > 1
          ? `הוחלה חלופה 1. אפשר לדפדף בין ${normalized.length} תוצאות בסרגל AI.`
          : 'הצעת ה-AI הוחלה מיד. אפשר לחזור אחורה דרך סרגל AI.');
      } else {
        setAnswer('לא נמצא שינוי שימושי לבצע על המצב הקיים. שום דבר באתר לא שונה.');
      }
    } catch (error) {
      const message = error?.message || 'פעולת AI נכשלה';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }, [
    activeTab,
    aiEnabled,
    getModelSnapshot,
    getSnapshot,
    instruction,
    readOnly,
    recordCandidatesAndApply,
    selectedAction?.hint,
    selectedAction?.label,
    selectedActionId,
  ]);

  const modal = isOpen && typeof document !== 'undefined'
    ? createPortal(
        <div
          dir="rtl"
          className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
          onClick={() => !isGenerating && setIsOpen(false)}
          data-admin-ai-ui
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-3xl border border-black/10 bg-white shadow-2xl dark:border-white/15 dark:bg-[#12151b]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-white/10 sm:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-lg font-black text-gray-950 dark:text-white">
                  <Sparkles size={18} className="text-primary" />
                  AI — {capability.title}
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {capability.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isGenerating}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-100 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10"
                aria-label="סגור"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[78vh] overflow-y-auto px-5 py-5 sm:px-6">
              <div className="flex flex-wrap gap-2">
                {capability.actions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelectedActionId(item.id);
                      setAnswer('');
                      setErrorMessage('');
                    }}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                      item.id === selectedActionId
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-primary/30 hover:text-gray-900 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                readOnly
                  ? 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-100'
              }`}>
                <div className="flex items-start gap-2">
                  {readOnly ? <MessageSquare size={16} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={16} className="mt-0.5 shrink-0" />}
                  <div>
                    <div className="font-black">{selectedAction?.label}</div>
                    <div className="mt-0.5 text-xs leading-5 opacity-85">{selectedAction?.hint}</div>
                    {!readOnly && (
                      <div className="mt-1 text-xs font-bold">
                        התוצאה תחול מיד על האתר. לפני ההחלה נשמרת גרסה, ותמיד אפשר לחזור ל״לפני AI״ או לדפדף בין התוצאות.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  מה תרצה שה-AI יעשה?
                </span>
                <textarea
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  rows={6}
                  placeholder={selectedAction?.hint || 'כתוב בקשה או הדבק כאן טקסט...'}
                  className="w-full resize-y rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary/50 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-white/5 dark:text-white"
                  disabled={isGenerating}
                />
              </label>

              {!aiEnabled && (
                <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-black">
                    <AlertTriangle size={15} /> AI כבוי כרגע
                  </div>
                  <div className="mt-1 text-xs">הפעל VITE_ALPHA_AI_ENABLED והגדר API base תקין.</div>
                </div>
              )}

              {errorMessage && (
                <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                  <div className="flex items-center gap-2 font-black">
                    <AlertTriangle size={15} /> {errorMessage}
                  </div>
                </div>
              )}

              {answer && (
                <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="mb-2 flex items-center gap-2 text-xs font-black text-gray-500 dark:text-gray-400">
                    <Bot size={13} /> תשובת AI {modelUsed ? `· ${modelUsed}` : ''}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-7 text-gray-800 dark:text-gray-100">{answer}</div>
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-white/10">
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {modelUsed ? `מודל אחרון: ${modelUsed}` : `מודל: ${RUNTIME_CONFIG.defaultModel || 'ברירת מחדל'}`}
                </div>
                <button
                  type="button"
                  onClick={generate}
                  disabled={!aiEnabled || isGenerating}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-black text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                  {isGenerating ? 'עובד...' : (readOnly ? 'נתח והצג תשובה' : 'צור והחל מיד')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 z-[11910] inline-flex h-12 items-center gap-2 rounded-2xl border border-primary/30 bg-white px-4 text-sm font-black text-gray-950 shadow-xl transition hover:-translate-y-0.5 hover:border-primary hover:shadow-2xl dark:border-white/15 dark:bg-[#15171d] dark:text-white"
        title={`AI — ${capability.title}`}
        data-admin-ai-ui
      >
        <Sparkles size={17} className="text-primary" />
        AI
      </button>

      <AdminAIHistoryBar
        pageTitle={capability.title}
        history={activeHistory}
        busy={historyBusy}
        onPrevious={() => applyHistoryIndex((activeHistory?.index || 0) - 1)}
        onNext={() => applyHistoryIndex((activeHistory?.index || 0) + 1)}
        onReset={() => applyHistoryIndex(0)}
        onSelect={applyHistoryIndex}
      />

      {modal}
    </>
  );
}
