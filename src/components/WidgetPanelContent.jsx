import React from 'react';
import { Bell } from 'lucide-react';
import EventsList from './EventsList';
import WidgetOutstanding from './widgets/WidgetOutstanding';
import WidgetCountdown from './widgets/WidgetCountdown';
import WidgetNewsTicker from './widgets/WidgetNewsTicker';
import WidgetPhonebook from './widgets/WidgetPhonebook';
import WidgetShuttles from './widgets/WidgetShuttles';
import WidgetPolls from './widgets/WidgetPolls';
import WidgetCelebrations from './widgets/WidgetCelebrations';
import WidgetHeritage from './widgets/WidgetHeritage';
import WidgetTips from './widgets/WidgetTips';
import WidgetEmptyState from './widgets/WidgetEmptyState';
import WidgetAlerts from './widgets/WidgetAlerts';
import { getWidgetSetting } from '../utils/widgetDisplay';

export function getWidgetTitle(activeWidget) {
  if (activeWidget === 'events') return 'מופעי החודש';
  if (activeWidget === 'outstanding') return 'מצטייני היחידה';
  if (activeWidget === 'countdown') return 'ספירה לאחור';
  if (activeWidget === 'alerts') return 'לוח הודעות';
  if (activeWidget === 'news') return 'מבזקים ועדכונים';
  if (activeWidget === 'phonebook') return 'ספר טלפונים';
  if (activeWidget === 'shuttles') return 'זמני היסעים';
  if (activeWidget === 'polls') return 'סקרים ודעת קהל';
  if (activeWidget === 'celebrations') return 'חוגגים השבוע';
  if (activeWidget === 'heritage') return 'מורשת קרב וציטוטים';
  if (activeWidget === 'tips') return 'טיפ השבוע';
  return 'ווידגט';
}

export function WidgetContent({ activeWidget, widgetConfig }) {
  const widgetSettings = widgetConfig?.widgetSettings || {};

  if (activeWidget === 'events') return <EventsList />;
  if (activeWidget === 'outstanding') return <WidgetOutstanding data={widgetConfig?.outstanding || []} settings={getWidgetSetting(widgetSettings, 'outstanding')} />;
  if (activeWidget === 'countdown') return <WidgetCountdown data={widgetConfig?.countdown || {}} />;
  if (activeWidget === 'news') return <WidgetNewsTicker data={widgetConfig?.news || []} settings={getWidgetSetting(widgetSettings, 'news')} />;
  if (activeWidget === 'phonebook') return <WidgetPhonebook data={widgetConfig?.phonebook || []} settings={getWidgetSetting(widgetSettings, 'phonebook')} />;
  if (activeWidget === 'shuttles') return <WidgetShuttles data={widgetConfig?.shuttles || []} settings={getWidgetSetting(widgetSettings, 'shuttles')} />;
  if (activeWidget === 'polls') return <WidgetPolls data={widgetConfig?.polls || []} settings={getWidgetSetting(widgetSettings, 'polls')} />;
  if (activeWidget === 'celebrations') return <WidgetCelebrations data={widgetConfig?.celebrations || []} settings={getWidgetSetting(widgetSettings, 'celebrations')} />;
  if (activeWidget === 'heritage') return <WidgetHeritage data={widgetConfig?.heritage || []} settings={getWidgetSetting(widgetSettings, 'heritage')} />;
  if (activeWidget === 'tips') return <WidgetTips data={widgetConfig?.tips || []} settings={getWidgetSetting(widgetSettings, 'tips')} />;
  if (activeWidget === 'alerts') return <WidgetAlerts data={widgetConfig?.alerts || []} settings={getWidgetSetting(widgetSettings, 'alerts')} />;
  return <WidgetEmptyState icon={Bell} title="ווידג'ט לא ידוע" description="לא זוהתה תצורה מתאימה עבור הרכיב שנבחר." />;
}

export default function WidgetPanelContent({ widgetConfig, activeWidget, compact = false }) {
  const resolvedWidget = activeWidget || widgetConfig?.activeWidget || 'events';

  return (
    <div className={`relative z-10 flex h-full w-full flex-col ${compact ? 'p-4 pt-5' : 'p-6 pt-7'}`}>
      <h2 className={`border-b border-gray-200 pb-2 font-black text-gray-900 dark:border-white/20 dark:text-white ${compact ? 'mb-4 text-xl' : 'mb-6 text-2xl [@media(max-height:850px)]:mb-3 [@media(max-height:850px)]:text-xl'}`}>
        {getWidgetTitle(resolvedWidget)}
      </h2>
      <div className="mask-image-bottom relative flex-1 overflow-hidden">
        <div className="flex h-full flex-col">
          <WidgetContent activeWidget={resolvedWidget} widgetConfig={widgetConfig} />
        </div>
      </div>
    </div>
  );
}
