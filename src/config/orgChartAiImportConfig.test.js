import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Org Chart AI import configuration', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('keeps the experimental UI hidden when the flag is missing or false', async () => {
        vi.stubEnv('VITE_UI_SHOW_ORG_CHART_AI_IMPORT', '');
        const { UI_FEATURES } = await import('./uiFeatures.config');
        expect(UI_FEATURES.showOrgChartAiImport).toBe(false);
    });

    it('shows the experimental UI only when explicitly enabled', async () => {
        vi.stubEnv('VITE_UI_SHOW_ORG_CHART_AI_IMPORT', 'true');
        const { UI_FEATURES } = await import('./uiFeatures.config');
        expect(UI_FEATURES.showOrgChartAiImport).toBe(true);
    });

    it('does not fall back to the regular text model for file imports', async () => {
        vi.stubEnv('VITE_ALPHA_AI_MODEL', 'gpt-text-only');
        vi.stubEnv('VITE_ALPHA_AI_FILE_MODEL', '');
        const { AI_CONFIG } = await import('./ai.config');
        expect(AI_CONFIG.defaultModel).toBe('gpt-text-only');
        expect(AI_CONFIG.fileModel).toBe('');
    });
});
