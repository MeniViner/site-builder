const assert = require('node:assert/strict');
const { test } = require('node:test');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Document, Packer, Paragraph } = require('docx');
const { extractFile } = require('../services/FileExtractionService');
const { resolveFileType } = require('../services/fileTypes');

function file(buffer, originalname, mimetype) {
  return { buffer, originalname, mimetype, size: buffer.length };
}

async function createPdfBuffer() {
  return new Promise((resolve) => {
    const chunks = [];
    const document = new PDFDocument();
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.text('Headquarters reports to Command Division');
    document.end();
  });
}

test('extracts meaningful text from PDF files', async () => {
  const source = file(await createPdfBuffer(), 'chart.pdf', 'application/pdf');
  const result = await extractFile(source, resolveFileType(source));
  assert.match(result.text, /Headquarters reports to Command Division/);
});

test('extracts meaningful text from DOCX files', async () => {
  const document = new Document({
    sections: [{ children: [new Paragraph('Operations Division reports to Headquarters')] }],
  });
  const source = file(
    await Packer.toBuffer(document),
    'chart.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  const result = await extractFile(source, resolveFileType(source));
  assert.match(result.text, /Operations Division reports to Headquarters/);
});

test('extracts sheet names and rows from XLSX files', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Units');
  sheet.addRow(['Unit', 'Parent']);
  sheet.addRow(['Logistics', 'Headquarters']);
  const source = file(
    Buffer.from(await workbook.xlsx.writeBuffer()),
    'chart.xlsx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  const result = await extractFile(source, resolveFileType(source));
  assert.match(result.text, /Sheet: Units/);
  assert.match(result.text, /Logistics\tHeadquarters/);
  assert.equal(result.metadata.sheetCount, 1);
});

test('rejects scanned or image-only PDF content instead of claiming success', async () => {
  const chunks = [];
  const document = new PDFDocument();
  document.on('data', (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve) => document.on('end', resolve));
  document.addPage();
  document.end();
  await completed;
  const source = file(Buffer.concat(chunks), 'scan.pdf', 'application/pdf');
  await assert.rejects(
    () => extractFile(source, resolveFileType(source)),
    (error) => error.code === 'PDF_VISUAL_CONTENT_UNSUPPORTED',
  );
});
