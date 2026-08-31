import React, { useMemo, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import {
    getAiPromptSuggestions,
    pickAiPromptSuggestion,
} from '../utils/aiPromptSuggestions';

const DEFAULT_TOOLTIP = 'ממלא דוגמת הנחיה שמתאימה למסך הזה ומחליף את הטקסט הנוכחי. הטקסט לא נשלח עד שתלחץ על כפתור ההפעלה.';

export default function AiPromptSuggestionButton({
    surfaceKey,
    actionKey,
    context,
    currentValue = '',
    onChange,
    suggestions,
    disabled = false,
    className = '',
    random = Math.random,
}) {
    const previousSuggestionRef = useRef('');
    const availableSuggestions = useMemo(
        () => (
            Array.isArray(suggestions)
                ? suggestions
                : getAiPromptSuggestions(surfaceKey, actionKey, context)
        ),
        [actionKey, context, suggestions, surfaceKey]
    );
    const isDisabled = disabled || availableSuggestions.length === 0 || typeof onChange !== 'function';

    const handleClick = () => {
        const nextSuggestion = pickAiPromptSuggestion(
            availableSuggestions,
            previousSuggestionRef.current || currentValue,
            random
        );
        if (!nextSuggestion) return;
        previousSuggestionRef.current = nextSuggestion;
        onChange(nextSuggestion);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            title={DEFAULT_TOOLTIP}
            aria-label="הצע ניסוח"
            className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-primary/25 bg-primary/5 px-3 text-xs font-bold text-primary transition-[transform,background-color] hover:bg-primary/10 active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
        >
            <Sparkles size={14} aria-hidden="true" />
            הצע ניסוח
        </button>
    );
}
