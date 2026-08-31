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

    it('keeps the dedicated file-model setting distinct from the text model', async () => {
        vi.stubEnv('VITE_ALPHA_AI_MODEL', 'gpt-text-only');
        vi.stubEnv('VITE_ALPHA_AI_FILE_MODEL', '');
        const { AI_CONFIG } = await import('./ai.config');
        expect(AI_CONFIG.defaultModel).toBe('gpt-text-only');
        expect(AI_CONFIG.fileModel).toBe('');
    });

    it('does not require a dedicated file model for locally extracted text', async () => {
        const { resolveAlphaAiFileModel } = await import('./ai.config');
        const status = resolveAlphaAiFileModel({
            config: {
                enabled: true,
                devAi: false,
                defaultModel: 'gpt-text-only',
                fileModel: '',
            },
            capabilityKind: 'local-text',
        });

        expect(status).toMatchObject({
            canAnalyze: true,
            path: 'local-text-extraction',
            modelSource: 'default-model',
            resolvedModel: 'gpt-text-only',
        });
    });

    it('uses the DEV gateway configured model for extracted text', async () => {
        const { resolveAlphaAiFileModel } = await import('./ai.config');
        const status = resolveAlphaAiFileModel({
            config: {
                enabled: true,
                devAi: true,
                defaultModel: '',
                fileModel: '',
            },
            capabilityKind: 'local-text',
        });

        expect(status).toMatchObject({
            canAnalyze: true,
            modelSource: 'dev-transport-default',
            resolvedModel: '',
            displayModel: 'DEV AI · מודל ברירת המחדל של השרת',
            reasonCode: null,
        });
    });

    it('still blocks visual files when the visual transport is unavailable', async () => {
        const { resolveAlphaAiFileModel } = await import('./ai.config');
        const status = resolveAlphaAiFileModel({
            config: {
                enabled: true,
                devAi: true,
                defaultModel: '',
                fileModel: '',
            },
            capabilityKind: 'visual-unverified',
        });

        expect(status).toMatchObject({
            canAnalyze: false,
            path: 'visual-file-analysis',
            reasonCode: 'VISUAL_TRANSPORT_UNAVAILABLE',
        });
        expect(status.reason).toContain('ניתוח חזותי');
    });

    it('does not require any AI model for native imports', async () => {
        const { resolveAlphaAiFileModel } = await import('./ai.config');
        expect(resolveAlphaAiFileModel({
            config: { enabled: false, defaultModel: '', fileModel: '' },
            capabilityKind: 'native-import',
        })).toMatchObject({
            canAnalyze: true,
            path: 'native-import',
            displayModel: 'לא נדרש',
        });
    });
});
