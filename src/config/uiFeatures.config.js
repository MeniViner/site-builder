function parseBoolean(rawValue, defaultValue = false) {
    if (rawValue === undefined) {
        return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(rawValue).trim().toLowerCase());
}

export const UI_FEATURES = Object.freeze({
    showAiUi: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_UI, true),
    showGlobalAiCopilot: parseBoolean(import.meta.env.VITE_UI_SHOW_GLOBAL_AI_COPILOT, false),
    showWidgetAiButtons: parseBoolean(import.meta.env.VITE_UI_SHOW_WIDGET_AI_BUTTONS, false),
    showQuickDesignComposer: parseBoolean(import.meta.env.VITE_UI_SHOW_QUICK_DESIGN_COMPOSER, true),
});
