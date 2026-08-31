function parseBoolean(rawValue, defaultValue = false) {
    if (rawValue === undefined) {
        return defaultValue;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(rawValue).trim().toLowerCase());
}

const widgetAiButtons = Object.freeze({
    events: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_EVENTS, false),
    alerts: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_ALERTS, false),
    outstanding: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_OUTSTANDING, false),
    countdown: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_COUNTDOWN, false),
    news: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_NEWS, false),
    phonebook: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_PHONEBOOK, false),
    shuttles: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_SHUTTLES, false),
    polls: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_POLLS, false),
    celebrations: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_CELEBRATIONS, false),
    heritage: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_HERITAGE, false),
    tips: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_TIPS, false),
});

export const UI_FEATURES = Object.freeze({
    showAiUi: parseBoolean(import.meta.env.VITE_UI_SHOW_AI_UI, true),
    showWidgetAiButtons: parseBoolean(import.meta.env.VITE_UI_SHOW_WIDGET_AI_BUTTONS, false),
    widgetAiButtons,
    showOrgChartAiImport: parseBoolean(import.meta.env.VITE_UI_SHOW_ORG_CHART_AI_IMPORT, false),
    showQuickDesignComposer: parseBoolean(import.meta.env.VITE_UI_SHOW_QUICK_DESIGN_COMPOSER, true),
});

export function isWidgetAiButtonEnabled(widgetKey) {
    return UI_FEATURES.showAiUi
        && UI_FEATURES.showWidgetAiButtons
        && (
            !Object.prototype.hasOwnProperty.call(UI_FEATURES.widgetAiButtons, widgetKey)
            || UI_FEATURES.widgetAiButtons[widgetKey] === true
        );
}
