const ExcelJS = require('exceljs');
const mammoth = require('mammoth');
const { PDFParse } = require('pdf-parse');
const config = require('../config');
const FileImportError = require('../errors/FileImportError');
const { isValidImageSignature } = require('./fileTypes');

function limitText(text) {
  const normalized = String(text || '').replace(/\0/g, '').trim();
  if (!normalized) {
    throw new FileImportError('EXTRACTION_FAILED', 'No readable text was extracted from the file.', 422);
  }
  if (normalized.length > config.ai.fileExtractedTextMaxChars) {
    throw new FileImportError(
      'EXTRACTION_FAILED',
      `Extracted text exceeds the ${config.ai.fileExtractedTextMaxChars} character safety limit.`,
      422,
    );
  }
  return normalized;
}

async function extractPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = Array.isArray(result?.pages)
      ? result.pages.map((page) => page?.text || '').join('\n').trim()
      : String(result?.text || '').trim();
    if (text.length < 10) {
      throw new FileImportError(
        'PDF_VISUAL_CONTENT_UNSUPPORTED',
        'The PDF does not contain enough readable text. Scanned or diagram-only PDFs are not supported by this extraction path.',
        422,
      );
    }
    return {
      text: limitText(text),
      metadata: { pageCount: Number(result?.total || result?.pages?.length || 0) || undefined },
    };
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return { text: limitText(result.value), metadata: {} };
}

async function extractXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = [];
  workbook.eachSheet((worksheet) => {
    const rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      rows.push(row.values.slice(1).map((value) => {
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') {
          if (typeof value.text === 'string') return value.text;
          if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
          if (value.result !== undefined) return String(value.result);
        }
        return String(value);
      }).join('\t'));
    });
    sheets.push(`Sheet: ${worksheet.name}\n${rows.join('\n')}`);
  });
  return { text: limitText(sheets.join('\n\n')), metadata: { sheetCount: workbook.worksheets.length } };
}

async function extractFile(file, fileType) {
  try {
    if (fileType.kind === 'image') {
      if (!isValidImageSignature(file.buffer, fileType.extension)) {
        throw new FileImportError('MALFORMED_FILE', 'The image signature does not match the selected file type.', 422);
      }
      return {
        attachment: {
          kind: 'image',
          mimeType: file.mimetype,
          base64: file.buffer.toString('base64'),
        },
        metadata: {},
      };
    }
    if (fileType.strategy === 'pdf-text') return await extractPdf(file.buffer);
    if (fileType.strategy === 'docx-text') return await extractDocx(file.buffer);
    if (fileType.strategy === 'xlsx-rows') return await extractXlsx(file.buffer);
    if (fileType.strategy === 'json-text') {
      const text = limitText(file.buffer.toString('utf8'));
      JSON.parse(text);
      return { text, metadata: {} };
    }
    return { text: limitText(file.buffer.toString('utf8')), metadata: {} };
  } catch (error) {
    if (error instanceof FileImportError) throw error;
    throw new FileImportError('MALFORMED_FILE', 'The selected file could not be parsed.', 422);
  }
}

module.exports = { extractFile };
