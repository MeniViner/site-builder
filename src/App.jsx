import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import AdminHub from './components/AdminHub';
import RightSidebarNav from './components/RightSidebarNav';
import CategorySection from './components/home/CategorySection';
import { CommanderPanel, WidgetSection } from './components/home/PortalPanels';
import NavigationBar from './components/home/NavigationBar';
import HeroSection from './components/home/HeroSection';
import OverlayImageElement from './components/home/OverlayImageElement';
import { ExtLinksCards, ExtLinksFloating, ExtLinksMinimal } from './components/home/ExternalLinksLayouts';
import SharePointPermissionsSetupStatus from './components/SharePointPermissionsSetupStatus';
import { getWidgetTitle } from './components/WidgetPanelContent';
import NotFoundPage from './components/NotFoundPage';
import { useNavigation } from './context/NavigationContext';
import { useAuth } from './context/AuthContext';
import { useSiteContent } from './context/SiteContentContext';
import { useTheme } from './context/ThemeContext';
import { useExternalLinks } from './context/ExternalLinksContext';
import { useOrgChart } from './context/OrgChartContext';
import { normalizeBorderStyle, panelStyle } from './utils/borderStyles';
import { normalizeOverlayImageConfig } from './utils/overlayImageConfig';
import { resolveSiteImageUrl } from './utils/assetUrl';
import { ALPHA_TEAM_CONFIG, APP_VERSION, getAlphaTeamLinks } from './config/alphaTeam.config';
import OrgChartPage from './pages/OrgChartPage';
import AdminSharePointSetupPage from './pages/AdminSharePointSetupPage';
import 'react-toastify/dist/ReactToastify.css';

export function Home({ isPreview = false }) {
  const navigate = useNavigate();
  const onOpenAdmin = () => navigate('/admin');
  const [bgIndex, setBgIndex] = useState(0);
  const [flippedCardId, setFlippedCardId] = useState(null);

  const { navItems, loading } = useNavigation();
  const { currentUser, isAdmin, loading: authLoading } = useAuth();
  const { siteContent } = useSiteContent();
  const { theme, effectiveMode, toggleUserMode, borderTargets } = useTheme();
  const { externalLinks } = useExternalLinks();
  const { orgChart } = useOrgChart();
  const [widgetTitle, setWidgetTitle] = useState(() => getWidgetTitle('events'));

  const hero = siteContent?.hero || { title: '', subtitle: '', description: '', backgroundImages: [] };
  const commander = siteContent?.commander || { image: '', sectionTitle: '', roleLabel: '', messages: [] };
  const overlayImage = normalizeOverlayImageConfig(siteContent?.overlayImage);
  const messages = commander.messages || [];
  const backgrounds = (hero.backgroundImages || []).filter(Boolean).map((path) => resolveSiteImageUrl(path));
  const showOverlayImage = overlayImage.enabled && Boolean(overlayImage.imageUrl);
  const heroGrayscale = theme?.heroGrayscale ?? false;
  const showNavCategories = theme?.showNavCategories ?? true;
  const borderStyle = normalizeBorderStyle(theme?.borderStyle || 'cyber');
  const regularLinksLayout = theme?.regularLinksLayout || 'grid';
  const externalLinksLayout = theme?.externalLinksLayout || 'cards';
  const externalLinksFixed = theme?.externalLinksFixed ?? false;
  const externalLinksBordered = theme?.externalLinksBordered !== false;
  const externalLinksShowBackground = theme?.externalLinksShowBackground !== false;
  const heroGlassEffect = theme?.heroGlassEffect === true;
  const heroGlassStrength = Number.isFinite(Number(theme?.heroGlassStrength))
    ? Math.max(0, Math.min(100, Math.round(Number(theme.heroGlassStrength))))
    : 58;
  const commanderPanelBordered = theme?.commanderPanelBordered !== false;
  const widgetPanelBordered = theme?.widgetPanelBordered !== false;
  const commanderBorderStyle = borderTargets?.commander ? borderStyle : 'standard';
  const widgetBorderStyle = borderTargets?.widget ? borderStyle : 'standard';
  const searchBorderStyle = borderTargets?.search ? borderStyle : 'standard';
  const topNavBorderStyle = borderTargets?.topNav ? borderStyle : 'standard';
  const flipCardBorderStyle = borderTargets?.flipCards ? borderStyle : 'standard';
  const hqDashBorderStyle = borderTargets?.hqDash ? borderStyle : 'standard';
  const extLinksBorderStyle = borderTargets?.extLinks ? borderStyle : 'standard';
  const utilityLinks = orgChart?.enabled
    ? [{ id: 'org-chart', label: orgChart.pageTitle || 'עץ מבנה', to: '/org-chart' }]
    : [];
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
    const timer = setInterval(() => setBgIndex((prev) => (prev + 1) % backgrounds.length), 3000);
    return () => clearInterval(timer);
  }, [backgrounds.length]);

  const handleNavTo = (cat) => {
    if ((cat.isDirectLink && cat.url) || cat.url) {
      window.open(cat.url, '_blank', 'noopener,noreferrer');
      return;
    }
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

  const filteredCats = navItems.filter((c) => c.children && c.children.length > 0 && !c.isDirectLink && !c.url);

  const renderExternalLinks = () => {
    if (!externalLinks || externalLinks.length === 0) return null;
    const footerCls = 'relative z-10 w-full border-t border-theme-subtle bg-theme-card';
    if (externalLinksFixed) return null;
    if (externalLinksLayout === 'minimal') return <footer className={footerCls}><ExtLinksMinimal links={externalLinks} bordered={externalLinksBordered} /></footer>;
    if (externalLinksLayout === 'floating') return <footer className={footerCls}><ExtLinksFloating links={externalLinks} fixed={false} bordered={externalLinksBordered} showBackground={externalLinksShowBackground} borderStyle={extLinksBorderStyle} /></footer>;
    return <footer className={footerCls}><ExtLinksCards links={externalLinks} bordered={externalLinksBordered} borderStyle={extLinksBorderStyle} /></footer>;
  };
  const alphaTeamLinks = getAlphaTeamLinks();
  const heroGlassBlur = 10 + (heroGlassStrength * 0.36);
  const heroGlassBackgroundAlpha = 0.04 + (heroGlassStrength * 0.0018);
  const heroGlassBorderAlpha = 0.12 + (heroGlassStrength * 0.0013);

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
        <NavigationBar
          theme={theme}
          hero={hero}
          navItems={navItems}
          showNavCategories={showNavCategories}
          onNavTo={handleNavTo}
          onOpenAdmin={onOpenAdmin}
          canOpenAdmin={isAdmin && !authLoading}
          topNavBorderStyle={topNavBorderStyle}
          searchBorderStyle={searchBorderStyle}
          effectiveMode={effectiveMode}
          toggleUserMode={toggleUserMode}
          getGreeting={getGreeting}
          userName={userName}
          utilityLinks={utilityLinks}
        />

        <main data-widget-title={widgetTitle} className="w-full relative h-[calc(100vh-80px)] min-h-[calc(100vh-80px)] max-h-[calc(100vh-80px)] flex flex-col justify-between overflow-hidden pt-4 [@media(max-height:850px)]:pt-2 lg:pt-8 xl:pt-12">
          {heroGlassEffect && (
            <div
              className="pointer-events-none absolute inset-x-3 top-3 bottom-4 z-[1] rounded-[28px] border shadow-[0_24px_80px_rgba(0,0,0,0.28)] sm:inset-x-6 lg:inset-x-10 xl:inset-x-20"
              style={{
                borderColor: `rgba(255,255,255,${heroGlassBorderAlpha.toFixed(3)})`,
                backgroundColor: `rgba(255,255,255,${heroGlassBackgroundAlpha.toFixed(3)})`,
                backdropFilter: `saturate(140%) blur(${heroGlassBlur.toFixed(1)}px)`,
                WebkitBackdropFilter: `saturate(140%) blur(${heroGlassBlur.toFixed(1)}px)`,
              }}
              aria-hidden="true"
            />
          )}
          <HeroSection
            hero={hero}
            logoSrc={siteContent?.hero?.logo || '/images/gift.svg'}
            renderHeroTitle={renderHeroTitle}
            renderDescription={renderDescription}
            showOverlayImage={showOverlayImage}
            overlayImage={overlayImage}
            isPreview={isPreview}
          />

          <div className="w-full px-8 lg:px-12 xl:px-24 pb-6 lg:pb-10 xl:pb-12 flex flex-col lg:flex-row items-end justify-between gap-6 lg:gap-6 xl:gap-10 pointer-events-auto z-30 mt-auto">
            <CommanderPanel
              commander={commander}
              messages={messages}
              borderStyle={commanderBorderStyle}
              bordered={commanderPanelBordered}
            />

            <WidgetSection
              borderStyle={widgetBorderStyle}
              widgetHeight={getWidgetHeight(theme?.widgetHeight)}
              onWidgetTitleChange={setWidgetTitle}
              showBorder={widgetPanelBordered}
              showBackground={widgetPanelBordered}
              showShadow={widgetPanelBordered}
            />
          </div>

          {showOverlayImage && overlayImage.displayArea === 'hero-full' && (
            <OverlayImageElement overlayImage={overlayImage} isPreview={isPreview} />
          )}
        </main>

        {regularLinksLayout !== 'sidebar-right' && (
          <div className="relative z-10 w-full mt-[10vh] pb-24 px-6 lg:px-12 flex flex-col gap-16 bg-theme-bg-base/90 backdrop-blur-xl border-t border-theme-strong pt-16">
            {loading ? (
              <div className="w-full h-64 flex items-center justify-center text-theme-muted">טוען קטגוריות...</div>
            ) : filteredCats.map((cat) => (
              <CategorySection
                key={cat.id}
                cat={cat}
                regularLinksLayout={regularLinksLayout}
                hqDashBorderStyle={hqDashBorderStyle}
                flipCardBorderStyle={flipCardBorderStyle}
                flippedCardId={flippedCardId}
                onFlip={handleFlip}
              />
            ))}
          </div>
        )}

        {!externalLinksFixed && renderExternalLinks()}

        <div className="relative z-10 border-t border-theme-subtle py-4 text-center bg-theme-bg-base flex items-center justify-center min-h-[64px]">
          <p className="text-xs text-theme-muted text-gray-900 dark:text-gray-100 truncate leading-tight"> מתנ"ה - siteBuilder {APP_VERSION}©</p>

          {/* Alpha Team Watermark */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[100] opacity-90 hover:opacity-100 transition-opacity select-none rounded-xl border border-blue-100 dark:border-blue-900/30 bg-[#f4f7fb] dark:bg-blue-900/10 flex items-center gap-3 pr-2 pl-4 py-1.5 shadow-sm">
            <img
              src={resolveSiteImageUrl(ALPHA_TEAM_CONFIG.logoPath)}
              alt="Alpha logo"
              className="h-10 object-contain shrink-0"
              loading="lazy"
            />
            <div className="min-w-0 flex-1 text-right">
              <div className="flex items-center gap-1.5 text-[13px] font-bold text-gray-900 dark:text-gray-100">
                {alphaTeamLinks.length > 0 ? (
                  alphaTeamLinks.map((link, index) => (
                    <React.Fragment key={link.key}>
                      {index > 0 && <span className="text-gray-300 dark:text-gray-600">|</span>}
                      <a href={link.href} className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors" target={link.key === 'site' ? '_blank' : undefined} rel={link.key === 'site' ? 'noopener noreferrer' : undefined}>
                        {link.label}
                      </a>
                    </React.Fragment>
                  ))
                ) : (
                  <span>{ALPHA_TEAM_CONFIG.nameHe}</span>
                )}
              </div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate leading-tight mt-0.5">
                {alphaTeamLinks.length > 0 ? 'פרטי קשר / אתר הפרוייקט' : ALPHA_TEAM_CONFIG.nameEn}
              </p>
            </div>
          </div>
        </div>
      </div>

      {regularLinksLayout === 'sidebar-right' && <RightSidebarNav />}

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

      {showOverlayImage && overlayImage.displayArea === 'fixed-site' && (
        <OverlayImageElement overlayImage={overlayImage} isPreview={isPreview} />
      )}
    </div>
  );
}

function AdminRoute() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen w-full flex items-center justify-center bg-[#0c0d12] text-white font-heebo">
        טוען הרשאות...
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <AdminHub />;
}

export default function App() {
  const { effectiveMode } = useTheme();
  const { siteContent } = useSiteContent();

  useEffect(() => {
    const siteName = siteContent?.hero?.siteName?.trim() || 'אלפא';
    document.title = `ניהול ידע | ${siteName}`;

    const faviconHref = resolveSiteImageUrl(siteContent?.hero?.logo || '/images/gift.svg');
    let faviconEl = document.querySelector('link[data-app-favicon="true"]');

    if (!faviconEl) {
      faviconEl = document.createElement('link');
      faviconEl.setAttribute('rel', 'icon');
      faviconEl.setAttribute('data-app-favicon', 'true');
      document.head.appendChild(faviconEl);
    }

    faviconEl.setAttribute('href', faviconHref);
  }, [siteContent?.hero?.logo, siteContent?.hero?.siteName]);

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/org-chart" element={<OrgChartPage />} />
        <Route path="/admin/sharepoint-setup" element={<AdminSharePointSetupPage />} />
        <Route path="/admin/*" element={<AdminRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <ToastContainer
        position="top-center"
        rtl
        theme={effectiveMode === 'dark' ? 'dark' : 'light'}
        autoClose={4000}
        closeButton
      />
      <SharePointPermissionsSetupStatus />
    </>
  );
}
