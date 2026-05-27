import React from 'react';
import { SMART_TEXT_TOKEN_TYPES, smartTextToRenderData, smartTextTokensToPlainText } from '../utils/smartText';

function applyMarks(node, marks = [], keyPrefix = 'mark') {
    return marks.reduce((current, mark, index) => {
        const key = `${keyPrefix}-${mark}-${index}`;
        if (mark === 'bold') return <strong key={key}>{current}</strong>;
        if (mark === 'italic') return <em key={key}>{current}</em>;
        if (mark === 'underline') return <span key={key} className="underline underline-offset-2">{current}</span>;
        return current;
    }, node);
}

export default function SmartTextRenderer({
    text,
    richText,
    linkLabels,
    fallback = '',
    className = '',
    linkClassName = 'text-primary underline underline-offset-2 hover:opacity-80',
}) {
    const hasRichText = Array.isArray(richText)
        ? richText.length > 0
        : Array.isArray(richText?.tokens) && richText.tokens.length > 0;
    const renderData = smartTextToRenderData(hasRichText ? richText : (text || ''), linkLabels || {});
    const plainText = hasRichText ? smartTextTokensToPlainText(renderData.tokens) : String(text ?? '');

    if (!plainText.trim() && fallback) {
        return <span className={className}>{fallback}</span>;
    }

    return (
        <span className={className}>
            {renderData.tokens.map((token, index) => {
                if (token.type === SMART_TEXT_TOKEN_TYPES.break) {
                    return <br key={`br-${index}`} />;
                }

                if (token.type === SMART_TEXT_TOKEN_TYPES.link) {
                    const content = applyMarks(token.text, token.marks, `link-${index}`);
                    return (
                        <a
                            key={`link-${index}`}
                            href={token.href}
                            target={token.target}
                            rel={token.rel}
                            className={linkClassName}
                        >
                            {content}
                        </a>
                    );
                }

                return (
                    <React.Fragment key={`text-${index}`}>
                        {applyMarks(token.text, token.marks, `text-${index}`)}
                    </React.Fragment>
                );
            })}
        </span>
    );
}
