import { afterEach, describe, expect, it, vi } from 'vitest';

const WIDGET_FLAGS = {
    events: 'VITE_UI_SHOW_AI_EVENTS',
    alerts: 'VITE_UI_SHOW_AI_ALERTS',
    outstanding: 'VITE_UI_SHOW_AI_OUTSTANDING',
    countdown: 'VITE_UI_SHOW_AI_COUNTDOWN',
    news: 'VITE_UI_SHOW_AI_NEWS',
    phonebook: 'VITE_UI_SHOW_AI_PHONEBOOK',
    shuttles: 'VITE_UI_SHOW_AI_SHUTTLES',
    polls: 'VITE_UI_SHOW_AI_POLLS',
    celebrations: 'VITE_UI_SHOW_AI_CELEBRATIONS',
    heritage: 'VITE_UI_SHOW_AI_HERITAGE',
    tips: 'VITE_UI_SHOW_AI_TIPS',
};

describe('per-widget AI button configuration', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.resetModules();
    });

    it('defaults every widget-specific flag to false when missing', async () => {
        Object.values(WIDGET_FLAGS).forEach((flag) => vi.stubEnv(flag, ''));
        const { UI_FEATURES } = await import('./uiFeatures.config');
        expect(UI_FEATURES.widgetAiButtons).toEqual({
            events: false,
            alerts: false,
            outstanding: false,
            countdown: false,
            news: false,
            phonebook: false,
            shuttles: false,
            polls: false,
            celebrations: false,
            heritage: false,
            tips: false,
        });
    });

    it('enables only the explicitly selected widget flag', async () => {
        Object.values(WIDGET_FLAGS).forEach((flag) => vi.stubEnv(flag, 'false'));
        vi.stubEnv('VITE_UI_SHOW_AI_NEWS', 'true');
        const { UI_FEATURES } = await import('./uiFeatures.config');
        expect(UI_FEATURES.widgetAiButtons.news).toBe(true);
        expect(UI_FEATURES.widgetAiButtons.alerts).toBe(false);
        expect(UI_FEATURES.widgetAiButtons.events).toBe(false);
    });

    it('requires both master flags in addition to the widget-specific flag', async () => {
        vi.stubEnv('VITE_UI_SHOW_AI_NEWS', 'true');
        vi.stubEnv('VITE_UI_SHOW_AI_UI', 'false');
        vi.stubEnv('VITE_UI_SHOW_WIDGET_AI_BUTTONS', 'true');
        let config = await import('./uiFeatures.config');
        expect(config.isWidgetAiButtonEnabled('news')).toBe(false);

        vi.resetModules();
        vi.stubEnv('VITE_UI_SHOW_AI_UI', 'true');
        vi.stubEnv('VITE_UI_SHOW_WIDGET_AI_BUTTONS', 'false');
        config = await import('./uiFeatures.config');
        expect(config.isWidgetAiButtonEnabled('news')).toBe(false);

        vi.resetModules();
        vi.stubEnv('VITE_UI_SHOW_WIDGET_AI_BUTTONS', 'true');
        config = await import('./uiFeatures.config');
        expect(config.isWidgetAiButtonEnabled('news')).toBe(true);
        expect(config.isWidgetAiButtonEnabled('alerts')).toBe(false);
        expect(config.isWidgetAiButtonEnabled('gantt')).toBe(true);
    });
});
