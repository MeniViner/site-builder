import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import GanttChart from '../components/GanttChart';
import NavigationBar from '../components/home/NavigationBar';
import { useAuth } from '../context/AuthContext';
import { useGantt } from '../context/GanttContext';
import { useNavigation } from '../context/NavigationContext';
import { useSiteContent } from '../context/SiteContentContext';
import { useTheme } from '../context/ThemeContext';
import { normalizeBorderStyle } from '../utils/borderStyles';
import { openLinkTarget } from '../utils/linkTargets';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 16) return 'צהריים טובים';
    if (hour >= 16 && hour < 18) return 'אחה"צ טובים';
    if (hour >= 18 && hour < 22) return 'ערב טוב';
    return 'לילה טוב';
}

function RestrictedState() {
    return (
        <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12">
            <div className="w-full max-w-3xl rounded-[30px] border border-theme-strong bg-theme-card/90 p-8 text-right shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary-200">
                    גישה סגורה
                </div>
                <h1 className="mt-4 text-3xl font-black sm:text-4xl">תרשים הגאנט אינו פעיל באתר זה.</h1>
                <p className="mt-5 max-w-2xl leading-8 text-theme-muted">
                    מנהל המערכת עדיין לא הפעיל את עמוד הגאנט לצפייה באתר.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-3 font-bold text-white transition hover:brightness-110"
                    >
                        <ArrowRight size={18} />
                        חזרה לעמוד הבית
                    </Link>
                </div>
            </div>
        </main>
    );
}

export default function GanttPage() {
    const navigate = useNavigate();
    const { navItems } = useNavigation();
    const { currentUser, isAdmin, loading: authLoading } = useAuth();
    const { siteContent } = useSiteContent();
    const { theme, effectiveMode, toggleUserMode, borderTargets } = useTheme();
    const { gantt, loading } = useGantt();

    const hero = siteContent?.hero || { siteName: 'שם האתר' };
    const normalizedBorderStyle = normalizeBorderStyle(theme?.borderStyle || 'cyber');
    const topNavBorderStyle = borderTargets?.topNav ? normalizedBorderStyle : 'standard';
    const searchBorderStyle = borderTargets?.search ? normalizedBorderStyle : 'standard';
    const utilityLinks = gantt.enabled
        ? [{ id: 'gantt-home', label: 'חזרה לדף הבית', to: '/', isActivePath: '/gantt' }]
        : [];
    const userName = currentUser?.displayName || 'אורח';

    const handleNavTo = (cat) => {
        if ((cat.isDirectLink && cat.url) || cat.url) {
            openLinkTarget(cat.url);
            return;
        }
        navigate('/');
    };

    return (
        <div dir="rtl" className="min-h-screen bg-theme-bg-base text-theme font-heebo">
            <NavigationBar
                theme={theme}
                hero={hero}
                navItems={navItems}
                showNavCategories={false}
                onNavTo={handleNavTo}
                onOpenAdmin={() => navigate('/admin/gantt')}
                canOpenAdmin={isAdmin && !authLoading}
                topNavBorderStyle={topNavBorderStyle}
                searchBorderStyle={searchBorderStyle}
                effectiveMode={effectiveMode}
                toggleUserMode={toggleUserMode}
                getGreeting={getGreeting}
                userName={userName}
                utilityLinks={utilityLinks}
            />

            {loading ? (
                <main className="flex min-h-[calc(100vh-88px)] items-center justify-center">
                    <Loader2 className="ml-2 animate-spin text-primary" size={22} />
                    טוען גאנט...
                </main>
            ) : !gantt.enabled ? (
                <RestrictedState />
            ) : (
                <main className="public-gantt-page box-border flex min-h-[calc(100dvh-88px)] w-full max-w-none flex-col px-3 py-3 sm:px-5 lg:px-8">
                    <div className="public-gantt-breadcrumb mb-3 flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm font-black text-theme-muted">
                        <span>{hero.siteName || hero.title || 'האתר'}</span>
                        <span className="text-theme-muted/60">|</span>
                        <span className="text-theme">{gantt.pageTitle || 'גאנט'}</span>
                        {gantt.description && (
                            <span className="basis-full text-xs font-bold leading-6 text-theme-muted sm:basis-auto">
                                {gantt.description}
                            </span>
                        )}
                    </div>
                    <div className="public-gantt-card min-h-0 w-full max-w-none flex-1 overflow-hidden">
                        <GanttChart
                            data={gantt}
                            layoutVariant="public"
                            viewportHeight="clamp(560px, calc(100dvh - 180px), 920px)"
                            className="public-gantt-chart w-full max-w-none"
                        />
                    </div>
                </main>
            )}
        </div>
    );
}
