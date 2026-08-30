import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export const ORG_CHART_LOCAL_FILE_MAX_MB = 20;
export const ORG_CHART_LOCAL_TEXT_MAX_CHARS = 200000;

const LOCAL_FORMATS = Object.freeze({
    '.txt': { strategy: 'text-utf8', label: 'טקסט מקומי' },
    '.md': { strategy: 'markdown-utf8', label: 'Markdown מקומי' },
    '.markdown': { strategy: 'markdown-utf8', label: 'Markdown מקומי' },
    '.json': { strategy: 'json-local', label: 'JSON מקומי' },
    '.csv': { strategy: 'csv-local', label: 'CSV מקומי' },
    '.xlsx': { strategy: 'xlsx-local', label: 'Excel מקומי' },
    '.docx': { strategy: 'docx-local', label: 'Word מקומי' },
    '.pdf': { strategy: 'pdf-text-local', label: 'טקסט PDF מקומי' },
});

const VISUAL_FORMATS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export const ORG_CHART_AI_ACCEPT = [
    ...Object.keys(LOCAL_FORMATS),
    ...VISUAL_FORMATS,
].join(',');

function createFileError(code, message, cause) {
    return Object.assign(new Error(message, cause ? { cause } : undefined), { code });
}

export function getFileExtension(fileName) {
    const name = String(fileName || '');
    const dotIndex = name.lastIndexOf('.');
    return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
}

export function getOrgChartFileCapability(file) {
    const extension = getFileExtension(file?.name);
    if (LOCAL_FORMATS[extension]) {
        return { extension, kind: 'local-text', ...LOCAL_FORMATS[extension] };
    }
    if (VISUAL_FORMATS.has(extension)) {
        return {
            extension,
            kind: 'visual-unverified',
            strategy: 'visual-transport-unverified',
            label: 'ממתין לחיבור חזותי מאומת',
        };
    }
    return {
        extension,
        kind: 'unsupported',
        strategy: 'unsupported',
        label: 'סוג קובץ לא נתמך',
    };
}

export function validateOrgChartAiFile(file, maxMb = ORG_CHART_LOCAL_FILE_MAX_MB) {
    const capability = getOrgChartFileCapability(file);
    if (capability.kind === 'unsupported') {
        throw createFileError('UNSUPPORTED_FILE_TYPE', 'סוג הקובץ אינו נתמך לייבוא עם AI.');
    }
    if (!Number.isFinite(file?.size) || file.size <= 0) {
        throw createFileError('MALFORMED_FILE', 'הקובץ ריק או שלא ניתן לקרוא את גודלו.');
    }
    if (file.size > maxMb * 1024 * 1024) {
        throw createFileError('FILE_TOO_LARGE', `הקובץ גדול מהמגבלה המותרת (${maxMb} MB).`);
    }
    return capability;
}

function throwIfAborted(signal) {
    if (signal?.aborted) {
        throw createFileError('ABORTED', 'ניתוח הקובץ בוטל.');
    }
}

function boundText(text, maxChars) {
    const normalized = String(text || '').replace(/\0/g, '').trim();
    if (!normalized) {
        throw createFileError('EXTRACTION_FAILED', 'לא נמצא בקובץ תוכן טקסטואלי שניתן לנתח.');
    }
    if (normalized.length > maxChars) {
        throw createFileError(
            'EXTRACTED_TEXT_TOO_LARGE',
            `התוכן שחולץ גדול מהמגבלה המותרת (${maxChars.toLocaleString('he-IL')} תווים).`,
        );
    }
    return normalized;
}

async function readUtf8(file) {
    const buffer = await file.arrayBuffer();
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
        throw createFileError('MALFORMED_FILE', 'הקובץ אינו טקסט UTF-8 תקין.');
    }
}

function cellToText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'object') return String(value);
    if (typeof value.text === 'string') return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part?.text || '').join('');
    if (value.result !== undefined) return String(value.result);
    if (value.hyperlink) return String(value.text || value.hyperlink);
    return '';
}

async function extractXlsx(file, maxChars, signal) {
    const excelModule = await import('exceljs');
    throwIfAborted(signal);
    const ExcelJS = excelModule.default || excelModule;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    throwIfAborted(signal);

    let text = '';
    for (const worksheet of workbook.worksheets) {
        text += `${text ? '\n\n' : ''}Sheet: ${worksheet.name}\n`;
        worksheet.eachRow({ includeEmpty: false }, (row) => {
            text += `${row.values.slice(1).map(cellToText).join('\t')}\n`;
            if (text.length > maxChars) {
                throw createFileError('EXTRACTED_TEXT_TOO_LARGE', 'תוכן קובץ ה-Excel גדול מדי לניתוח בטוח.');
            }
        });
    }
    return {
        text: boundText(text, maxChars),
        metadata: { sheetCount: workbook.worksheets.length },
    };
}

async function extractDocx(file, maxChars, signal) {
    const mammothModule = await import('mammoth/mammoth.browser');
    throwIfAborted(signal);
    const mammoth = mammothModule.default || mammothModule;
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    throwIfAborted(signal);
    return {
        text: boundText(result.value, maxChars),
        metadata: { warningCount: Array.isArray(result.messages) ? result.messages.length : 0 },
    };
}

async function extractPdf(file, maxChars, signal) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    throwIfAborted(signal);
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const onAbort = () => loadingTask.destroy();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        const document = await loadingTask.promise;
        let text = '';
        for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
            throwIfAborted(signal);
            const page = await document.getPage(pageNumber);
            const content = await page.getTextContent();
            text += `${content.items.map((item) => item?.str || '').join(' ')}\n`;
            if (text.length > maxChars) {
                throw createFileError('EXTRACTED_TEXT_TOO_LARGE', 'תוכן ה-PDF גדול מדי לניתוח בטוח.');
            }
        }
        if (text.replace(/\s/g, '').length < 10) {
            throw createFileError(
                'PDF_VISUAL_CONTENT_UNSUPPORTED',
                'ה-PDF אינו מכיל מספיק טקסט קריא ונראה שהוא סרוק או חזותי.',
            );
        }
        return {
            text: boundText(text, maxChars),
            metadata: { pageCount: document.numPages },
        };
    } catch (error) {
        if (error?.code) throw error;
        throw createFileError('MALFORMED_FILE', 'לא ניתן לקרוא את קובץ ה-PDF.', error);
    } finally {
        signal?.removeEventListener('abort', onAbort);
        await loadingTask.destroy();
    }
}

export async function extractOrgChartFileLocally(file, options = {}) {
    const maxChars = options.maxChars || ORG_CHART_LOCAL_TEXT_MAX_CHARS;
    const capability = validateOrgChartAiFile(file, options.maxMb);
    throwIfAborted(options.signal);

    if (capability.kind === 'visual-unverified') {
        throw createFileError(
            'VISUAL_TRANSPORT_UNVERIFIED',
            'ניתוח קבצים חזותיים עדיין אינו זמין בחיבור ה-AI הנוכחי. יש להגדיר חיבור למודל שתומך בקבצים/תמונות.',
        );
    }

    let extraction;
    try {
        if (capability.strategy === 'xlsx-local') {
            extraction = await extractXlsx(file, maxChars, options.signal);
        } else if (capability.strategy === 'docx-local') {
            extraction = await extractDocx(file, maxChars, options.signal);
        } else if (capability.strategy === 'pdf-text-local') {
            extraction = await extractPdf(file, maxChars, options.signal);
        } else {
            const rawText = await readUtf8(file);
            throwIfAborted(options.signal);
            if (capability.strategy === 'json-local') {
                try {
                    JSON.parse(rawText);
                } catch {
                    throw createFileError('MALFORMED_FILE', 'קובץ ה-JSON אינו תקין.');
                }
            }
            extraction = { text: boundText(rawText, maxChars), metadata: {} };
        }
    } catch (error) {
        if (error?.code) throw error;
        throwIfAborted(options.signal);
        throw createFileError('MALFORMED_FILE', 'לא ניתן לקרוא את הקובץ שנבחר.', error);
    }

    return {
        ...extraction,
        extension: capability.extension,
        strategy: capability.strategy,
        strategyLabel: capability.label,
        extractedCharacterCount: extraction.text.length,
    };
}
