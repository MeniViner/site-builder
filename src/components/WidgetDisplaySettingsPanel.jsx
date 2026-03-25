// src/components/WidgetDisplaySettingsPanel.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Settings2 } from 'lucide-react';
import { useConfig } from '../context/ConfigProvider';
import { DEFAULT_WIDGET_SETTINGS } from '../utils/widgetDisplay';
import { HelpLabel, HelpTooltipButton } from './AdminHelp';

const inputCls = 'mt-1.5 w-full rounded-lg border border-theme-subtle bg-theme-elevated px-3 py-1.5 text-sm text-theme outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/20';

function normalizeSettings(value, defaults) {
    return {
        itemsPerView: Math.max(1, Number(value?.itemsPerView ?? defaults.itemsPerView) || defaults.itemsPerView),
        autoScroll: value?.autoScroll ?? defaults.autoScroll,
        intervalMs: Math.max(2000, Number(value?.intervalMs ?? defaults.intervalMs) || defaults.intervalMs),
    };
}

export default function WidgetDisplaySettingsPanel({ widgetId, widgetKey }) {
    const resolvedWidgetId = widgetId || widgetKey;
    const defaults = DEFAULT_WIDGET_SETTINGS[resolvedWidgetId];
    const supportsSettings = Boolean(defaults);
    const supportsItemsPerView = resolvedWidgetId !== 'polls';

    const { config, updateConfig, saveNow, error } = useConfig();
    const [settingsDraft, setSettingsDraft] = useState(
        supportsSettings ? normalizeSettings({}, defaults) : { itemsPerView: 1, autoScroll: true, intervalMs: 5000 }
    );
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef(null);

    const currentSettings = useMemo(() => {
        if (!supportsSettings) return null;
        return normalizeSettings(config?.widgets?.display?.[resolvedWidgetId], defaults);
    }, [config?.widgets?.display, defaults, resolvedWidgetId, supportsSettings]);

    const maxItemsPerView = useMemo(() => {
        if (!supportsItemsPerView) return 1;
        const branch = config?.widgets?.data?.[resolvedWidgetId];
        const itemsCount = Array.isArray(branch?.items)
            ? branch.items.length
            : (Array.isArray(branch) ? branch.length : 0);
        return Math.max(1, itemsCount || 1);
    }, [config?.widgets?.data, resolvedWidgetId, supportsItemsPerView]);

    useEffect(() => {
        if (!supportsSettings || !currentSettings) return;
        setSettingsDraft(currentSettings);
    }, [currentSettings, supportsSettings]);

    useEffect(() => {
        if (!supportsItemsPerView) return;
        setSettingsDraft((prev) => ({
            ...prev,
            itemsPerView: Math.min(maxItemsPerView, Math.max(1, Number(prev.itemsPerView) || 1)),
        }));
    }, [maxItemsPerView, supportsItemsPerView]);

    const hasChanges = useMemo(() => {
        if (!supportsSettings || !currentSettings) return false;
        return JSON.stringify(settingsDraft) !== JSON.stringify(currentSettings);
    }, [currentSettings, settingsDraft, supportsSettings]);

    useEffect(() => {
        if (!supportsSettings || !hasChanges) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            setIsSaving(true);
            try {
                const nextSettings = {
                    ...normalizeSettings(settingsDraft, defaults),
                    itemsPerView: supportsItemsPerView
                        ? Math.min(maxItemsPerView, Math.max(1, Number(settingsDraft.itemsPerView) || 1))
                        : Math.max(1, Number(settingsDraft.itemsPerView) || defaults.itemsPerView),
                };
                updateConfig((prev) => ({
                    ...prev,
                    widgets: {
                        ...(prev?.widgets || {}),
                        display: {
                            ...(prev?.widgets?.display || {}),
                            [resolvedWidgetId]: nextSettings,
                        },
                    },
                }));
                await saveNow();
            } catch (saveError) {
                console.error('Failed to save widget display settings:', saveError);
            } finally {
                setIsSaving(false);
                saveTimeoutRef.current = null;
            }
        }, 700);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [defaults, hasChanges, maxItemsPerView, resolvedWidgetId, saveNow, settingsDraft, supportsItemsPerView, supportsSettings, updateConfig]);

    if (!supportsSettings) return null;

    return (
        <div className="bg-theme-card border border-theme-subtle rounded-xl p-4 mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-theme flex items-center gap-2">
                        <Settings2 size={18} className="text-primary" />
                        הגדרות תצוגה לווידגט
                    </h3>
                    <HelpTooltipButton
                        title="הגדרות תצוגה"
                        description="החלק הזה שולט רק בדרך שבה הווידג׳ט מוצג למשתמשים, ולא בתוכן עצמו."
                        items={[
                            'כאן קובעים אם התוכן יתחלף לבד, כמה זמן הוא יוצג, וכמה פריטים יופיעו יחד.',
                            'אם יש מעט פריטים, כדאי לשמור על כמות קטנה כדי שהתצוגה תישאר נקייה.',
                        ]}
                    />
                </div>
                {isSaving && <span className="text-xs font-semibold text-theme-muted">שומר...</span>}
            </div>

            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className={`grid grid-cols-1 ${supportsItemsPerView ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-4`}>
                <label className="block">
                    <HelpLabel
                        as="span"
                        className="text-sm font-semibold text-theme"
                        wrapperClassName="flex items-center gap-2"
                        helpTitle="החלפה אוטומטית"
                        helpDescription="כאשר האפשרות פעילה, הווידג׳ט יעבור לבד בין פריטים בלי שהמשתמש יצטרך ללחוץ."
                        helpItems={[
                            'כדאי להפעיל כשיש כמה פריטים ורוצים שכולם יקבלו חשיפה.',
                            'אם יש רק פריט אחד, ההשפעה כמעט לא תורגש.',
                        ]}
                    >
                        הפעל גלילה/החלפה אוטומטית
                    </HelpLabel>
                    <button
                        dir="ltr"
                        type="button"
                        onClick={() => setSettingsDraft((prev) => ({ ...prev, autoScroll: !prev.autoScroll }))}
                        className={`mt-1.5 flex h-8 w-14 items-center rounded-full border px-1 transition ${
                            settingsDraft.autoScroll
                                ? 'border-primary bg-primary'
                                : 'border-theme-subtle bg-theme-elevated'
                        }`}
                        aria-pressed={settingsDraft.autoScroll}
                        aria-label="הפעל גלילה או החלפה אוטומטית"
                    >
                        <span
                            className={`h-6 w-6 rounded-full bg-white border border-black/10 shadow transition-transform ${
                                settingsDraft.autoScroll ? 'translate-x-6' : 'translate-x-0'
                            }`}
                        />
                    </button>
                </label>

                <label className="block">
                    <HelpLabel
                        as="span"
                        className="text-sm font-semibold text-theme"
                        wrapperClassName="flex items-center gap-2"
                        helpTitle="משך זמן לתצוגת עמוד"
                        helpDescription="כאן קובעים כמה שניות כל מסך או קבוצה של פריטים תישאר על המסך לפני המעבר הבא."
                        helpItems={[
                            'זמן קצר מתאים לעדכונים קצרים.',
                            'זמן ארוך מתאים כשיש טקסט שצריך זמן לקרוא.',
                        ]}
                    >
                        משך זמן לתצוגת עמוד (שניות)
                    </HelpLabel>
                    <input
                        type="number"
                        min="2"
                        step="1"
                        value={Math.round(settingsDraft.intervalMs / 1000)}
                        onChange={(event) =>
                            setSettingsDraft((prev) => ({
                                ...prev,
                                intervalMs: Math.max(2000, (Number(event.target.value) || 2) * 1000),
                            }))
                        }
                        className={inputCls}
                    />
                </label>

                {supportsItemsPerView && (
                    <label className="block">
                        <HelpLabel
                            as="span"
                            className="text-sm font-semibold text-theme"
                            wrapperClassName="flex items-center gap-2"
                            helpTitle="כמות פריטים להצגה יחד"
                            helpDescription="המספר הזה קובע כמה פריטים יוצגו באותו זמן בתוך הווידג׳ט."
                            helpItems={[
                                'כמות קטנה נותנת יותר מקום לכל פריט.',
                                'כמות גדולה מתאימה רק אם כל פריט קצר ופשוט.',
                            ]}
                        >
                            כמות פריטים להצגה יחד
                        </HelpLabel>
                        <input
                            type="number"
                            min="1"
                            max={maxItemsPerView}
                            value={settingsDraft.itemsPerView}
                            onChange={(event) =>
                                setSettingsDraft((prev) => ({
                                    ...prev,
                                    itemsPerView: Math.min(maxItemsPerView, Math.max(1, Number(event.target.value) || 1)),
                                }))
                            }
                            className={inputCls}
                        />
                        <span className="mt-1 block text-xs text-theme-muted">מקסימום לפי נתונים קיימים: {maxItemsPerView}</span>
                    </label>
                )}
            </div>
        </div>
    );
}
