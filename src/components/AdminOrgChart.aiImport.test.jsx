import React, { forwardRef, useImperativeHandle } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG_V1 } from '../config/AppSchema';
import AdminOrgChart from './AdminOrgChart';
import AIService from '../services/AIService';
import { confirmToast } from '../utils/confirmToast';
import { UI_FEATURES } from '../config/uiFeatures.config';

const saveOrgChart = vi.fn(async () => true);
const sourceOrgChart = {
    ...DEFAULT_CONFIG_V1.content.orgChart,
    enabled: true,
    pageTitle: 'עץ קיים',
    nodes: [{
        id: 'before',
        name: 'לפני AI',
        rank: '',
        role: '',
        personalNumber: '',
        imageUrl: '',
        children: [],
    }],
};

vi.mock('../context/OrgChartContext', async (importOriginal) => ({
    ...await importOriginal(),
    useOrgChart: () => ({
        orgChart: sourceOrgChart,
        loading: false,
        error: '',
        saveOrgChart,
    }),
}));

vi.mock('../config/ai.config', () => ({
    AI_CONFIG: {
        fileModel: 'gpt-4o',
        fileMaxMb: 20,
    },
}));

vi.mock('../config/uiFeatures.config', () => ({
    UI_FEATURES: {
        showAiUi: true,
        showWidgetAiButtons: true,
        showOrgChartAiImport: true,
    },
}));

vi.mock('../services/AIService', () => ({
    default: {
        analyzeFile: vi.fn(),
    },
}));

vi.mock('../utils/confirmToast', () => ({
    confirmToast: vi.fn(async () => true),
}));

vi.mock('./AdminWidgetAIAssistant', () => ({
    default: forwardRef(function MockAssistant({ value, onChange }, ref) {
        useImperativeHandle(ref, () => ({
            async applyExternalResult(next) {
                if (JSON.stringify(next) === JSON.stringify(value)) return false;
                onChange(next);
                return true;
            },
        }), [onChange, value]);
        return null;
    }),
}));

vi.mock('./AdminHelp', () => ({
    AdminPageHelpButton: () => null,
    HelpLabel: ({ children }) => <span>{children}</span>,
    HelpTooltipButton: ({ title }) => <span aria-label={title} />,
}));

vi.mock('./OrgChartFlow', () => ({
    default: ({ config }) => <div data-testid="org-preview">{config.nodes.map((node) => node.name).join(',')}</div>,
}));

vi.mock('./OrgChartLivePreview', () => ({
    default: ({ draft }) => <div data-testid="org-live-preview">{draft.nodes.map((node) => node.name).join(',')}</div>,
}));

describe('AdminOrgChart AI file import', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        UI_FEATURES.showOrgChartAiImport = true;
    });

    afterEach(() => cleanup());

    function selectAiFile(container) {
        fireEvent.click(screen.getByRole('button', { name: 'הגדרות בסיס' }));
        const input = container.querySelector('input[accept*=".pdf"]');
        const file = new File(['unit,parent\nOperations,HQ'], 'org-chart.csv', { type: 'text/csv' });
        fireEvent.change(input, { target: { files: [file] } });
        return file;
    }

    it('hides the experimental import action when its UI flag is false', () => {
        UI_FEATURES.showOrgChartAiImport = false;
        render(<AdminOrgChart />);
        fireEvent.click(screen.getByRole('button', { name: 'הגדרות בסיס' }));
        expect(screen.queryByRole('button', { name: /ייבוא עם AI/ })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'ייבוא JSON' })).toBeVisible();
    });

    it('shows selected metadata and applies successful extraction to the real draft', async () => {
        AIService.analyzeFile.mockResolvedValue({
            requestId: 'req-success',
            modelUsed: 'gpt-4o',
            source: { extension: '.csv', extractionStrategy: 'utf8-text' },
            result: {
                nodes: [{
                    id: 'after',
                    name: 'אחרי AI',
                    rank: '',
                    role: '',
                    personalNumber: '',
                    imageUrl: '',
                    children: [],
                }],
                warnings: ['ההיררכיה דורשת בדיקה'],
                summary: 'זוהה צומת אחד',
                nodeCount: 1,
            },
        });
        const { container } = render(<AdminOrgChart />);
        selectAiFile(container);

        expect(screen.getByText('org-chart.csv')).toBeVisible();
        expect(screen.getByText('text/csv')).toBeVisible();
        expect(screen.getByText('gpt-4o')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'ניתוח וייבוא' }));

        await waitFor(() => expect(AIService.analyzeFile).toHaveBeenCalled());
        expect(await screen.findByText('זוהה צומת אחד')).toBeVisible();
        expect(screen.getByText('ההיררכיה דורשת בדיקה')).toBeVisible();
        expect(screen.getByTestId('org-live-preview')).toHaveTextContent('אחרי AI');
        expect(screen.getByText(/העץ עודכן/)).toBeVisible();
        expect(confirmToast).toHaveBeenCalled();
    });

    it('keeps the current draft unchanged when analysis fails', async () => {
        AIService.analyzeFile.mockRejectedValue(Object.assign(new Error('bad file'), {
            code: 'MALFORMED_FILE',
            requestId: 'req-failure',
        }));
        const { container } = render(<AdminOrgChart />);
        selectAiFile(container);
        fireEvent.click(screen.getByRole('button', { name: 'ניתוח וייבוא' }));

        expect(await screen.findByText('הקובץ פגום או שאי אפשר לקרוא אותו.')).toBeVisible();
        expect(screen.getByText('מזהה תקלה: req-failure')).toBeVisible();
        expect(screen.getByTestId('org-live-preview')).toHaveTextContent('לפני AI');
        expect(saveOrgChart).not.toHaveBeenCalled();
    });
});
