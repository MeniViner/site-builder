import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAICopilot from './AdminAICopilot';
import AIService from '../services/AIService';
import { toast } from 'react-toastify';

const contextMocks = vi.hoisted(() => ({
    saveSiteContent: vi.fn(async () => true),
    saveNavigation: vi.fn(async () => true),
    saveEvents: vi.fn(async () => true),
    saveWidgetConfig: vi.fn(async () => true),
    saveTheme: vi.fn(async () => true),
    saveExternalLinks: vi.fn(async () => true),
    saveGalleries: vi.fn(async () => true),
    saveGantt: vi.fn(async () => true),
    saveOrgChart: vi.fn(async () => true),
    saveBoom: vi.fn(async () => true),
}));

vi.mock('../services/AIService', () => ({
    default: {
        ask: vi.fn(),
        isEnabled: vi.fn(() => true),
    },
}));

vi.mock('../config/ai.config', () => ({
    getSafeAiRuntimeConfig: () => ({ defaultModel: 'test-model' }),
    formatAiEngineLabel: (result) => result?.modelUsed || 'test-model',
}));

vi.mock('react-toastify', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../context/SiteContentContext', () => ({
    useSiteContent: () => ({ siteContent: {}, saveSiteContent: contextMocks.saveSiteContent }),
}));
vi.mock('../context/NavigationContext', () => ({
    useNavigation: () => ({ navItems: [], saveNavigation: contextMocks.saveNavigation }),
}));
vi.mock('../context/EventsContext', () => ({
    useEvents: () => ({
        events: [],
        displayCount: 3,
        displayMode: 'default',
        intervalMs: 6000,
        saveEvents: contextMocks.saveEvents,
    }),
}));
vi.mock('../context/WidgetContext', () => ({
    useWidget: () => ({
        widgetConfig: {
            activeWidgets: [],
            news: [{ id: 'n1', text: 'קיים', isUrgent: false }],
            polls: [],
            alerts: [],
            outstanding: [],
            phonebook: [],
            shuttles: [],
            celebrations: [],
            heritage: [],
            tips: [],
            countdown: { items: [] },
        },
        saveWidgetConfig: contextMocks.saveWidgetConfig,
    }),
}));
vi.mock('../context/ThemeContext', () => ({
    useTheme: () => ({ theme: {}, saveTheme: contextMocks.saveTheme }),
}));
vi.mock('../context/ExternalLinksContext', () => ({
    useExternalLinks: () => ({ externalLinks: [], saveExternalLinks: contextMocks.saveExternalLinks }),
}));
vi.mock('../context/ImageGalleryContext', () => ({
    useImageGalleries: () => ({ galleries: [], saveGalleries: contextMocks.saveGalleries }),
}));
vi.mock('../context/GanttContext', () => ({
    useGantt: () => ({
        gantt: { enabled: true, categories: [], items: [] },
        saveGantt: contextMocks.saveGantt,
    }),
}));
vi.mock('../context/OrgChartContext', () => ({
    useOrgChart: () => ({ orgChart: { nodes: [] }, saveOrgChart: contextMocks.saveOrgChart }),
}));
vi.mock('../context/BoomContext', () => ({
    useBoom: () => ({
        boom: {
            enabled: true,
            categories: [],
            tasks: [{ id: 'b1', title: 'משימה חסומה', status: 'blocked', owner: '' }],
        },
        saveBoom: contextMocks.saveBoom,
    }),
}));

function runAction(actionLabel, instruction) {
    fireEvent.click(screen.getByRole('button', { name: 'AI' }));
    fireEvent.click(screen.getByRole('button', { name: actionLabel }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: instruction } });
    fireEvent.click(screen.getByRole('button', { name: 'נתח והצג תשובה' }));
}

describe('AdminAICopilot analysis responses', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        AIService.isEnabled.mockReturnValue(true);
    });

    afterEach(cleanup);

    it('renders BOOM status-check Markdown without mutation, persistence, history, or applied success', async () => {
        AIService.ask.mockResolvedValue({
            modelUsed: 'test-model',
            content: '## תמונת מצב\n\nנמצאה **משימה חסומה** ללא אחראי.\n\n| משימה | מצב |\n|---|---|\n| משימה חסומה | חסום |',
        });
        render(<AdminAICopilot activeTab="boom" />);

        runAction('בדוק תמונת מצב', 'בדוק את תמונת המצב והצג המלצות בלבד');

        expect(await screen.findByRole('heading', { name: 'תמונת מצב' })).toBeVisible();
        expect(screen.getByRole('table')).toHaveTextContent('משימה חסומה');
        expect(AIService.ask.mock.calls[0][0]).toContain('משימה חסומה');
        expect(AIService.ask.mock.calls[0][0]).toContain('אל תטען שביצעת שינוי');
        expect(contextMocks.saveBoom).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
        expect(screen.queryByText(/הוחלה|חזרנו למצב שלפני/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /לפני AI|הקודם|הבא/ })).not.toBeInTheDocument();
    });

    it('renders Gantt audit output while leaving the draft untouched', async () => {
        AIService.ask.mockResolvedValue({
            modelUsed: 'test-model',
            content: '## בדיקת תכנון\n\n1. חסר אחראי.\n2. חסר תאריך יעד.',
        });
        render(<AdminAICopilot activeTab="gantt" />);

        runAction('אתר בעיות תכנון', 'בדוק בעיות תכנון והצג אותן בלבד');

        expect(await screen.findByRole('heading', { name: 'בדיקת תכנון' })).toBeVisible();
        expect(screen.getByText('חסר אחראי.')).toBeVisible();
        expect(contextMocks.saveGantt).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('shows raw explanatory output when a mutating action returns no usable JSON', async () => {
        AIService.ask.mockResolvedValue({
            modelUsed: 'test-model',
            content: 'לא ניתן ליצור מבזק חדש בלי פרטים נוספים.',
        });
        render(<AdminAICopilot activeTab="news" />);

        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'צור מבזק חדש' } });
        fireEvent.click(screen.getByRole('button', { name: 'צור והחל מיד' }));

        expect(await screen.findByText('לא זוהה שינוי שניתן להחיל. תשובת ה-AI מוצגת למטה.')).toBeVisible();
        expect(screen.getByText('לא ניתן ליצור מבזק חדש בלי פרטים נוספים.')).toBeVisible();
        expect(contextMocks.saveWidgetConfig).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });

    it('renders the single retained lower-left Gantt AI launcher', () => {
        render(<AdminAICopilot activeTab="gantt" />);
        const launchers = screen.getAllByRole('button', { name: 'AI' });
        expect(launchers).toHaveLength(1);
        expect(launchers[0]).toHaveClass('fixed', 'bottom-4', 'left-4');
    });

    it('does not execute AI or show a response when only suggesting a prompt', () => {
        render(<AdminAICopilot activeTab="gantt" />);
        fireEvent.click(screen.getByRole('button', { name: 'AI' }));
        fireEvent.click(screen.getByRole('button', { name: 'הצע ניסוח' }));

        expect(screen.getByRole('textbox')).not.toHaveValue('');
        expect(AIService.ask).not.toHaveBeenCalled();
        expect(screen.queryByLabelText('תשובת AI')).not.toBeInTheDocument();
    });
});
