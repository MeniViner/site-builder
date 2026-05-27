import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, Link as LinkIcon, Underline, X } from 'lucide-react';
import {
    SMART_LINK_TYPES,
    SMART_TEXT_MARKS,
    SMART_TEXT_TOKEN_TYPES,
    autoLinkSmartTextTokens,
    cleanSmartText,
    createSmartTextLinkToken,
    getSmartTextDocument,
    insertSmartTextLinkToken,
    normalizeSmartTextTokens,
    smartTextTokensToPlainText,
} from '../utils/smartText';

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI']);

function applyMarks(node, marks = [], keyPrefix = 'mark') {
    return marks.reduce((current, mark, index) => {
        const key = `${keyPrefix}-${mark}-${index}`;
        if (mark === SMART_TEXT_MARKS.bold) return <strong key={key}>{current}</strong>;
        if (mark === SMART_TEXT_MARKS.italic) return <em key={key}>{current}</em>;
        if (mark === SMART_TEXT_MARKS.underline) return <span key={key} className="underline underline-offset-2">{current}</span>;
        return current;
    }, node);
}

function renderToken(token, index, linkClassName) {
    if (token.type === SMART_TEXT_TOKEN_TYPES.break) {
        return <br key={`br-${index}`} />;
    }

    if (token.type === SMART_TEXT_TOKEN_TYPES.link) {
        return (
            <a
                key={`link-${index}`}
                href={token.href}
                target={token.target}
                rel={token.rel}
                data-smart-link="true"
                data-link-type={token.linkType}
                data-raw={token.raw}
                data-value={token.value}
                className={linkClassName}
            >
                {applyMarks(token.text, token.marks, `link-${index}`)}
            </a>
        );
    }

    return (
        <React.Fragment key={`text-${index}`}>
            {applyMarks(token.text, token.marks, `text-${index}`)}
        </React.Fragment>
    );
}

function getTextLength(node) {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.length;
    if (node.nodeName === 'BR') return 1;
    return Array.from(node.childNodes || []).reduce((sum, child) => sum + getTextLength(child), 0);
}

function getOffsetFromPosition(root, targetNode, targetOffset) {
    let total = 0;
    let found = false;

    const walk = (node) => {
        if (found || !node) return;

        if (node === targetNode) {
            if (node.nodeType === Node.TEXT_NODE) {
                total += Math.min(targetOffset, node.nodeValue.length);
            } else {
                Array.from(node.childNodes || []).slice(0, targetOffset).forEach((child) => {
                    total += getTextLength(child);
                });
            }
            found = true;
            return;
        }

        if (node.nodeType === Node.TEXT_NODE || node.nodeName === 'BR') {
            total += getTextLength(node);
            return;
        }

        Array.from(node.childNodes || []).forEach(walk);
    };

    walk(root);
    return total;
}

function getSelectionOffsets(root) {
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;

    const start = getOffsetFromPosition(root, range.startContainer, range.startOffset);
    const end = getOffsetFromPosition(root, range.endContainer, range.endOffset);
    return { start: Math.min(start, end), end: Math.max(start, end) };
}

function findPositionForOffset(root, offset) {
    let remaining = Math.max(0, offset);
    let lastPosition = { node: root, offset: root.childNodes.length };

    const walk = (node) => {
        if (!node) return null;

        if (node.nodeType === Node.TEXT_NODE) {
            const length = node.nodeValue.length;
            if (remaining <= length) {
                return { node, offset: remaining };
            }
            remaining -= length;
            lastPosition = { node, offset: length };
            return null;
        }

        if (node.nodeName === 'BR') {
            if (remaining <= 1) {
                const parent = node.parentNode || root;
                return { node: parent, offset: Array.from(parent.childNodes).indexOf(node) + 1 };
            }
            remaining -= 1;
            return null;
        }

        const children = Array.from(node.childNodes || []);
        for (const child of children) {
            const found = walk(child);
            if (found) return found;
        }

        lastPosition = { node, offset: children.length };
        return null;
    };

    return walk(root) || lastPosition;
}

function restoreSelectionOffsets(root, offsets) {
    if (!offsets) return;
    const selection = window.getSelection?.();
    if (!selection) return;

    root.focus({ preventScroll: true });
    const range = document.createRange();
    const start = findPositionForOffset(root, offsets.start);
    const end = findPositionForOffset(root, offsets.end);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    selection.removeAllRanges();
    selection.addRange(range);
}

function mergeMark(marks, mark) {
    return marks.includes(mark) ? marks : [...marks, mark];
}

function getElementMarks(element, inheritedMarks) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return inheritedMarks;

    const tagName = element.tagName;
    let marks = inheritedMarks;
    const fontWeight = window.getComputedStyle?.(element)?.fontWeight || '';
    const textDecoration = window.getComputedStyle?.(element)?.textDecorationLine || element.style?.textDecorationLine || '';

    if (tagName === 'B' || tagName === 'STRONG' || Number(fontWeight) >= 600) marks = mergeMark(marks, SMART_TEXT_MARKS.bold);
    if (tagName === 'I' || tagName === 'EM') marks = mergeMark(marks, SMART_TEXT_MARKS.italic);
    if (tagName === 'U' || textDecoration.includes('underline')) marks = mergeMark(marks, SMART_TEXT_MARKS.underline);

    return marks;
}

function pushRawToken(tokens, token) {
    if (!token) return;
    if (token.type === SMART_TEXT_TOKEN_TYPES.break) {
        if (tokens[tokens.length - 1]?.type !== SMART_TEXT_TOKEN_TYPES.break) tokens.push(token);
        return;
    }

    if (!token.text) return;
    const last = tokens[tokens.length - 1];
    const sameMarks = JSON.stringify(last?.marks || []) === JSON.stringify(token.marks || []);
    const sameLink = token.type === SMART_TEXT_TOKEN_TYPES.link
        && last?.type === SMART_TEXT_TOKEN_TYPES.link
        && last.href === token.href
        && last.raw === token.raw
        && last.value === token.value
        && last.linkType === token.linkType;

    if (last?.type === token.type && sameMarks && (token.type === SMART_TEXT_TOKEN_TYPES.text || sameLink)) {
        last.text += token.text;
        return;
    }

    tokens.push(token);
}

function readSmartTextTokensFromElement(root) {
    const tokens = [];

    const readNode = (node, marks = [], linkMeta = null) => {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = cleanSmartText(node.nodeValue);
            if (!text) return;
            pushRawToken(tokens, linkMeta
                ? {
                    type: SMART_TEXT_TOKEN_TYPES.link,
                    linkType: linkMeta.linkType,
                    text,
                    raw: linkMeta.raw || text,
                    value: linkMeta.value || linkMeta.href,
                    href: linkMeta.href,
                    marks,
                    ...(linkMeta.target ? { target: linkMeta.target } : {}),
                    ...(linkMeta.rel ? { rel: linkMeta.rel } : {}),
                }
                : {
                    type: SMART_TEXT_TOKEN_TYPES.text,
                    text,
                    marks,
                });
            return;
        }

        if (node.nodeName === 'BR') {
            pushRawToken(tokens, { type: SMART_TEXT_TOKEN_TYPES.break });
            return;
        }

        if (node.nodeType !== Node.ELEMENT_NODE) return;

        const element = node;
        const nextMarks = getElementMarks(element, marks);
        const isAnchor = element.tagName === 'A';
        const nextLinkMeta = isAnchor
            ? {
                href: element.getAttribute('href') || '',
                linkType: element.dataset.linkType || SMART_LINK_TYPES.url,
                raw: element.dataset.raw || element.textContent || '',
                value: element.dataset.value || element.getAttribute('href') || '',
                target: element.getAttribute('target') || '',
                rel: element.getAttribute('rel') || '',
            }
            : linkMeta;

        Array.from(element.childNodes || []).forEach((child) => readNode(child, nextMarks, nextLinkMeta));
    };

    const children = Array.from(root.childNodes || []);
    children.forEach((child, index) => {
        readNode(child, [], null);
        if (BLOCK_TAGS.has(child.nodeName) && index < children.length - 1) {
            pushRawToken(tokens, { type: SMART_TEXT_TOKEN_TYPES.break });
        }
    });

    return normalizeSmartTextTokens(tokens);
}

function insertPlainTextAtSelection(root, text) {
    if (!root) return;
    const selection = window.getSelection?.();
    if (!selection) return;

    if (selection.rangeCount === 0 || !root.contains(selection.getRangeAt(0).startContainer)) {
        root.focus();
        const range = document.createRange();
        range.selectNodeContents(root);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const fragment = document.createDocumentFragment();
    let lastNode = null;
    cleanSmartText(text).split(/\r\n|\r|\n/).forEach((line, index) => {
        if (index > 0) {
            const br = document.createElement('br');
            fragment.appendChild(br);
            lastNode = br;
        }
        if (line) {
            const textNode = document.createTextNode(line);
            fragment.appendChild(textNode);
            lastNode = textNode;
        }
    });

    if (!lastNode) return;

    range.insertNode(fragment);
    range.setStartAfter(lastNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
}

export default function SmartTextEditor({
    value,
    plainText = '',
    linkLabels = {},
    onChange,
    onUrlTokensDetected,
    placeholder = '',
    className = '',
    editorClassName = '',
    linkClassName = 'text-blue-600 underline underline-offset-2 dark:text-blue-300',
}) {
    const editorRef = useRef(null);
    const pendingSelectionRef = useRef(null);
    const [linkDialog, setLinkDialog] = useState(null);
    const tokens = useMemo(
        () => getSmartTextDocument(value, plainText, linkLabels),
        [value, plainText, linkLabels]
    );
    const editorKey = useMemo(() => JSON.stringify(tokens), [tokens]);
    const plainValue = useMemo(() => smartTextTokensToPlainText(tokens), [tokens]);
    const isEmpty = plainValue.trim() === '';

    const commitTokens = useCallback((nextTokens, selectionOffsets = null) => {
        const normalizedTokens = autoLinkSmartTextTokens(nextTokens, linkLabels);
        pendingSelectionRef.current = selectionOffsets;
        onChange?.({
            tokens: normalizedTokens,
            plainText: smartTextTokensToPlainText(normalizedTokens),
        });
        onUrlTokensDetected?.(normalizedTokens);
    }, [linkLabels, onChange, onUrlTokensDetected]);

    const syncFromDom = useCallback((options = {}) => {
        const editor = editorRef.current;
        if (!editor) return;
        const preserveSelection = options?.preserveSelection !== false;
        const selectionOffsets = preserveSelection ? getSelectionOffsets(editor) : null;
        commitTokens(readSmartTextTokensFromElement(editor), selectionOffsets);
    }, [commitTokens]);

    const runFormatCommand = useCallback((command) => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.focus({ preventScroll: true });
        const selectionOffsets = getSelectionOffsets(editor);

        if (typeof document.execCommand === 'function') {
            document.execCommand(command, false, null);
            pendingSelectionRef.current = getSelectionOffsets(editor) || selectionOffsets;
            commitTokens(readSmartTextTokensFromElement(editor), pendingSelectionRef.current);
        }
    }, [commitTokens]);

    const openLinkDialog = useCallback(() => {
        const editor = editorRef.current;
        const selectionOffsets = getSelectionOffsets(editor) || { start: plainValue.length, end: plainValue.length };
        const selectedText = cleanSmartText(plainValue.slice(selectionOffsets.start, selectionOffsets.end)).replace(/\s+/g, ' ').trim();

        setLinkDialog({
            selectionOffsets,
            label: selectedText,
            href: '',
            error: '',
        });
    }, [plainValue]);

    const closeLinkDialog = useCallback(() => {
        const selectionOffsets = linkDialog?.selectionOffsets;
        setLinkDialog(null);
        if (!selectionOffsets) return;
        window.requestAnimationFrame?.(() => restoreSelectionOffsets(editorRef.current, selectionOffsets));
    }, [linkDialog]);

    const submitLinkDialog = useCallback((event) => {
        event?.preventDefault?.();
        if (!linkDialog) return;

        const linkToken = createSmartTextLinkToken({
            text: linkDialog.label,
            href: linkDialog.href,
        });

        if (!linkToken) {
            setLinkDialog((prev) => prev ? { ...prev, error: 'יש למלא שם וקישור תקין.' } : prev);
            return;
        }

        const nextTokens = insertSmartTextLinkToken(tokens, linkDialog.selectionOffsets, linkToken);
        const caretOffset = Math.min(
            smartTextTokensToPlainText(nextTokens).length,
            linkDialog.selectionOffsets.start + linkToken.text.length,
        );

        setLinkDialog(null);
        commitTokens(nextTokens, { start: caretOffset, end: caretOffset });
    }, [commitTokens, linkDialog, tokens]);

    useLayoutEffect(() => {
        const editor = editorRef.current;
        const selection = pendingSelectionRef.current;
        if (!editor || !selection) return;
        pendingSelectionRef.current = null;
        restoreSelectionOffsets(editor, selection);
    }, [tokens]);

    return (
        <div className={className}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault();
                        runFormatCommand('bold');
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-subtle bg-theme-elevated text-theme transition hover:bg-theme-card-hover"
                    title="הדגשה"
                    aria-label="הדגשה"
                >
                    <Bold size={15} />
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault();
                        runFormatCommand('italic');
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-subtle bg-theme-elevated text-theme transition hover:bg-theme-card-hover"
                    title="נטוי"
                    aria-label="נטוי"
                >
                    <Italic size={15} />
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault();
                        runFormatCommand('underline');
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-subtle bg-theme-elevated text-theme transition hover:bg-theme-card-hover"
                    title="קו תחתון"
                    aria-label="קו תחתון"
                >
                    <Underline size={15} />
                </button>
                <button
                    type="button"
                    onMouseDown={(event) => {
                        event.preventDefault();
                        openLinkDialog();
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-theme-subtle bg-theme-elevated text-theme transition hover:bg-theme-card-hover"
                    title="הוספת קישור"
                    aria-label="הוספת קישור"
                >
                    <LinkIcon size={15} />
                </button>
            </div>

            <div className="relative">
                {isEmpty && placeholder ? (
                    <div className="pointer-events-none absolute right-4 top-3 text-sm text-theme-muted/70">
                        {placeholder}
                    </div>
                ) : null}
                <div
                    key={editorKey}
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    dir="auto"
                    role="textbox"
                    aria-multiline="true"
                    onInput={() => syncFromDom()}
                    onBlur={() => syncFromDom({ preserveSelection: false })}
                    onPaste={(event) => {
                        event.preventDefault();
                        insertPlainTextAtSelection(editorRef.current, event.clipboardData?.getData('text/plain') || '');
                        syncFromDom();
                    }}
                    onKeyDown={(event) => {
                        if (!event.metaKey && !event.ctrlKey) return;
                        const key = String(event.key || '').toLowerCase();
                        const command = key === 'b' ? 'bold' : (key === 'i' ? 'italic' : (key === 'u' ? 'underline' : ''));
                        if (!command) return;
                        event.preventDefault();
                        runFormatCommand(command);
                    }}
                    onClick={(event) => {
                        if (event.target.closest?.('a')) event.preventDefault();
                    }}
                    className={`min-h-[108px] w-full whitespace-pre-wrap rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-3 text-sm leading-6 text-theme outline-none transition focus:border-blue-500 ${editorClassName}`}
                >
                    {tokens.map((token, index) => renderToken(token, index, linkClassName))}
                </div>
            </div>

            {linkDialog && (
                <div
                    className="fixed inset-0 z-[240] flex items-center justify-center bg-black/40 p-4"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeLinkDialog();
                    }}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-theme-subtle bg-theme-card p-5 text-right shadow-2xl"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="manual-link-title"
                        dir="rtl"
                    >
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <h3 id="manual-link-title" className="text-lg font-black text-theme">הוספת קישור</h3>
                                <p className="mt-1 text-sm text-theme-muted">מלאו שם שיוצג בטקסט ואת הכתובת שאליה הוא יוביל.</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeLinkDialog}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-theme-subtle bg-theme-elevated text-theme-muted transition hover:bg-theme-card-hover hover:text-theme"
                                aria-label="סגירה"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <label className="mb-3 block">
                            <span className="mb-1.5 block text-sm font-bold text-theme-muted">שם לתצוגה</span>
                            <input
                                autoFocus
                                value={linkDialog.label}
                                onChange={(event) => setLinkDialog((prev) => prev ? { ...prev, label: event.target.value, error: '' } : prev)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') closeLinkDialog();
                                    if (event.key === 'Enter') submitLinkDialog(event);
                                }}
                                className="w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-3 text-theme outline-none transition focus:border-blue-500"
                                placeholder="לדוגמה: טופס הרשמה"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-bold text-theme-muted">קישור</span>
                            <input
                                value={linkDialog.href}
                                onChange={(event) => setLinkDialog((prev) => prev ? { ...prev, href: event.target.value, error: '' } : prev)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Escape') closeLinkDialog();
                                    if (event.key === 'Enter') submitLinkDialog(event);
                                }}
                                className="w-full rounded-xl border border-theme-subtle bg-theme-elevated px-4 py-3 text-left text-theme outline-none transition focus:border-blue-500"
                                placeholder="https://example.com"
                                dir="ltr"
                            />
                        </label>

                        {linkDialog.error ? (
                            <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-bold text-red-600 dark:text-red-300">
                                {linkDialog.error}
                            </div>
                        ) : null}

                        <div className="mt-5 flex gap-3">
                            <button type="button" onClick={submitLinkDialog} className="h-10 flex-1 rounded-xl bg-blue-600 text-sm font-bold text-white transition hover:bg-blue-700">
                                הוסף קישור
                            </button>
                            <button type="button" onClick={closeLinkDialog} className="h-10 flex-1 rounded-xl border border-theme-subtle bg-theme-elevated text-sm font-bold text-theme transition hover:bg-theme-card-hover">
                                ביטול
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
