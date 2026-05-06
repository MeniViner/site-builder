import React, { useEffect, useRef, useState } from 'react';
import {
    Undo2, Menu, Save, FileText, Link as LinkIcon,
    LayoutGrid, Palette, ExternalLink, Sun, Moon, Users, ShieldCheck, ChevronDown
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
import AdminBackupManagement from './AdminBackupManagement';
import WidgetLivePreview from './WidgetLivePreview';
import Tooltip from './Tooltip';
import NotFoundPage from './NotFoundPage';
import { useWidget } from '../context/WidgetContext';
import { useTheme } from '../context/ThemeContext';
import { UI_FEATURES } from '../config/uiFeatures.config';


function SidebarButton({ icon, label, isActive, onClick, isSidebarOpen, title }) {
    const IconComponent = icon;

    return (
        <Tooltip text={title || label} wrapperClassName="block w-full">
            <button
                onClick={onClick}
                className={[
                    isSidebarOpen ? 'w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all' : 'w-full flex items-center justify-center px-2 py-3.5 rounded-xl transition-all',
                    'border',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#232733]',
                    isActive
                        ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm border-gray-300 dark:border-white/10'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200 border-transparent',
                ].join(' ')}
            >
                <IconComponent size={isSidebarOpen ? 22 : 26} className={isActive ? 'text-gray-700 dark:text-gray-200' : ''} />
                {isSidebarOpen && <span className="font-semibold whitespace-nowrap text-[16px] leading-6">{label}</span>}
            </button>
        </Tooltip>
    );
}

function AlphaTeamBanner({ isSidebarOpen }) {
    if (!isSidebarOpen) return null;

    return (
        <div className="rounded-xl border border-primary-200/70 dark:border-primary-500/25 bg-gradient-to-l from-primary-50 to-white dark:from-primary-500/10 dark:to-[#2b2f3c] p-2.5 shadow-sm">
            <div className="flex items-center gap-2.5">
                <img
                    src="/images/alphalogo.png"
                    alt="Alpha logo"
                    className="w-8 h-8 rounded-lg object-cover border border-primary-200/70 dark:border-primary-400/30 bg-white dark:bg-[#1e212b] p-1"
                    loading="lazy"
                />
                <div className="min-w-0">
                    <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100 truncate">צוות אלפא</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Alpha Team</p>
                </div>
            </div>
        </div>
    );
}

function AdminModeToggleButton({ isLightMode, onToggle }) {
    return (
        <Tooltip text={isLightMode ? 'מעבר למצב כהה (ניהול בלבד)' : 'מעבר למצב בהיר (ניהול בלבד)'}>
            <button
                onClick={onToggle}
                className="w-11 h-11 shrink-0 rounded-xl border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center justify-center"
            >
                {isLightMode ? <Moon size={20} /> : <Sun size={20} />}
            </button>
        </Tooltip>
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
    const [sectionOpen, setSectionOpen] = useState({
        content: true,
        system: false,
        maintenance: false,
    });

    const toggleSection = (sectionKey) => {
        setSectionOpen((prev) => ({
            ...prev,
            [sectionKey]: !prev[sectionKey],
        }));
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
            <div className={`${isSidebarOpen ? 'w-72' : 'w-20'} bg-white dark:bg-[#232733] border-l border-gray-200 dark:border-white/10 flex flex-col transition-all duration-300 z-50 shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.25)] dark:shadow-[0_0_20px_rgba(0,0,0,0.5)]`}>
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/5 h-20 shrink-0">
                    {isSidebarOpen ? (
                        <>
                            <div className="flex items-center gap-3 w-full min-w-0">
                                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition shrink-0">
                                    <Menu size={24} />
                                </button>
                                <img
                                    src="/images/alphalogo.png"
                                    alt="Alpha logo"
                                    className="w-8 h-8 rounded-lg object-cover border border-gray-200 dark:border-white/20 bg-white dark:bg-[#1e212b] p-1 shrink-0"
                                    loading="lazy"
                                />
                                <h1 className="text-xl font-bold text-gray-700 dark:text-gray-100 whitespace-nowrap">ממשק ניהול</h1>
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center mx-auto">
                            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                                <Menu size={24} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
                    {isSidebarOpen && (
                        <button
                            type="button"
                            onClick={() => toggleSection('content')}
                            className="w-full flex items-center justify-between text-sm font-extrabold text-gray-700 dark:text-gray-200 px-4 py-2.5 mb-2 rounded-lg bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition"
                        >
                            <span>ניהול תוכן</span>
                            <ChevronDown size={14} className={`transition-transform ${sectionOpen.content ? '' : '-rotate-90'}`} />
                        </button>
                    )}

                    {(sectionOpen.content || !isSidebarOpen) && (
                        <>
                            <SidebarButton
                                icon={FileText}
                                label="ניהול המידע"
                                isActive={activeTab === 'info'}
                                onClick={() => navigate('/admin')}
                                isSidebarOpen={isSidebarOpen}
                            />

                            <SidebarButton
                                icon={LinkIcon}
                                label="ניהול לינקים"
                                isActive={activeTab === 'links'}
                                onClick={() => navigate('/admin/links')}
                                isSidebarOpen={isSidebarOpen}
                                title="עריכת כפתורי קישורים במערכת"
                            />

                            <SidebarButton
                                icon={Users}
                                label="עץ מבנה"
                                isActive={activeTab === 'org-chart'}
                                onClick={() => navigate('/admin/org-chart')}
                                isSidebarOpen={isSidebarOpen}
                                title="בניית עץ המבנה הארגוני"
                            />

                            <SidebarButton
                                icon={ExternalLink}
                                label="קישורים חיצוניים"
                                isActive={activeTab === 'external-links'}
                                onClick={() => navigate('/admin/external-links')}
                                isSidebarOpen={isSidebarOpen}
                                title="הגדרת לינקים לכתובות חיצוניות"
                            />
                        </>
                    )}

                    {isSidebarOpen && (
                        <button
                            type="button"
                            onClick={() => toggleSection('system')}
                            className="w-full flex items-center justify-between text-sm font-extrabold text-gray-700 dark:text-gray-200 px-4 py-2.5 mt-6 mb-2 rounded-lg bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition"
                        >
                            <span>הגדרות מערכת</span>
                            <ChevronDown size={14} className={`transition-transform ${sectionOpen.system ? '' : '-rotate-90'}`} />
                        </button>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-gray-300 dark:border-white/10" />}

                    {(sectionOpen.system || !isSidebarOpen) && (
                        <>
                            <SidebarButton
                                icon={Palette}
                                label=" עיצוב האתר"
                                isActive={activeTab === 'theme'}
                                onClick={() => navigate('/admin/theme')}
                                isSidebarOpen={isSidebarOpen}
                                title="הגדרת עיצוב מתקדם לכל מקום באתר"
                            />

                            <SidebarButton
                                icon={LayoutGrid}
                                label="בחירת ווידג׳טים פעילים"
                                isActive={activeTab === 'widgets'}
                                onClick={() => navigate('/admin/widgets')}
                                isSidebarOpen={isSidebarOpen}
                                title="בחירת עד 3 ווידג׳טים שיוצגו בקרוסלה"
                            />

                            <SidebarButton
                                icon={LayoutGrid}
                                label="ניהול הווידגטים העכשוויים"
                                isActive={activeTab === 'current-widgets'}
                                onClick={() => navigate('/admin/current-widgets')}
                                isSidebarOpen={isSidebarOpen}
                                title="ניהול 3 הווידג׳טים הנבחרים מעמוד אחד"
                            />
                        </>
                    )}

                    {isSidebarOpen && (
                        <button
                            type="button"
                            onClick={() => toggleSection('maintenance')}
                            className="w-full flex items-center justify-between text-sm font-extrabold text-gray-700 dark:text-gray-200 px-4 py-2.5 mt-6 mb-2 rounded-lg bg-gray-100 dark:bg-white/[0.04] border border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/[0.08] transition"
                        >
                            <span>ניהול הרשאות ותחזוקה</span>
                            <ChevronDown size={14} className={`transition-transform ${sectionOpen.maintenance ? '' : '-rotate-90'}`} />
                        </button>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-gray-300 dark:border-white/10" />}

                    {(sectionOpen.maintenance || !isSidebarOpen) && (
                        <>
                            <SidebarButton
                                icon={ShieldCheck}
                                label="ניהול מנהלים"
                                isActive={activeTab === 'site-owners'}
                                onClick={() => navigate('/admin/site-owners')}
                                isSidebarOpen={isSidebarOpen}
                                title="ניהול מנהלים בקובץ, מנהלי אוסף אתרים וקבוצת בעלי האתר"
                            />

                            <SidebarButton
                                icon={Save}
                                label="ניהול גיבויים"
                                isActive={activeTab === 'backups'}
                                onClick={() => navigate('/admin/backups')}
                                isSidebarOpen={isSidebarOpen}
                                title="דשבורד גיבויים מלא עם צפייה ומחיקה"
                            />
                        </>
                    )}




                </div>

                <div className="shrink-0 border-t border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1f232f] p-4 space-y-3">
                    <SidebarButton
                        icon={Undo2}
                        label="חזרה לאתר"
                        isActive={false}
                        onClick={() => navigate('/')}
                        isSidebarOpen={isSidebarOpen}
                        title="יציאה מתפריט הניהול"
                    />

                    {isSidebarOpen ? (
                        <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                                <AlphaTeamBanner isSidebarOpen={isSidebarOpen} />
                            </div>
                            <AdminModeToggleButton isLightMode={isLightMode} onToggle={toggleAdminMode} />
                        </div>
                    ) : (
                        <div className="flex justify-center">
                            <AdminModeToggleButton isLightMode={isLightMode} onToggle={toggleAdminMode} />
                        </div>
                    )}

                    {isSidebarOpen ? (
                        <div className="text-center text-[11px] font-medium tracking-wide text-gray-500 dark:text-gray-400">
                            siteBuilder 0.1.9
                        </div>
                    ) : (
                        <Tooltip text="siteBuilder 0.1.9">
                            <div className="w-full text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
                                0.1.9
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
