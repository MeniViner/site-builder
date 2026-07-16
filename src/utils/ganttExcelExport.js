import {
    GANTT_STATUS_OPTIONS,
    GANTT_TIME_STATUS_OPTIONS,
    computeGanttProgress,
    computeGanttTimeStatus,
    describeGanttRecurrence,
    expandGanttRecurringTasks,
    normalizeGanttData,
} from './ganttData';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DAY_MS = 24 * 60 * 60 * 1000;
const HEADER_FILL = 'FF1F4E79';
const HEADER_FONT = 'FFFFFFFF';
const SUBTLE_FILL = 'FFEAF3F8';
const CARD_FILL = 'FFF8FBFD';
const BORDER_COLOR = 'FFD9E2EA';

const statusLabel = Object.fromEntries(GANTT_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const timeStatusLabel = Object.fromEntries(GANTT_TIME_STATUS_OPTIONS.map((option) => [option.value, option.label]));

const statusFills = {
    planned: 'FFEFF6FF',
    blocked: 'FFFFE4E6',
    completed: 'FFE7F8EF',
    cancelled: 'FFF1F5F9',
    onHold: 'FFFFF7D6',
};

function toDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDateString(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function addMonths(date, months) {
    const next = new Date(date);
    const originalDay = next.getDate();
    next.setMonth(next.getMonth() + months, 1);
    const daysInMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(originalDay, daysInMonth));
    return next;
}

function dateValue(value) {
    return toDate(value) || '';
}

function durationDays(task) {
    const start = toDate(task.startDate);
    const end = toDate(task.endDate);
    if (!start || !end) return '';
    return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

function joinMilestones(task) {
    return (task.milestones || [])
        .map((milestone) => `${milestone.title} (${milestone.date})`)
        .join('\n');
}

function sanitizeFilePart(value) {
    const cleaned = String(value || 'gantt')
        .replace(/[\\/:*?"<>|']/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 48);
    return cleaned || 'gantt';
}

export function auditGanttExcelExport(dataLike, now = new Date()) {
    const gantt = normalizeGanttData(dataLike);
    const taskDates = gantt.items
        .flatMap((task) => [
            toDate(task.startDate),
            toDate(task.endDate),
            ...(task.milestones || []).map((milestone) => toDate(milestone.date)),
        ])
        .filter(Boolean);
    const recurringTasks = gantt.items.filter((task) => task.recurrence?.enabled);
    const recurringUntilDates = recurringTasks
        .map((task) => toDate(task.recurrence?.until))
        .filter(Boolean);
    const fallbackNow = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
    const fallbackStart = taskDates[0] || fallbackNow;
    const rangeStart = taskDates.length > 0 ? new Date(Math.min(...taskDates.map((date) => date.getTime()))) : fallbackStart;
    const baseEnd = taskDates.length > 0 ? new Date(Math.max(...taskDates.map((date) => date.getTime()))) : fallbackStart;
    const boundedRecurringEnd = recurringUntilDates.length > 0
        ? new Date(Math.max(...recurringUntilDates.map((date) => date.getTime())))
        : null;
    const unboundedRecurringHorizon = recurringTasks.some((task) => !task.recurrence.until)
        ? addMonths(fallbackNow, 12)
        : null;
    const rangeEnd = new Date(Math.max(
        baseEnd.getTime(),
        boundedRecurringEnd?.getTime() || baseEnd.getTime(),
        unboundedRecurringHorizon?.getTime() || baseEnd.getTime()
    ));
    const expandedItems = expandGanttRecurringTasks(gantt.items, {
        rangeStart: toDateString(rangeStart),
        rangeEnd: toDateString(rangeEnd),
    });
    const recurringOccurrences = expandedItems.filter((task) => task.isRecurringOccurrence);

    return {
        gantt,
        rangeStart: toDateString(rangeStart),
        rangeEnd: toDateString(rangeEnd),
        sourceTaskCount: gantt.items.length,
        recurringTaskCount: recurringTasks.length,
        occurrenceCount: expandedItems.length,
        recurringOccurrenceCount: recurringOccurrences.length,
        categoryCount: gantt.categories.length,
        overdueCount: expandedItems.filter((task) => computeGanttTimeStatus(task, fallbackNow) === 'overdue').length,
        expandedItems,
        hasUnboundedRecurrence: recurringTasks.some((task) => !task.recurrence.until),
    };
}

function styleWorksheet(worksheet) {
    worksheet.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
    worksheet.properties.defaultRowHeight = 22;
    worksheet.eachRow((row) => {
        row.eachCell((cell) => {
            cell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true, readingOrder: 'rtl' };
            cell.border = {
                top: { style: 'thin', color: { argb: BORDER_COLOR } },
                left: { style: 'thin', color: { argb: BORDER_COLOR } },
                bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
                right: { style: 'thin', color: { argb: BORDER_COLOR } },
            };
        });
    });
}

function styleHeaderRow(row) {
    row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        cell.font = { bold: true, color: { argb: HEADER_FONT } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true, readingOrder: 'rtl' };
    });
}

function applyStatusStyle(worksheet, columnNumber, startRow, endRow) {
    for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
        const cell = worksheet.getCell(rowNumber, columnNumber);
        const status = Object.entries(statusLabel).find(([, label]) => label === cell.value)?.[0];
        if (status && statusFills[status]) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusFills[status] } };
            cell.font = { bold: true, color: { argb: 'FF1F2937' } };
        }
    }
}

function addSummarySheet(workbook, audit) {
    const sheet = workbook.addWorksheet('תקציר', {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 5 }],
    });
    sheet.columns = [
        { width: 26 },
        { width: 34 },
        { width: 22 },
        { width: 22 },
    ];
    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = audit.gantt.pageTitle || 'גאנט';
    sheet.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FF0F172A' } };
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' };
    sheet.getRow(1).height = 34;

    sheet.getCell('A3').value = 'נוצר בתאריך';
    sheet.getCell('B3').value = new Date();
    sheet.getCell('B3').numFmt = 'yyyy-mm-dd hh:mm';
    sheet.getCell('C3').value = 'טווח מופעים';
    sheet.getCell('D3').value = `${audit.rangeStart} - ${audit.rangeEnd}`;

    const cards = [
        ['משימות מקור', audit.sourceTaskCount],
        ['משימות חוזרות', audit.recurringTaskCount],
        ['מופעים ביצוא', audit.occurrenceCount],
        ['באיחור', audit.overdueCount],
        ['תחומים', audit.categoryCount],
        ['מופעים חוזרים', audit.recurringOccurrenceCount],
    ];
    cards.forEach(([label, value], index) => {
        const row = 5 + Math.floor(index / 3) * 2;
        const col = 1 + (index % 3);
        const cell = sheet.getCell(row, col);
        cell.value = label;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTLE_FILL } };
        cell.font = { bold: true, color: { argb: 'FF334155' } };
        const valueCell = sheet.getCell(row + 1, col);
        valueCell.value = value;
        valueCell.font = { bold: true, size: 16, color: { argb: 'FF0F172A' } };
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CARD_FILL } };
    });

    sheet.getCell('A10').value = 'הערת audit';
    sheet.getCell('B10').value = audit.hasUnboundedRecurrence
        ? 'חלק מהמשימות החוזרות אינן כוללות תאריך סיום; המופעים נפרסו עד שנה קדימה או עד מגבלת המופעים שהוגדרה במשימה.'
        : 'כל המשימות החוזרות כוללות תאריך סיום או נכללות בטווח הנתונים הקיים.';
    sheet.mergeCells('B10:D10');
    sheet.getCell('A10').font = { bold: true };
    sheet.getCell('B10').alignment = { wrapText: true, readingOrder: 'rtl' };
    sheet.getRow(10).height = 44;
    styleWorksheet(sheet);
}

function addTasksSheet(workbook, audit) {
    const sheet = workbook.addWorksheet('משימות מקור', {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    const headers = [
        'מזהה',
        'שם משימה',
        'תחום',
        'אחראי',
        'סטטוס',
        'מצב זמן',
        'התחלה',
        'סיום',
        'משך ימים',
        'התקדמות',
        'מופע חוזר',
        'חוק חזרה',
        'אבני דרך',
        'תלויות',
        'הערות',
    ];
    sheet.addRow(headers);
    audit.gantt.items.forEach((task) => {
        sheet.addRow([
            task.id,
            task.title,
            task.category,
            task.owner || '',
            statusLabel[task.status] || task.status,
            timeStatusLabel[computeGanttTimeStatus(task)] || computeGanttTimeStatus(task),
            dateValue(task.startDate),
            dateValue(task.endDate),
            durationDays(task),
            computeGanttProgress(task) / 100,
            task.recurrence?.enabled ? 'כן' : 'לא',
            describeGanttRecurrence(task.recurrence, task),
            joinMilestones(task),
            (task.dependsOn || []).join(', '),
            task.details || '',
        ]);
    });
    sheet.columns = [
        { width: 24 },
        { width: 28 },
        { width: 18 },
        { width: 18 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 11 },
        { width: 12 },
        { width: 12 },
        { width: 36 },
        { width: 34 },
        { width: 24 },
        { width: 42 },
    ];
    styleHeaderRow(sheet.getRow(1));
    sheet.getColumn(7).numFmt = 'yyyy-mm-dd';
    sheet.getColumn(8).numFmt = 'yyyy-mm-dd';
    sheet.getColumn(10).numFmt = '0%';
    sheet.autoFilter = { from: 'A1', to: `O${Math.max(1, sheet.rowCount)}` };
    applyStatusStyle(sheet, 5, 2, sheet.rowCount);
    styleWorksheet(sheet);
}

function addOccurrencesSheet(workbook, audit) {
    const sheet = workbook.addWorksheet('מופעים בפועל', {
        views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    });
    const headers = [
        'מזהה מקור',
        'מזהה מופע',
        'שם משימה',
        'תחום',
        'אחראי',
        'סטטוס',
        'מצב זמן',
        'התחלה',
        'סיום',
        'משך ימים',
        'מספר מופע',
        'חוק חזרה',
        'אבני דרך',
        'הערות',
    ];
    sheet.addRow(headers);
    audit.expandedItems.forEach((task) => {
        sheet.addRow([
            task.recurrenceMeta?.sourceTaskId || task.id,
            task.id,
            task.title,
            task.category,
            task.owner || '',
            statusLabel[task.status] || task.status,
            timeStatusLabel[computeGanttTimeStatus(task)] || computeGanttTimeStatus(task),
            dateValue(task.startDate),
            dateValue(task.endDate),
            durationDays(task),
            task.recurrenceMeta?.occurrenceIndex || '',
            task.isRecurringOccurrence ? task.recurrenceMeta?.ruleLabel : 'חד פעמי',
            joinMilestones(task),
            task.details || '',
        ]);
    });
    sheet.columns = [
        { width: 24 },
        { width: 30 },
        { width: 28 },
        { width: 18 },
        { width: 18 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 11 },
        { width: 11 },
        { width: 36 },
        { width: 34 },
        { width: 42 },
    ];
    styleHeaderRow(sheet.getRow(1));
    sheet.getColumn(8).numFmt = 'yyyy-mm-dd';
    sheet.getColumn(9).numFmt = 'yyyy-mm-dd';
    sheet.autoFilter = { from: 'A1', to: `N${Math.max(1, sheet.rowCount)}` };
    applyStatusStyle(sheet, 6, 2, sheet.rowCount);
    styleWorksheet(sheet);
}

export function getGanttExcelFileName(dataLike, now = new Date()) {
    const gantt = normalizeGanttData(dataLike);
    const stamp = toDateString(now) || new Date().toISOString().slice(0, 10);
    return `${sanitizeFilePart(gantt.pageTitle || gantt.buttonLabel || 'gantt')}-${stamp}.xlsx`;
}

export async function buildGanttExcelWorkbook(dataLike, now = new Date()) {
    const excelModule = await import('exceljs');
    const ExcelJS = excelModule.default || excelModule;
    const audit = auditGanttExcelExport(dataLike, now);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Site Builder';
    workbook.created = now;
    workbook.modified = now;
    workbook.views = [{ rtl: true }];

    addSummarySheet(workbook, audit);
    addTasksSheet(workbook, audit);
    addOccurrencesSheet(workbook, audit);

    return { workbook, audit };
}

export async function downloadGanttExcel(dataLike, now = new Date()) {
    const { workbook, audit } = await buildGanttExcelWorkbook(dataLike, now);
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: XLSX_MIME });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = getGanttExcelFileName(dataLike, now);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return audit;
}
