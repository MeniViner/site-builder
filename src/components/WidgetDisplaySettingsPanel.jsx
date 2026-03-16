import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useWidget } from '../context/WidgetContext';
import { DEFAULT_WIDGET_SETTINGS, getWidgetSetting } from '../utils/widgetDisplay';

const inputCls =
    'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#171a22] dark:text-white';

const SETTINGS_SUPPORTED = Object.keys(DEFAULT_WIDGET_SETTINGS);

export default function WidgetDisplaySettingsPanel({ widgetKey, title }) {
    const { widgetConfig, saveWidgetConfig, error } = useWidget();
    const [settingsDraft, setSettingsDraft] = useState(DEFAULT_WIDGET_SETTINGS[widgetKey] || { itemsPerView: 1, autoScroll: true, intervalMs: 5000 });
    const [isSaving, setIsSaving] = useState(false);
    const saveTimeoutRef = useRef(null);

    const supportsSettings = SETTINGS_SUPPORTED.includes(widgetKey);

    useEffect(() => {
        if (!supportsSettings || !widgetConfig) return;
        setSettingsDraft(getWidgetSetting(widgetConfig.widgetSettings, widgetKey));
    }, [widgetConfig, widgetKey, supportsSettings]);

    const hasChanges = useMemo(() => {
        if (!supportsSettings || !widgetConfig) return false;
        const current = getWidgetSetting(widgetConfig.widgetSettings, widgetKey);
        return JSON.stringify(current) !== JSON.stringify(settingsDraft);
    }, [widgetConfig, widgetKey, supportsSettings, settingsDraft]);

    // Auto-save (debounced) להגדרות הווידג׳ט הספציפי
    useEffect(() => {
        if (!supportsSettings || !widgetConfig || !hasChanges) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        saveTimeoutRef.current = setTimeout(async () => {
            setIsSaving(true);

            const nextConfig = {
                ...widgetConfig,
                widgetSettings: {
                    ...(widgetConfig.widgetSettings || {}),
                    [widgetKey]: settingsDraft,
                },
            };

            const success = await saveWidgetConfig(nextConfig);
            setIsSaving(false);

            if (!success) {
                console.error('שמירת הגדרות התצוגה הדינמיות נכשלה');
            }

            saveTimeoutRef.current = null;
        }, 800);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [supportsSettings, widgetConfig, hasChanges, widgetKey, settingsDraft, saveWidgetConfig]);

    if (!supportsSettings) return null;

    return (
        <div className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#232733]">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-black text-gray-900 dark:text-white">
                        {title || 'הגדרות הצגה דינמיות לווידג׳ט שנבחר'}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        קבע כמה פריטים יוצגו בווידג׳ט זה, האם לעבור אוטומטית, ומה יהיה קצב ההחלפה.
                    </p>
                </div>
                {isSaving && (
                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                        שומר...
                    </span>
                )}
            </div>

            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-400 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500 dark:bg-red-900/30 dark:text-red-200">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                        כמה פריטים להציג יחד
                    </span>
                    <input
                        type="number"
                        min="1"
                        max="6"
                        value={settingsDraft.itemsPerView}
                        onChange={(event) =>
                            setSettingsDraft((prev) => ({
                                ...prev,
                                itemsPerView: Math.max(1, Number(event.target.value) || 1),
                            }))
                        }
                        className={inputCls}
                    />
                </label>

                <label className="block">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.22em] text-gray-500 dark:text-gray-400">
                        משך מעבר אוטומטי (שניות)
                    </span>
                    <input
                        type="number"
                        min="2"
                        step="0.1"
                        value={settingsDraft.intervalMs / 1000}
                        onChange={(event) =>
                            setSettingsDraft((prev) => ({
                                ...prev,
                                intervalMs: Math.max(2000, Math.round(Number(event.target.value) * 1000) || 2000),
                            }))
                        }
                        className={inputCls}
                    />
                </label>

                <label className="flex items-end">
                    <span className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700 dark:border-white/10 dark:bg-[#171a22] dark:text-gray-200">
                        <input
                            type="checkbox"
                            checked={settingsDraft.autoScroll}
                            onChange={(event) =>
                                setSettingsDraft((prev) => ({
                                    ...prev,
                                    autoScroll: event.target.checked,
                                }))
                            }
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        />
                        הפעל מעבר/סקרול אוטומטי
                    </span>
                </label>
            </div>
        </div>
    );
}

