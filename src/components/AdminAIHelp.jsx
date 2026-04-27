import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bot, Copy, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import AIService from '../services/AIService';
import { getSafeAiRuntimeConfig } from '../config/ai.config';

const DEFAULT_QUESTION = 'איך נכון לעבוד עם שמירה אוטומטית במסכי הניהול בלי לאבד שינויים?';
const QUICK_PROMPTS = [
    'בנה לי תהליך עבודה בטוח לעריכת תוכן במסך "ניהול המידע", כולל סדר פעולות, שמירה, בדיקת תצוגה מקדימה ופרסום.',
    'איך למנוע דריסת נתונים במסכי הניהול כשכמה עורכים עובדים במקביל? תן נוהל עבודה ברור עם נקודות בקרה.',
    'תן לי צ׳קליסט לפני פרסום שינויים באתר: מה לבדוק בתוכן, ניווט, עיצוב, ווידג׳טים וקישורים חיצוניים.',
    'מה סדר הפעולות המומלץ לעדכון ווידג׳טים מהבחירה ועד אימות תוצאה באתר, כולל בדיקות תקינות אחרי שמירה?',
    'איך לתעד שינויי תוכן כדי שאפשר יהיה לשחזר מהר במקרה של טעות?',
    'איך לעבוד נכון עם תצוגה מקדימה כדי לזהות תקלות עיצוב לפני פרסום?',
    'תן נוהל בדיקה מהיר אחרי כל שמירה כדי לוודא שלא נשברו ניווטים, קישורים ורכיבים בדף הבית.',
];
const AI_HELP_SCOPE_PROMPT = [
    'תפקיד: עוזר AI פנימי של מערכת BIHS 7134 לבנייה, תחזוקה ותפעול האתר בלבד.',
    'היקף מותר: מסכי ניהול, תוכן אתר, ניווט, אירועים, עיצוב, ווידג׳טים, קישורים, SharePoint, אינטגרציות ומבנה המערכת.',
    'היקף אסור: כל נושא שאינו קשור ישירות למערכת האתר.',
    'אם השאלה מחוץ להיקף: הסבר בקצרה שאתה מוגבל להקשר האתר והצע ניסוח חלופי רלוונטי.',
    'סגנון תשובה: עברית ברורה, תכל׳ס, שלבים מעשיים, התייחסות לסיכונים רק כשבאמת נדרש.',
    'בקש הבהרה רק אם חסר מידע קריטי לביצוע מדויק.',
].join('\n');

export default function AdminAIHelp({ embedded = false }) {
    const [question, setQuestion] = useState(DEFAULT_QUESTION);
    const [answer, setAnswer] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [modelUsed, setModelUsed] = useState('');
    const [history, setHistory] = useState([]);
    const [showMorePrompts, setShowMorePrompts] = useState(false);
    const visiblePrompts = showMorePrompts ? QUICK_PROMPTS : QUICK_PROMPTS.slice(0, 4);

    const runtimeConfig = useMemo(() => getSafeAiRuntimeConfig(), []);
    const isEnabled = AIService.isEnabled();

    const buildPrompt = (userQuestion) => {
        return [
            AI_HELP_SCOPE_PROMPT,
            `השאלה: ${userQuestion}`,
        ].join('\n');
    };

    const handleAsk = async () => {
        const trimmed = question.trim();
        if (!trimmed) {
            toast.error('יש להזין שאלה');
            return;
        }

        setIsLoading(true);
        setAnswer('');
        try {
            let streamed = '';
            const response = await AIService.ask(buildPrompt(trimmed), {
                model: runtimeConfig.defaultModel,
                onToken: (token) => {
                    streamed += token;
                    setAnswer((prev) => prev + token);
                },
            });
            const content = response?.content || streamed || '';
            setAnswer(String(content).trim());
            setModelUsed(response?.modelUsed || response?.model || '');
            setHistory((prev) => [trimmed, ...prev.filter((item) => item !== trimmed)].slice(0, 5));
        } catch (error) {
            toast.error(error?.message || 'שליחת השאלה ל-AI נכשלה');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyAnswer = async () => {
        if (!answer) return;
        try {
            await navigator.clipboard.writeText(answer);
            toast.success('התשובה הועתקה');
        } catch {
            toast.error('ההעתקה נכשלה');
        }
    };

    return (
        <div
            dir="rtl"
            className={embedded
                ? 'h-full min-h-0 w-full text-theme'
                : 'h-full min-h-full w-full text-theme bg-white dark:bg-[#1e212b] selection:bg-black/10 dark:selection:bg-white/20 selection:text-inherit'}
        >
            <div className={embedded ? 'h-full w-full flex flex-col' : 'h-full w-full max-w-5xl mx-auto flex flex-col px-4 py-4 sm:px-6 sm:py-5'}>
                <div className={`flex items-start justify-between gap-3 pb-3 ${embedded ? '' : 'border-b border-black/10 dark:border-white/10'}`}>
                    <div>
                        <h1 className={`${embedded ? 'text-lg' : 'text-xl sm:text-2xl'} font-black flex items-center gap-2`}>
                            <Sparkles size={16} className="opacity-70" />
                            {embedded ? 'עוזר AI לניווט ותפעול' : 'עוזר AI תפעולי לניהול'}
                        </h1>
                        <p className={`mt-1 text-sm text-theme-muted ${embedded ? 'max-w-none' : 'max-w-3xl'}`}>
                            אפשר לשאול איך לבצע פעולות במסכי הניהול ולקבל תשובה מעשית לפי תהליך עבודה מומלץ.
                        </p>
                    </div>
                    {modelUsed && (
                        <div className="text-xs text-theme-muted inline-flex items-center gap-1">
                            <Bot size={12} />
                            מודל: {modelUsed}
                        </div>
                    )}
                </div>

                {!isEnabled && (
                    <div className="mt-4 rounded-lg bg-amber-100/60 px-4 py-3 text-sm text-amber-900">
                        <div className="font-bold">AI כבוי כרגע</div>
                        <div className="mt-1">
                            כדי להפעיל: `VITE_ALPHA_AI_ENABLED=true` והרץ מחדש את ה-frontend.
                        </div>
                        <div className="mt-1 text-xs">apiBase: {runtimeConfig.apiBase}</div>
                    </div>
                )}

                <div className={embedded ? 'mt-3' : 'mt-4'}>
                    <label className="block text-sm font-bold mb-2 text-theme-muted">השאלה שלך</label>
                    <textarea
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                                e.preventDefault();
                                handleAsk();
                            }
                        }}
                        rows={3}
                        className={[
                            'w-full rounded-xl px-4 py-3 outline-none transition',
                            'border border-black/15 bg-white text-black placeholder:text-black/40',
                            'focus:ring-2 focus:ring-black/10 focus:border-black/30',
                            'dark:border-white/15 dark:bg-[#0f0f10] dark:text-white dark:placeholder:text-white/35',
                            'dark:focus:ring-white/15 dark:focus:border-white/25',
                        ].join(' ')}
                        placeholder="כתוב שאלה על תפעול ממשק הניהול..."
                    />
                    <div className="mt-2 text-xs text-theme-muted">
                        שליחה מהירה: <span className="font-bold">Ctrl+Enter</span>
                    </div>
                </div>

                <div className={`${embedded ? 'mt-3' : 'mt-4'} flex items-center gap-2 flex-wrap`}>
                    <button
                        type="button"
                        onClick={handleAsk}
                        disabled={!isEnabled || isLoading}
                        className="h-10 rounded-xl bg-black px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
                    >
                        {isLoading ? 'שולח...' : 'שאל את העוזר'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setQuestion('');
                            setAnswer('');
                        }}
                        className="h-10 rounded-xl px-3 text-sm font-bold border border-black/15 bg-white text-black hover:bg-black/[0.04] inline-flex items-center gap-1 dark:border-white/15 dark:bg-[#151515] dark:text-white dark:hover:bg-white/[0.08]"
                    >
                        <Trash2 size={14} />
                        נקה
                    </button>
                    <button
                        type="button"
                        onClick={handleCopyAnswer}
                        disabled={!answer}
                        className="h-10 rounded-xl px-3 text-sm font-bold border border-black/15 bg-white text-black hover:bg-black/[0.04] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1 dark:border-white/15 dark:bg-[#151515] dark:text-white dark:hover:bg-white/[0.08]"
                    >
                        <Copy size={14} />
                        העתק תשובה
                    </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    {visiblePrompts.map((item) => (
                        <button
                            key={item}
                            type="button"
                            onClick={() => setQuestion(item)}
                            className="rounded-full px-3 py-1.5 text-xs border border-black/10 bg-white text-black hover:bg-black/[0.03] transition dark:border-white/10 dark:bg-[#151515] dark:text-white dark:hover:bg-white/[0.08]"
                        >
                            {item}
                        </button>
                    ))}
                    {!showMorePrompts && QUICK_PROMPTS.length > 4 && (
                        <button
                            type="button"
                            onClick={() => setShowMorePrompts(true)}
                            className="rounded-full px-3 py-1.5 text-xs font-black bg-black text-white hover:opacity-90 transition dark:bg-white dark:text-black"
                            aria-label="הצג עוד שאלות מוכנות"
                        >
                            +
                        </button>
                    )}
                </div>

                {history.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 items-center">
                        <span className="text-xs text-theme-muted">שאלות אחרונות:</span>
                        {history.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => setQuestion(item)}
                                className="rounded-md px-2 py-1 text-xs bg-black/[0.04] dark:bg-white/[0.08] hover:bg-black/[0.08] dark:hover:bg-white/[0.14]"
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                )}

                {answer && (
                    <div className={`mt-4 ${embedded ? 'h-[300px]' : 'h-[clamp(180px,30vh,320px)]'} rounded-2xl border border-black/10 bg-white p-4 overflow-y-auto dark:border-white/10 dark:bg-[#0f0f10]`}>
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <h2 className="text-sm font-black text-black dark:text-white">תשובה</h2>
                            {modelUsed && (
                                <div className="text-[11px] text-theme-muted inline-flex items-center gap-1">
                                    <Bot size={12} />
                                    {modelUsed}
                                </div>
                            )}
                        </div>
                        <div className="whitespace-pre-wrap leading-7 text-sm text-black/90 dark:text-white/90">{answer}</div>
                    </div>
                )}

                {!answer && (
                    <div className={`mt-4 ${embedded ? 'h-[300px]' : 'h-[clamp(180px,30vh,320px)]'} rounded-2xl border border-black/10 bg-white p-5 flex items-center justify-center dark:border-white/10 dark:bg-[#0f0f10]`}>
                        <div className="w-full max-w-xl text-right">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 bg-black/[0.02] text-black dark:border-white/10 dark:bg-white/[0.06] dark:text-white">
                                    <AlertTriangle size={16} className="opacity-80" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-black text-black dark:text-white">עדיין אין תשובה</h3>
                                    <p className="mt-1 text-sm text-black/60 dark:text-white/60">
                                        כתוב שאלה למעלה, או בחר אחת מהשאלות המוכנות, ואז לחץ על <span className="font-bold">"שאל את העוזר"</span>.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm text-black/70 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
                                    <div className="text-xs font-black text-black/80 dark:text-white/80">תשאל ממוקד</div>
                                    <div className="mt-1 text-xs leading-5">
                                        ציין את המסך (תוכן/עיצוב/ווידג׳טים) ומה המטרה.
                                    </div>
                                </div>
                                <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm text-black/70 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
                                    <div className="text-xs font-black text-black/80 dark:text-white/80">תבקש תהליך</div>
                                    <div className="mt-1 text-xs leading-5">
                                        “תן לי צ׳קליסט” / “סדר פעולות” / “בדיקות לפני פרסום”.
                                    </div>
                                </div>
                                <div className="rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm text-black/70 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/70">
                                    <div className="text-xs font-black text-black/80 dark:text-white/80">קיצור מקלדת</div>
                                    <div className="mt-1 text-xs leading-5">
                                        שלח מהר עם <span className="font-bold">Ctrl+Enter</span>.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
