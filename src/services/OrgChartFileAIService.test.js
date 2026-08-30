import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIService from './AIService';
import { analyzeOrgChartSourceFile } from './OrgChartFileAIService';

vi.mock('./AIService', () => ({
    default: {
        ask: vi.fn(),
    },
}));

const validResult = {
    nodes: [{
        id: 'root',
        name: 'Headquarters',
        rank: '',
        role: '',
        personalNumber: '',
        imageUrl: '',
        children: [],
    }],
    summary: 'One unit',
    warnings: [],
    ambiguities: [],
};

describe('OrgChartFileAIService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AIService.ask.mockResolvedValue({
            modelUsed: 'dedicated-file-model',
            content: JSON.stringify(validResult),
        });
    });

    it('sends locally extracted text through the existing AIService ask transport', async () => {
        const file = new File(
            ['unit,parent\nOperations,Headquarters'],
            'tree.csv',
            { type: 'text/csv' },
        );
        const extractionSpy = vi.fn();

        const response = await analyzeOrgChartSourceFile(file, {
            model: 'dedicated-file-model',
            instruction: 'focus on reporting lines',
            onExtraction: extractionSpy,
        });

        expect(AIService.ask).toHaveBeenCalledOnce();
        expect(AIService.ask.mock.calls[0][0]).toContain('Operations,Headquarters');
        expect(AIService.ask.mock.calls[0][0]).toContain('BEGIN UNTRUSTED DOCUMENT DATA');
        expect(AIService.ask.mock.calls[0][1]).toMatchObject({ model: 'dedicated-file-model' });
        expect(extractionSpy).toHaveBeenCalledWith(expect.objectContaining({
            strategy: 'csv-local',
            extractedCharacterCount: expect.any(Number),
        }));
        expect(response.result).toEqual(validResult);
    });

    it('does not call text transport for a visual file without a verified adapter', async () => {
        const file = new File(['image bytes'], 'tree.png', { type: 'image/png' });
        await expect(analyzeOrgChartSourceFile(file, { model: 'dedicated-file-model' }))
            .rejects.toMatchObject({ code: 'VISUAL_TRANSPORT_UNVERIFIED' });
        expect(AIService.ask).not.toHaveBeenCalled();
    });

    it('exposes a future visual transport seam without assuming its contract', async () => {
        const file = new File(['image bytes'], 'tree.png', { type: 'image/png' });
        const visualTransport = vi.fn().mockResolvedValue({ future: true });
        await expect(analyzeOrgChartSourceFile(file, {
            model: 'dedicated-file-model',
            visualTransport,
        })).resolves.toEqual({ future: true });
        expect(visualTransport).toHaveBeenCalledWith(file, expect.objectContaining({
            model: 'dedicated-file-model',
        }));
        expect(AIService.ask).not.toHaveBeenCalled();
    });
});
