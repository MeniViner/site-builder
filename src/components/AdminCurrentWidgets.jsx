import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Calendar, Bell, Award, Timer, Rss, BookUser, BusFront, Vote, PartyPopper, ScrollText, Lightbulb } from 'lucide-react';
import { useWidget } from '../context/WidgetContext';
import WidgetLivePreview from './WidgetLivePreview';
import AdminEvents from './AdminEvents';
import AdminAlerts from './AdminAlerts';
import AdminOutstanding from './AdminOutstanding';
import AdminCountdown from './AdminCountdown';
import AdminNews from './AdminNews';
import AdminPhonebook from './AdminPhonebook';
import AdminShuttles from './AdminShuttles';
import AdminPolls from './AdminPolls';
import AdminCelebrations from './AdminCelebrations';
import AdminHeritage from './AdminHeritage';
import AdminTips from './AdminTips';
import { AdminPageHelpButton, HelpTooltipButton } from './AdminHelp';
import { DEFAULT_ACTIVE_WIDGETS } from '../utils/widgetDisplay';

const AVAILABLE_WIDGETS = [
  { id: 'events', label: 'לוח אירועים', icon: Calendar },
  { id: 'alerts', label: 'לוח הודעות', icon: Bell },
  { id: 'outstanding', label: 'מצטייני היחידה', icon: Award },
  { id: 'countdown', label: 'ספירה לאחור / שעון עצר', icon: Timer },
  { id: 'news', label: 'מבזקים ועדכונים', icon: Rss },
  { id: 'phonebook', label: 'ספר טלפונים', icon: BookUser },
  { id: 'shuttles', label: 'זמני היסעים', icon: BusFront },
  { id: 'polls', label: 'סקרים ודעת קהל', icon: Vote },
  { id: 'celebrations', label: 'חוגגים השבוע', icon: PartyPopper },
  { id: 'heritage', label: 'מורשת קרב וציטוטים', icon: ScrollText },
  { id: 'tips', label: 'טיפ השבוע', icon: Lightbulb },
];

export default function AdminCurrentWidgets() {
  const { widgetConfig, loading, error, updateField } = useWidget();
  const activeWidgets = Array.isArray(widgetConfig?.activeWidgets) && widgetConfig.activeWidgets.length > 0
    ? widgetConfig.activeWidgets
    : [...DEFAULT_ACTIVE_WIDGETS];
  const [selectedWidgetId, setSelectedWidgetId] = useState(activeWidgets[0]);
  const rotationInterval = Number.isFinite(Number(widgetConfig?.rotationInterval))
    ? Number(widgetConfig.rotationInterval)
    : 8;
  const [rotationDraft, setRotationDraft] = useState(rotationInterval);
  const [rotationSaveError, setRotationSaveError] = useState('');
  const lastSavedRotationRef = useRef(rotationInterval);

  useEffect(() => {
    if (!activeWidgets.includes(selectedWidgetId)) {
      setSelectedWidgetId(activeWidgets[0]);
    }
  }, [activeWidgets, selectedWidgetId]);

  useEffect(() => {
    setRotationDraft(rotationInterval);
    lastSavedRotationRef.current = rotationInterval;
  }, [rotationInterval]);

  useEffect(() => {
    const nextValue = Math.max(3, Math.min(30, Number(rotationDraft) || 8));
    if (nextValue === lastSavedRotationRef.current) return undefined;

    const timeoutId = window.setTimeout(async () => {
      const success = await updateField('rotationInterval', nextValue);
      if (success) {
        lastSavedRotationRef.current = nextValue;
        setRotationSaveError('');
        return;
      }
      setRotationSaveError('שמירת זמן ההחלפה נכשלה. אפשר להמשיך לעבוד ולנסות שוב.');
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [rotationDraft, updateField]);

  const handleRotationChange = (nextValue) => {
    setRotationSaveError('');
    setRotationDraft(Number(nextValue));
  };

  const renderSelectedWidgetManager = () => {
    if (selectedWidgetId === 'events') return <AdminEvents inHub />;
    if (selectedWidgetId === 'alerts') return <AdminAlerts />;
    if (selectedWidgetId === 'outstanding') return <AdminOutstanding />;
    if (selectedWidgetId === 'countdown') return <AdminCountdown />;
    if (selectedWidgetId === 'news') return <AdminNews />;
    if (selectedWidgetId === 'phonebook') return <AdminPhonebook />;
    if (selectedWidgetId === 'shuttles') return <AdminShuttles />;
    if (selectedWidgetId === 'polls') return <AdminPolls />;
    if (selectedWidgetId === 'celebrations') return <AdminCelebrations />;
    if (selectedWidgetId === 'heritage') return <AdminHeritage />;
    if (selectedWidgetId === 'tips') return <AdminTips />;
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/10 p-4 text-sm text-gray-600 dark:text-gray-300">
        לווידג׳ט הנבחר אין כרגע מסך ניהול ייעודי.
      </div>
    );
  };

  if (loading && !widgetConfig) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען הגדרות ווידגטים...</div>;
  }

  return (
    <div dir="rtl" className="h-full min-h-0 bg-gray-50 dark:bg-[#12141a] text-gray-900 dark:text-white font-heebo flex flex-col">
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-[#12141a]/95 backdrop-blur border-b border-gray-200 dark:border-white/10 px-8 pt-6 pb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">ניהול הווידגטים העכשוויים</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">מעבר בין 3 הווידג׳טים שנבחרו וניהול כל אחד מהם מתוך אותו עמוד.</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminPageHelpButton pageId="current-widgets" />
          <span className="rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-3 py-1 text-xs font-bold text-gray-600 dark:text-gray-300">
            פעילים עכשיו: {activeWidgets.length}/3
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
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#232733] px-4 py-3">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-gray-900 dark:text-white">בחירת דף ניהול פעיל</h2>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">בחר איזה מהווידג׳טים הפעילים תרצה לנהל עכשיו.</p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeWidgets.map((widgetId, index) => {
                      const widgetMeta = AVAILABLE_WIDGETS.find((item) => item.id === widgetId);
                      const isActiveManager = selectedWidgetId === widgetId;
                      return (
                        <button
                          key={widgetId}
                          type="button"
                          onClick={() => setSelectedWidgetId(widgetId)}
                          className={`rounded-lg border px-3.5 py-1.5 text-xs font-bold transition ${
                            isActiveManager
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

                <div className="w-full xl:w-[300px] xl:shrink-0 rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1b1f2a] px-3 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white">זמן החלפה אוטומטית בין ווידגטים</span>
                      <HelpTooltipButton
                        title="זמן החלפה אוטומטית"
                        description="המספר הזה קובע כל כמה שניות המערכת תעבור לווידג׳ט הפעיל הבא."
                      />
                    </div>
                    <span className="text-base font-black text-primary">{rotationDraft}s</span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={30}
                    step={1}
                    value={rotationDraft}
                    onChange={(e) => handleRotationChange(e.target.value)}
                    className="w-full cursor-pointer accent-primary"
                  />
                  <div className="mt-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                    <span>3 שנ׳</span>
                    <span>30 שנ׳</span>
                  </div>
                  {rotationSaveError && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/30 dark:bg-red-950/30 dark:text-red-100">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>{rotationSaveError}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4">
              {renderSelectedWidgetManager()}
            </div>
            
          </div>

          

          <div className="hidden 2xl:block w-px self-stretch bg-gradient-to-b from-primary/0 via-primary/60 to-primary/0" />

          <div className="min-w-0 2xl:w-[560px] 2xl:max-w-[44vw] 2xl:shrink-0">
            <div className="sticky top-24 h-[calc(100vh-8rem)]">
              <WidgetLivePreview activeWidget={selectedWidgetId || activeWidgets[0]} showStand={false} fillHeight desktopOffsetX={-56} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
