import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useWidget } from '../context/WidgetContext';
import { useTheme, applyThemeToElement } from '../context/ThemeContext';
import WidgetPanelContent, { getWidgetTitle } from './WidgetPanelContent';

const PREVIEW_WIDTH = 380;
// גובה וירטואלי גדול יותר כדי לראות יותר מהווידג׳ט בתוך המעטפת של הניהול
const PREVIEW_HEIGHT = 680;

export default function WidgetLivePreview({ widgetConfigOverride = null, title = 'תצוגה מקדימה מהאתר' }) {
  const containerRef = useRef(null);
  const previewRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [isTallScreen, setIsTallScreen] = useState(false);
  const { widgetConfig } = useWidget();
  const { theme, effectiveMode } = useTheme();

  const effectiveWidgetConfig = useMemo(
    () => widgetConfigOverride || widgetConfig,
    [widgetConfigOverride, widgetConfig]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (!width || !height) return;
      const nextScale = Math.min(width / PREVIEW_WIDTH, height / PREVIEW_HEIGHT);
      // במסך הניהול יש לנו מסגרת גבוהה ורחבה מספיק, לכן אפשר לאפשר גם הגדלה
      // כדי שהווידג׳ט ירונדר קרוב יותר לגודל האמיתי שלו באתר.
      setScale(nextScale);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // גובה שונה למסכים גבוהים מאוד, בלי לגעת במסכים קטנים
  useEffect(() => {
    const updateTallFlag = () => {
      setIsTallScreen(window.innerHeight >= 900);
    };
    updateTallFlag();
    window.addEventListener('resize', updateTallFlag);
    return () => window.removeEventListener('resize', updateTallFlag);
  }, []);

  useEffect(() => {
    if (!previewRef.current || !theme) return;
    // בתצוגה המקדימה נרצה להשתמש במצב התצוגה האפקטיבי של האדמין (טוגל למעלה)
    const themedWithMode = {
      ...theme,
      displayMode: effectiveMode === 'dark' ? 'dark' : 'light',
    };
    applyThemeToElement(previewRef.current, themedWithMode);
  }, [theme, effectiveWidgetConfig, effectiveMode]);

  const activeWidget = effectiveWidgetConfig?.activeWidget || 'events';
  const containerHeightStyle = isTallScreen ? 'min(82vh, 760px)' : 'min(72vh, 620px)';

  return (
    <div
      ref={containerRef}
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-gray-300 bg-white shadow-xl dark:border-white/15 dark:bg-[#232733]"
      style={{ height: containerHeightStyle, minWidth: '320px', maxWidth: '480px' }}
    >
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <div className="text-xs font-bold text-gray-500 dark:text-gray-400">{title}</div>
        <div className="mt-1 text-sm font-black text-gray-900 dark:text-white">{getWidgetTitle(activeWidget)}</div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-100/80 p-3 dark:bg-[#1b1d26]">
        <div
          className="origin-center overflow-hidden rounded-[28px]"
          style={{
            width: `${PREVIEW_WIDTH}px`,
            height: `${PREVIEW_HEIGHT}px`,
            transform: `scale(${scale})`,
          }}
        >
          <div
            ref={previewRef}
            dir="rtl"
            className="relative h-full w-full bg-gray-50 text-gray-900 dark:bg-[#1e212b] dark:text-white"
          >
            <div className="h-full w-full p-3">
              <div className="h-full w-full bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)] dark:bg-[#232733]">
                <WidgetPanelContent widgetConfig={effectiveWidgetConfig} activeWidget={activeWidget} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
