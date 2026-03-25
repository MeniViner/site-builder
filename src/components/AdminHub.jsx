import React, { useState } from 'react';
import { toast } from 'react-toastify';
import {
    Undo2, Menu, Save, FileText, Link as LinkIcon,
    LayoutGrid, Palette, ExternalLink, Sun, Moon
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
import WidgetLivePreview from './WidgetLivePreview';
import Tooltip from './Tooltip';
import NotFoundPage from './NotFoundPage';
import { createBackup } from '../utils/sharepointUtils';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { useWidget } from '../context/WidgetContext';
import { useTheme } from '../context/ThemeContext';
import { confirmToast } from '../utils/confirmToast';


function SidebarButton({ icon: Icon, label, isActive, onClick, isSidebarOpen, title }) {
    return (
        <Tooltip text={title || label} wrapperClassName="block w-full">
            <button
                onClick={onClick}
                className={[
                    'w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all',
                    'border',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#232733]',
                    isActive
                        ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm border-gray-300 dark:border-white/10'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200 border-transparent',
                ].join(' ')}
            >
                <Icon size={22} className={isActive ? 'text-gray-700 dark:text-gray-200' : ''} />
                {isSidebarOpen && <span className="font-medium whitespace-nowrap text-[15px]">{label}</span>}
            </button>
        </Tooltip>
    );
}

export default function AdminHub() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const [isBackingUp, setIsBackingUp] = useState(false);
    const { widgetConfig } = useWidget();
    const { effectiveMode, toggleAdminMode } = useTheme();

    const activeWidgets = Array.isArray(widgetConfig?.activeWidgets) && widgetConfig.activeWidgets.length > 0
        ? widgetConfig.activeWidgets.slice(0, 3)
        : [widgetConfig?.activeWidget || 'events'];
    const primaryWidget = activeWidgets[0] || 'events';
    const isLightMode = effectiveMode === 'light';

    const getActiveTab = () => {
        const path = location.pathname;
        if (path.includes('/admin/links')) return 'links';
        if (path.includes('/admin/events')) return 'events';
        if (path.includes('/admin/widgets')) return 'widgets';
        if (path.includes('/admin/current-widgets')) return 'current-widgets';
        if (path.includes('/admin/theme')) return 'theme';
        if (path.includes('/admin/external-links')) return 'external-links';
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

    // Determine the key for the current dynamic widget page
    const widgetPageKeys = ['events', 'alerts', 'outstanding', 'countdown', 'news', 'phonebook', 'shuttles', 'polls', 'celebrations', 'heritage', 'tips'];
    const isOnWidgetPage = widgetPageKeys.includes(activeTab);
    const previewActiveWidget = isOnWidgetPage ? activeTab : primaryWidget;

    const handleBackup = async () => {
        if (SHAREPOINT_CONFIG.useMock) {
            toast.info('גיבוי לא נתמך במצב פיתוח (Mock)');
            return;
        }
        const confirmed = await confirmToast({
            title: 'גיבוי מערכת',
            message: 'האם ליצור גיבוי של כלל הנתונים עכשיו?',
            confirmText: 'צור גיבוי',
            cancelText: 'ביטול',
        });
        if (confirmed) {
            setIsBackingUp(true);
            const success = await createBackup();
            setIsBackingUp(false);
            if (!success) {
                toast.error('שגיאה ביצירת הגיבוי. אנא נסה שוב או בדוק את הלוגים.');
            }
        }
    };

    return (
        <div dir="rtl" className="flex h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo overflow-hidden">
            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-72' : 'w-20'} bg-white dark:bg-[#232733] border-l border-gray-200 dark:border-white/5 flex flex-col transition-all duration-300 z-50 shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.5)]`}>
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-white/5 h-20 shrink-0">
                    {isSidebarOpen ? (
                        <>
                            <div className="flex items-center gap-3 w-full min-w-0">
                                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition shrink-0">
                                    <Menu size={24} />
                                </button>
                                <h1 className="text-xl font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap">ממשק ניהול</h1>
                            </div>
                            <Tooltip text={isLightMode ? 'מעבר למצב כהה (ניהול בלבד)' : 'מעבר למצב בהיר (ניהול בלבד)'}>
                                <button
                                    onClick={toggleAdminMode}
                                    className="w-10 h-10 shrink-0 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center justify-center"
                                >
                                    {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
                                </button>
                            </Tooltip>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 mx-auto">
                            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                                <Menu size={24} />
                            </button>
                            <Tooltip text={isLightMode ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'}>
                                <button
                                    onClick={toggleAdminMode}
                                    className="w-10 h-10 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center justify-center"
                                >
                                    {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
                                </button>
                            </Tooltip>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
                    {isSidebarOpen && (
                        <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 mb-2">ניהול תוכן</div>
                    )}

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

                    {isSidebarOpen && (
                        <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 mt-6 mb-2">הגדרות מערכת</div>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-gray-300 dark:border-white/10" />}

                    <SidebarButton
                        icon={Palette}
                        label="ניהול עיצוב האתר"
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


                    <SidebarButton
                        icon={ExternalLink}
                        label="קישורים חיצוניים"
                        isActive={activeTab === 'external-links'}
                        onClick={() => navigate('/admin/external-links')}
                        isSidebarOpen={isSidebarOpen}
                        title="הגדרת לינקים לכתובות חיצוניות"
                    />

                    <div className="flex-1" />

                    <div className="pt-6 mt-6 border-t border-gray-300 dark:border-white/10 space-y-1.5">
                        <SidebarButton
                            icon={Undo2}
                            label="חזרה לאתר"
                            isActive={false}
                            onClick={() => navigate('/')}
                            isSidebarOpen={isSidebarOpen}
                            title="יציאה מתפריט הניהול"
                        />

                        <Tooltip text="גיבוי מערכת" wrapperClassName="block w-full">
                            <button
                                onClick={handleBackup}
                                disabled={isBackingUp}
                                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${isBackingUp ? 'opacity-50 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-300'} border border-transparent`}
                            >
                                <Save size={22} className={isBackingUp ? 'animate-pulse' : ''} />
                                {isSidebarOpen && <span className="font-medium whitespace-nowrap text-[15px]">{isBackingUp ? 'מגבה נתונים...' : 'גיבוי מערכת ידני'}</span>}
                            </button>
                        </Tooltip>
                    </div>
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
