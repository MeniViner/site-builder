import { normalizeOrgChartInput } from '../context/OrgChartContext';

export const ORG_CHART_AI_ACCEPT = [
    '.png', '.jpg', '.jpeg', '.webp', '.pdf', '.docx', '.xlsx',
    '.json', '.txt', '.md', '.markdown', '.csv',
].join(',');

const SUPPORTED_EXTENSIONS = new Set(ORG_CHART_AI_ACCEPT.split(','));

export function validateOrgChartAiFile(file, maxMb = 20) {
    const extension = `.${String(file?.name || '').split('.').pop()?.toLowerCase()}`;
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        throw Object.assign(new Error('סוג הקובץ אינו נתמך לייבוא עם AI.'), { code: 'UNSUPPORTED_FILE_TYPE' });
    }
    if (file.size > maxMb * 1024 * 1024) {
        throw Object.assign(new Error(`הקובץ גדול מהמגבלה המותרת (${maxMb} MB).`), { code: 'FILE_TOO_LARGE' });
    }
}

export function createOrgChartDraftFromExtraction(currentDraft, extraction) {
    if (!extraction || !Array.isArray(extraction.nodes)) {
        throw Object.assign(new Error('תשובת ה-AI אינה מכילה עץ מבנה תקין.'), { code: 'INVALID_ORG_CHART_STRUCTURE' });
    }
    const seen = new Set();
    let count = 0;
    const visit = (nodes, depth) => {
        if (depth > 20) throw new Error('עץ המבנה שהתקבל עמוק מדי.');
        nodes.forEach((node) => {
            if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || !node.id.trim()) {
                throw new Error('עץ המבנה שהתקבל מכיל צומת לא תקין.');
            }
            count += 1;
            if (count > 500 || seen.has(node.id)) throw new Error('עץ המבנה שהתקבל מכיל יותר מדי צמתים או מזהים כפולים.');
            seen.add(node.id);
            visit(Array.isArray(node.children) ? node.children : [], depth + 1);
        });
    };
    visit(extraction.nodes, 1);
    return normalizeOrgChartInput({ ...currentDraft, nodes: extraction.nodes }, currentDraft);
}

export function getOrgChartAiErrorMessage(error) {
    const messages = {
        UNSUPPORTED_FILE_TYPE: 'סוג הקובץ אינו נתמך לייבוא עם AI.',
        FILE_TOO_LARGE: 'הקובץ גדול ממגבלת ההעלאה.',
        MALFORMED_FILE: 'הקובץ פגום או שאי אפשר לקרוא אותו.',
        EXTRACTION_FAILED: 'לא ניתן לחלץ תוכן שימושי מהקובץ.',
        PDF_VISUAL_CONTENT_UNSUPPORTED: 'ה-PDF אינו מכיל טקסט קריא. PDF סרוק או תרשים חזותי בלבד אינו נתמך כרגע.',
        FILE_MODEL_NOT_CONFIGURED: 'יש להגדיר מודל AI תומך קבצים באמצעות VITE_ALPHA_AI_FILE_MODEL.',
        PROVIDER_MULTIMODAL_UNSUPPORTED: 'ספק ה-AI של המודל שהוגדר אינו תומך בייבוא הקובץ הזה.',
        MODEL_REQUEST_FAILED: 'הבקשה למודל ה-AI נכשלה.',
        INVALID_AI_RESPONSE: 'המודל החזיר תשובה שאינה JSON תקין.',
        INVALID_ORG_CHART_STRUCTURE: 'המודל החזיר מבנה ארגוני לא תקין.',
        TIMEOUT: 'ניתוח הקובץ ארך זמן רב מדי והופסק.',
    };
    return messages[error?.code] || error?.message || 'ייבוא הקובץ עם AI נכשל.';
}
