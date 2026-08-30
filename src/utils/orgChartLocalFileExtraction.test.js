import { describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph } from 'docx';
import {
    extractOrgChartFileLocally,
    getOrgChartFileCapability,
    validateOrgChartAiFile,
} from './orgChartLocalFileExtraction';

vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url', async () => {
    const path = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    return {
        default: pathToFileURL(path.resolve(
            process.cwd(),
            'node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs',
        )).href,
    };
});

function createFile(parts, name, type) {
    return new File(parts, name, { type });
}

async function createPdfBuffer(text) {
    return new Promise((resolve) => {
        const chunks = [];
        const document = new PDFDocument();
        document.on('data', (chunk) => chunks.push(chunk));
        document.on('end', () => resolve(Buffer.concat(chunks)));
        if (text) document.text(text);
        document.end();
    });
}

describe('orgChartLocalFileExtraction', () => {
    it.each([
        ['tree.txt', 'text/plain', 'Headquarters\nOperations reports to Headquarters'],
        ['tree.md', 'text/markdown', '# Headquarters\n- Operations'],
        ['tree.csv', 'text/csv', 'unit,parent\nOperations,Headquarters'],
        ['tree.json', 'application/json', '{"unit":"Operations","parent":"Headquarters"}'],
    ])('extracts bounded UTF-8 content from %s', async (name, type, content) => {
        const result = await extractOrgChartFileLocally(createFile([content], name, type));
        expect(result.text).toContain('Headquarters');
        expect(result.extractedCharacterCount).toBe(result.text.length);
    });

    it('extracts sheet names and rows from XLSX locally', async () => {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Units');
        sheet.addRow(['Unit', 'Parent']);
        sheet.addRow(['Operations', 'Headquarters']);
        const buffer = await workbook.xlsx.writeBuffer();
        const result = await extractOrgChartFileLocally(createFile(
            [buffer],
            'tree.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ));
        expect(result.text).toContain('Sheet: Units');
        expect(result.text).toContain('Operations\tHeadquarters');
        expect(result.metadata.sheetCount).toBe(1);
    });

    it('extracts DOCX text locally', async () => {
        const document = new Document({
            sections: [{ children: [new Paragraph('Operations reports to Headquarters')] }],
        });
        const buffer = await Packer.toBuffer(document);
        const result = await extractOrgChartFileLocally(createFile(
            [buffer],
            'tree.docx',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ));
        expect(result.text).toContain('Operations reports to Headquarters');
    });

    it('extracts text-based PDF content locally', async () => {
        const buffer = await createPdfBuffer('Operations reports to Headquarters');
        const result = await extractOrgChartFileLocally(createFile([buffer], 'tree.pdf', 'application/pdf'));
        expect(result.text).toContain('Operations reports to Headquarters');
        expect(result.metadata.pageCount).toBeGreaterThan(0);
    });

    it.each([
        ['tree.txt', 'text/plain'],
        ['tree.md', 'text/markdown'],
        ['tree.csv', 'text/csv'],
    ])('rejects malformed UTF-8 in %s', async (name, type) => {
        await expect(extractOrgChartFileLocally(createFile(
            [new Uint8Array([0xc3, 0x28])],
            name,
            type,
        ))).rejects.toMatchObject({ code: 'MALFORMED_FILE' });
    });

    it.each([
        ['tree.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['tree.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['tree.pdf', 'application/pdf'],
    ])('rejects malformed structured file %s', async (name, type) => {
        await expect(extractOrgChartFileLocally(createFile(['not a valid document'], name, type)))
            .rejects.toMatchObject({ code: 'MALFORMED_FILE' });
    });

    it('rejects scanned or image-only PDF instead of claiming visual support', async () => {
        const buffer = await createPdfBuffer('');
        await expect(extractOrgChartFileLocally(createFile([buffer], 'scan.pdf', 'application/pdf')))
            .rejects.toMatchObject({ code: 'PDF_VISUAL_CONTENT_UNSUPPORTED' });
    });

    it('rejects malformed JSON, oversized extraction, and oversized selection', async () => {
        await expect(extractOrgChartFileLocally(createFile(['{bad'], 'tree.json', 'application/json')))
            .rejects.toMatchObject({ code: 'MALFORMED_FILE' });
        await expect(extractOrgChartFileLocally(
            createFile(['123456'], 'tree.txt', 'text/plain'),
            { maxChars: 5 },
        )).rejects.toMatchObject({ code: 'EXTRACTED_TEXT_TOO_LARGE' });
        expect(() => validateOrgChartAiFile({ name: 'tree.pdf', size: 21 * 1024 * 1024 }, 20))
            .toThrow(/גדול/);
    });

    it('classifies visual files as selectable but blocks unverified transport without reading bytes', async () => {
        const image = createFile(['not-uploaded'], 'tree.png', 'image/png');
        expect(getOrgChartFileCapability(image).kind).toBe('visual-unverified');
        await expect(extractOrgChartFileLocally(image)).rejects.toMatchObject({
            code: 'VISUAL_TRANSPORT_UNVERIFIED',
        });
    });

    it('rejects unsupported extensions', () => {
        expect(() => validateOrgChartAiFile(createFile(['x'], 'tree.exe', 'application/octet-stream')))
            .toThrow(/אינו נתמך/);
    });
});
