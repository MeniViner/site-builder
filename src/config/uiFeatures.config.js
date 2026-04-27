function parseBoolean(rawValue, defaultValue = false) {
    if (rawValue === undefined) {
        return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(rawValue).trim().toLowerCase());
}

export const UI_FEATURES = Object.freeze({
    showAiUi: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_UI, true),
    showQuickDesignComposer: parseBoolean(import.meta.env.VITE_UI_SHOW_QUICK_DESIGN_COMPOSER, true),
});
