import AIService from './AIService';
import {
    buildOrgChartFileExtractionPrompt,
    parseOrgChartAiResponse,
} from '../utils/orgChartAiImport';
import {
    extractOrgChartFileLocally,
    validateOrgChartAiFile,
} from '../utils/orgChartLocalFileExtraction';

function createError(code, message) {
    return Object.assign(new Error(message), { code });
}

export async function analyzeOrgChartSourceFile(file, options = {}) {
    const model = String(options.model || '').trim();
    const capability = validateOrgChartAiFile(file, options.maxMb);
    if (capability.kind === 'visual-unverified') {
        if (typeof options.visualTransport !== 'function') {
            throw createError(
                'VISUAL_TRANSPORT_UNVERIFIED',
                'ניתוח קבצים חזותיים עדיין אינו זמין בחיבור ה-AI הנוכחי.',
            );
        }
        return options.visualTransport(file, options);
    }

    const extraction = await extractOrgChartFileLocally(file, {
        maxMb: options.maxMb,
        maxChars: options.maxChars,
        signal: options.signal,
    });
    options.onExtraction?.(extraction);

    const prompt = buildOrgChartFileExtractionPrompt({
        text: extraction.text,
        extension: extraction.extension,
        strategy: extraction.strategy,
        instruction: options.instruction,
    });
    options.onStage?.('ai-request');
    const aiResponse = await AIService.ask(prompt, {
        ...(model ? { model } : {}),
        signal: options.signal,
    });
    options.onStage?.('response-parse');
    const result = parseOrgChartAiResponse(aiResponse?.content || '');

    return {
        modelUsed: aiResponse?.modelUsed || model || 'מודל ברירת המחדל של חיבור ה-AI',
        rawResponseText: String(aiResponse?.content || ''),
        source: {
            extension: extraction.extension,
            mimeType: file.type || 'unknown',
            byteSize: file.size,
            extractionStrategy: extraction.strategy,
            extractedCharacterCount: extraction.extractedCharacterCount,
            ...extraction.metadata,
        },
        result,
    };
}
