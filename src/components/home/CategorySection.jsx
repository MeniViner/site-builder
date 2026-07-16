import { ChevronLeft, ExternalLink, FolderOpen, Undo2 } from 'lucide-react';
import NavVisual from '../NavVisual';
import { panelStyle } from '../../utils/borderStyles';
import { getLinkTargetAttributes, openLinkTarget } from '../../utils/linkTargets';
import { getNavigationNodeModel } from '../../utils/navigationModel';

function OpenTargetAction({ node, label = 'פתח קישור', compact = false, className = '' }) {
  const model = getNavigationNodeModel(node);
  if (!model.canOpen) return null;

  return (
    <a
      {...getLinkTargetAttributes(model.url)}
      onClick={(event) => event.stopPropagation()}
      className={`${compact ? 'min-h-10 px-2.5 text-[11px]' : 'min-h-10 px-3 text-xs'} inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 font-bold text-primary transition-[background-color,transform] hover:bg-primary/20 active:scale-[0.96] ${className}`}
    >
      <ExternalLink size={compact ? 12 : 14} />
      <span>{label}</span>
    </a>
  );
}

function NavigationChildLinks({ links, className = '' }) {
  if (!links.length) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {links.map((link, index) => {
        const model = getNavigationNodeModel(link);
        const content = (
          <>
            <NavVisual item={link} size={13} className="shrink-0 text-theme-muted" imageClassName="h-[13px] w-[13px] object-contain shrink-0" />
            <span>{link.label || link.title}</span>
            {model.canOpen && <ExternalLink size={10} className="shrink-0 opacity-70" />}
          </>
        );
        const sharedClassName = 'inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-theme-elevated px-3 py-2 text-xs font-medium text-theme-muted transition-[background-color,color,transform] hover:bg-primary/10 hover:text-primary active:scale-[0.96]';
        const key = link.id || `${link.label || link.title || 'link'}-${index}`;

        return model.canOpen ? (
          <a key={key} {...getLinkTargetAttributes(model.url)} className={sharedClassName}>{content}</a>
        ) : (
          <span key={key} className={sharedClassName}>{content}</span>
        );
      })}
    </div>
  );
}

function CategoryHeader({ cat, compact = false }) {
  return (
    <div className={`relative flex items-center gap-4 px-2 pb-4 ${compact ? 'mb-4' : 'mb-8'}`}>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-primary/50 via-primary/20 to-transparent" />
      <div className={`${compact ? 'p-2.5' : 'p-3'} rounded-xl border border-primary/20 bg-primary/10 text-primary`}>
        <NavVisual item={cat} size={compact ? 20 : 24} className="text-primary" imageClassName={`${compact ? 'h-5 w-5' : 'h-6 w-6'} object-contain`} />
      </div>
      <h2 className={`${compact ? 'text-xl' : 'text-2xl'} flex-1 font-bold tracking-wide text-theme [text-wrap:balance]`}>{cat.label}</h2>
      <OpenTargetAction node={cat} label={getNavigationNodeModel(cat).canExplore ? 'פתח יעד תיקייה' : 'פתח קישור'} compact={compact} />
    </div>
  );
}

function EmptyOrDirectCategory({ cat, borderStyle = 'standard' }) {
  const model = getNavigationNodeModel(cat);
  if (model.canOpen) {
    return (
      <a
        {...getLinkTargetAttributes(model.url)}
        className="group flex min-h-40 w-full flex-col items-center justify-center rounded-3xl bg-gradient-to-br from-theme-card-hover to-theme-card p-6 text-center transition-[background-color,box-shadow,transform] hover:bg-primary/5 hover:shadow-xl active:scale-[0.98]"
        style={panelStyle(borderStyle, 16)}
      >
        <div className="mb-4 rounded-2xl bg-primary/10 p-4 text-primary">
          <NavVisual item={cat} size={32} className="text-primary" imageClassName="h-8 w-8 object-contain" />
        </div>
        <span className="text-lg font-bold text-theme">{cat.label}</span>
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-theme-muted group-hover:text-primary">
          פתיחת הקישור <ExternalLink size={14} />
        </span>
      </a>
    );
  }

  return (
    <div className="flex h-52 w-full flex-col items-center justify-center rounded-3xl border border-dashed border-theme-subtle bg-gradient-to-br from-theme-card-hover to-theme-card text-theme-muted">
      <div className="mb-4 rounded-2xl bg-theme-elevated p-5">
        <FolderOpen size={40} className="text-theme-muted opacity-50" />
      </div>
      <p className="text-lg font-medium text-theme-muted">התיקייה ריקה</p>
    </div>
  );
}

export function FlipCard({ id, title, icon: iconName, iconUrl = '', subLinks = [], url, kind, isFlipped, onFlip, borderStyle = 'standard' }) {
  const node = { id, title, icon: iconName, iconUrl, subLinks, url, kind };
  const model = getNavigationNodeModel(node);
  const handleCardClick = () => {
    if (model.canExplore) {
      onFlip(isFlipped ? null : id);
      return;
    }
    if (model.canOpen) openLinkTarget(model.url);
  };
  const handleClose = (event) => {
    event.stopPropagation();
    onFlip(null);
  };
  const cardFrameStyle = panelStyle(borderStyle, 12);

  return (
    <div className="group relative h-56 w-full cursor-pointer [perspective:1000px]" onClick={handleCardClick} data-navigation-card={id}>
      <div className={`h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden rounded-xl border border-theme-subtle bg-gradient-to-br from-theme-card-hover to-theme-card p-6 text-theme shadow-sm transition-[border-color,box-shadow] group-hover:border-primary/50 group-hover:shadow-[0_0_20px_var(--color-primary-900)] [backface-visibility:hidden]"
          style={cardFrameStyle}
        >
          <div className="mb-4 rounded-xl border border-theme-subtle bg-theme-elevated p-4 text-primary transition-transform duration-300 group-hover:scale-110">
            <NavVisual icon={iconName} iconUrl={iconUrl} size={36} className="text-primary" imageClassName="h-9 w-9 object-contain" />
          </div>
          <h3 className="text-xl font-bold tracking-wide text-theme [text-wrap:balance]">{title}</h3>
          <div className="mt-4 flex items-center justify-center gap-1 text-xs font-medium uppercase tracking-wider text-theme-muted">
            <span>{model.canExplore ? 'לצפייה בתוכן' : (model.canOpen ? 'לפתיחה' : 'תיקייה ריקה')}</span>
            {model.canExplore && <ChevronLeft size={12} className="-rotate-90 text-theme-muted" aria-hidden />}
          </div>
          {model.isHybrid && <OpenTargetAction node={node} label="פתח יעד" compact className="absolute bottom-3 left-3" />}
        </div>
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-xl border border-theme-subtle bg-gradient-to-br from-theme-card-hover to-theme-card p-5 text-theme shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
          style={cardFrameStyle}
        >
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-theme-subtle pb-3">
            <h3 className="min-w-0 flex-1 truncate text-base font-bold text-theme">{title}</h3>
            {model.canOpen && <OpenTargetAction node={node} label="פתח" compact />}
            <button type="button" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg bg-theme-elevated text-theme-muted transition-[background-color,color,transform] hover:text-primary active:scale-[0.96]" onClick={handleClose} aria-label="סגור">
              <Undo2 size={16} />
            </button>
          </div>
          {model.children.length > 0 ? (
            <NavigationChildLinks links={model.children} className="flex-1 content-center overflow-y-auto" />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-theme-muted">התיקייה ריקה</div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactListSection({ cat }) {
  const model = getNavigationNodeModel(cat);
  return (
    <section id={cat.id} className="mx-auto w-full max-w-[1400px] scroll-mt-32" data-navigation-layout="compact">
      <CategoryHeader cat={cat} compact />
      {model.children.length > 0 ? (
        <div className="space-y-2">
          {model.children.map((card) => {
            const cardModel = getNavigationNodeModel(card);
            return (
              <div key={card.id} className="rounded-xl bg-theme-card px-4 py-3 shadow-sm ring-1 ring-theme-subtle">
                <div className="flex min-h-10 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-theme-elevated text-theme-muted">
                    <NavVisual item={card} size={16} className="text-theme-muted" imageClassName="h-4 w-4 object-contain" />
                  </div>
                  <span className="flex-1 text-sm font-medium text-theme">{card.title || card.label}</span>
                  <OpenTargetAction node={card} label="פתח" compact />
                </div>
                <NavigationChildLinks links={cardModel.children} className="mr-11 mt-2" />
              </div>
            );
          })}
        </div>
      ) : <EmptyOrDirectCategory cat={cat} />}
    </section>
  );
}

function HQDashboardSection({ cat, borderStyle = 'standard' }) {
  const model = getNavigationNodeModel(cat);
  return (
    <section id={cat.id} className="mx-auto w-full max-w-[1400px] scroll-mt-32" data-navigation-layout="hq">
      <CategoryHeader cat={cat} />
      {model.children.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {model.children.map((card) => {
            const cardModel = getNavigationNodeModel(card);
            return (
              <div key={card.id} className="group relative overflow-hidden border-r-2 border-primary/30 bg-gradient-to-l from-surface-card to-transparent p-5 transition-[background-color,border-color] hover:border-primary hover:bg-surface-card/80" style={panelStyle(borderStyle, 12)}>
                <div className="flex items-center gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-theme-subtle bg-theme-elevated text-primary">
                    <NavVisual item={card} size={24} className="text-primary" imageClassName="h-6 w-6 object-contain" />
                  </div>
                  <h3 className="min-w-0 flex-1 text-base font-bold text-theme [text-wrap:balance]">{card.title || card.label}</h3>
                  <OpenTargetAction node={card} label="פתח" compact />
                </div>
                <NavigationChildLinks links={cardModel.children} className="mr-16 mt-3" />
              </div>
            );
          })}
        </div>
      ) : <EmptyOrDirectCategory cat={cat} borderStyle={borderStyle} />}
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

  const model = getNavigationNodeModel(cat);
  return (
    <section id={cat.id} className="mx-auto w-full max-w-[1400px] scroll-mt-32" data-navigation-layout="grid">
      <CategoryHeader cat={cat} />
      {model.children.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {model.children.map((card) => {
            const uid = `${cat.id}-${card.id}`;
            return (
              <FlipCard
                key={card.id}
                id={uid}
                title={card.title || card.label}
                icon={card.icon}
                iconUrl={card.iconUrl}
                subLinks={getNavigationNodeModel(card).children}
                url={getNavigationNodeModel(card).url}
                kind={getNavigationNodeModel(card).kind}
                isFlipped={flippedCardId === uid}
                onFlip={onFlip}
                borderStyle={flipCardBorderStyle}
              />
            );
          })}
        </div>
      ) : (
        <EmptyOrDirectCategory cat={cat} borderStyle={flipCardBorderStyle} />
      )}
    </section>
  );
}
