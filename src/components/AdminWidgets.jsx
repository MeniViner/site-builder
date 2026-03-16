import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  AlertTriangle, Bell, BookUser, BusFront, Calendar, Check,
  Award, Timer, Rss, Vote, PartyPopper, ScrollText, Lightbulb
} from 'lucide-react';
import { useWidget } from '../context/WidgetContext';
import WidgetLivePreview from './WidgetLivePreview';
import { DEFAULT_WIDGET_SETTINGS, getWidgetSetting } from '../utils/widgetDisplay';

const AVAILABLE_WIDGETS = [
  { id: 'events', label: 'לוח אירועים', description: 'הצגת אירועים קרובים עם ניהול מלא דרך ממשק האירועים.', icon: Calendar, color: 'red' },
  { id: 'alerts', label: 'לוח הודעות', description: 'אזור שמור לעדכונים מערכתיים והודעות שוטפות.', icon: Bell, color: 'amber' },
  { id: 'outstanding', label: 'מצטייני היחידה', description: 'כרטיסי מצטיינים עם תמונה, תפקיד ותיאור קצר.', icon: Award, color: 'emerald' },
  { id: 'countdown', label: 'ספירה לאחור / שעון עצר', description: 'טיימר ספירה לאחור לעבר תאריך יעד מוגדר.', icon: Timer, color: 'sky' },
  { id: 'news', label: 'מבזקים ועדכונים', description: 'רשימת מבזקים עם סימון דחיפות ותצוגה מתחלפת.', icon: Rss, color: 'orange' },
  { id: 'phonebook', label: 'ספר טלפונים', description: 'אנשי קשר עם מחלקה ומספר לחיוג מהיר.', icon: BookUser, color: 'violet' },
  { id: 'shuttles', label: 'זמני היסעים', description: 'יעדים, שעת יציאה וסוג היסע.', icon: BusFront, color: 'blue' },
  { id: 'polls', label: 'סקרים ודעת קהל', description: 'שאלות והצבעות עם תצוגת תוצאות.', icon: Vote, color: 'pink' },
  { id: 'celebrations', label: 'חוגגים השבוע', description: 'שחרורים, דרגות ואירועים משמחים.', icon: PartyPopper, color: 'teal' },
  { id: 'heritage', label: 'מורשת קרב וציטוטים', description: 'מסרי מורשת, השראה וציטוטים.', icon: ScrollText, color: 'indigo' },
  { id: 'tips', label: 'טיפ השבוע', description: 'טיפים קצרים, נהלים ותזכורות מתחלפות.', icon: Lightbulb, color: 'yellow' },
];

const COLOR_MAP = {
  red: { activeBg: 'bg-red-500/10', activeBorder: 'border-red-500/40', activeRing: 'ring-red-500/30', iconBg: 'bg-red-500/15', iconText: 'text-red-400', badgeBg: 'bg-red-600' },
  amber: { activeBg: 'bg-amber-500/10', activeBorder: 'border-amber-500/40', activeRing: 'ring-amber-500/30', iconBg: 'bg-amber-500/15', iconText: 'text-amber-400', badgeBg: 'bg-amber-600' },
  emerald: { activeBg: 'bg-emerald-500/10', activeBorder: 'border-emerald-500/40', activeRing: 'ring-emerald-500/30', iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400', badgeBg: 'bg-emerald-600' },
  sky: { activeBg: 'bg-sky-500/10', activeBorder: 'border-sky-500/40', activeRing: 'ring-sky-500/30', iconBg: 'bg-sky-500/15', iconText: 'text-sky-400', badgeBg: 'bg-sky-600' },
  orange: { activeBg: 'bg-orange-500/10', activeBorder: 'border-orange-500/40', activeRing: 'ring-orange-500/30', iconBg: 'bg-orange-500/15', iconText: 'text-orange-400', badgeBg: 'bg-orange-600' },
  violet: { activeBg: 'bg-violet-500/10', activeBorder: 'border-violet-500/40', activeRing: 'ring-violet-500/30', iconBg: 'bg-violet-500/15', iconText: 'text-violet-400', badgeBg: 'bg-violet-600' },
  blue: { activeBg: 'bg-blue-500/10', activeBorder: 'border-blue-500/40', activeRing: 'ring-blue-500/30', iconBg: 'bg-blue-500/15', iconText: 'text-blue-400', badgeBg: 'bg-blue-600' },
  pink: { activeBg: 'bg-pink-500/10', activeBorder: 'border-pink-500/40', activeRing: 'ring-pink-500/30', iconBg: 'bg-pink-500/15', iconText: 'text-pink-400', badgeBg: 'bg-pink-600' },
  teal: { activeBg: 'bg-teal-500/10', activeBorder: 'border-teal-500/40', activeRing: 'ring-teal-500/30', iconBg: 'bg-teal-500/15', iconText: 'text-teal-400', badgeBg: 'bg-teal-600' },
  indigo: { activeBg: 'bg-indigo-500/10', activeBorder: 'border-indigo-500/40', activeRing: 'ring-indigo-500/30', iconBg: 'bg-indigo-500/15', iconText: 'text-indigo-400', badgeBg: 'bg-indigo-600' },
  yellow: { activeBg: 'bg-yellow-500/10', activeBorder: 'border-yellow-500/40', activeRing: 'ring-yellow-500/30', iconBg: 'bg-yellow-500/15', iconText: 'text-yellow-500', badgeBg: 'bg-yellow-600' },
};

const SETTINGS_SUPPORTED = Object.keys(DEFAULT_WIDGET_SETTINGS);
const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 outline-none transition focus:border-primary/30 focus:ring-2 focus:ring-primary/10 dark:border-white/10 dark:bg-[#171a22] dark:text-white';

export default function AdminWidgets() {
  const { widgetConfig, loading, error, saveWidgetConfig } = useWidget();
  const [selected, setSelected] = useState('events');
  const [settingsDraft, setSettingsDraft] = useState({ itemsPerView: 1, autoScroll: true, intervalMs: 5000 });
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    if (widgetConfig?.activeWidget) setSelected(widgetConfig.activeWidget);
  }, [widgetConfig]);

  useEffect(() => {
    if (!widgetConfig) return;
    setSettingsDraft(getWidgetSetting(widgetConfig.widgetSettings, selected));
  }, [widgetConfig, selected]);

  const supportsSettings = SETTINGS_SUPPORTED.includes(selected);

  const previewConfig = useMemo(() => {
    if (!widgetConfig) return null;
    return {
      ...widgetConfig,
      activeWidget: selected,
      widgetSettings: supportsSettings
        ? { ...(widgetConfig.widgetSettings || {}), [selected]: settingsDraft }
        : widgetConfig.widgetSettings,
    };
  }, [widgetConfig, selected, settingsDraft, supportsSettings]);

  const hasChanges = useMemo(() => {
    if (!widgetConfig) return false;
    const activeChanged = selected !== widgetConfig.activeWidget;
    const settingsChanged = supportsSettings
      ? JSON.stringify(settingsDraft) !== JSON.stringify(getWidgetSetting(widgetConfig.widgetSettings, selected))
      : false;
    return activeChanged || settingsChanged;
  }, [widgetConfig, selected, settingsDraft, supportsSettings]);

  // Auto-save (debounced) whenever הווידג׳ט הפעיל או ההגדרות הדינמיות שלו משתנים
  useEffect(() => {
    if (!widgetConfig || !hasChanges) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);

      const nextConfig = {
        ...widgetConfig,
        activeWidget: selected,
        widgetSettings: supportsSettings
          ? { ...(widgetConfig.widgetSettings || {}), [selected]: settingsDraft }
          : widgetConfig.widgetSettings,
      };

      const success = await saveWidgetConfig(nextConfig);
      setIsSaving(false);

      if (!success) {
        // השגיאה תופיע דרך error שמגיע מהקונטקסט
        console.error('שמירת הגדרות הווידג׳ט נכשלה');
      }

      saveTimeoutRef.current = null;
    }, 800);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [widgetConfig, selected, settingsDraft, supportsSettings, hasChanges, saveWidgetConfig]);

  if (loading && !widgetConfig) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען הגדרות ווידגטים...</div>;
  }

  const selectedMeta = AVAILABLE_WIDGETS.find((widget) => widget.id === selected) || AVAILABLE_WIDGETS[0];
  const colors = COLOR_MAP[selectedMeta.color];
  const SelectedIcon = selectedMeta.icon;

  return (
    <div dir="rtl" className="min-h-screen bg-gray-100 font-heebo text-gray-900 dark:bg-[#1e212b] dark:text-white flex flex-col">
      <div className="sticky top-0 z-20 bg-gray-100/95 dark:bg-[#1e212b]/95 backdrop-blur border-b border-gray-300 dark:border-white/10 px-8 pt-6 pb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">הגדרות תצוגת ווידגט</h1>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            כאן בוחרים ווידג׳ט פעיל ורואים תצוגה אמיתית כמו באתר. הגדרות התצוגה נשמרות אוטומטית.
          </p>
        </div>
        {isSaving && (
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
            שומר...
          </span>
        )}
      </div>

      {error && (
        <div className="px-8 pt-4">
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-500 bg-red-50 p-4 dark:bg-red-900/50">
            <AlertTriangle className="shrink-0 text-red-400" />
            <span className="text-red-700 dark:text-red-200">{error}</span>
          </div>
        </div>
      )}

      <div className="flex-1 px-8 pb-8 pt-4">
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1.2fr)_430px]">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {AVAILABLE_WIDGETS.map((widget) => {
              const isSelected = selected === widget.id;
              const isLive = widgetConfig?.activeWidget === widget.id;
              const cardColors = COLOR_MAP[widget.color];
              const Icon = widget.icon;

              return (
                <button
                  key={widget.id}
                  onClick={() => setSelected(widget.id)}
                  className={`relative rounded-2xl border-2 p-6 text-right transition-all duration-200 group ${isSelected
                    ? `${cardColors.activeBg} ${cardColors.activeBorder} ring-2 ${cardColors.activeRing} shadow-lg`
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-white/5 dark:bg-[#232733] dark:hover:border-white/15 dark:hover:bg-[#272b38]'
                  }`}
                >
                  {isLive && (
                    <div className={`absolute left-3 top-3 ${cardColors.badgeBg} rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white`}>
                      פעיל כעת
                    </div>
                  )}
                  <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-xl ${isSelected ? cardColors.iconBg : 'bg-gray-100 dark:bg-white/5'} transition-colors`}>
                    <Icon size={28} className={isSelected ? cardColors.iconText : 'text-gray-500'} />
                  </div>
                  <h3 className={`mb-2 text-xl font-bold ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                    {widget.label}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isSelected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                    {widget.description}
                  </p>
                  <div className={`mt-5 flex items-center gap-2 text-sm font-bold ${isSelected ? cardColors.iconText : 'text-gray-400 dark:text-gray-600'}`}>
                    {isSelected ? <><Check size={16} /><span>נבחר</span></> : <span className="transition group-hover:text-gray-500 dark:group-hover:text-gray-400">לחץ לבחירה</span>}
                  </div>
                </button>
              );
            })}
            </div>
          </div>

          <div className="min-w-0">
            <div className="sticky top-28">
              <WidgetLivePreview widgetConfigOverride={previewConfig} title="תצוגה מקדימה מהאתר" />
            </div>
          </div>
        </div>
      </div>

      {!supportsSettings && selected !== 'events' && selected !== 'countdown' && selected !== 'alerts' && (
        <div className="mt-6 text-sm text-amber-600 dark:text-amber-300">
          שים לב: לווידג׳ט הזה עדיין אין הגדרות פריסה ייעודיות.
        </div>
      )}
    </div>
  );
}
