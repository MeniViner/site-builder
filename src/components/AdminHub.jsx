import React, { useState } from 'react';
import { toast } from 'react-toastify';
import {
    Undo2, Calendar, Menu, Save, FileText, Link as LinkIcon,
    LayoutGrid, Palette, ExternalLink, Sun, Moon,
    Award, Timer, Rss, BookUser
} from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AdminEvents from './AdminEvents';
import AdminNavigation from './AdminNavigation';
import AdminSiteContent from './AdminSiteContent';
import AdminWidgets from './AdminWidgets';
import AdminTheme from './AdminTheme';
import AdminExternalLinks from './AdminExternalLinks';
import AdminOutstanding from './AdminOutstanding';
import AdminCountdown from './AdminCountdown';
import AdminNews from './AdminNews';
import AdminPhonebook from './AdminPhonebook';
import { createBackup } from '../utils/sharepointUtils';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { useWidget } from '../context/WidgetContext';
import { useTheme } from '../context/ThemeContext';

// ─── Dynamic widget management link config ────────────────────────────────────
// Maps activeWidget value → sidebar label, icon, and route path.
// Widgets without a dedicated management page (e.g. 'alerts') are omitted
// so the link will simply not render.
const WIDGET_MANAGE_MAP = {
    events: { label: 'ניהול מופעים', icon: Calendar, path: '/admin/events' },
    outstanding: { label: 'ניהול מצטיינים', icon: Award, path: '/admin/outstanding' },
    countdown: { label: 'ניהול ספירה לאחור', icon: Timer, path: '/admin/countdown' },
    news: { label: 'ניהול מבזקים', icon: Rss, path: '/admin/news' },
    phonebook: { label: 'ניהול ספר טלפונים', icon: BookUser, path: '/admin/phonebook' },
};

function SidebarButton({ icon: Icon, label, isActive, onClick, isSidebarOpen, title }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${isActive
                ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm border border-gray-300 dark:border-white/10'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 hover:text-gray-700 dark:hover:text-gray-200 border border-transparent'
                }`}
            title={title || label}
        >
            <Icon size={22} className={isActive ? 'text-gray-700 dark:text-gray-200' : ''} />
            {isSidebarOpen && <span className="font-medium whitespace-nowrap text-[15px]">{label}</span>}
        </button>
    );
}

export default function AdminHub() {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const [isBackingUp, setIsBackingUp] = useState(false);
    const { widgetConfig } = useWidget();
    const { effectiveMode, toggleAdminMode } = useTheme();

    const activeWidget = widgetConfig?.activeWidget || 'events';
    const widgetManageMeta = WIDGET_MANAGE_MAP[activeWidget] ?? null;
    const isLightMode = effectiveMode === 'light';

    const getActiveTab = () => {
        const path = location.pathname;
        if (path.includes('/admin/links')) return 'links';
        if (path.includes('/admin/events')) return 'events';
        if (path.includes('/admin/widgets')) return 'widgets';
        if (path.includes('/admin/theme')) return 'theme';
        if (path.includes('/admin/external-links')) return 'external-links';
        if (path.includes('/admin/outstanding')) return 'outstanding';
        if (path.includes('/admin/countdown')) return 'countdown';
        if (path.includes('/admin/news')) return 'news';
        if (path.includes('/admin/phonebook')) return 'phonebook';
        return 'info';
    };

    const activeTab = getActiveTab();

    // Determine the key for the current dynamic widget page
    const widgetPageKeys = ['events', 'outstanding', 'countdown', 'news', 'phonebook'];
    const isOnWidgetPage = widgetPageKeys.includes(activeTab);

    const handleBackup = async () => {
        if (SHAREPOINT_CONFIG.useMock) {
            toast.info('גיבוי לא נתמך במצב פיתוח (Mock)');
            return;
        }
        if (window.confirm('האם ליצור גיבוי של כלל הנתונים עכשיו?')) {
            setIsBackingUp(true);
            const success = await createBackup();
            setIsBackingUp(false);
            if (success) {
                toast.success('הגיבוי נוצר בהצלחה!');
            } else {
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
                            <button
                                onClick={toggleAdminMode}
                                className="w-10 h-10 shrink-0 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center justify-center"
                                title={isLightMode ? 'מעבר למצב כהה (ניהול בלבד)' : 'מעבר למצב בהיר (ניהול בלבד)'}
                            >
                                {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-2 mx-auto">
                            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                                <Menu size={24} />
                            </button>
                            <button
                                onClick={toggleAdminMode}
                                className="w-10 h-10 rounded-lg border border-gray-300 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/10 transition flex items-center justify-center"
                                title={isLightMode ? 'מעבר למצב כהה' : 'מעבר למצב בהיר'}
                            >
                                {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
                            </button>
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
                    />

                    {/* Dynamic widget management link — updates based on activeWidget */}
                    {widgetManageMeta && (
                        <SidebarButton
                            icon={widgetManageMeta.icon}
                            label={widgetManageMeta.label}
                            isActive={isOnWidgetPage && activeTab !== 'info' && activeTab !== 'links'}
                            onClick={() => navigate(widgetManageMeta.path)}
                            isSidebarOpen={isSidebarOpen}
                            title={`${widgetManageMeta.label} (ווידגט פעיל)`}
                        />
                    )}

                    {isSidebarOpen && (
                        <div className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 mt-6 mb-2">הגדרות מערכת</div>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-gray-300 dark:border-white/10" />}

                    <SidebarButton
                        icon={LayoutGrid}
                        label="הגדרות ווידגט"
                        isActive={activeTab === 'widgets'}
                        onClick={() => navigate('/admin/widgets')}
                        isSidebarOpen={isSidebarOpen}
                    />

                    <SidebarButton
                        icon={Palette}
                        label="ניהול עיצוב האתר"
                        isActive={activeTab === 'theme'}
                        onClick={() => navigate('/admin/theme')}
                        isSidebarOpen={isSidebarOpen}
                    />

                    <SidebarButton
                        icon={ExternalLink}
                        label="קישורים חיצוניים"
                        isActive={activeTab === 'external-links'}
                        onClick={() => navigate('/admin/external-links')}
                        isSidebarOpen={isSidebarOpen}
                    />

                    <div className="flex-1" />

                    <div className="pt-6 mt-6 border-t border-gray-300 dark:border-white/10 space-y-1.5">
                        <SidebarButton
                            icon={Undo2}
                            label="חזרה לאתר"
                            isActive={false}
                            onClick={() => navigate('/')}
                            isSidebarOpen={isSidebarOpen}
                        />

                        <button
                            onClick={handleBackup}
                            disabled={isBackingUp}
                            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${isBackingUp ? 'opacity-50 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 hover:text-blue-700 dark:hover:text-blue-300'} border border-transparent`}
                            title="גיבוי מערכת"
                        >
                            <Save size={22} className={isBackingUp ? 'animate-pulse' : ''} />
                            {isSidebarOpen && <span className="font-medium whitespace-nowrap text-[15px]">{isBackingUp ? 'מגבה נתונים...' : 'גיבוי מערכת ידני'}</span>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full bg-gray-100 dark:bg-[#1e212b] overflow-hidden">
                <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
                    <Routes>
                        <Route path="/" element={<div className="w-full h-full"><AdminSiteContent /></div>} />
                        <Route path="/links" element={<div className="w-full h-full p-8 max-w-7xl mx-auto"><AdminNavigation /></div>} />
                        <Route path="/events" element={<div className="w-full h-full"><AdminEvents onClose={() => navigate('/')} inHub={true} /></div>} />
                        <Route path="/widgets" element={<div className="w-full h-full"><AdminWidgets /></div>} />
                        <Route path="/theme" element={<div className="w-full h-full"><AdminTheme /></div>} />
                        <Route path="/external-links" element={<div className="w-full h-full"><AdminExternalLinks /></div>} />
                        {/* ── New dedicated widget management pages ── */}
                        <Route path="/outstanding" element={<div className="w-full h-full"><AdminOutstanding /></div>} />
                        <Route path="/countdown" element={<div className="w-full h-full"><AdminCountdown /></div>} />
                        <Route path="/news" element={<div className="w-full h-full"><AdminNews /></div>} />
                        <Route path="/phonebook" element={<div className="w-full h-full"><AdminPhonebook /></div>} />
                    </Routes>
                </div>
            </div>
        </div>
    );
}
