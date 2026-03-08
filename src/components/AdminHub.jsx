import React, { useState } from 'react';
import {
    Undo2, Calendar, Menu, Save, FileText, Link as LinkIcon,
    LayoutGrid, Palette, ExternalLink
} from 'lucide-react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import AdminEvents from './AdminEvents';
import AdminNavigation from './AdminNavigation';
import AdminSiteContent from './AdminSiteContent';
import AdminWidgets from './AdminWidgets';
import AdminTheme from './AdminTheme';
import AdminExternalLinks from './AdminExternalLinks';
import { createBackup } from '../utils/sharepointUtils';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { useWidget } from '../context/WidgetContext';

const WIDGET_META = {
    events: { label: 'ניהול אירועים', icon: Calendar, path: '/admin/events' },
};

function SidebarButton({ icon: Icon, label, isActive, onClick, isSidebarOpen, title }) {
    return (
        <button
            onClick={onClick}
            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${isActive
                ? 'bg-white/10 text-white shadow-sm border border-white/10'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'
                }`}
            title={title || label}
        >
            <Icon size={22} className={isActive ? 'text-gray-200' : ''} />
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

    const activeWidget = widgetConfig?.activeWidget || 'events';
    const widgetMeta = WIDGET_META[activeWidget];

    const getActiveTab = () => {
        const path = location.pathname;
        if (path.includes('/admin/links')) return 'links';
        if (path.includes('/admin/events')) return 'events';
        if (path.includes('/admin/widgets')) return 'widgets';
        if (path.includes('/admin/theme')) return 'theme';
        if (path.includes('/admin/external-links')) return 'external-links';
        return 'info';
    };

    const activeTab = getActiveTab();

    const handleBackup = async () => {
        if (SHAREPOINT_CONFIG.useMock) {
            alert('גיבוי לא נתמך במצב פיתוח (Mock)');
            return;
        }

        if (window.confirm('האם ליצור גיבוי של כלל הנתונים עכשיו?')) {
            setIsBackingUp(true);
            const success = await createBackup();
            setIsBackingUp(false);
            if (success) {
                alert('הגיבוי נוצר בהצלחה!');
            } else {
                alert('שגיאה ביצירת הגיבוי. אנא נסה שוב או בדוק את הלוגים.');
            }
        }
    };

    return (
        <div dir="rtl" className="flex h-screen bg-[#1e212b] text-white font-heebo overflow-hidden">
            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-72' : 'w-20'} bg-[#232733] border-l border-white/5 flex flex-col transition-all duration-300 z-50 shrink-0 shadow-[0_0_20px_rgba(0,0,0,0.5)]`}>
                <div className="flex items-center justify-between p-6 border-b border-white/5 h-20 shrink-0">
                    {isSidebarOpen ? (
                        <div className="flex items-center gap-3 w-full">
                            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white transition shrink-0">
                                <Menu size={24} />
                            </button>
                            <h1 className="text-xl font-bold text-gray-200 whitespace-nowrap">ממשק ניהול</h1>
                        </div>
                    ) : (
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-400 hover:text-white transition mx-auto">
                            <Menu size={24} />
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5 custom-scrollbar">
                    {isSidebarOpen && (
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-4 mb-2">ניהול תוכן</div>
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

                    {widgetMeta && (
                        <SidebarButton
                            icon={widgetMeta.icon}
                            label={widgetMeta.label}
                            isActive={activeTab === 'events'}
                            onClick={() => navigate('/admin/events')}
                            isSidebarOpen={isSidebarOpen}
                        />
                    )}

                    {isSidebarOpen && (
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-widest px-4 mt-6 mb-2">הגדרות מערכת</div>
                    )}
                    {!isSidebarOpen && <div className="my-4 border-t border-white/10" />}

                    <SidebarButton
                        icon={LayoutGrid}
                        label="ניהול ווידגטים"
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

                    <div className="pt-6 mt-6 border-t border-white/10 space-y-1.5">
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
                            className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${isBackingUp ? 'opacity-50 cursor-not-allowed' : 'text-blue-400 hover:bg-blue-500/10 hover:text-blue-300'} border border-transparent`}
                            title="גיבוי מערכת"
                        >
                            <Save size={22} className={isBackingUp ? 'animate-pulse' : ''} />
                            {isSidebarOpen && <span className="font-medium whitespace-nowrap text-[15px]">{isBackingUp ? 'מגבה נתונים...' : 'גיבוי מערכת ידני'}</span>}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col h-full bg-[#1e212b] overflow-hidden">
                <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
                    <Routes>
                        <Route path="/" element={
                            <div className="w-full h-full">
                                <AdminSiteContent />
                            </div>
                        } />
                        <Route path="/links" element={
                            <div className="w-full h-full p-8 max-w-7xl mx-auto">
                                <AdminNavigation />
                            </div>
                        } />
                        <Route path="/events" element={
                            <div className="w-full h-full">
                                <AdminEvents onClose={() => navigate('/')} inHub={true} />
                            </div>
                        } />
                        <Route path="/widgets" element={
                            <div className="w-full h-full">
                                <AdminWidgets />
                            </div>
                        } />
                        <Route path="/theme" element={
                            <div className="w-full h-full">
                                <AdminTheme />
                            </div>
                        } />
                        <Route path="/external-links" element={
                            <div className="w-full h-full">
                                <AdminExternalLinks />
                            </div>
                        } />
                    </Routes>
                </div>
            </div>
        </div>
    );
}
