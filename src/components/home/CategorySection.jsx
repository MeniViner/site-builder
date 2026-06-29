import { ChevronLeft, Image as ImageIcon, Undo2 } from 'lucide-react';
import NavVisual from '../NavVisual';
import Tooltip from '../Tooltip';
import { panelStyle } from '../../utils/borderStyles';
import { getLinkTargetAttributes, openLinkTarget } from '../../utils/linkTargets';

export function FlipCard({ id, title, icon: iconName, iconUrl = '', subLinks = [], url, isFlipped, onFlip, borderStyle = 'standard' }) {
  const handleLinkClick = (e) => e.stopPropagation();
  const handleCardClick = () => {
    if (url) {
      openLinkTarget(url);
      return;
    }
    onFlip(isFlipped ? null : id);
  };
  const handleClose = (e) => {
    e.stopPropagation();
    onFlip(null);
  };
  const cardFrameStyle = panelStyle(borderStyle, 12);

  return (
    <div className="relative w-full h-56 cursor-pointer [perspective:1000px] group" onClick={handleCardClick}>
      <div className={`w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <div
          className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-theme-card-hover to-theme-card border border-theme-subtle shadow-sm text-theme group-hover:border-primary/50 group-hover:shadow-[0_0_20px_var(--color-primary-900)] transition-all rounded-xl p-6 flex flex-col items-center justify-center overflow-hidden"
          style={cardFrameStyle}
        >
          <div className="bg-theme-elevated border border-theme-subtle p-4 rounded-xl mb-4 text-primary group-hover:scale-110 transition-transform duration-300">
            <NavVisual icon={iconName} iconUrl={iconUrl} size={36} className="text-primary" imageClassName="h-9 w-9 object-contain" />
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
            <button type="button" className="text-theme-muted hover:text-primary transition-colors bg-theme-elevated rounded-md p-1" onClick={handleClose} aria-label="סגור">
              <Undo2 size={16} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 flex-1 content-center">
            {(subLinks || []).map((link, idx) => {
              const attrs = getLinkTargetAttributes(link.url);
              return (
                <button key={idx} type="button" onClick={handleLinkClick} className="relative flex items-center gap-1.5 text-right bg-theme-elevated hover:bg-primary/10 hover:text-primary-300 px-3 py-2 rounded-lg transition-all text-sm text-theme-muted group/btn whitespace-nowrap">
                  <NavVisual item={link} size={14} className="text-theme-muted group-hover/btn:text-primary-300 shrink-0" imageClassName="h-3.5 w-3.5 object-contain shrink-0" />
                  <span>{link.label}</span>
                  {link.url && <a {...attrs} className="absolute inset-0" onClick={(e) => e.stopPropagation()} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function CompactListSection({ cat }) {
  return (
    <section id={cat.id} className="scroll-mt-32 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-4 px-2 pb-3 relative">
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
        <div className="bg-primary/10 text-primary p-2.5 rounded-lg border border-primary/20">
          <NavVisual item={cat} size={20} className="text-primary" imageClassName="h-5 w-5 object-contain" />
        </div>
        <h2 className="text-xl font-bold text-theme">{cat.label}</h2>
      </div>
      <div className="space-y-1">
        {cat.children.map((card) => (
          <a
            key={card.id}
            {...getLinkTargetAttributes(card.url)}
            className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-theme-elevated transition-all group border border-transparent hover:border-theme-subtle"
          >
            <div className="w-8 h-8 rounded-lg bg-theme-elevated flex items-center justify-center text-theme-muted group-hover:text-primary group-hover:bg-primary/10 transition shrink-0">
              <NavVisual item={card} size={16} className="text-theme-muted group-hover:text-primary transition shrink-0" imageClassName="h-4 w-4 object-contain shrink-0" />
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

function HQDashboardSection({ cat, borderStyle = 'standard' }) {
  return (
    <section id={cat.id} className="scroll-mt-32 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-6 px-2 pb-4 relative">
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
        <div className="bg-primary/10 text-primary p-3 rounded-xl border border-primary/20">
          <NavVisual item={cat} size={24} className="text-primary" imageClassName="h-6 w-6 object-contain" />
        </div>
        <h2 className="text-2xl font-bold text-theme tracking-wide">{cat.label}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cat.children.map((card) => (
          <a
            key={card.id}
            {...getLinkTargetAttributes(card.url)}
            className="group relative flex items-center gap-5 p-5 bg-gradient-to-l from-surface-card to-transparent border-r-2 border-primary/30 hover:border-primary hover:bg-surface-card/80 transition-all overflow-hidden"
            style={panelStyle(borderStyle, 12)}
          >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />
            <div className="absolute top-0 right-0 w-1 h-full bg-primary/0 group-hover:bg-primary transition-all shadow-[0_0_12px_var(--color-primary-hex)] group-hover:shadow-[0_0_16px_var(--color-primary-hex)]" />
            <div className="w-12 h-12 rounded-lg bg-theme-elevated border border-theme-subtle flex items-center justify-center text-primary shrink-0 group-hover:scale-105 transition-transform">
              <NavVisual item={card} size={24} className="text-primary shrink-0" imageClassName="h-6 w-6 object-contain shrink-0" />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <h3 className="font-bold text-theme text-base mb-0.5 group-hover:text-primary-300 transition">{card.title || card.label}</h3>
              {card.subLinks && card.subLinks.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {card.subLinks.slice(0, 4).map((subLink, index) => (
                    <span key={index} className="text-[10px] text-theme-muted bg-theme-elevated border border-theme-subtle px-2 py-0.5 rounded font-medium">{subLink.label}</span>
                  ))}
                  {card.subLinks.length > 4 && <span className="text-[10px] text-theme-muted/70">+{card.subLinks.length - 4}</span>}
                </div>
              )}
            </div>
            <Tooltip text="פעיל">
              <div className="w-2 h-2 rounded-full bg-green-500/60 group-hover:bg-green-400 shrink-0 shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
            </Tooltip>
          </a>
        ))}
      </div>
    </section>
  );
}

export default function CategorySection({
  cat,
  regularLinksLayout,
  hqDashBorderStyle,
  flipCardBorderStyle,
  flippedCardId,
  onFlip,
}) {
  if (regularLinksLayout === 'compact') return <CompactListSection cat={cat} />;
  if (regularLinksLayout === 'hq') return <HQDashboardSection cat={cat} borderStyle={hqDashBorderStyle} />;

  return (
    <section id={cat.id} className="scroll-mt-32 max-w-[1400px] mx-auto w-full">
      <div className="flex items-center gap-4 mb-8 px-2 pb-4 relative">
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
        <div className="bg-primary/10 text-primary p-3 rounded-xl border border-primary/20">
          <NavVisual item={cat} size={24} className="text-primary" imageClassName="h-6 w-6 object-contain" />
        </div>
        <h2 className="text-2xl font-bold text-theme tracking-wide">{cat.label}</h2>
      </div>
      {cat.children.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {cat.children.map((card) => {
            const uid = `${cat.id}-${card.id}`;
            return (
              <FlipCard
                key={card.id}
                id={uid}
                title={card.title || card.label}
                icon={card.icon}
                iconUrl={card.iconUrl}
                subLinks={card.subLinks}
                url={card.url}
                isFlipped={flippedCardId === uid}
                onFlip={onFlip}
                borderStyle={flipCardBorderStyle}
              />
            );
          })}
        </div>
      ) : (
        <div className="w-full bg-gradient-to-br from-theme-card-hover to-theme-card border border-dashed border-theme-subtle rounded-3xl h-64 flex flex-col items-center justify-center text-theme-muted">
          <div className="bg-theme-elevated border border-theme-subtle p-5 rounded-2xl mb-4">
            <ImageIcon size={40} className="opacity-30 text-theme-muted" />
          </div>
          <p className="text-xl font-medium text-theme-muted">התוכן טרם הוזן</p>
        </div>
      )}
    </section>
  );
}
