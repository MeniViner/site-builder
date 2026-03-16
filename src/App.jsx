import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import AdminEvents from './components/AdminEvents';
import WidgetPanelContent from './components/WidgetPanelContent';
import {
  Search, ChevronLeft, ChevronRight,
  Undo2, Globe,
  Image as ImageIcon, ExternalLink,
  Sun, Moon
} from 'lucide-react';

import { DynamicIcon } from './components/DynamicIcon';
import { useNavigation } from './context/NavigationContext';
import { useAuth } from './context/AuthContext';
import { useSiteContent } from './context/SiteContentContext';
import { useTheme } from './context/ThemeContext';
import { useWidget } from './context/WidgetContext';
import { useExternalLinks } from './context/ExternalLinksContext';
import AdminHub from './components/AdminHub';
import RightSidebarNav from './components/RightSidebarNav';
import { ToastContainer } from 'react-toastify';
import { normalizeBorderStyle, panelStyle, tacticalClip, isTacticalStyle } from './utils/borderStyles';
import 'react-toastify/dist/ReactToastify.css';

/* ================================================================
   FLIP CARD (Grid layout)
   ================================================================ */
export const FlipCard = ({ id, title, icon: iconName, subLinks = [], url, isFlipped, onFlip, borderStyle = 'standard' }) => {
  const handleLinkClick = (e) => e.stopPropagation();
  const handleCardClick = () => {
    if (url) { window.open(url, '_blank', 'noopener,noreferrer'); return; }
    onFlip(isFlipped ? null : id);
  };
  const handleClose = (e) => { e.stopPropagation(); onFlip(null); };
  const cardFrameStyle = panelStyle(borderStyle, 12);

  return (
    <div className="relative w-full h-56 cursor-pointer [perspective:1000px] group" onClick={handleCardClick}>
      <div className={`w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <div
          className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-theme-card-hover to-theme-card border border-theme-subtle shadow-sm text-theme group-hover:border-primary/50 group-hover:shadow-[0_0_20px_var(--color-primary-900)] transition-all rounded-xl p-6 flex flex-col items-center justify-center overflow-hidden"
          style={cardFrameStyle}
        >
          <div className="bg-theme-elevated border border-theme-subtle p-4 rounded-xl mb-4 text-primary group-hover:scale-110 transition-transform duration-300">
            <DynamicIcon name={iconName} size={36} strokeWidth={1.5} />
          </div>
          <h3 className="text-xl font-bold text-theme tracking-wide">{title}</h3>
          <div className="mt-4 flex items-center justify-center gap-1 text-xs text-theme-muted font-medium tracking-wider uppercase">
            <span>לכניסה</span>
            <ChevronLeft size={12} className="-rotate-90 text-theme-muted" aria-hidden />
          </div>
        </div>
        <div
          className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-theme-card-hover to-theme-card border border-theme-subtle shadow-sm text-theme rounded-xl p-5 flex flex-col shadow-2xl overflow-hidden"
          style={cardFrameStyle}
        >
          <div className="flex justify-between items-center mb-3 border-b border-theme-subtle pb-3">
            <h3 className="text-base font-bold text-theme">{title}</h3>
            <button type="button" className="text-theme-muted hover:text-primary transition-colors bg-theme-elevated rounded-md p-1" onClick={handleClose} aria-label="סגור"><Undo2 size={16} /></button>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-1 content-center">
            {(subLinks || []).map((link, idx) => (
              <button key={idx} type="button" onClick={handleLinkClick} className="relative flex items-center gap-1.5 text-right bg-theme-elevated hover:bg-primary/10 hover:text-primary-300 px-3 py-2 rounded-lg transition-all text-sm text-theme-muted group/btn whitespace-nowrap">
                <DynamicIcon name={link.icon} size={14} className="text-theme-muted group-hover/btn:text-primary-300 shrink-0" />
                <span>{link.label}</span>
                {link.url && <a href={link.url} target="_blank" rel="noreferrer" className="absolute inset-0" onClick={(e) => e.stopPropagation()} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ================================================================
   COMPACT LIST LAYOUT
   ================================================================ */
function CompactListSection({ cat }) {
  return (
    <section key={cat.id} id={cat.id} className="scroll-mt-32 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-4 px-2 pb-3 relative">
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
        <div className="bg-primary/10 text-primary p-2.5 rounded-lg border border-primary/20">
          <DynamicIcon name={cat.icon} size={20} />
        </div>
        <h2 className="text-xl font-bold text-theme">{cat.label}</h2>
      </div>
      <div className="space-y-1">
        {cat.children.map((card) => (
          <a
            key={card.id}
            href={card.url || '#'}
            target={card.url ? '_blank' : undefined}
            rel={card.url ? 'noopener noreferrer' : undefined}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-theme-elevated transition-all group border border-transparent hover:border-theme-subtle"
          >
            <div className="w-8 h-8 rounded-lg bg-theme-elevated flex items-center justify-center text-theme-muted group-hover:text-primary group-hover:bg-primary/10 transition shrink-0">
              <DynamicIcon name={card.icon} size={16} />
            </div>
            <span className="text-sm font-medium text-theme-muted group-hover:text-theme transition flex-1">{card.title || card.label}</span>
            {card.subLinks && card.subLinks.length > 0 && (
              <span className="text-[10px] text-theme-muted bg-theme-elevated px-2 py-0.5 rounded-full">{card.subLinks.length} קישורים</span>
            )}
            <ChevronLeft size={14} className="text-theme-muted group-hover:text-primary transition shrink-0" />
          </a>
        ))}
      </div>
    </section>
  );
}

/* ================================================================
   HQ DASHBOARD LAYOUT (Creative)
   Command-center inspired: status-card rows with glow accents
   ================================================================ */
function HQDashboardSection({ cat, borderStyle = 'standard' }) {
  return (
    <section key={cat.id} id={cat.id} className="scroll-mt-32 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-6 px-2 pb-4 relative">
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
        <div className="bg-primary/10 text-primary p-3 rounded-xl border border-primary/20">
          <DynamicIcon name={cat.icon} size={24} />
        </div>
        <h2 className="text-2xl font-bold text-theme tracking-wide">{cat.label}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cat.children.map((card) => (
          <a
            key={card.id}
            href={card.url || '#'}
            target={card.url ? '_blank' : undefined}
            rel={card.url ? 'noopener noreferrer' : undefined}
            className="group relative flex items-center gap-5 p-5 bg-gradient-to-l from-surface-card to-transparent border-r-2 border-primary/30 hover:border-primary hover:bg-surface-card/80 transition-all overflow-hidden"
            style={panelStyle(borderStyle, 12)}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-1 h-full bg-primary/0 group-hover:bg-primary transition-all shadow-[0_0_12px_var(--color-primary-hex)] group-hover:shadow-[0_0_16px_var(--color-primary-hex)]" />
            <div className="w-12 h-12 rounded-lg bg-theme-elevated border border-theme-subtle flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
              <DynamicIcon name={card.icon} size={24} strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="font-bold text-theme text-base mb-0.5 group-hover:text-primary-300 transition">{card.title || card.label}</h3>
              {card.subLinks && card.subLinks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {card.subLinks.slice(0, 4).map((sl, i) => (
                    <span key={i} className="text-[10px] text-theme-muted bg-theme-elevated border border-theme-subtle px-2 py-0.5 rounded font-medium">{sl.label}</span>
                  ))}
                  {card.subLinks.length > 4 && <span className="text-[10px] text-theme-muted/70">+{card.subLinks.length - 4}</span>}
                </div>
              )}
            </div>
            <div className="w-2 h-2 rounded-full bg-green-500/60 group-hover:bg-green-400 shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.4)]" title="פעיל" />
          </a>
        ))}
      </div>
    </section>
  );
}

/* ================================================================
   EXTERNAL LINK IMAGE with Globe fallback
   ================================================================ */
function ExtLinkIcon({ icon, src, alt, size = 18, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (icon) {
    return <DynamicIcon name={icon} size={size} className={`text-theme-muted group-hover:text-primary transition ${className}`} />;
  }
  if (!src || failed) {
    return <Globe size={size} className={`text-theme-muted group-hover:text-primary transition ${className}`} />;
  }
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className={`w-full h-full object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

/* ================================================================
   EXTERNAL LINKS — Cards Layout
   ================================================================ */
function ExtLinksCards({ links, compact, bordered = true, borderStyle = 'standard' }) {
  const cardBorder = bordered ? 'border border-theme-subtle hover:border-primary/30' : '';
  const iconWrap = bordered
    ? 'w-8 h-8 rounded-lg bg-theme-elevated border border-theme-subtle group-hover:border-primary/30 overflow-hidden shrink-0'
    : 'w-8 h-8 rounded-lg overflow-hidden shrink-0';
  const iconWrapFull = bordered
    ? 'w-12 h-12 rounded-lg bg-theme-elevated border border-theme-subtle group-hover:border-primary/30 overflow-hidden shrink-0'
    : 'w-12 h-12 rounded-lg overflow-hidden shrink-0';
  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-nowrap">
        {links.map((link) => (
          <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
            className={`group flex flex-col items-center gap-1.5 p-2.5 rounded-lg bg-theme-card ${cardBorder} hover:bg-primary/5 transition-all text-center shrink-0 overflow-hidden`}
            style={panelStyle(borderStyle, 10)}>
            <div className={`flex items-center justify-center ${iconWrap}`}>
              <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={18} />
            </div>
            <span className="text-[10px] font-medium text-theme-muted group-hover:text-theme transition truncate max-w-[64px]">{link.title}</span>
          </a>
        ))}
      </div>
    );
  }
  return (
    <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-12">
      <div className="flex items-center gap-3 mb-8">
        <ExternalLink size={20} className="text-primary" />
        <h3 className="text-lg font-bold text-theme">קישורים חיצוניים</h3>
        <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent via-theme-subtle to-transparent" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {links.map((link) => (
          <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
            className={`group flex flex-col items-center gap-3 p-5 rounded-xl bg-theme-card ${cardBorder} hover:bg-primary/5 transition-all text-center overflow-hidden`}
            style={panelStyle(borderStyle, 12)}>
            <div className={`flex items-center justify-center ${iconWrapFull}`}>
              <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={24} />
            </div>
            <span className="text-sm font-medium text-theme-muted group-hover:text-theme transition truncate w-full">{link.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   EXTERNAL LINKS — Minimal Icons Layout
   ================================================================ */
function ExtLinksMinimal({ links, compact, bordered = true }) {
  const wrapCls = compact ? 'flex items-center gap-3 flex-nowrap' : 'max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex items-center justify-center gap-6 flex-wrap';
  const ringCls = bordered ? 'border border-theme-subtle hover:border-primary/40 bg-theme-elevated hover:bg-primary/10' : 'hover:bg-theme-elevated';
  const linkCls = compact
    ? `group relative w-10 h-10 rounded-full ${ringCls} flex items-center justify-center overflow-hidden transition-all hover:scale-110 shrink-0`
    : `group relative w-14 h-14 rounded-full ${ringCls} flex items-center justify-center overflow-hidden transition-all hover:scale-110`;
  return (
    <div className={wrapCls}>
      {links.map((link) => (
        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
          className={linkCls}
          title={link.title}>
          <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={compact ? 16 : 22} />
          {!compact && (
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-theme-chrome text-theme text-[10px] font-bold px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 border border-theme-subtle">
              {link.title}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}

/* ================================================================
   EXTERNAL LINKS — Floating Bar Layout
   ================================================================ */
function ExtLinksFloating({ links, fixed: isFixed = true, bordered = true, showBackground = true, borderStyle = 'standard' }) {
  const barBorder = bordered && showBackground ? 'border border-theme-subtle' : '';
  const iconBg = bordered ? 'bg-theme-elevated' : '';
  const barBg = showBackground ? 'bg-theme-chrome backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)]' : '';
  const barShape = panelStyle(borderStyle, 12);
  const content = (
    <div className={`flex items-center gap-2 ${barBg} ${barBorder} rounded-full px-4 py-2.5 overflow-hidden`} style={barShape}>
      {links.map((link) => (
        <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
          className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-theme-card-hover transition-all"
          title={link.title}>
          <div className={`w-6 h-6 rounded-full ${iconBg} flex items-center justify-center overflow-hidden shrink-0`}>
            <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={14} className="!p-0" />
          </div>
          <span className="text-xs font-medium text-theme-muted group-hover:text-theme transition hidden sm:inline max-w-[80px] truncate">{link.title}</span>
        </a>
      ))}
    </div>
  );
  if (isFixed) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90]">
        {content}
      </div>
    );
  }
  return <div className="w-full border-t border-theme-subtle bg-theme-card py-4 flex justify-center">{content}</div>;
}

/* ================================================================
   COMMANDER SECTION
   ================================================================ */
function CommanderSection({ commander, messages }) {
  const [msgIndex, setMsgIndex] = useState(0);
  const hasMultiple = messages.length > 1;
  const decorativeElement = commander?.decorativeElement || 'line-diamond-line';

  useEffect(() => {
    if (!hasMultiple) return;
    const timer = setInterval(() => setMsgIndex(prev => (prev + 1) % messages.length), 8000);
    return () => clearInterval(timer);
  }, [messages.length, hasMultiple]);

  const goNext = () => setMsgIndex(prev => (prev + 1) % messages.length);
  const goPrev = () => setMsgIndex(prev => (prev - 1 + messages.length) % messages.length);
  const currentMsg = messages[msgIndex] || {};

  return (
    <div className="relative p-6 [@media(max-height:850px)]:p-4 flex flex-col sm:flex-row items-stretch h-full w-full">
      <div className="w-full sm:w-[45%] relative shrink-0 sm:-ml-4 flex items-center justify-center overflow-visible mb-6 sm:mb-0 isolate">
        <div className="absolute left-1/2 top-1/2 -translate-x-[40%] -translate-y-[60%] w-28 lg:w-32 xl:w-36 h-28 lg:h-32 xl:h-36 bg-primary z-[1] hidden sm:block shadow-[0_0_25px_var(--color-primary-600),0_0_50px_var(--color-primary-900)]" aria-hidden="true" />
        <img src={commander.image} className="w-full sm:w-44 lg:w-52 xl:w-60 h-40 sm:h-full object-contain object-center relative z-[2] border-b sm:border-b-0 border-theme-subtle" alt="Commander" />
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

/* ================================================================
   TACTICAL PANEL — reusable layered card with dynamic border style
   ================================================================ */
function TacticalPanel({ borderStyle, cornerSize, className, children, glowLine }) {
  const normalizedStyle = normalizeBorderStyle(borderStyle);
  const isTactical = isTacticalStyle(normalizedStyle);
  const outerClip = isTactical ? tacticalClip(normalizedStyle, cornerSize) : null;
  const radius = !isTactical
    ? (normalizedStyle === 'square' ? '0px' : `${Math.min(cornerSize, 20)}px`)
    : undefined;

  return (
    <div
      className={`relative bg-theme-card border border-theme-subtle shadow-md text-theme ${className}`}
      style={outerClip ? { clipPath: outerClip } : { borderRadius: radius }}
    >
      {glowLine && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] shadow-[0_0_15px_var(--color-primary-hex)] z-20" style={{ backgroundColor: 'var(--color-primary-hex)' }} />
      )}
      {children}
    </div>
  );
}

/* ================================================================
   SEARCH BAR — dynamic border style
   ================================================================ */
function SearchBar({ borderStyle }) {
  const normalizedStyle = normalizeBorderStyle(borderStyle);
  const isTactical = isTacticalStyle(normalizedStyle);
  const squareStyle = normalizedStyle === 'square' ? { borderRadius: '0px' } : undefined;

  if (!isTactical) {
    return (
      <div className="relative flex items-center w-64 md:w-80 h-10 group" style={{ filter: `drop-shadow(0 0 4px var(--color-primary-900))` }}>
        <div className="absolute inset-0 bg-primary-900 rounded-lg" style={squareStyle} />
        <div className="absolute inset-[1px] bg-theme-elevated rounded-[7px]" style={squareStyle} />
        <div className="absolute inset-[3px] rounded-[5px] transition-colors group-hover:brightness-110" style={{ backgroundColor: 'var(--color-primary-800)', ...(squareStyle || {}) }} />
        <div className="absolute inset-[4px] bg-theme-card flex items-center px-3 rounded-[4px]" style={squareStyle}>
          <Search size={22} className="shrink-0" style={{ color: 'var(--color-primary-800)' }} strokeWidth={2} />
          <input type="text" placeholder="חיפוש באתר..." className="flex-1 w-full bg-transparent border-none outline-none text-theme placeholder-theme-muted text-sm font-medium mr-2" />
        </div>
      </div>
    );
  }

  const clip = (s) => tacticalClip(normalizedStyle, s);
  return (
    <div className="relative flex items-center w-64 md:w-80 h-10 group" style={{ filter: `drop-shadow(0 0 4px var(--color-primary-900))` }}>
      <div className="absolute inset-0 bg-primary-900" style={{ clipPath: clip(12) }} />
      <div className="absolute inset-[1px] bg-theme-elevated" style={{ clipPath: clip(11) }} />
      <div className="absolute inset-[3px] transition-colors group-hover:brightness-110" style={{ clipPath: clip(9), backgroundColor: 'var(--color-primary-800)' }} />
      <div className="absolute inset-[4px] bg-theme-card flex items-center px-3" style={{ clipPath: clip(8) }}>
        <Search size={22} className="shrink-0" style={{ color: 'var(--color-primary-800)' }} strokeWidth={2} />
        <input type="text" placeholder="חיפוש באתר..." className="flex-1 w-full bg-transparent border-none outline-none text-theme placeholder-theme-muted text-sm font-medium mr-2" />
      </div>
    </div>
  );
}

/* ================================================================
   HOME
   ================================================================ */
export function Home() {
  const navigate = useNavigate();
  const onOpenAdmin = () => navigate('/admin');
  const [bgIndex, setBgIndex] = useState(0);
  const [flippedCardId, setFlippedCardId] = useState(null);

  const { navItems, loading } = useNavigation();
  const { currentUser } = useAuth();
  const { siteContent } = useSiteContent();
  const { theme, effectiveMode, toggleUserMode, borderTargets } = useTheme();
  const { widgetConfig } = useWidget();
  const { externalLinks } = useExternalLinks();

  const hero = siteContent?.hero || { title: '', subtitle: '', description: '', backgroundImages: [] };
  const commander = siteContent?.commander || { image: '', sectionTitle: '', roleLabel: '', messages: [] };
  const messages = commander.messages || [];
  const backgrounds = (hero.backgroundImages || []).filter(Boolean);
  const heroGrayscale = theme?.heroGrayscale ?? false;
  const showNavCategories = theme?.showNavCategories ?? true;
  const borderStyle = normalizeBorderStyle(theme?.borderStyle || 'cyber');
  const regularLinksLayout = theme?.regularLinksLayout || 'grid';
  const externalLinksLayout = theme?.externalLinksLayout || 'cards';
  const externalLinksFixed = theme?.externalLinksFixed ?? false;
  const externalLinksBordered = theme?.externalLinksBordered !== false;
  const externalLinksShowBackground = theme?.externalLinksShowBackground !== false;
  const activeWidget = widgetConfig?.activeWidget || 'events';
  const commanderBorderStyle = borderTargets?.commander ? borderStyle : 'standard';
  const widgetBorderStyle = borderTargets?.widget ? borderStyle : 'standard';
  const searchBorderStyle = borderTargets?.search ? borderStyle : 'standard';
  const topNavBorderStyle = borderTargets?.topNav ? borderStyle : 'standard';
  const flipCardBorderStyle = borderTargets?.flipCards ? borderStyle : 'standard';
  const hqDashBorderStyle = borderTargets?.hqDash ? borderStyle : 'standard';
  const extLinksBorderStyle = borderTargets?.extLinks ? borderStyle : 'standard';
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 16) return 'צהריים טובים';
    if (hour >= 16 && hour < 18) return 'אחה"צ טובים';
    if (hour >= 18 && hour < 22) return 'ערב טוב';
    return 'לילה טוב';
  };
  const userName = currentUser?.displayName || 'אורח';

  useEffect(() => {
    if (backgrounds.length === 0) return;
    const timer = setInterval(() => setBgIndex(prev => (prev + 1) % backgrounds.length), 3000);
    return () => clearInterval(timer);
  }, [backgrounds.length]);

  const handleNavTo = (cat) => {
    if ((cat.isDirectLink && cat.url) || cat.url) { window.open(cat.url, '_blank', 'noopener,noreferrer'); return; }
    const el = document.getElementById(cat.id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFlip = (id) => setFlippedCardId(id);

  const renderHeroTitle = () => {
    if (!hero.title) return null;
    return hero.title.split(/\\n|\n/).map((part, i, arr) => (
      <React.Fragment key={i}>{part.trim()}{i < arr.length - 1 && <br />}</React.Fragment>
    ));
  };

  const renderDescription = () => {
    if (!hero.description) return null;
    return hero.description.split(/\\n|\n/).map((part, i, arr) => (
      <React.Fragment key={i}>{part.trim()}{i < arr.length - 1 && <br />}</React.Fragment>
    ));
  };

  const filteredCats = navItems.filter(c => c.children && c.children.length > 0 && !c.isDirectLink && !c.url);

  const renderCategorySection = (cat) => {
    if (regularLinksLayout === 'compact') return <CompactListSection key={cat.id} cat={cat} />;
    if (regularLinksLayout === 'hq') return <HQDashboardSection key={cat.id} cat={cat} borderStyle={hqDashBorderStyle} />;
    // Default: grid with FlipCards
    return (
      <section key={cat.id} id={cat.id} className="scroll-mt-32 max-w-[1400px] mx-auto w-full">
        <div className="flex items-center gap-4 mb-8 px-2 pb-4 relative">
          <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
          <div className="bg-primary/10 text-primary p-3 rounded-xl border border-primary/20"><DynamicIcon name={cat.icon} size={24} /></div>
          <h2 className="text-2xl font-bold text-theme tracking-wide">{cat.label}</h2>
        </div>
        {cat.children.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {cat.children.map((card) => {
              const uid = `${cat.id}-${card.id}`;
              return <FlipCard key={card.id} id={uid} title={card.title || card.label} icon={card.icon} subLinks={card.subLinks} url={card.url} isFlipped={flippedCardId === uid} onFlip={handleFlip} borderStyle={flipCardBorderStyle} />;
            })}
          </div>
        ) : (
          <div className="w-full bg-gradient-to-br from-theme-card-hover to-theme-card border border-dashed border-theme-subtle rounded-3xl h-64 flex flex-col items-center justify-center text-theme-muted">
            <div className="bg-theme-elevated border border-theme-subtle p-5 rounded-2xl mb-4"><ImageIcon size={40} className="opacity-30 text-theme-muted" /></div>
            <p className="text-xl font-medium text-theme-muted">התוכן טרם הוזן</p>
          </div>
        )}
      </section>
    );
  };

  const renderExternalLinks = () => {
    if (!externalLinks || externalLinks.length === 0) return null;
    const footerCls = 'relative z-10 w-full border-t border-theme-subtle bg-theme-card';
    if (externalLinksFixed) return null;
    if (externalLinksLayout === 'minimal') return <footer className={footerCls}><ExtLinksMinimal links={externalLinks} bordered={externalLinksBordered} /></footer>;
    if (externalLinksLayout === 'floating') return <footer className={footerCls}><ExtLinksFloating links={externalLinks} fixed={false} bordered={externalLinksBordered} showBackground={externalLinksShowBackground} borderStyle={extLinksBorderStyle} /></footer>;
    return <footer className={footerCls}><ExtLinksCards links={externalLinks} bordered={externalLinksBordered} borderStyle={extLinksBorderStyle} /></footer>;
  };

  const getWidgetHeight = (level) => {
    switch (level) {
      case 'full': return 'calc(100vh - 180px)';
      case 'high': return 'calc(100vh - 300px)';
      case 'medium': return '520px';
      case 'low':
      default: return '400px';
    }
  };

  return (
    <div dir="rtl" className="min-h-screen relative bg-theme-bg-base text-theme font-heebo selection:bg-primary/30">

      {/* Background */}
      <div className="fixed inset-0 z-0 bg-theme-bg-base">
        {backgrounds.map((bg, idx) => (
          <img
            key={idx}
            src={bg}
            alt={`bg-${idx}`}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 brightness-75 contrast-125 ${idx === bgIndex ? 'opacity-50' : 'opacity-0'}`}
            style={{
              filter: heroGrayscale ? 'grayscale(100%)' : 'none',
              mixBlendMode: heroGrayscale ? 'luminosity' : 'normal',
            }}
          />
        ))}
        <div className="absolute inset-0 z-10 grid-overlay pointer-events-none opacity-70" />
        <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_30%,var(--color-bg-base)_100%)] opacity-90 pointer-events-none" />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-theme-grad-end via-theme-grad-end/80 to-transparent h-full pointer-events-none" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-theme-grad-start/80 via-transparent to-transparent h-1/2 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 z-10 w-2/3 bg-gradient-to-l from-theme-grad-end via-theme-grad-end/60 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 left-0 z-10 w-1/4 bg-gradient-to-r from-theme-grad-end to-transparent pointer-events-none" />
      </div>

      <div className="relative z-20 flex flex-col w-full h-full">
        {/* Top Navbar */}
        <nav className="w-full px-8 py-6 flex items-center justify-between bg-theme-chrome backdrop-blur-md border-b border-theme-subtle sticky top-0 z-[100]">
          <div className="flex items-center gap-8 lg:gap-10">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo(0, 0)}>
              <div className="font-bold text-xl relative shrink-0" style={{ color: theme?.primaryColor ?? '#dc2626' }}>
                {hero.siteName || 'שם האתר'}
                <div className="absolute -bottom-7 left-0 right-0 h-1 rounded-t-sm" style={{ backgroundColor: theme?.primaryColor ?? '#dc2626' }} />
              </div>
            </div>
            {showNavCategories && navItems.map(cat => (
              <div key={cat.id} onClick={() => handleNavTo(cat)} className="px-3 py-1.5 rounded-md text-theme-muted hover:text-theme hover:bg-theme-elevated transition font-medium cursor-pointer text-sm tracking-wide">{cat.label}</div>
            ))}
          </div>
          <div className="flex flex-row-reverse items-center gap-3">
            <SearchBar borderStyle={searchBorderStyle} />
            <button
              onClick={onOpenAdmin}
              className="border text-theme px-6 h-10 font-bold transition text-sm whitespace-nowrap hidden sm:block bg-theme-elevated hover:brightness-110"
              style={{ ...panelStyle(topNavBorderStyle, 10), borderColor: theme?.primaryColor ?? '#dc2626' }}
            >ניהול</button>
            {theme?.displayMode === 'user-toggle' && (
              <button
                onClick={toggleUserMode}
                className="flex items-center justify-center w-10 h-10 border border-theme-subtle bg-theme-elevated hover:brightness-110 transition text-theme-muted"
                title={effectiveMode === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
                style={panelStyle(topNavBorderStyle, 10)}
              >
                {effectiveMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            )}
            <div
              className="flex items-center text-theme px-4 h-10 whitespace-nowrap bg-theme-elevated border border-theme-subtle"
              style={panelStyle(topNavBorderStyle, 10)}
            >
              <span className="text-theme-muted font-medium ml-1.5">{getGreeting()}</span>
              <span className="font-bold text-primary-400">{userName}</span>
            </div>
          </div>
        </nav>

        {/* Main Hero Content */}
        <main className="w-full relative h-[calc(100vh-80px)] min-h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] flex flex-col justify-between overflow-hidden pt-4 [@media(max-height:850px)]:pt-2 lg:pt-8 xl:pt-12">
          <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-12 xl:px-24 pointer-events-auto z-20">
            <div className="w-full lg:w-[75%] xl:w-[65%] text-right self-end md:self-auto">
              <div className="text-primary font-bold lg:text-lg [@media(max-height:850px)]:text-sm mb-1 mr-1">{hero.subtitle}</div>
              <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 lg:gap-6 [@media(max-height:850px)]:gap-4 mb-4 xl:mb-6 [@media(max-height:850px)]:mb-2 mt-1">
                <img src="/logo_1734_rmbg.png" alt="Logo החמם" className="h-[70px] md:h-[90px] lg:h-[110px] xl:h-[130px] 2xl:h-[160px] [@media(max-height:850px)]:h-[70px] xl:[@media(max-height:850px)]:h-[80px] w-auto drop-shadow-[0_0_15px_var(--color-primary-900)] transition-transform duration-500 hover:scale-105" />
                <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-[4.2rem] 2xl:text-7xl [@media(max-height:850px)]:text-4xl lg:[@media(max-height:850px)]:text-5xl font-black text-theme drop-shadow-lg tracking-tight leading-tight lg:leading-none break-words">{renderHeroTitle()}</h1>
              </div>
              <p className="text-theme-muted text-base md:text-lg lg:text-xl xl:text-2xl [@media(max-height:850px)]:text-xl [@media(max-height:850px)]:leading-tight leading-relaxed mb-4 lg:mb-8 [@media(max-height:850px)]:mb-3 drop-shadow-md max-w-2xl break-words">{renderDescription()}</p>
            </div>
          </div>

          {/* Bottom Panels: Commander + Widget */}
          <div className="w-full px-8 lg:px-12 xl:px-24 pb-6 lg:pb-10 xl:pb-12 flex flex-col lg:flex-row items-end justify-between gap-6 lg:gap-6 xl:gap-10 pointer-events-auto z-30 mt-auto">
            <TacticalPanel
              borderStyle={commanderBorderStyle}
              cornerSize={30}
              className="w-full lg:flex-1 lg:max-w-[700px] h-auto lg:h-[260px] xl:h-[300px] 2xl:min-h-[320px] [@media(max-height:850px)]:h-[220px] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)] group self-end"
            >
              <CommanderSection commander={commander} messages={messages} />
            </TacticalPanel>

            {/* Dynamic Widget Controlled Wrapper */}
            <div className="self-end shrink-0 w-full lg:w-[320px] xl:w-[380px] relative z-40 lg:h-0">
              {/* On mobile: regular flow. On desktop: absolutely positioned to grow UP from the 0-height wrapper */}
              <div
                className="w-full lg:absolute lg:bottom-0 lg:left-0 transition-all duration-300"
                style={{ height: getWidgetHeight(theme?.widgetHeight) }}
              >
                <TacticalPanel
                  borderStyle={widgetBorderStyle}
                  cornerSize={30}
                  glowLine
                  className="w-full h-full shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)] group flex flex-col"
                >
                  <WidgetPanelContent widgetConfig={widgetConfig} activeWidget={activeWidget} />
                </TacticalPanel>
              </div>
            </div>
          </div>
        </main>

        {/* Categories Section */}
        {regularLinksLayout !== 'sidebar-right' && (
          <div className="relative z-10 w-full mt-[10vh] pb-24 px-6 lg:px-12 flex flex-col gap-16 bg-theme-bg-base/90 backdrop-blur-xl border-t border-theme-strong pt-16">
            {loading ? (
              <div className="w-full h-64 flex items-center justify-center text-theme-muted">טוען קטגוריות...</div>
            ) : filteredCats.map(renderCategorySection)}
          </div>
        )}

        {/* External Links (in flow when not fixed) */}
        {!externalLinksFixed && renderExternalLinks()}

        {/* Copyright */}
        {externalLinks && externalLinks.length > 0 && !externalLinksFixed && (
          <div className="relative z-10 border-t border-theme-subtle py-4 text-center bg-theme-bg-base">
            <p className="text-xs text-theme-muted">כל הזכויות שמורות &copy; {new Date().getFullYear()}</p>
          </div>
        )}
      </div>

      {/* Right Sidebar Nav — TOP LEVEL, outside all relative/overflow parents */}
      {regularLinksLayout === 'sidebar-right' && <RightSidebarNav />}

      {/* Fixed bar (when "נעוץ" is on) — any of the 3 layouts can be shown fixed */}
      {externalLinksFixed && externalLinks && externalLinks.length > 0 && (
        externalLinksLayout === 'floating' ? (
          <ExtLinksFloating links={externalLinks} fixed bordered={externalLinksBordered} showBackground={externalLinksShowBackground} borderStyle={extLinksBorderStyle} />
        ) : (
          <div
            className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] max-w-[95vw] overflow-x-auto rounded-2xl px-4 py-3 ${externalLinksShowBackground ? 'bg-theme-chrome backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)]' : ''} ${externalLinksShowBackground && externalLinksBordered ? 'border border-theme-subtle' : ''}`}
            style={panelStyle(extLinksBorderStyle, 12)}
          >
            {externalLinksLayout === 'minimal' ? (
              <ExtLinksMinimal links={externalLinks} compact bordered={externalLinksBordered} />
            ) : (
              <ExtLinksCards links={externalLinks} compact bordered={externalLinksBordered} borderStyle={extLinksBorderStyle} />
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function App() {
  const { effectiveMode } = useTheme();
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/*" element={<AdminHub />} />
      </Routes>
      <ToastContainer
        position="top-right"
        rtl
        theme={effectiveMode === 'dark' ? 'dark' : 'light'}
        autoClose={4000}
        closeButton
      />
    </>
  );
}
