import { describe, expect, it } from 'vitest';
import { auditGanttExcelExport, buildGanttExcelWorkbook, getGanttExcelFileName } from './ganttExcelExport';

describe('gantt excel export audit', () => {
    it('audits source tasks, recurring occurrences and export range before workbook creation', () => {
        const audit = auditGanttExcelExport({
            enabled: true,
            pageTitle: 'גאנט בדיקה',
            categories: [{ id: 'cat', name: 'בדיקות', color: '#2563eb', order: 1 }],
            items: [
                {
                    id: 'one-time',
                    title: 'משימה חד פעמית',
                    category: 'בדיקות',
                    status: 'planned',
                    startDate: '2026-01-10',
                    endDate: '2026-01-11',
                    color: '#2563eb',
                },
                {
                    id: 'weekly',
                    title: 'עדכון שבועי',
                    category: 'בדיקות',
                    status: 'planned',
                    startDate: '2026-01-05',
                    endDate: '2026-01-05',
                    color: '#16a34a',
                    recurrence: {
                        enabled: true,
                        frequency: 'weekly',
                        weekdays: [1],
                        until: '2026-01-26',
                    },
                },
            ],
        }, new Date('2026-01-01T10:00:00'));

        expect(audit.sourceTaskCount).toBe(2);
        expect(audit.recurringTaskCount).toBe(1);
        expect(audit.recurringOccurrenceCount).toBe(4);
        expect(audit.occurrenceCount).toBe(5);
        expect(audit.rangeStart).toBe('2026-01-05');
        expect(audit.rangeEnd).toBe('2026-01-26');
    });

    it('marks recurrence without an end date as bounded by the audited export horizon', () => {
        const audit = auditGanttExcelExport({
            pageTitle: 'גאנט פתוח',
            items: [
                {
                    id: 'weekly-open',
                    title: 'חזרה פתוחה',
                    startDate: '2026-01-05',
                    endDate: '2026-01-05',
                    recurrence: {
                        enabled: true,
                        frequency: 'weekly',
                        weekdays: [1],
                        maxOccurrences: 3,
                    },
                },
            ],
        }, new Date('2026-01-01T10:00:00'));

        expect(audit.hasUnboundedRecurrence).toBe(true);
        expect(audit.recurringOccurrenceCount).toBe(3);
        expect(audit.rangeEnd).toBe('2027-01-01');
    });

    it('creates a safe Hebrew-friendly xlsx file name', () => {
        expect(getGanttExcelFileName({ pageTitle: 'גאנט / קורס: א' }, new Date('2026-01-15T10:00:00'))).toBe('גאנט-קורס-א-2026-01-15.xlsx');
    });

    it('builds a real workbook buffer with the expected sheets', async () => {
        const { workbook, audit } = await buildGanttExcelWorkbook({
            pageTitle: 'בדיקת יצוא',
            items: [
                {
                    id: 'weekly',
                    title: 'עדכון שבועי',
                    startDate: '2026-01-05',
                    endDate: '2026-01-05',
                    recurrence: { enabled: true, frequency: 'weekly', weekdays: [1], until: '2026-01-26' },
                },
            ],
        }, new Date('2026-01-01T10:00:00'));

        const buffer = await workbook.xlsx.writeBuffer();

        expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['תקציר', 'משימות מקור', 'מופעים בפועל']);
        expect(buffer.byteLength).toBeGreaterThan(8000);
        expect(audit.occurrenceCount).toBe(4);
    });
});
