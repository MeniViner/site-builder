function extractFromCodeBlock(text) {
    const match = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
    return match ? match[1].trim() : '';
}

function extractBalancedJson(text) {
    const source = String(text || '');
    const firstObject = source.indexOf('{');
    const firstArray = source.indexOf('[');
    let start = -1;

    if (firstObject === -1 && firstArray === -1) {
        return '';
    }
    if (firstObject === -1) {
        start = firstArray;
    } else if (firstArray === -1) {
        start = firstObject;
    } else {
        start = Math.min(firstObject, firstArray);
    }

    const stack = [];
    let inString = false;
    let escaping = false;

    for (let i = start; i < source.length; i += 1) {
        const ch = source[i];

        if (inString) {
            if (escaping) {
                escaping = false;
            } else if (ch === '\\') {
                escaping = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{' || ch === '[') {
            stack.push(ch);
            continue;
        }

        if (ch === '}' || ch === ']') {
            const last = stack[stack.length - 1];
            if ((ch === '}' && last === '{') || (ch === ']' && last === '[')) {
                stack.pop();
            }

            if (stack.length === 0) {
                return source.slice(start, i + 1).trim();
            }
        }
    }

    return '';
}

export function extractJsonText(rawText) {
    const direct = String(rawText || '').trim();
    if (!direct) return '';

    const codeBlock = extractFromCodeBlock(direct);
    if (codeBlock) return codeBlock;

    const balanced = extractBalancedJson(direct);
    return balanced || direct;
}

export function parseJsonFromModel(rawText) {
    const jsonText = extractJsonText(rawText);
    if (!jsonText) {
        throw new Error('לא התקבל JSON בתשובת ה-AI');
    }

    try {
        return JSON.parse(jsonText);
    } catch {
        throw new Error('פורמט ה-JSON שהוחזר אינו תקין');
    }
}
