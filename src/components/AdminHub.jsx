import React, { useEffect, useRef, useState } from 'react';
import {
    Undo2, Menu, Save, FileText, Link as LinkIcon,
    LayoutGrid, Palette, ExternalLink, Sun, Moon, Users, ShieldCheck, ChevronDown, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AdminEvents from './AdminEvents';
import AdminNavigation from './AdminNavigation';
import AdminSiteContent from './AdminSiteContent';
import AdminWidgets from './AdminWidgets';
import AdminCurrentWidgets from './AdminCurrentWidgets';
import AdminTheme from './AdminTheme';
import AdminExternalLinks from './AdminExternalLinks';
import AdminOutstanding from './AdminOutstanding';
import AdminCountdown from './AdminCountdown';
import AdminNews from './AdminNews';
import AdminAlerts from './AdminAlerts';
import AdminPhonebook from './AdminPhonebook';
import AdminShuttles from './AdminShuttles';
import AdminPolls from './AdminPolls';
import AdminCelebrations from './AdminCelebrations';
import AdminHeritage from './AdminHeritage';
import AdminTips from './AdminTips';
import AdminOrgChart from './AdminOrgChart';
import AdminAIHelp from './AdminAIHelp';
import AdminSiteOwnersManagement from './AdminSiteOwnersManagement';
import AdminAdminsSync from './AdminAdminsSync';
import AdminBackupManagement from './AdminBackupManagement';
import WidgetLivePreview from './WidgetLivePreview';
import Tooltip from './Tooltip';
import NotFoundPage from './NotFoundPage';
import { useWidget } from '../context/WidgetContext';
import { useTheme } from '../context/ThemeContext';
import { UI_FEATURES } from '../config/uiFeatures.config';
import { resolveSiteImageUrl } from '../utils/assetUrl';
import { ALPHA_TEAM_CONFIG, APP_VERSION } from '../config/alphaTeam.config';

const ADMIN_SECTION_STORAGE_KEY = 'siteBuilder.adminHub.openSections.v1';
const ADMIN_LAST_PATH_STORAGE_KEY = 'siteBuilder.adminHub.lastPath.v1';
const DEFAULT_SECTION_OPEN = {
    content: true,
    system: false,
    maintenance: false,
};

const ADMIN_SECTION_BY_TAB = {
    info: 'content',
    links: 'content',
    'org-chart': 'content',
    'external-links': 'content',
    widgets: 'content',
    'current-widgets': 'content',
    theme: 'system',
    'ai-help': 'system',
    admins: 'maintenance',
    'site-owners': 'maintenance',
    backups: 'maintenance',
};

function readStoredOpenSections() {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(ADMIN_SECTION_STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return DEFAULT_SECTION_OPEN;
        return {
            ...DEFAULT_SECTION_OPEN,
            content: Boolean(parsed.content ?? DEFAULT_SECTION_OPEN.content),
            system: Boolean(parsed.system ?? DEFAULT_SECTION_OPEN.system),
            maintenance: Boolean(parsed.maintenance ?? DEFAULT_SECTION_OPEN.maintenance),
        };
    } catch {
        return DEFAULT_SECTION_OPEN;
    }
}

function SidebarButton({ icon, label, isActive, onClick, isSidebarOpen, title }) {
    const IconComponent = icon;

    return (
        <Tooltip text={title || label} wrapperClassName="block w-full">
            <button
                onClick={onClick}
                className={[
                    // בסיס ופריסה
                    'w-full flex items-center transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
                    isSidebarOpen ? 'justify-start gap-3 px-4 py-2.5' : 'justify-center px-2 py-3',

                    // לוגיקת עיצוב לפי מצב פעיל/לא פעיל
                    isActive
                        ? 'bg-[#f4f7fb] text-[#1a365d] border-r-4 border-[#1a365d] rounded-l-lg rounded-r-md dark:bg-slate-800 dark:text-white dark:border-blue-400 font-bold'
                        : 'border-r-4 border-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg font-medium',
                ].join(' ')}
            >
                <IconComponent
                    size={isSidebarOpen ? 18 : 24}
                    className={isActive ? 'text-[#1a365d] dark:text-white' : 'text-gray-500 dark:text-gray-400'} 
                />
                {isSidebarOpen && <span className="whitespace-nowrap text-sm">{label}</span>}
            </button>
        </Tooltip>
    );
}
function AlphaTeamAdminBanner({ isSidebarOpen }) {
    if (!isSidebarOpen) {
        return (
            <div className="flex justify-center mt-2">
                <img
                    src={resolveSiteImageUrl(ALPHA_TEAM_CONFIG.logoPath)}
                    alt="Alpha logo"
                    className="w-10 h-10 object-contain shrink-0"
                    loading="lazy"
                />
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-blue-100 dark:border-blue-900/30 bg-[#f4f7fb] dark:bg-blue-900/10 flex items-center gap-3 mt-1">
            <img
                src={resolveSiteImageUrl(ALPHA_TEAM_CONFIG.logoPath)}
                alt="Alpha logo"
                className="h-14 object-contain shrink-0"
                loading="lazy"
            />
            <div className="min-w-0 flex-1 text-right">
                <p className="text-[13px] font-bold text-gray-900 dark:text-gray-100 truncate">{ALPHA_TEAM_CONFIG.nameHe}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{ALPHA_TEAM_CONFIG.nameEn}</p>
            </div>
        </div>
    );
}

export default function AdminHub() {
    const showAiUi = UI_FEATURES.showAiUi;
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const lastJumpKeyRef = useRef(null);
    const { widgetConfig } = useWidget();
    const { effectiveMode, toggleAdminMode } = useTheme();

    const activeWidgets = Array.isArray(widgetConfig?.activeWidgets) && widgetConfig.activeWidgets.length > 0
        ? widgetConfig.activeWidgets.slice(0, 3)
        : [widgetConfig?.activeWidget || 'events'];
    const primaryWidget = activeWidgets[0] || 'events';
    const isLightMode = effectiveMode === 'light';
    const [sectionOpen, setSectionOpen] = useState(() => readStoredOpenSections());

    const toggleSection = (sectionKey) => {
        setSectionOpen((prev) => ({
            ...prev,
            [sectionKey]: !prev[sectionKey],
        }));
    };

    const navigateAdmin = (path) => {
        try {
            window.localStorage.setItem(ADMIN_LAST_PATH_STORAGE_KEY, path);
        } catch {
            // Local UI state is best-effort only.
        }
        navigate(path);
    };

    const getActiveTab = () => {
        const path = location.pathname;
        if (path.includes('/admin/links')) return 'links';
        if (path.includes('/admin/events')) return 'events';
        if (path.includes('/admin/widgets')) return 'widgets';
        if (path.includes('/admin/current-widgets')) return 'current-widgets';
        if (path.includes('/admin/theme')) return 'theme';
        if (path.includes('/admin/external-links')) return 'external-links';
        if (showAiUi && path.includes('/admin/ai-help')) return 'ai-help';
        if (path.includes('/admin/admins')) return 'admins';
        if (path.includes('/admin/site-owners')) return 'site-owners';
        if (path.includes('/admin/backups')) return 'backups';
        if (path.includes('/admin/org-chart')) return 'org-chart';
        if (path.includes('/admin/outstanding')) return 'outstanding';
        if (path.includes('/admin/countdown')) return 'countdown';
        if (path.includes('/admin/news')) return 'news';
        if (path.includes('/admin/alerts')) return 'alerts';
        if (path.includes('/admin/phonebook')) return 'phonebook';
        if (path.includes('/admin/shuttles')) return 'shuttles';
        if (path.includes('/admin/polls')) return 'polls';
        if (path.includes('/admin/celebrations')) return 'celebrations';
        if (path.includes('/admin/heritage')) return 'heritage';
        if (path.includes('/admin/tips')) return 'tips';
        return 'info';
    };

    const activeTab = getActiveTab();

    const jumpToThemeTab = location.state?.jumpToThemeTab;

    useEffect(() => {
        try {
            window.localStorage.setItem(ADMIN_SECTION_STORAGE_KEY, JSON.stringify(sectionOpen));
        } catch {
            // Local UI state is best-effort only.
        }
    }, [sectionOpen]);

    useEffect(() => {
        const sectionKey = ADMIN_SECTION_BY_TAB[activeTab];
        if (!sectionKey) return;
        setSectionOpen((prev) => (prev[sectionKey] ? prev : { ...prev, [sectionKey]: true }));
    }, [activeTab]);

    useEffect(() => {
        if (!location.pathname.startsWith('/admin')) return;
        if (location.pathname === '/admin' && jumpToThemeTab === 'displayMode') return;
        if (location.pathname === '/admin') return;

        const lastPath = `${location.pathname}${location.search || ''}`;
        try {
            window.localStorage.setItem(ADMIN_LAST_PATH_STORAGE_KEY, lastPath);
        } catch {
            // Local UI state is best-effort only.
        }
    }, [jumpToThemeTab, location.pathname, location.search]);

    useEffect(() => {
        if (location.pathname !== '/admin') return;
        if (jumpToThemeTab === 'displayMode') return;

        try {
            const lastPath = window.localStorage.getItem(ADMIN_LAST_PATH_STORAGE_KEY);
            if (lastPath && lastPath !== '/admin' && lastPath.startsWith('/admin/')) {
                navigate(lastPath, { replace: true });
            }
        } catch {
            // First-time users keep the default /admin page.
        }
    }, [jumpToThemeTab, location.pathname, navigate]);

    useEffect(() => {
        if (location.pathname !== '/admin') return;
        if (jumpToThemeTab !== 'displayMode') return;
        if (location.key === lastJumpKeyRef.current) return;
        lastJumpKeyRef.current = location.key;

        // "בסוף" (אחרי ניהול המידע) -> עיצוב האתר > מצב תצוגה
        const t = window.setTimeout(() => {
            navigate('/admin/theme?tab=displayMode', { replace: true });
        }, 650);

        return () => window.clearTimeout(t);
    }, [jumpToThemeTab, location.key, location.pathname, navigate]);

    // Determine the key for the current dynamic widget page
    const widgetPageKeys = ['events', 'alerts', 'outstanding', 'countdown', 'news', 'phonebook', 'shuttles', 'polls', 'celebrations', 'heritage', 'tips'];
    const isOnWidgetPage = widgetPageKeys.includes(activeTab);
    const previewActiveWidget = isOnWidgetPage ? activeTab : primaryWidget;

    return (
        <div dir="rtl" className="flex h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo overflow-hidden">
            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-72' : 'w-20'} bg-white dark:bg-[#232733] border-l border-gray-200 dark:border-white/10 flex flex-col transition-all duration-300 z-50 shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(0,0,0,0.5)]`}>
                <div className="flex items-center  p-6 border-b border-gray-200 dark:border-white/5 h-20 shrink-0">
                    {isSidebarOpen ? (
                        <>
                            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition shrink-0 ml-1 p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">
                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="w-7 h-7 text-gray-500 dark:text-gray-300" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4.40347 3.90332L2.98926 5.31753L6.17124 8.49951L2.98926 11.6815L4.40347 13.0957L8.99967 8.49951L4.40347 3.90332ZM20.9997 19.9995V17.9995H2.99967V19.9995H20.9997ZM20.9997 12.9995V10.9995H11.9997V12.9995H20.9997ZM20.9997 5.99951V3.99951H11.9997V5.99951H20.9997Z"></path>
                                </svg>
                            </button>
                            <div className="flex items-center gap-2 mr-1">
                                <img
                                    src={resolveSiteImageUrl("/images/giftFull.svg")}
                                    alt="Logo"
                                    className="h-10 object-contain shrink-0"
                                    loading="lazy"
                                />
                                <span className="text-[20px] mr-1 font-extrabold text-[#334155] dark:text-gray-100 whitespace-nowrap"> | </span>
                                <span className="text-[20px] mr-1 font-extrabold text-[#334155] dark:text-gray-100 whitespace-nowrap"> ניהול</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center mx-auto">
                            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition p-1 hover:bg-gray-100 dark:hover:bg-white/5 rounded-lg">
                                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="w-7 h-7 text-gray-500 dark:text-gray-300" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M20.5956 3.90332L15.9994 8.49951L20.5956 13.0957L22.0098 11.6815L18.8278 8.49951L22.0098 5.31753L20.5956 3.90332ZM21 19.9995V17.9995H3V19.9995H21ZM12 12.9995V10.9995H3V12.9995H12ZM12 5.99951V3.99951H3V5.99951H12Z"></path>
                                </svg>
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
                    {isSidebarOpen && (
                        <button
                            type="button"
                            onClick={() => toggleSection('content')}
                            className="w-full flex items-center justify-between text-sm font-extrabold text-[#0f172a] dark:text-gray-200 px-4 py-2.5 mb-1 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition rounded-lg"
                        >
                            <span>ניהול ידע</span>
                            <ChevronLeft
                                size={16}
                                className={`transition-transform text-gray-900 dark:text-gray-200 ${sectionOpen.content ? '-rotate-90' : ''}`}
                            />
                        </button>
                    )}

                    {(sectionOpen.content || !isSidebarOpen) && (
                        <>
                            <SidebarButton
                                icon={FileText}
                                label="ניהול המידע"
                                isActive={activeTab === 'info'}
                                onClick={() => navigateAdmin('/admin')}
                                isSidebarOpen={isSidebarOpen}
                            />

                            <SidebarButton
                                icon={LinkIcon}
                                label="ניהול לינקים"
                                isActive={activeTab === 'links'}
                                onClick={() => navigateAdmin('/admin/links')}
                                isSidebarOpen={isSidebarOpen}
                                title="עריכת כפתורי קישורים במערכת"
                            />

                            <SidebarButton
                                icon={Users}
                                label="עץ מבנה"
                                isActive={activeTab === 'org-chart'}
                                onClick={() => navigateAdmin('/admin/org-chart')}
                                isSidebarOpen={isSidebarOpen}
                                title="בניית עץ המבנה הארגוני"
                            />

                            <SidebarButton
                                icon={ExternalLink}
                                label="קישורים חיצוניים"
                                isActive={activeTab === 'external-links'}
                                onClick={() => navigateAdmin('/admin/external-links')}
                                isSidebarOpen={isSidebarOpen}
                                title="הגדרת לינקים לכתובות חיצוניות"
                            />

                            <SidebarButton
                                icon={LayoutGrid}
                                label="בחירת ווידג׳טים פעילים"
                                isActive={activeTab === 'widgets'}
                                onClick={() => navigateAdmin('/admin/widgets')}
                                isSidebarOpen={isSidebarOpen}
                                title="בחירת עד 3 ווידג׳טים שיוצגו בקרוסלה"
                            />

                            <SidebarButton
                                icon={LayoutGrid}
                                label="ניהול הווידגטים העכשוויים"
                                isActive={activeTab === 'current-widgets'}
                                onClick={() => navigateAdmin('/admin/current-widgets')}
                                isSidebarOpen={isSidebarOpen}
                                title="ניהול 3 הווידג׳טים הנבחרים מעמוד אחד"
                            />
                        </>
                    )}

                    {isSidebarOpen && (
                        <button
                            type="button"
                            onClick={() => toggleSection('system')}
                            className="w-full flex items-center justify-between text-sm font-extrabold text-[#0f172a] dark:text-gray-200 px-4 py-2.5 mt-4 mb-1 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition rounded-lg"
                        >
                            <span>הגדרות מערכת</span>
                            <ChevronLeft size={16} className={`transition-transform text-gray-900 dark:text-gray-200 ${sectionOpen.system ? '-rotate-90' : ''}`} />
                        </button>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-gray-300 dark:border-white/10" />}

                    {(sectionOpen.system || !isSidebarOpen) && (
                        <>
                            <SidebarButton
                                icon={Palette}
                                label=" עיצוב האתר"
                                isActive={activeTab === 'theme'}
                                onClick={() => navigateAdmin('/admin/theme')}
                                isSidebarOpen={isSidebarOpen}
                                title="הגדרת עיצוב מתקדם לכל מקום באתר"
                            />
                        </>
                    )}

                    {isSidebarOpen && (
                        <button
                            type="button"
                            onClick={() => toggleSection('maintenance')}
                            className="w-full flex items-center justify-between text-sm font-extrabold text-[#0f172a] dark:text-gray-200 px-4 py-2.5 mt-4 mb-1 hover:bg-gray-50 dark:hover:bg-white/[0.04] transition rounded-lg"
                        >
                            <span>ניהול הרשאות ותחזוקה</span>
                            <ChevronLeft size={16} className={`transition-transform text-gray-900 dark:text-gray-200 ${sectionOpen.maintenance ? '-rotate-90' : ''}`} />
                        </button>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-gray-300 dark:border-white/10" />}

                    {(sectionOpen.maintenance || !isSidebarOpen) && (
                        <>
                            <SidebarButton
                                icon={ShieldCheck}
                                label="סנכרון מנהלים"
                                isActive={activeTab === 'admins'}
                                onClick={() => navigateAdmin('/admin/admins')}
                                isSidebarOpen={isSidebarOpen}
                                title="בדיקת סנכרון בין SharePoint לבין מנהלי האתר"
                            />

                            <SidebarButton
                                icon={Save}
                                label="ניהול גיבויים"
                                isActive={activeTab === 'backups'}
                                onClick={() => navigateAdmin('/admin/backups')}
                                isSidebarOpen={isSidebarOpen}
                                title="דשבורד גיבויים מלא עם צפייה ומחיקה"
                            />
                        </>
                    )}




                </div>

                <div className="shrink-0 border-t border-gray-200 dark:border-white/10 bg-[#f8fafc] dark:bg-[#1e212b] p-4 space-y-3">
                    <div className={isSidebarOpen ? "flex items-center justify-between gap-3" : "flex flex-col gap-3"}>
                        {isSidebarOpen ? (
                            <button
                                onClick={() => navigate('/')}
                                className="flex items-center gap-3 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors pl-2"
                            >
                                <Undo2 size={18} className="text-gray-500" />
                                <span className="font-bold text-sm">חזרה לאתר</span>
                            </button>
                        ) : (
                            <SidebarButton
                                icon={Undo2}
                                label="חזרה לאתר"
                                isActive={false}
                                onClick={() => navigate('/')}
                                isSidebarOpen={isSidebarOpen}
                                title="יציאה מתפריט הניהול"
                            />
                        )}

                        <Tooltip text={isLightMode ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'} wrapperClassName={isSidebarOpen ? "shrink-0" : "w-full"}>
                            <button
                                type="button"
                                onClick={toggleAdminMode}
                                className={`shrink-0 rounded-xl border border-gray-200 dark:border-white/10 bg-white hover:bg-gray-50 dark:bg-[#232733] dark:hover:bg-white/5 text-gray-800 dark:text-gray-300 transition flex items-center justify-center ${isSidebarOpen ? 'w-10 h-10' : 'w-full py-2.5'}`}
                            >
                                {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
                            </button>
                        </Tooltip>
                    </div>

                    <AlphaTeamAdminBanner
                        isSidebarOpen={isSidebarOpen}
                    />

                    {isSidebarOpen ? (
                        <div className="text-center text-[11px] font-medium tracking-wide text-gray-500 dark:text-gray-400">
                            siteBuilder {APP_VERSION}
                        </div>
                    ) : (
                        <Tooltip text={`siteBuilder ${APP_VERSION}`}>
                            <div className="w-full text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                {APP_VERSION}
                            </div>
                        </Tooltip>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full bg-gray-100 dark:bg-[#1e212b] overflow-hidden">
                {isOnWidgetPage ? (
                    <div className="flex-1 flex gap-4 w-full min-h-0 overflow-hidden px-4 py-4">
                        <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
                            <Routes>
                                <Route path="/" element={<div className="w-full h-full"><AdminSiteContent /></div>} />
                                <Route path="/links" element={<div className="w-full h-full "><AdminNavigation /></div>} />
                                <Route path="/events" element={<div className="w-full h-full"><AdminEvents onClose={() => navigate('/')} inHub={true} /></div>} />
                                <Route path="/widgets" element={<div className="w-full h-full"><AdminWidgets /></div>} />
                                <Route path="/current-widgets" element={<div className="w-full h-full"><AdminCurrentWidgets /></div>} />
                                <Route path="/theme" element={<div className="w-full h-full"><AdminTheme /></div>} />
                                {showAiUi && <Route path="/ai-help" element={<div className="w-full h-full"><AdminAIHelp /></div>} />}
                                <Route path="/admins" element={<div className="w-full h-full"><AdminAdminsSync /></div>} />
                                <Route path="/site-owners" element={<div className="w-full h-full"><AdminSiteOwnersManagement /></div>} />
                                <Route path="/backups" element={<div className="w-full h-full"><AdminBackupManagement /></div>} />
                                <Route path="/org-chart" element={<div className="w-full h-full"><AdminOrgChart /></div>} />
                                <Route path="/external-links" element={<div className="w-full h-full"><AdminExternalLinks /></div>} />
                                <Route path="/outstanding" element={<div className="w-full h-full"><AdminOutstanding /></div>} />
                                <Route path="/countdown" element={<div className="w-full h-full"><AdminCountdown /></div>} />
                                <Route path="/news" element={<div className="w-full h-full"><AdminNews /></div>} />
                                <Route path="/alerts" element={<div className="w-full h-full"><AdminAlerts /></div>} />
                                <Route path="/phonebook" element={<div className="w-full h-full"><AdminPhonebook /></div>} />
                                <Route path="/shuttles" element={<div className="w-full h-full"><AdminShuttles /></div>} />
                                <Route path="/polls" element={<div className="w-full h-full"><AdminPolls /></div>} />
                                <Route path="/celebrations" element={<div className="w-full h-full"><AdminCelebrations /></div>} />
                                <Route path="/heritage" element={<div className="w-full h-full"><AdminHeritage /></div>} />
                                <Route path="/tips" element={<div className="w-full h-full"><AdminTips /></div>} />
                                <Route path="*" element={<NotFoundPage adminMode />} />
                            </Routes>
                        </div>
                        <aside className="shrink-0 h-full w-[560px] max-w-[44vw]">
                            <div className="sticky top-4 h-[calc(100vh-2rem)] w-full">
                                <WidgetLivePreview activeWidget={previewActiveWidget} showStand={false} fillHeight desktopOffsetX={-56} />
                            </div>
                        </aside>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
                        <Routes>
                            <Route path="/" element={<div className="w-full h-full"><AdminSiteContent /></div>} />
                            <Route path="/links" element={<div className="w-full h-full p-8 max-w-8xl mx-auto"><AdminNavigation /></div>} />
                            <Route path="/events" element={<div className="w-full h-full"><AdminEvents onClose={() => navigate('/')} inHub={true} /></div>} />
                            <Route path="/widgets" element={<div className="w-full h-full"><AdminWidgets /></div>} />
                            <Route path="/current-widgets" element={<div className="w-full h-full"><AdminCurrentWidgets /></div>} />
                            <Route path="/theme" element={<div className="w-full h-full"><AdminTheme /></div>} />
                            {showAiUi && <Route path="/ai-help" element={<div className="w-full h-full"><AdminAIHelp /></div>} />}
                            <Route path="/admins" element={<div className="w-full h-full"><AdminAdminsSync /></div>} />
                            <Route path="/site-owners" element={<div className="w-full h-full"><AdminSiteOwnersManagement /></div>} />
                            <Route path="/backups" element={<div className="w-full h-full"><AdminBackupManagement /></div>} />
                            <Route path="/org-chart" element={<div className="w-full h-full"><AdminOrgChart /></div>} />
                            <Route path="/external-links" element={<div className="w-full h-full"><AdminExternalLinks /></div>} />
                            <Route path="/outstanding" element={<div className="w-full h-full"><AdminOutstanding /></div>} />
                            <Route path="/countdown" element={<div className="w-full h-full"><AdminCountdown /></div>} />
                            <Route path="/news" element={<div className="w-full h-full"><AdminNews /></div>} />
                            <Route path="/alerts" element={<div className="w-full h-full"><AdminAlerts /></div>} />
                            <Route path="/phonebook" element={<div className="w-full h-full"><AdminPhonebook /></div>} />
                            <Route path="/shuttles" element={<div className="w-full h-full"><AdminShuttles /></div>} />
                            <Route path="/polls" element={<div className="w-full h-full"><AdminPolls /></div>} />
                            <Route path="/celebrations" element={<div className="w-full h-full"><AdminCelebrations /></div>} />
                            <Route path="/heritage" element={<div className="w-full h-full"><AdminHeritage /></div>} />
                            <Route path="/tips" element={<div className="w-full h-full"><AdminTips /></div>} />
                            <Route path="*" element={<NotFoundPage adminMode />} />
                        </Routes>
                    </div>
                )}
            </div>
        </div>
    );
}
