import React, { useState } from 'react';
import { Check, Clipboard, Loader2, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function MarkdownTable({ children }) {
    return (
        <div className="my-4 max-w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
            <table className="w-full min-w-max border-collapse text-right text-sm">{children}</table>
        </div>
    );
}

const markdownComponents = {
    h1: ({ children }) => <h1 className="mb-3 mt-5 text-xl font-black text-gray-950 first:mt-0 dark:text-white">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-3 mt-5 text-lg font-black text-gray-950 first:mt-0 dark:text-white">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-2 mt-4 text-base font-black text-gray-900 first:mt-0 dark:text-gray-100">{children}</h3>,
    p: ({ children }) => <p className="my-2 whitespace-pre-wrap break-words leading-7 text-gray-800 dark:text-gray-100">{children}</p>,
    ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pr-6 marker:text-primary">{children}</ul>,
    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pr-6 marker:font-bold marker:text-primary">{children}</ol>,
    li: ({ children, className }) => <li className={`break-words leading-7 ${className || ''}`}>{children}</li>,
    blockquote: ({ children }) => (
        <blockquote className="my-4 border-r-4 border-primary/40 bg-primary/5 px-4 py-2 text-gray-700 dark:bg-primary/10 dark:text-gray-200">
            {children}
        </blockquote>
    ),
    hr: () => <hr className="my-5 border-0 border-t border-gray-200 dark:border-white/10" />,
    a: ({ children, href }) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-bold text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
        >
            {children}
        </a>
    ),
    code: ({ children, className }) => {
        const text = String(children || '');
        const isBlock = Boolean(className) || text.includes('\n');
        if (isBlock) {
            return (
                <code dir="ltr" className={`${className || ''} block min-w-max font-mono text-xs leading-6 text-gray-100`}>
                    {children}
                </code>
            );
        }
        return (
            <code dir="ltr" className="rounded-md bg-gray-200 px-1.5 py-0.5 font-mono text-[0.9em] text-gray-900 dark:bg-white/10 dark:text-gray-100">
                {children}
            </code>
        );
    },
    pre: ({ children }) => (
        <pre dir="ltr" className="my-4 max-w-full overflow-x-auto rounded-xl bg-[#111827] p-4 text-left shadow-inner">
            {children}
        </pre>
    ),
    table: MarkdownTable,
    thead: ({ children }) => <thead className="bg-gray-100 text-gray-900 dark:bg-white/10 dark:text-white">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-gray-200 dark:divide-white/10">{children}</tbody>,
    tr: ({ children }) => <tr className="odd:bg-white even:bg-gray-50/80 dark:odd:bg-white/[0.02] dark:even:bg-white/[0.05]">{children}</tr>,
    th: ({ children }) => <th className="whitespace-nowrap border-l border-gray-200 px-3 py-2.5 font-black last:border-l-0 dark:border-white/10">{children}</th>,
    td: ({ children }) => <td className="max-w-md border-l border-gray-200 px-3 py-2.5 align-top last:border-l-0 dark:border-white/10">{children}</td>,
    input: ({ type, checked }) => (
        type === 'checkbox'
            ? <input type="checkbox" checked={checked} readOnly disabled className="ml-2 accent-primary" />
            : null
    ),
};

export default function AdminAIResponsePanel({
    content = '',
    isLoading = false,
    loadingLabel = 'ה-AI מנתח את המידע...',
    modelLabel = '',
    notice = '',
    onClear,
    className = '',
}) {
    const [copyStatus, setCopyStatus] = useState('idle');
    const hasContent = String(content).trim().length > 0;
    if (!hasContent && !isLoading) return null;

    const copyResponse = async () => {
        if (!hasContent || !navigator.clipboard?.writeText) {
            setCopyStatus('error');
            return;
        }
        try {
            await navigator.clipboard.writeText(content);
            setCopyStatus('copied');
        } catch {
            setCopyStatus('error');
        }
    };

    return (
        <section
            dir="rtl"
            aria-label="תשובת AI"
            aria-live="polite"
            className={`mt-4 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-500/25 dark:bg-white/[0.04] ${className}`}
        >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-sky-50/80 px-4 py-3 dark:border-white/10 dark:bg-sky-500/10">
                <div>
                    <h3 className="text-sm font-black text-gray-950 dark:text-white">תשובת AI</h3>
                    {modelLabel && <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">מודל: {modelLabel}</div>}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={copyResponse}
                        disabled={!hasContent}
                        className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-gray-600 transition-[background-color,transform] hover:bg-black/5 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-white/10"
                    >
                        {copyStatus === 'copied' ? <Check size={14} aria-hidden="true" /> : <Clipboard size={14} aria-hidden="true" />}
                        {copyStatus === 'copied' ? 'הועתק' : copyStatus === 'error' ? 'ההעתקה נכשלה' : 'העתק תשובה'}
                    </button>
                    {typeof onClear === 'function' && (
                        <button
                            type="button"
                            onClick={onClear}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-gray-500 transition-[background-color,transform] hover:bg-black/5 active:scale-[0.96] dark:text-gray-400 dark:hover:bg-white/10"
                        >
                            <Trash2 size={14} aria-hidden="true" />
                            נקה תשובה
                        </button>
                    )}
                </div>
            </div>
            {notice && (
                <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-100">
                    {notice}
                </div>
            )}
            <div className="min-w-0 px-4 py-4 text-sm sm:px-5">
                {isLoading && !hasContent && (
                    <div className="flex min-h-24 items-center justify-center gap-2 text-sm font-bold text-sky-800 dark:text-sky-200">
                        <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                        {loadingLabel}
                    </div>
                )}
                {hasContent && (
                    <div className="min-w-0 overflow-hidden">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            skipHtml
                            components={markdownComponents}
                        >
                            {content}
                        </ReactMarkdown>
                    </div>
                )}
                {isLoading && hasContent && (
                    <div className="mt-3 flex items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-300">
                        <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                        התשובה עדיין מתקבלת...
                    </div>
                )}
            </div>
        </section>
    );
}
