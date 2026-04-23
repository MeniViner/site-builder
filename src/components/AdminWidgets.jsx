import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Calendar, Bell, Award, Timer, Rss, BookUser,
  BusFront, Vote, PartyPopper, ScrollText, Lightbulb, Check,
  Monitor
} from 'lucide-react';
import { useWidget } from '../context/WidgetContext';
import WidgetLivePreview from './WidgetLivePreview';
import { AdminPageHelpButton, HelpTooltipButton } from './AdminHelp';
import { DEFAULT_ACTIVE_WIDGETS } from '../utils/widgetDisplay';

const AVAILABLE_WIDGETS = [
  { id: 'events', label: 'לוח אירועים', description: 'הצגת אירועים קרובים עם ניהול מלא דרך ממשק האירועים.', icon: Calendar },
  { id: 'alerts', label: 'לוח הודעות', description: 'אזור שמור לעדכונים מערכתיים והודעות שוטפות.', icon: Bell },
  { id: 'outstanding', label: 'מצטייני היחידה', description: 'כרטיסי מצטיינים עם תמונה, תפקיד ותיאור קצר.', icon: Award },
  { id: 'countdown', label: 'ספירה לאחור / שעון עצר', description: 'טיימר ספירה לאחור לעבר תאריך יעד מוגדר.', icon: Timer },
  { id: 'news', label: 'מבזקים ועדכונים', description: 'רשימת מבזקים עם סימון דחיפות ותצוגה מתחלפת.', icon: Rss },
  { id: 'phonebook', label: 'ספר טלפונים', description: 'אנשי קשר עם מחלקה ומספר לחיוג מהיר.', icon: BookUser },
  { id: 'shuttles', label: 'זמני היסעים', description: 'יעדים, שעת יציאה וסוג היסע.', icon: BusFront },
  { id: 'polls', label: 'סקרים ודעת קהל', description: 'שאלות והצבעות עם תצוגת תוצאות.', icon: Vote },
  { id: 'celebrations', label: 'חוגגים השבוע', description: 'שחרורים, דרגות ואירועים משמחים.', icon: PartyPopper },
  { id: 'heritage', label: 'מורשת קרב וציטוטים', description: 'מסרי מורשת, השראה וציטוטים.', icon: ScrollText },
  { id: 'tips', label: 'טיפ השבוע', description: 'טיפים קצרים, נהלים ותזכורות מתחלפות.', icon: Lightbulb },
];

export default function AdminWidgets() {
  const { widgetConfig, loading, error, updateField } = useWidget();
  const activeWidgets = Array.isArray(widgetConfig?.activeWidgets) && widgetConfig.activeWidgets.length > 0
    ? widgetConfig.activeWidgets
    : [...DEFAULT_ACTIVE_WIDGETS];
  const [previewWidgetId, setPreviewWidgetId] = useState(activeWidgets[0]);

  useEffect(() => {
    if (!activeWidgets.includes(previewWidgetId)) {
      setPreviewWidgetId(activeWidgets[0]);
    }
  }, [activeWidgets, previewWidgetId]);

  const handleWidgetToggle = async (widgetId) => {
    const isSelected = activeWidgets.includes(widgetId);

    if (isSelected) {
      if (activeWidgets.length <= 1) return;
      const nextActive = activeWidgets.filter((id) => id !== widgetId);
      await updateField('activeWidgets', nextActive);
      return;
    }

    if (activeWidgets.length >= 3) return;
    await updateField('activeWidgets', [...activeWidgets, widgetId]);
  };

  if (loading && !widgetConfig) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען הגדרות ווידגטים...</div>;
  }

  return (
    <div dir="rtl" className="h-full min-h-0 bg-gray-50 dark:bg-[#12141a] text-gray-900 dark:text-white font-heebo flex flex-col">
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-[#12141a]/95 backdrop-blur border-b border-gray-200 dark:border-white/10 px-8 pt-6 pb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">בחירת ווידג׳טים פעילים</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            בחר עד 3 ווידג׳טים שיוצגו בקרוסלה בעמוד הבית.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AdminPageHelpButton pageId="widgets" />
          <span className="rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 text-xs font-bold text-gray-600 dark:text-gray-300">
            נבחרו {activeWidgets.length}/3
          </span>
        </div>
      </div>

      {error && (
        <div className="px-8 pt-4">
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4">
            <AlertTriangle className="shrink-0 text-primary" />
            <span className="text-gray-800 dark:text-gray-100">{error}</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 px-8 pb-8 pt-4 overflow-y-auto 2xl:overflow-hidden">
        <div className="h-full flex flex-col gap-6 2xl:flex-row 2xl:items-stretch">
          <div className="flex-1 min-h-0 space-y-6 2xl:overflow-y-auto 2xl:pr-2 custom-scrollbar">
            <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#232733] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">רשימת הווידג׳טים</h2>
                  <HelpTooltipButton
                    title="רשימת הווידג׳טים"
                    description="לחיצה על כרטיס מוסיפה או מסירה את הווידג׳ט מהרשימה הפעילה."
                    items={[
                      'אפשר לבחור עד שלושה ווידג׳טים.',
                      'סדר הבחירה קובע גם את סדר ההופעה באתר.',
                    ]}
                  />
                </div>
                <span className="text-xs text-gray-500 dark:text-gray-400">מינימום 1, מקסימום 3</span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {AVAILABLE_WIDGETS.map((widget) => {
                  const Icon = widget.icon;
                  const order = activeWidgets.indexOf(widget.id);
                  const isSelected = order !== -1;

                  return (
                    <button
                      key={widget.id}
                      onClick={() => handleWidgetToggle(widget.id)}
                      className={`relative rounded-2xl border p-5 text-right transition-all duration-200 group ${
                        isSelected
                          ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_var(--color-primary-hex)]'
                          : 'border-gray-200 dark:border-[#2f3442] bg-white dark:bg-[#1b1f2a] hover:border-primary/40 dark:hover:border-primary/35 hover:bg-gray-50 dark:hover:bg-[#242938]'
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute left-3 top-3 rounded-full bg-primary px-2.5 py-1 text-[10px] font-black tracking-wide text-white">
                          נבחר {order + 1}/3
                        </div>
                      )}
                      <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl border ${isSelected ? 'border-primary/30 bg-primary/15 text-primary' : 'border-gray-200 dark:border-[#31384a] bg-gray-50 dark:bg-[#202536] text-gray-500 dark:text-gray-300'} transition-colors`}>
                        <Icon size={22} />
                      </div>
                      <h3 className={`mb-2 text-lg font-bold ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white'}`}>
                        {widget.label}
                      </h3>
                      <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{widget.description}</p>
                      <div className={`mt-4 flex items-center gap-2 text-sm font-bold ${isSelected ? 'text-primary' : 'text-gray-500 dark:text-gray-300'}`}>
                        {isSelected ? <><Check size={16} /><span>נבחר כווידגט פעיל</span></> : <span>לחץ להוספה</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="hidden 2xl:block w-px self-stretch bg-gradient-to-b from-primary/0 via-primary/60 to-primary/0" />

          <div className="min-w-0 2xl:w-[560px] 2xl:max-w-[44vw] 2xl:shrink-0 ">
            <div className="sticky top-24 h-[calc(100vh-8rem)]">
              <div className="mb-2 -mt-2 ">
                {/* <div className="text-xs font-bold text-grey-muted">תצוגת ווידג׳ט לבדיקה</div> */}
                <div className=" flex flex-wrap gap-2 items-center">
                      <Monitor size={20} className="text-primary dark:text-primary-600 " />
                                      {/* <div className="text-xs font-bold text-primary-600">תצוגה לבדיקה</div> */}

                  {activeWidgets.map((widgetId, index) => {
                    const widgetMeta = AVAILABLE_WIDGETS.find((item) => item.id === widgetId);
                    const isPreviewActive = previewWidgetId === widgetId;
                    return (
                      <button
                        key={widgetId}
                        type="button"
                        onClick={() => setPreviewWidgetId(widgetId)}
                        className={`rounded-lg border px-3 py-0.5 text-xs font-bold transition ${
                          isPreviewActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1b1f2a] text-gray-500 dark:text-gray-300 hover:border-primary/40 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {`#${index + 1} ${widgetMeta?.label || widgetId}`}
                      </button>
                    );
                  })}
                </div>
              </div>
              <WidgetLivePreview activeWidget={previewWidgetId || activeWidgets[0]} showStand={false} fillHeight desktopOffsetX={-56} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
