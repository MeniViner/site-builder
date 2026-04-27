import { useMemo, useState } from 'react';
import { Moon, Search, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import Tooltip from '../Tooltip';
import { isTacticalStyle, normalizeBorderStyle, panelStyle, tacticalClip } from '../../utils/borderStyles';
import { SHAREPOINT_PATHS } from '../../config/sharepointPaths';

function buildSharePointSearchUrl(searchQuery) {
  const query = String(searchQuery || '').trim();
  if (!query) return '';
  const host = SHAREPOINT_PATHS.host || 'portal.army.idf';
  const siteCode = SHAREPOINT_PATHS.siteCode || 'bihs7134';
  return `https://${host}/sites/${siteCode}/Shared%20Documents/Forms/AllItems.aspx?view=7&q=${encodeURIComponent(query)}`;
}

function SearchBar({ borderStyle }) {
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedStyle = normalizeBorderStyle(borderStyle);
  const isTactical = isTacticalStyle(normalizedStyle);
  const squareStyle = normalizedStyle === 'square' ? { borderRadius: '0px' } : undefined;
  const searchUrl = useMemo(() => buildSharePointSearchUrl(searchQuery), [searchQuery]);

  const handleSearch = () => {
    if (!searchUrl) return;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSearch();
    }
  };

  if (!isTactical) {
    return (
      <div className="relative flex items-center w-64 md:w-80 h-10 group" style={{ filter: 'drop-shadow(0 0 4px var(--color-primary-900))' }}>
        <div className="absolute inset-0 bg-primary-900 rounded-lg" style={squareStyle} />
        <div className="absolute inset-[1px] bg-theme-elevated rounded-[7px]" style={squareStyle} />
        <div className="absolute inset-[3px] rounded-[5px] transition-colors group-hover:brightness-110" style={{ backgroundColor: 'var(--color-primary-800)', ...(squareStyle || {}) }} />
        <div className="absolute inset-[4px] bg-theme-card flex items-center px-3 rounded-[4px]" style={squareStyle}>
          <Search
            size={22}
            className="shrink-0 cursor-pointer"
            style={{ color: 'var(--color-primary-800)' }}
            strokeWidth={2}
            onClick={handleSearch}
            aria-label="חפש במסמכי SharePoint"
          />
          <input
            type="text"
            placeholder="חיפוש באתר..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 w-full bg-transparent border-none outline-none text-theme placeholder-theme-muted text-sm font-medium mr-2"
          />
        </div>
      </div>
    );
  }

  const clip = (size) => tacticalClip(normalizedStyle, size);
  return (
    <div className="relative flex items-center w-64 md:w-80 h-10 group" style={{ filter: 'drop-shadow(0 0 4px var(--color-primary-900))' }}>
      <div className="absolute inset-0 bg-primary-900" style={{ clipPath: clip(12) }} />
      <div className="absolute inset-[1px] bg-theme-elevated" style={{ clipPath: clip(11) }} />
      <div className="absolute inset-[3px] transition-colors group-hover:brightness-110" style={{ clipPath: clip(9), backgroundColor: 'var(--color-primary-800)' }} />
      <div className="absolute inset-[4px] bg-theme-card flex items-center px-3" style={{ clipPath: clip(8) }}>
        <Search
          size={22}
          className="shrink-0 cursor-pointer"
          style={{ color: 'var(--color-primary-800)' }}
          strokeWidth={2}
          onClick={handleSearch}
          aria-label="חפש במסמכי SharePoint"
        />
        <input
          type="text"
          placeholder="חיפוש באתר..."
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 w-full bg-transparent border-none outline-none text-theme placeholder-theme-muted text-sm font-medium mr-2"
        />
      </div>
    </div>
  );
}

export default function NavigationBar({
  theme,
  hero,
  navItems,
  showNavCategories,
  onNavTo,
  onOpenAdmin,
  canOpenAdmin = false,
  topNavBorderStyle,
  searchBorderStyle,
  effectiveMode,
  toggleUserMode,
  getGreeting,
  userName,
  utilityLinks = [],
  onBrandClick,
}) {
  const location = useLocation();
  const handleBrandClick = typeof onBrandClick === 'function'
    ? onBrandClick
    : () => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <nav className="w-full px-8 py-6 flex items-center justify-between bg-theme-chrome backdrop-blur-md border-b border-theme-subtle sticky top-0 z-[100]">
      <div className="flex items-center gap-8 lg:gap-10">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={handleBrandClick}>
          <div className="font-bold text-xl relative shrink-0" style={{ color: theme?.primaryColor ?? '#dc2626' }}>
            {hero.siteName || 'שם האתר'}
            <div className="absolute -bottom-7 left-0 right-0 h-1 rounded-t-sm" style={{ backgroundColor: theme?.primaryColor ?? '#dc2626' }} />
          </div>
        </div>
        {showNavCategories && navItems.map((cat) => (
          <div key={cat.id} onClick={() => onNavTo(cat)} className="px-3 py-1.5 rounded-md text-theme-muted hover:text-theme hover:bg-theme-elevated transition font-medium cursor-pointer text-sm tracking-wide">
            {cat.label}
          </div>
        ))}
      </div>
      <div className="flex flex-row-reverse items-center gap-3">
        <SearchBar borderStyle={searchBorderStyle} />
        {utilityLinks.map((link) => {
          const isActive = link?.isActivePath ? location.pathname === link.isActivePath : location.pathname === link.to;
          return (
            <Link
              key={link.id || link.to}
              to={link.to}
              className={`border text-theme px-4 h-10 font-bold transition text-sm whitespace-nowrap inline-flex items-center ${isActive ? 'bg-primary/15 border-primary/35 text-primary-200' : 'bg-theme-elevated hover:brightness-110'}`}
              style={!isActive ? { ...panelStyle(topNavBorderStyle, 10), borderColor: theme?.primaryColor ?? '#dc2626' } : panelStyle(topNavBorderStyle, 10)}
            >
              <span className="max-w-[220px] truncate">{link.label}</span>
            </Link>
          );
        })}
        {canOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="border text-theme px-6 h-10 font-bold transition text-sm whitespace-nowrap hidden sm:block bg-theme-elevated hover:brightness-110"
            style={{ ...panelStyle(topNavBorderStyle, 10), borderColor: theme?.primaryColor ?? '#dc2626' }}
          >
            ניהול
          </button>
        )}
        {theme?.displayMode === 'user-toggle' && (
          <Tooltip text={effectiveMode === 'dark' ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}>
            <button
              onClick={toggleUserMode}
              className="flex items-center justify-center w-10 h-10 border border-theme-subtle bg-theme-elevated hover:brightness-110 transition text-theme-muted"
              style={panelStyle(topNavBorderStyle, 10)}
            >
              {effectiveMode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </Tooltip>
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
  );
}
