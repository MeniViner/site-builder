import { describe, expect, it, vi } from 'vitest';
import {
    ADMIN_AI_EXECUTION_MODES,
    ADMIN_AI_EXECUTION_OUTCOMES,
    buildAdminAiChangeSummary,
    didAdminAiApplyChange,
    executeAdminAiResponse,
} from './adminAiExecution';

function verifiedApply() {
    return vi.fn(async ({ candidates, summaries }) => ({
        changed: true,
        persistenceTriggered: true,
        historyEntryCreated: true,
        appliedSnapshot: candidates[0],
        appliedChangeSummary: summaries[0],
    }));
}

describe('admin AI execution outcomes', () => {
    it('returns applied only after a changed candidate is persisted and recorded', async () => {
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: '{"items":[{"id":"n1","text":"ידיעה חדשה","isUrgent":false}]}',
            surfaceKey: 'news',
            actionId: 'flash',
            instruction: 'הוסף ידיעה חדשה',
            baseline: [],
            applyCandidates,
        });

        expect(result).toMatchObject({
            mode: ADMIN_AI_EXECUTION_MODES.MUTATING,
            outcome: ADMIN_AI_EXECUTION_OUTCOMES.APPLIED,
            changed: true,
            historyEntryCreated: true,
            persistenceTriggered: true,
            errorCode: null,
        });
        expect(result.appliedChangeSummary).toEqual(['נוספו 1 ידיעות']);
        expect(applyCandidates).toHaveBeenCalledOnce();
    });

    it('returns analysis without parsing, mutation, persistence, or history', async () => {
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'analysis',
            rawResponseText: '## ממצאים\n\nאין כפילויות.',
            surfaceKey: 'gantt',
            actionId: 'audit',
            baseline: { items: [] },
            applyCandidates,
        });

        expect(result).toMatchObject({
            outcome: ADMIN_AI_EXECUTION_OUTCOMES.ANALYSIS,
            changed: false,
            historyEntryCreated: false,
            persistenceTriggered: false,
        });
        expect(applyCandidates).not.toHaveBeenCalled();
    });

    it('returns no-change and keeps the raw response for invalid JSON', async () => {
        const rawResponseText = 'כדאי לעדכן את הכותרת, אך לא החזרתי JSON.';
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText,
            surfaceKey: 'news',
            actionId: 'improve',
            baseline: [],
            applyCandidates: verifiedApply(),
        });

        expect(result).toMatchObject({
            outcome: ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE,
            rawResponseText,
            changed: false,
            historyEntryCreated: false,
            errorCode: 'INVALID_JSON',
        });
        expect(result.userMessage).toContain('אינה JSON תקין');
    });

    it('returns no-change for an unusable structured payload', async () => {
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: '{"items":[{}]}',
            surfaceKey: 'news',
            actionId: 'flash',
            baseline: [],
            applyCandidates,
        });

        expect(result.outcome).toBe(ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE);
        expect(result.errorCode).toBe('NO_MEANINGFUL_DIFF');
        expect(applyCandidates).not.toHaveBeenCalled();
    });

    it('returns no-change when normalization produces the current News state', async () => {
        const baseline = [{ id: 'n1', text: 'אותה ידיעה', isUrgent: false }];
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: '{"items":[{"id":"n1","text":"אותה ידיעה","isUrgent":false}]}',
            surfaceKey: 'news',
            actionId: 'improve',
            baseline,
            applyCandidates,
        });

        expect(result).toMatchObject({
            outcome: ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE,
            errorCode: 'NO_MEANINGFUL_DIFF',
            historyEntryCreated: false,
        });
        expect(applyCandidates).not.toHaveBeenCalled();
    });

    it('does not accept an apply callback that cannot verify persistence and history', async () => {
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: '{"items":[{"id":"n1","text":"חדש","isUrgent":false}]}',
            surfaceKey: 'news',
            actionId: 'flash',
            baseline: [],
            applyCandidates: vi.fn(async () => true),
        });

        expect(result).toMatchObject({
            outcome: ADMIN_AI_EXECUTION_OUTCOMES.NO_CHANGE,
            errorCode: 'APPLY_NOT_VERIFIED',
            historyEntryCreated: false,
        });
    });
});

describe('surface-aware AI execution', () => {
    it('applies a BOOM task update and reports task and status changes', async () => {
        const baseline = {
            enabled: true,
            buttonLabel: 'BOOM',
            pageTitle: 'BOOM',
            description: '',
            design: {},
            categories: [{ id: 'c1', name: 'מבצעים', color: '#2563eb', order: 1 }],
            items: [{
                id: 'b1',
                title: 'היערכות',
                owner: 'דנה',
                category: 'מבצעים',
                status: 'planned',
                startDate: '2026-09-01',
                endDate: '2026-09-03',
                details: '',
                color: '#2563eb',
            }],
        };
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: JSON.stringify({
                boom: {
                    categories: baseline.categories,
                    items: [{ ...baseline.items[0], status: 'active' }],
                },
            }),
            surfaceKey: 'boom',
            actionId: 'update',
            instruction: 'עדכן את משימת היערכות לסטטוס active',
            baseline,
            applyCandidates: verifiedApply(),
        });

        expect(result.outcome).toBe('applied');
        expect(result.appliedSnapshot.items[0].status).toBe('active');
        expect(result.appliedChangeSummary.join(' ')).toContain('סטטוסים');
    });

    it('keeps a BOOM status check analysis-only', async () => {
        const result = await executeAdminAiResponse({
            mode: 'analysis',
            rawResponseText: 'משימה אחת חסומה.',
            surfaceKey: 'boom',
            actionId: 'audit',
            baseline: { items: [] },
            applyCandidates: verifiedApply(),
        });

        expect(result.outcome).toBe('analysis');
        expect(result.historyEntryCreated).toBe(false);
    });

    it('applies a valid Gantt task without losing planning fields', async () => {
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: JSON.stringify({
                gantt: {
                    categories: [{ id: 'c1', name: 'תכנון', color: '#2563eb', order: 1 }],
                    items: [{
                        id: 'g1',
                        title: 'אפיון',
                        owner: '',
                        category: 'תכנון',
                        status: 'planned',
                        startDate: '2026-09-01',
                        endDate: '2026-09-05',
                        color: '#2563eb',
                        details: 'הגדרת דרישות',
                        dependsOn: [],
                        milestones: [],
                    }],
                },
            }),
            surfaceKey: 'gantt',
            actionId: 'brief',
            instruction: 'צור משימת אפיון מ-1.9.2026 עד 5.9.2026',
            baseline: { categories: [], items: [] },
            applyCandidates,
        });

        expect(result.outcome).toBe('applied');
        expect(result.appliedSnapshot.items[0]).toMatchObject({
            title: 'אפיון',
            details: 'הגדרת דרישות',
            dependsOn: [],
            milestones: [],
        });
        expect(result.appliedChangeSummary[0]).toContain('משימות Gantt');
    });

    it('keeps Gantt status analysis output-only', async () => {
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'analysis',
            rawResponseText: 'הפרויקט עומד בלוחות הזמנים.',
            surfaceKey: 'gantt',
            actionId: 'status',
            baseline: { items: [] },
            applyCandidates,
        });

        expect(result.outcome).toBe('analysis');
        expect(applyCandidates).not.toHaveBeenCalled();
    });

    it('preserves Poll votes and voters while applying wording changes', async () => {
        const baseline = [{
            id: 'p1',
            question: 'האם השירות טוב?',
            active: true,
            options: [
                { id: 'o1', text: 'כן', votes: 7, voters: ['u1'] },
                { id: 'o2', text: 'לא', votes: 2, voters: ['u2'] },
            ],
        }];
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: JSON.stringify({
                items: [{
                    id: 'p1',
                    question: 'כיצד היית מדרג את השירות?',
                    active: true,
                    options: [
                        { id: 'o1', text: 'טוב', votes: 999 },
                        { id: 'o2', text: 'דורש שיפור', votes: 999 },
                    ],
                }],
            }),
            surfaceKey: 'polls',
            actionId: 'rewrite',
            instruction: 'שכתב את השאלה והתשובות',
            baseline,
            applyCandidates: verifiedApply(),
        });

        expect(result.outcome).toBe('applied');
        expect(result.appliedSnapshot[0].options).toEqual([
            { id: 'o1', text: 'טוב', votes: 7, voters: ['u1'] },
            { id: 'o2', text: 'דורש שיפור', votes: 2, voters: ['u2'] },
        ]);
    });

    it('treats normalized Site Content whitespace as no meaningful change', () => {
        expect(didAdminAiApplyChange(
            { hero: { title: 'כותרת  קיימת' } },
            { hero: { title: ' כותרת קיימת ' } },
            'info'
        )).toBe(false);
    });

    it('does not treat normalized empty Site Content defaults as a real change', async () => {
        const applyCandidates = verifiedApply();
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: '{"hero":{"siteName":"","title":"","subtitle":"","description":""},"commander":{"sectionTitle":"","roleLabel":"","messages":[]}}',
            surfaceKey: 'info',
            actionId: 'fill-missing',
            instruction: 'מלא שדות חסרים',
            baseline: {},
            applyCandidates,
        });

        expect(result.outcome).toBe('no-change');
        expect(result.errorCode).toBe('NO_MEANINGFUL_DIFF');
        expect(applyCandidates).not.toHaveBeenCalled();
    });

    it('does not report an unchanged Events candidate as applied', async () => {
        const baseline = {
            events: [{
                id: 'e1',
                date: '2026-09-01',
                title: 'אירוע',
                subtitle: '',
                subtitleRichText: [],
                linkLabels: {},
                color: 'gray',
            }],
            displayCount: 1,
            displayMode: 'default',
            intervalMs: 6000,
        };
        const result = await executeAdminAiResponse({
            mode: 'mutating',
            rawResponseText: JSON.stringify({
                events: [{
                    id: 'e1',
                    date: '2026-09-01',
                    title: 'אירוע',
                    subtitle: '',
                    color: 'gray',
                }],
                displayCount: 1,
                displayMode: 'default',
                intervalMs: 6000,
            }),
            surfaceKey: 'events',
            actionId: 'improve',
            instruction: 'שפר ניסוח',
            baseline,
            applyCandidates: verifiedApply(),
        });

        expect(result.outcome).toBe('no-change');
        expect(result.historyEntryCreated).toBe(false);
    });

    it('builds non-empty summaries for every changed supported surface', () => {
        expect(buildAdminAiChangeSummary(
            [],
            [{ id: 'a1', title: 'חשוב', text: 'עדכון', isUrgent: false }],
            'alerts',
            'draft'
        )).toEqual(['נוספו 1 הודעות']);
    });
});
