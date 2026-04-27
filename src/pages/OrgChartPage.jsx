import React from 'react';
import { ArrowRight, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import OrgChartFlow from '../components/OrgChartFlow';
import OrgChart3D from '../components/OrgChart3D';
import NavigationBar from '../components/home/NavigationBar';
import { useAuth } from '../context/AuthContext';
import { useConfig } from '../context/ConfigProvider';
import { useSiteContent } from '../context/SiteContentContext';
import { useTheme } from '../context/ThemeContext';
import { resolveSiteImageUrl } from '../utils/assetUrl';
import { normalizeBorderStyle } from '../utils/borderStyles';

const LINE_STYLE_CLASS_MAP = {
    solid: 'border-solid',
    dashed: 'border-dashed',
    dotted: 'border-dotted',
};
const BEFORE_LINE_STYLE_CLASS_MAP = {
    solid: 'before:border-solid',
    dashed: 'before:border-dashed',
    dotted: 'before:border-dotted',
};
const AFTER_LINE_STYLE_CLASS_MAP = {
    solid: 'after:border-solid',
    dashed: 'after:border-dashed',
    dotted: 'after:border-dotted',
};

const LINE_TONE_CLASS = 'text-primary/40';

function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 16) return 'צהריים טובים';
    if (hour >= 16 && hour < 18) return 'אחה"צ טובים';
    if (hour >= 18 && hour < 22) return 'ערב טוב';
    return 'לילה טוב';
}

function buildDisplayName(node) {
    return node?.name?.trim() || node?.role?.trim() || 'צומת ללא שם';
}

function buildSubtitle(node) {
    return [node?.rank, node?.role].filter(Boolean).join(' | ') || 'טרם הוגדרו דרגה ותפקיד';
}

function avatarRadiusClass(avatarShape) {
    if (avatarShape === 'rounded') return 'rounded-2xl';
    if (avatarShape === 'square') return 'rounded-none';
    return 'rounded-full';
}

function NodePortrait({ node, size = 'md', avatarShape = 'circle' }) {
    const src = resolveSiteImageUrl(node.imageUrl);
    const sizeClasses = {
        sm: 'h-10 w-10 text-xs',
        md: 'h-16 w-16 text-lg',
        lg: 'h-24 w-24 text-2xl',
    };
    const initials = buildDisplayName(node).replace(/\s+/g, ' ').trim().slice(0, 2) || 'צה';

    return (
        <div className={`${sizeClasses[size] || sizeClasses.md} ${avatarRadiusClass(avatarShape)} overflow-hidden border border-primary/20 bg-primary/10 shadow-[0_10px_28px_rgba(0,0,0,0.18)]`}>
            {node.imageUrl ? (
                <img src={src} alt={buildDisplayName(node)} className="h-full w-full object-cover" />
            ) : (
                <div className="flex h-full w-full items-center justify-center font-black text-primary">
                    {initials}
                </div>
            )}
        </div>
    );
}

function NodeCard({ node, cardStyle, avatarShape }) {
    const title = buildDisplayName(node);
    const subtitle = buildSubtitle(node);
    const baseCardClass = 'group relative isolate max-w-full border border-theme-strong bg-theme-card/80 text-theme backdrop-blur-xl shadow-[0_14px_38px_rgba(15,23,42,0.18)] transition duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_22px_54px_rgba(15,23,42,0.24)]';

    if (cardStyle === 'horizontal') {
        return (
            <article dir="rtl" className={`${baseCardClass} w-[19rem] rounded-[26px] px-4 py-4`}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-primary/80 via-primary/25 to-transparent" />
                <div className="flex items-center gap-4 text-right">
                    <NodePortrait node={node} size="md" avatarShape={avatarShape} />
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-black">{title}</h3>
                        <p className="mt-1 text-sm leading-6 text-theme-muted">{subtitle}</p>
                    </div>
                </div>
            </article>
        );
    }

    if (cardStyle === 'large-avatar') {
        return (
            <article dir="rtl" className={`${baseCardClass} w-[17rem] rounded-[30px] px-6 py-6 text-center`}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-primary/80 via-primary/25 to-transparent" />
                <div className="flex flex-col items-center gap-5">
                    <NodePortrait node={node} size="lg" avatarShape={avatarShape} />
                    <div className="space-y-1">
                        <h3 className="break-words text-lg font-black leading-6">{title}</h3>
                        <p className="text-sm leading-6 text-theme-muted">{subtitle}</p>
                    </div>
                </div>
            </article>
        );
    }

    if (cardStyle === 'compact') {
        return (
            <article dir="rtl" className={`${baseCardClass} w-[14rem] rounded-[22px] px-4 py-3`}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-primary/80 via-primary/25 to-transparent" />
                <div className="flex items-center gap-3 text-right">
                    <NodePortrait node={node} size="sm" avatarShape={avatarShape} />
                    <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-black">{title}</h3>
                        <p className="truncate text-xs text-theme-muted">{subtitle}</p>
                    </div>
                </div>
            </article>
        );
    }

    return (
        <article dir="rtl" className={`${baseCardClass} w-[15.5rem] rounded-[28px] px-5 py-5 text-center`}>
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-primary/80 via-primary/25 to-transparent" />
            <div className="flex flex-col items-center gap-4">
                <NodePortrait node={node} size="md" avatarShape={avatarShape} />
                <div className="space-y-1">
                    <h3 className="break-words text-lg font-black leading-6">{title}</h3>
                    <p className="text-sm leading-6 text-theme-muted">{subtitle}</p>
                </div>
            </div>
        </article>
    );
}

function RestrictedState() {
    return (
        <main className="flex min-h-[calc(100vh-88px)] items-center justify-center px-6 py-12">
            <div className="w-full max-w-3xl rounded-[34px] border border-theme-strong bg-theme-card/90 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-10">
                <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary-200">
                    Restricted
                </div>
                <h1 className="mt-4 text-3xl font-black sm:text-4xl">העמוד עדיין לא פתוח לצפייה</h1>
                <p className="mt-5 max-w-2xl leading-8 text-theme-muted">
                    מנהל המערכת עדיין לא הפעיל את עץ המבנה עבור משתמשי האתר, ולכן הגישה לדף הזה חסומה כרגע.
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

function EmptyState() {
    return (
        <div className="mx-auto max-w-2xl rounded-[30px] border border-theme-strong bg-theme-card/70 px-8 py-12 text-center shadow-[0_18px_56px_rgba(0,0,0,0.2)] backdrop-blur-xl">
            <Users size={40} className="mx-auto mb-4 text-primary" />
            <h2 className="text-2xl font-black text-theme">העמוד פעיל, אבל עדיין אין עץ להצגה</h2>
            <p className="mx-auto mt-4 max-w-xl leading-7 text-theme-muted">
                ברגע שיוגדרו צמתים בממשק הניהול, כאן יוצג המבנה ההיררכי המלא של היחידה.
            </p>
        </div>
    );
}

export default function OrgChartPage({ isPreview = false, previewData = null }) {
    const navigate = useNavigate();
    const { currentUser, isAdmin, loading: authLoading } = useAuth();
    const { config } = useConfig();
    const { siteContent } = useSiteContent();
    const { theme, effectiveMode, toggleUserMode, borderTargets } = useTheme();

    const chartData = isPreview ? previewData : config?.content?.orgChart;
    if (!chartData) return null;

    const hero = siteContent?.hero || { siteName: 'שם האתר' };
    const rootNodes = Array.isArray(chartData.nodes) ? chartData.nodes : [];
    const layoutDirection = chartData.layoutDirection || 'flow-canvas';
    const cardStyle = chartData.cardStyle || 'classic';
    const lineStyle = chartData.lineStyle || 'solid';
    const avatarShape = chartData.avatarShape || 'circle';
    const lineStyleClass = LINE_STYLE_CLASS_MAP[lineStyle] || LINE_STYLE_CLASS_MAP.solid;
    const beforeLineStyleClass = BEFORE_LINE_STYLE_CLASS_MAP[lineStyle] || BEFORE_LINE_STYLE_CLASS_MAP.solid;
    const afterLineStyleClass = AFTER_LINE_STYLE_CLASS_MAP[lineStyle] || AFTER_LINE_STYLE_CLASS_MAP.solid;
    const utilityLinks = (chartData.enabled || isPreview)
        ? [{ id: 'org-chart', label: 'חזרה לדף הבית', to: '/', isActivePath: '/org-chart' }]
        : [];
    const isSteppedLayout = layoutDirection === 'step-rtl' || layoutDirection === 'step-ltr';
    const is3DGraphLayout = layoutDirection === '3d-graph';
    const isFlowCanvasLayout = layoutDirection === 'flow-canvas';
    const graphMode = effectiveMode;
    const normalizedBorderStyle = normalizeBorderStyle(theme?.borderStyle || 'cyber');
    const topNavBorderStyle = borderTargets?.topNav ? normalizedBorderStyle : 'standard';
    const searchBorderStyle = borderTargets?.search ? normalizedBorderStyle : 'standard';

    function renderCenterNode(node) {
        const children = Array.isArray(node?.children) ? node.children : [];
        const stemBeforeClass = `before:pointer-events-none before:absolute before:left-1/2 before:top-0 before:h-8 before:-translate-x-1/2 before:border-l-2 before:border-current ${beforeLineStyleClass}`;

        return (
            <div key={node.id} className="flex flex-col items-center">
                <NodeCard node={node} cardStyle={cardStyle} avatarShape={avatarShape} />

                {children.length > 0 && (
                    <>
                        {children.length === 1 ? (
                            <div className={`relative mt-4 pt-8 ${LINE_TONE_CLASS} ${stemBeforeClass}`}>
                                {renderCenterNode(children[0])}
                            </div>
                        ) : (
                            <div
                                className={`relative mt-4 flex justify-center gap-8 ${LINE_TONE_CLASS} ${stemBeforeClass} after:pointer-events-none after:absolute after:left-0 after:right-0 after:top-8 after:border-t-2 after:border-current ${afterLineStyleClass}`}
                            >
                                {children.map((child) => (
                                    <div
                                        key={child.id}
                                        className={`relative flex flex-col items-center px-2 pt-8 before:pointer-events-none before:absolute before:left-1/2 before:top-0 before:h-8 before:-translate-x-1/2 before:border-l-2 before:border-current ${beforeLineStyleClass}`}
                                    >
                                        {renderCenterNode(child)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    function renderSteppedNode(node) {
        const children = Array.isArray(node?.children) ? node.children : [];
        const isRtlStep = layoutDirection === 'step-rtl';
        const branchClass = isRtlStep
            ? `relative mt-5 mr-8 flex flex-col gap-2 pr-6 border-r-2 border-current ${lineStyleClass}`
            : `relative mt-5 ml-8 flex flex-col gap-2 pl-6 border-l-2 border-current ${lineStyleClass}`;
        const notchBaseClass = `before:pointer-events-none before:absolute before:top-1/2 before:w-6 before:-translate-y-1/2 before:border-t-2 before:border-current before:content-[''] ${beforeLineStyleClass}`;
        const notchEdgeClass = isRtlStep
            ? 'before:right-0'
            : 'before:left-0';
        const alignmentClass = 'items-start';

        return (
            <div key={node.id} className={`flex flex-col ${alignmentClass}`}>
                <NodeCard node={node} cardStyle={cardStyle} avatarShape={avatarShape} />

                {children.length > 0 && (
                    <div className={`${branchClass} ${LINE_TONE_CLASS}`}>
                        {children.map((child) => (
                            <div
                                key={child.id}
                                className={`relative flex flex-col py-2 ${alignmentClass} ${notchBaseClass} ${notchEdgeClass}`}
                            >
                                {renderSteppedNode(child)}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    }

    function renderTreeLayout() {
        if (isFlowCanvasLayout) {
            return (
                <div className={isPreview ? 'h-[70vh] min-h-[460px]' : 'h-[calc(100vh-220px)] min-h-[580px]'}>
                    <OrgChartFlow config={chartData} isEditable={false} />
                </div>
            );
        }

        if (is3DGraphLayout) {
            return (
                <div className={`relative w-full h-[80vh] rounded-xl overflow-hidden border border-theme-strong shadow-[0_20px_60px_rgba(0,0,0,0.18)] ${graphMode === 'dark' ? 'bg-[#0c0d12]' : 'bg-[#f2f3f5]'}`}>
                    <div
                        className="pointer-events-none absolute inset-0"
                        style={{
                            background: graphMode === 'dark'
                                ? 'radial-gradient(circle at top right, hsl(var(--color-primary) / 0.18), transparent 35%), radial-gradient(circle at bottom left, hsl(var(--color-primary) / 0.12), transparent 32%)'
                                : 'radial-gradient(circle at top right, hsl(var(--color-primary) / 0.12), transparent 32%), radial-gradient(circle at bottom left, hsl(var(--color-primary) / 0.09), transparent 30%)',
                        }}
                    />
                    <div className="relative h-full w-full">
                        <OrgChart3D rawNodes={rootNodes} graph3d={chartData.graph3d} primaryColor={theme?.primaryColor} effectiveMode={graphMode} />
                    </div>
                </div>
            );
        }

        if (isSteppedLayout) {
            const stepAlignmentClass = layoutDirection === 'step-rtl' ? 'items-end' : 'items-start';
            const stepStartClass = 'justify-start';
            const stepPaddingClass = layoutDirection === 'step-rtl' ? 'pr-0 pl-6' : 'pl-0 pr-6';

            return (
                <div className="overflow-x-auto custom-scrollbar pb-10" dir={layoutDirection === 'step-ltr' ? 'ltr' : 'rtl'}>
                    <div className={`flex min-w-full ${stepStartClass}`}>
                        <div className={`flex min-w-fit flex-col gap-6 ${stepPaddingClass} ${stepAlignmentClass}`}>
                            {rootNodes.map((node) => renderSteppedNode(node))}
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="overflow-x-auto custom-scrollbar pb-10">
                <div className="inline-flex min-w-full justify-center px-6">
                    <div className={`flex items-start justify-center gap-10 ${rootNodes.length > 1 ? 'flex-row' : 'flex-col'}`}>
                        {rootNodes.map((node) => renderCenterNode(node))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div dir="rtl" className="relative min-h-screen overflow-hidden bg-theme-bg-base font-heebo text-theme">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(8,145,178,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.12),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_42%)]" />

            <div className="relative z-10">
                <NavigationBar
                    theme={theme}
                    hero={hero}
                    navItems={[]}
                    showNavCategories={false}
                    onNavTo={() => {}}
                    onOpenAdmin={() => {
                        if (!isPreview) navigate('/admin');
                    }}
                    canOpenAdmin={!isPreview && isAdmin && !authLoading}
                    topNavBorderStyle={topNavBorderStyle}
                    searchBorderStyle={searchBorderStyle}
                    effectiveMode={effectiveMode}
                    toggleUserMode={toggleUserMode}
                    getGreeting={getGreeting}
                    userName={currentUser?.displayName || 'אורח'}
                    utilityLinks={utilityLinks}
                    onBrandClick={() => {
                        if (!isPreview) navigate('/');
                    }}
                />

                {!chartData.enabled && !isPreview ? (
                    <RestrictedState />
                ) : (
                    <main className={isPreview ? 'px-4 py-4' : ((isSteppedLayout || isFlowCanvasLayout) ? 'px-0 py-4' : 'px-4 py-4 sm:px-8 lg:px-12 xl:px-16')}>
                        <section className={(isSteppedLayout || isFlowCanvasLayout) ? 'w-full' : 'mx-auto max-w-7xl'}>
                            <div className={`ml-auto mr-0 max-w-3xl text-right ${(isSteppedLayout || isFlowCanvasLayout) ? 'pr-6' : ''} ${isPreview ? 'pt-2 pb-4' : 'pt-1 pb-5'}`}>
                                <h1 className="text-3xl font-black tracking-tight text-theme sm:text-4xl">
                                    {chartData.pageTitle || 'עץ מבנה'}
                                </h1>
                                <p className="mt-3 text-base leading-7 text-theme-muted sm:text-lg">
                                    הכירו את שרשרת הפיקוד והמבנה הארגוני של היחידה.
                                </p>
                            </div>

                            {rootNodes.length === 0 ? (
                                <EmptyState />
                            ) : (
                                <div className="mx-auto w-full pb-12">
                                    {renderTreeLayout()}
                                </div>
                            )}
                        </section>
                    </main>
                )}
            </div>
        </div>
    );
}
