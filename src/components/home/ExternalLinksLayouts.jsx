import { useState } from 'react';
import { ExternalLink, Globe } from 'lucide-react';
import { DynamicIcon } from '../DynamicIcon';
import Tooltip from '../Tooltip';
import { panelStyle } from '../../utils/borderStyles';
import { resolveSiteImageUrl } from '../../utils/assetUrl';
import { getLinkTargetAttributes } from '../../utils/linkTargets';

function ExtLinkIcon({ icon, src, alt, size = 18, className = '' }) {
  const [failed, setFailed] = useState(false);
  const resolvedSrc = resolveSiteImageUrl(src);
  if (icon) {
    return <DynamicIcon name={icon} size={size} className={`text-theme-muted group-hover:text-primary transition ${className}`} />;
  }
  if (!resolvedSrc || failed) {
    return <Globe size={size} className={`text-theme-muted group-hover:text-primary transition ${className}`} />;
  }
  return (
    <img
      src={resolvedSrc}
      alt={alt ?? ''}
      className={`w-full h-full object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}

function ExternalLinkAnchor({ link, className = '', style, children }) {
  return (
    <a
      {...getLinkTargetAttributes(link?.url)}
      className={className}
      style={style}
    >
      {children}
    </a>
  );
}

export function ExtLinksCards({ links, compact, bordered = true, borderStyle = 'standard' }) {
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
          <ExternalLinkAnchor
            key={link.id}
            link={link}
            className={`group flex flex-col items-center gap-1.5 p-2.5 rounded-lg bg-theme-card ${cardBorder} hover:bg-primary/5 transition-all text-center shrink-0 overflow-hidden`}
            style={panelStyle(borderStyle, 10)}
          >
            <div className={`flex items-center justify-center ${iconWrap}`}>
              <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={18} />
            </div>
            <span className="text-[10px] font-medium text-theme-muted group-hover:text-theme transition truncate max-w-[64px]">{link.title}</span>
          </ExternalLinkAnchor>
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
          <ExternalLinkAnchor
            key={link.id}
            link={link}
            className={`group flex flex-col items-center gap-3 p-5 rounded-xl bg-theme-card ${cardBorder} hover:bg-primary/5 transition-all text-center overflow-hidden`}
            style={panelStyle(borderStyle, 12)}
          >
            <div className={`flex items-center justify-center ${iconWrapFull}`}>
              <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={24} />
            </div>
            <span className="text-sm font-medium text-theme-muted group-hover:text-theme transition truncate w-full">{link.title}</span>
          </ExternalLinkAnchor>
        ))}
      </div>
    </div>
  );
}

export function ExtLinksMinimal({ links, compact, bordered = true }) {
  const wrapCls = compact ? 'flex items-center gap-3 flex-nowrap' : 'max-w-[1400px] mx-auto px-6 lg:px-12 py-10 flex items-center justify-center gap-6 flex-wrap';
  const ringCls = bordered ? 'border border-theme-subtle hover:border-primary/40 bg-theme-elevated hover:bg-primary/10' : 'hover:bg-theme-elevated';
  const linkCls = compact
    ? `group relative w-10 h-10 rounded-full ${ringCls} flex items-center justify-center overflow-hidden transition-all hover:scale-110 shrink-0`
    : `group relative w-14 h-14 rounded-full ${ringCls} flex items-center justify-center overflow-hidden transition-all hover:scale-110`;

  return (
    <div className={wrapCls}>
      {links.map((link) => (
        <Tooltip key={link.id} text={link.title}>
          <ExternalLinkAnchor link={link} className={linkCls}>
            <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={compact ? 16 : 22} />
          </ExternalLinkAnchor>
        </Tooltip>
      ))}
    </div>
  );
}

export function ExtLinksFloating({ links, fixed: isFixed = true, bordered = true, showBackground = true, borderStyle = 'standard' }) {
  const barBorder = bordered && showBackground ? 'border border-theme-subtle' : '';
  const iconBg = bordered ? 'bg-theme-elevated' : '';
  const barBg = showBackground ? 'bg-theme-chrome backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.35)]' : '';
  const barShape = panelStyle(borderStyle, 12);

  const content = (
    <div className={`flex items-center gap-2 ${barBg} ${barBorder} rounded-full px-4 py-2.5 overflow-hidden`} style={barShape}>
      {links.map((link) => (
        <Tooltip key={link.id} text={link.title}>
          <ExternalLinkAnchor link={link} className="group relative flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-theme-card-hover transition-all">
            <div className={`w-6 h-6 rounded-full ${iconBg} flex items-center justify-center overflow-hidden shrink-0`}>
              <ExtLinkIcon icon={link.icon} src={link.iconUrl || link.image} alt={link.title} size={14} className="!p-0" />
            </div>
            <span className="text-xs font-medium text-theme-muted group-hover:text-theme transition hidden sm:inline max-w-[80px] truncate">{link.title}</span>
          </ExternalLinkAnchor>
        </Tooltip>
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
