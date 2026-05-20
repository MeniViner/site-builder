import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import WidgetPanelContent, { getWidgetTitle } from '../WidgetPanelContent';
import { useWidget } from '../../context/WidgetContext';
import { DEFAULT_ACTIVE_WIDGETS } from '../../utils/widgetDisplay';
import { isTacticalStyle, normalizeBorderStyle, tacticalClip } from '../../utils/borderStyles';
import { resolveSiteImageUrl } from '../../utils/assetUrl';

function TacticalPanel({ borderStyle, cornerSize, className, children, glowLine, showBorder = true, showBackground = true, showShadow = true }) {
  const normalizedStyle = normalizeBorderStyle(borderStyle);
  const isTactical = isTacticalStyle(normalizedStyle);
  const outerClip = isTactical ? tacticalClip(normalizedStyle, cornerSize) : null;
  const radius = !isTactical
    ? (normalizedStyle === 'square' ? '0px' : `${Math.min(cornerSize, 20)}px`)
    : undefined;

  return (
    <div
      className={`relative ${showBackground ? 'bg-theme-card' : 'bg-transparent'} ${showShadow ? 'shadow-md' : ''} text-theme ${showBorder ? 'border border-theme-subtle' : ''} ${className}`}
      style={outerClip ? { clipPath: outerClip } : { borderRadius: radius }}
    >
      {glowLine && showBackground && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] shadow-[0_0_15px_var(--color-primary-hex)] z-20" style={{ backgroundColor: 'var(--color-primary-hex)' }} />
      )}
      {children}
    </div>
  );
}

function CommanderSection({ commander, messages }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const hasMultiple = messages.length > 1;
  const decorativeElement = commander?.decorativeElement || 'line-diamond-line';

  useEffect(() => {
    if (!hasMultiple) return;
    const timer = setInterval(() => setMsgIndex((prev) => (prev + 1) % messages.length), 8000);
    return () => clearInterval(timer);
  }, [messages.length, hasMultiple]);

  const goNext = () => setMsgIndex((prev) => (prev + 1) % messages.length);
  const goPrev = () => setMsgIndex((prev) => (prev - 1 + messages.length) % messages.length);
  const currentMsg = messages[msgIndex] || {};

  return (
    <div className="relative p-6 [@media(max-height:850px)]:p-4 flex flex-col sm:flex-row items-stretch h-full w-full">
      <div className="w-full sm:w-[45%] relative shrink-0 sm:-ml-4 flex items-center justify-center overflow-visible mb-6 sm:mb-0 isolate">
        <div className="absolute left-1/2 top-1/2 -translate-x-[40%] -translate-y-[60%] w-28 lg:w-32 xl:w-36 h-28 lg:h-32 xl:h-36 bg-primary z-[1] hidden sm:block shadow-[0_0_25px_var(--color-primary-600),0_0_50px_var(--color-primary-900)]" aria-hidden="true" />
        {commander.image && (
          <img src={resolveSiteImageUrl(commander.image)} className="w-full sm:w-44 lg:w-52 xl:w-60 h-40 sm:h-full object-contain object-center relative z-[2] border-b sm:border-b-0 border-theme-subtle" alt="Commander" />
        )}
      </div>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] shadow-[0_0_15px_var(--color-primary-hex)] z-20" style={{ backgroundColor: 'var(--color-primary-hex)' }} />
      <div className="flex-1 flex flex-col justify-between items-start sm:border-r border-theme-subtle sm:pr-6 [@media(max-height:850px)]:pr-4 pt-2 pb-1 relative z-20 overflow-hidden">
        <div className="w-full">
          <div className="text-primary text-xs xl:text-sm [@media(max-height:850px)]:text-sm font-bold mb-1 opacity-90 tracking-wide">{commander.roleLabel}</div>
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-black text-theme mb-2 xl:mb-4 leading-tight">{commander.sectionTitle}</h2>
          <p className="text-theme-muted text-[13px] xl:text-[14px] [@media(max-height:850px)]:text-[14px] leading-snug xl:leading-relaxed [@media(max-height:850px)]:leading-tight mb-4 xl:mb-6 [@media(max-height:850px)]:mb-2 font-medium xl:line-clamp-none line-clamp-3 [@media(max-height:850px)]:line-clamp-3 transition-opacity duration-500">
            {currentMsg.text}
          </p>
          <div className="text-theme-muted/70 text-xs xl:text-sm [@media(max-height:850px)]:text-sm tracking-wider opacity-70">{currentMsg.signature}</div>
        </div>
        <div className="flex gap-0.5 mt-6 sm:absolute sm:bottom-0 sm:left-0">
          {hasMultiple ? (
            <>
              <button
                onClick={goPrev}
                className="bg-primary w-10 h-10 flex items-center justify-center text-white hover:brightness-110 transition"
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={goNext}
                className="bg-primary w-10 h-10 flex items-center justify-center text-white hover:brightness-110 transition"
              >
                <ChevronLeft size={18} />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 opacity-60 text-primary">
              {decorativeElement === 'line-diamond-line' && (
                <>
                  <div className="w-8 h-[2px] bg-current rounded-full" />
                  <div className="w-2 h-2 rotate-45 border border-current" />
                  <div className="w-5 h-[2px] bg-current rounded-full" />
                </>
              )}
              {decorativeElement === 'dots' && (
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-current" />
                  <div className="w-1.5 h-1.5 rounded-full bg-current/70" />
                  <div className="w-1.5 h-1.5 rounded-full bg-current/40" />
                </div>
              )}
              {decorativeElement === 'line' && (
                <div className="w-12 h-[2px] rounded-full bg-current" />
              )}
              {decorativeElement === 'double-line' && (
                <div className="flex flex-col gap-1">
                  <div className="w-12 h-[2px] rounded-full bg-current" />
                  <div className="w-8 h-[2px] rounded-full bg-current/80 self-end" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommanderPanel({ commander, messages, borderStyle, bordered = true }) {
  return (
    <TacticalPanel
      borderStyle={borderStyle}
      cornerSize={30}
      showBorder={bordered}
      showBackground={bordered}
      showShadow={bordered}
      className={`w-full lg:flex-1 lg:max-w-[700px] h-auto lg:h-[260px] xl:h-[300px] 2xl:min-h-[320px] [@media(max-height:850px)]:h-[220px] group self-end ${bordered ? 'shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)]' : ''}`}
    >
      <CommanderSection commander={commander} messages={messages} />
    </TacticalPanel>
  );
}

export function WidgetSection({ borderStyle, widgetHeight, onWidgetTitleChange, showBorder = true, showBackground = true, showShadow = true }) {
  const { widgetConfig } = useWidget();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isWidgetHovered, setIsWidgetHovered] = useState(false);

  const activeWidgets = useMemo(() => {
    if (Array.isArray(widgetConfig?.activeWidgets) && widgetConfig.activeWidgets.length > 0) {
      return widgetConfig.activeWidgets.slice(0, 3);
    }
    if (widgetConfig?.activeWidget) {
      return [widgetConfig.activeWidget];
    }
    return [...DEFAULT_ACTIVE_WIDGETS];
  }, [widgetConfig?.activeWidgets, widgetConfig?.activeWidget]);

  const rotationInterval = useMemo(() => {
    const parsed = Number(widgetConfig?.rotationInterval);
    if (!Number.isFinite(parsed)) return 8;
    return Math.max(3, Math.min(30, parsed));
  }, [widgetConfig?.rotationInterval]);

  useEffect(() => {
    if (currentIndex <= activeWidgets.length - 1) return;
    setCurrentIndex(0);
  }, [activeWidgets.length, currentIndex]);

  useEffect(() => {
    if (activeWidgets.length <= 1 || isWidgetHovered) return undefined;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % activeWidgets.length);
    }, rotationInterval * 1000);

    return () => clearInterval(timer);
  }, [activeWidgets.length, isWidgetHovered, rotationInterval]);

  const currentWidget = activeWidgets[currentIndex] || activeWidgets[0] || 'events';
  const widgetTitle = getWidgetTitle(currentWidget);
  const hasMultipleWidgets = activeWidgets.length > 1;

  useEffect(() => {
    if (!onWidgetTitleChange) return;
    onWidgetTitleChange(widgetTitle);
  }, [onWidgetTitleChange, widgetTitle]);

  const goPrev = () => {
    setCurrentIndex((prev) => (prev - 1 + activeWidgets.length) % activeWidgets.length);
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev + 1) % activeWidgets.length);
  };

  return (
    <div className="self-end shrink-0 w-full lg:w-[320px] xl:w-[380px] relative z-40 lg:h-0">
      {hasMultipleWidgets && (
        <div className="absolute -left-8 lg:-left-10 top-1/2 -button-5px -translate-y-20 flex flex-col gap-1 z-50">
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous widget"
            className="p-1 rounded-none bg-primary border border-primary/40 text-white dark:text-black hover:brightness-110 transition-colors shadow-sm cursor-pointer"
          >
            <ChevronRight size={18} />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next widget"
            className="p-1 rounded-none bg-primary border border-primary/40 text-white dark:text-black hover:brightness-110 transition-colors shadow-sm cursor-pointer"
          >
            <ChevronLeft size={18} />
          </button>
        </div>
      )}
      <div
        className="w-full lg:absolute lg:bottom-0 lg:left-0 transition-all duration-300"
        style={{ height: widgetHeight }}
        onPointerEnter={() => setIsWidgetHovered(true)}
        onPointerLeave={() => setIsWidgetHovered(false)}
        onMouseEnter={() => setIsWidgetHovered(true)}
        onMouseLeave={() => setIsWidgetHovered(false)}
        onFocus={() => setIsWidgetHovered(true)}
        onBlur={() => setIsWidgetHovered(false)}
      >
        <TacticalPanel
          borderStyle={borderStyle}
          cornerSize={30}
          glowLine
          showBorder={showBorder}
          showBackground={showBackground}
          showShadow={showShadow}
          className={`w-full h-full group flex flex-col ${showBackground ? 'shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)]' : ''}`}
        >
          <div className="relative h-full">
            <div key={currentIndex} className="h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
              <WidgetPanelContent widgetConfig={widgetConfig} activeWidget={currentWidget} widgetTitle={widgetTitle} />
            </div>
          </div>
        </TacticalPanel>
      </div>
    </div>
  );
}
