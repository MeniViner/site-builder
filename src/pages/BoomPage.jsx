import React from 'react';
import { ArrowRight, Loader2, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import NavigationBar from '../components/home/NavigationBar';
import TaskManagementTable, { TASK_STATUS_META } from '../components/TaskManagementTable';
import { useAuth } from '../context/AuthContext';
import { useBoom } from '../context/BoomContext';
import { useNavigation } from '../context/NavigationContext';
import { useSiteContent } from '../context/SiteContentContext';
import { useTheme } from '../context/ThemeContext';
import { canAccessAdminUi } from '../utils/adminAccess';
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
                <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary"><ShieldCheck size={14} />גישה סגורה</span>
                <h1 className="mt-4 text-3xl font-black text-balance sm:text-4xl">עמוד BOOM אינו פעיל באתר זה.</h1>
                <p className="mt-5 max-w-2xl leading-8 text-theme-muted text-pretty">מנהל המערכת עדיין לא הפעיל את מערכת השליטה והבקרה לצפייה באתר.</p>
                <Link to="/" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]">
                    <ArrowRight size={18} />חזרה לעמוד הבית
                </Link>
            </div>
        </main>
    );
}

export default function BoomPage() {
    const navigate = useNavigate();
    const { navItems } = useNavigation();
    const { currentUser, isAdmin, loading: authLoading } = useAuth();
    const { siteContent } = useSiteContent();
    const { theme, effectiveMode, toggleUserMode, borderTargets } = useTheme();
    const { boom, loading, loaded, error, reloadBoom } = useBoom();
    const hero = siteContent?.hero || { siteName: 'שם האתר' };
    const borderStyle = normalizeBorderStyle(theme?.borderStyle || 'cyber');

    return (
        <div dir="rtl" className="min-h-screen bg-theme-bg-base text-theme font-heebo">
            <NavigationBar
                theme={theme}
                hero={hero}
                navItems={navItems}
                showNavCategories={false}
                onNavTo={(item) => (item.url ? openLinkTarget(item.url) : navigate('/'))}
                onOpenAdmin={() => navigate('/admin/boom')}
                canOpenAdmin={canAccessAdminUi({ isAdmin, loading: authLoading })}
                topNavBorderStyle={borderTargets?.topNav ? borderStyle : 'standard'}
                searchBorderStyle={borderTargets?.search ? borderStyle : 'standard'}
                effectiveMode={effectiveMode}
                toggleUserMode={toggleUserMode}
                getGreeting={getGreeting}
                userName={currentUser?.displayName || 'אורח'}
                utilityLinks={boom.enabled ? [{ id: 'boom-home', label: 'חזרה לדף הבית', to: '/', isActivePath: '/boom' }] : []}
            />

            {loading ? (
                <main className="flex min-h-[calc(100vh-88px)] items-center justify-center"><Loader2 className="ml-2 animate-spin text-primary" size={22} />טוען BOOM...</main>
            ) : !loaded ? (
                <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12">
                    <div className="w-full max-w-2xl rounded-[30px] border border-red-500/25 bg-theme-card/90 p-8 text-right shadow-[0_24px_80px_rgba(0,0,0,0.20)]">
                        <h1 className="text-3xl font-black text-balance">לא ניתן לטעון את עמוד BOOM</h1>
                        <p className="mt-4 leading-7 text-theme-muted text-pretty">{error || 'אירעה שגיאה בטעינת הנתונים.'}</p>
                        <button type="button" onClick={reloadBoom} className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-primary px-5 font-bold text-white transition-[filter,transform] hover:brightness-110 active:scale-[0.96]">
                            <RefreshCw size={18} />ניסיון נוסף
                        </button>
                    </div>
                </main>
            ) : !boom.enabled ? (
                <RestrictedState />
            ) : (
                <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-7 lg:px-10">
                    <header className="mb-6 flex flex-col gap-4 rounded-[28px] border border-theme-subtle bg-theme-card/80 p-6 shadow-sm backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary"><Zap size={14} />Command &amp; Control</span>
                            <h1 className="mt-3 text-3xl font-black text-balance sm:text-4xl">{boom.pageTitle}</h1>
                            {boom.description && <p className="mt-2 max-w-3xl leading-7 text-theme-muted text-pretty">{boom.description}</p>}
                        </div>
                        <div className="shrink-0 rounded-2xl bg-primary/10 px-5 py-3 text-center">
                            <div className="text-2xl font-black tabular-nums text-primary">{boom.items.length}</div>
                            <div className="text-xs font-bold text-theme-muted">משימות</div>
                        </div>
                    </header>

                    <section className="overflow-hidden rounded-[28px] border border-theme-subtle bg-theme-card shadow-[0_14px_44px_rgba(0,0,0,0.10)]">
                        {boom.items.length > 0 ? (
                            <TaskManagementTable
                                tasks={boom.items}
                                categories={boom.categories}
                                statusMeta={TASK_STATUS_META}
                                readOnly
                            />
                        ) : (
                            <div className="px-6 py-20 text-center text-theme-muted">
                                <Zap className="mx-auto opacity-40" size={42} />
                                <h2 className="mt-4 text-xl font-black text-theme">עדיין אין משימות BOOM</h2>
                                <p className="mt-2">משימות חדשות שיוגדרו על ידי מנהל המערכת יוצגו כאן.</p>
                            </div>
                        )}
                    </section>
                </main>
            )}
        </div>
    );
}
