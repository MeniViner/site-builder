import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Home } from '../App';
import { ConfigContext } from '../context/ConfigProvider';
import { NavigationProvider } from '../context/NavigationContext';
import { EventsProvider } from '../context/EventsContext';
import { SiteContentProvider } from '../context/SiteContentContext';
import { OrgChartProvider } from '../context/OrgChartContext';
import { ThemeContext, applyThemeToElement } from '../context/ThemeContext';
import { WidgetContext } from '../context/WidgetContext';
import { ExternalLinksProvider } from '../context/ExternalLinksContext';
import { DEFAULT_ACTIVE_WIDGETS, mergeWidgetSettings } from '../utils/widgetDisplay';
import { validateAndNormalize } from '../config/AppSchema';

const DESKTOP_WIDTH = 1440;
const DESKTOP_HEIGHT = 900;

const noopAsync = async () => false;
const noop = () => {};

function normalizeActiveWidgets(value) {
    const source = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? [value] : []);
    const normalized = source.filter((item) => typeof item === 'string' && item.trim()).slice(0, 3);
    return normalized.length > 0 ? normalized : [...DEFAULT_ACTIVE_WIDGETS];
}

function normalizeCountdownItems(countdownBranch) {
    const branch = countdownBranch || {};
    const rawItems = Array.isArray(branch.items) ? branch.items : [];
    const items = (rawItems.length > 0 ? rawItems : ((branch.title || branch.targetDate || branch.details)
        ? [{ id: 'countdown-1', title: branch.title, targetDate: branch.targetDate, details: branch.details, showDetails: branch.showDetails }]
        : []))
        .map((item, index) => ({
            id: String(item?.id ?? `countdown-${index + 1}`),
            title: item?.title ?? '',
            targetDate: item?.targetDate ?? '',
            details: item?.details ?? '',
            showDetails: item?.showDetails ?? false,
        }));

    const validIds = new Set(items.map((item) => item.id));
    const activeItemId = validIds.has(String(branch.activeItemId ?? ''))
        ? String(branch.activeItemId)
        : (items[0]?.id ?? null);

    return { items, activeItemId };
}

function toLegacyPolls(pollsBranch) {
    const branch = pollsBranch || {};
    const activePollId = branch.activePollId || null;
    const items = Array.isArray(branch.items) ? branch.items : [];

    return items.map((poll) => ({
        ...poll,
        active: activePollId !== null && String(activePollId) === String(poll?.id),
    }));
}

function toPreviewWidgetConfig(widgets) {
    const source = widgets || {};
    const data = source.data || {};
    const display = mergeWidgetSettings(source.display || {});
    const activeWidgets = normalizeActiveWidgets(source.active);
    const countdown = normalizeCountdownItems(data.countdown || {});
    const activeCountdown = countdown.items.find((item) => item.id === countdown.activeItemId) || null;

    return {
        activeWidgets,
        activeWidget: activeWidgets[0] || 'events',
        rotationInterval: Number.isFinite(Number(source.carousel?.rotationIntervalSeconds))
            ? Number(source.carousel.rotationIntervalSeconds)
            : 8,
        widgetSettings: display,
        ...display,
        events: Array.isArray(data.events?.items) ? data.events.items : [],
        displayCount: Number.isFinite(Number(data.events?.displayCount)) ? Number(data.events.displayCount) : 3,
        displayMode: typeof data.events?.displayMode === 'string' ? data.events.displayMode : 'default',
        alerts: Array.isArray(data.alerts?.items) ? data.alerts.items : [],
        outstanding: Array.isArray(data.outstanding?.items)
            ? data.outstanding.items.map((item) => ({
                ...item,
                image: item?.imageUrl ?? item?.image ?? '',
            }))
            : [],
        countdown: {
            title: activeCountdown?.title ?? data.countdown?.title ?? '',
            targetDate: activeCountdown?.targetDate ?? data.countdown?.targetDate ?? '',
            details: activeCountdown?.details ?? data.countdown?.details ?? '',
            showDetails: activeCountdown?.showDetails ?? data.countdown?.showDetails ?? false,
            switchIntervalSeconds: Number.isFinite(Number(data.countdown?.switchIntervalSeconds))
                ? Math.min(30, Math.max(3, Number(data.countdown.switchIntervalSeconds)))
                : 8,
            items: countdown.items,
            activeItemId: countdown.activeItemId,
        },
        news: Array.isArray(data.news?.items) ? data.news.items : [],
        phonebook: Array.isArray(data.phonebook?.items) ? data.phonebook.items : [],
        shuttles: Array.isArray(data.shuttles?.items) ? data.shuttles.items : [],
        polls: toLegacyPolls(data.polls),
        celebrations: Array.isArray(data.celebrations?.items) ? data.celebrations.items : [],
        heritage: Array.isArray(data.heritage?.items) ? data.heritage.items : [],
        tips: Array.isArray(data.tips?.items) ? data.tips.items : [],
    };
}

function normalizePercent(value, fallback = 60) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.round(parsed)));
}

function toPreviewTheme(config) {
    const theme = config?.theme || {};
    const layout = config?.layout || {};

    return {
        primaryColor: theme.primaryColor || '#0891b2',
        displayMode: theme.displayMode || 'user-toggle',
        borderStyle: theme.borderStyle || 'cyber',
        useTintedBackground: theme.backgrounds?.tinted?.enabled ?? true,
        tintedBackgroundStrength: theme.backgrounds?.tinted?.strength ?? 72,
        borderTargets: theme.borderTargets || {},
        heroGrayscale: theme.backgrounds?.hero?.grayscale ?? false,
        heroGlassEffect: theme.backgrounds?.hero?.glassEffect ?? false,
        heroGlassStrength: normalizePercent(theme.backgrounds?.hero?.glassStrength, 58),
        topNavGlassEffect: theme.backgrounds?.navbar?.glassEffect ?? false,
        topNavGlassStrength: normalizePercent(theme.backgrounds?.navbar?.glassStrength, 62),
        heroPanelsBordered: layout.hero?.panelsBordered ?? true,
        commanderPanelBordered: layout.hero?.commanderPanelBordered ?? false,
        widgetPanelBordered: layout.hero?.widgetPanelBordered ?? layout.hero?.panelsBordered ?? true,
        showNavCategories: layout.navigation?.showCategories ?? false,
        regularLinksLayout: layout.navigation?.mode || 'sidebar-right',
        externalLinksLayout: layout.externalLinks?.mode || 'cards',
        externalLinksFixed: layout.externalLinks?.fixed ?? false,
        externalLinksBordered: layout.externalLinks?.bordered ?? true,
        externalLinksShowBackground: layout.externalLinks?.showBackground ?? true,
        widgetHeight: layout.hero?.widgetHeight || 'full',
        linksLayout: 'cards',
    };
}

function BackupPreviewProviders({ config, children }) {
    const normalizedConfig = useMemo(() => validateAndNormalize(config), [config]);
    const previewTheme = useMemo(() => toPreviewTheme(normalizedConfig), [normalizedConfig]);
    const previewMode = previewTheme.displayMode === 'light' ? 'light' : 'dark';
    const previewBorderTargets = useMemo(
        () => normalizedConfig.theme?.borderTargets || {},
        [normalizedConfig.theme?.borderTargets],
    );
    const widgetConfig = useMemo(() => toPreviewWidgetConfig(normalizedConfig.widgets), [normalizedConfig.widgets]);

    const configContextValue = useMemo(() => ({
        config: normalizedConfig,
        status: 'idle',
        error: null,
        updateConfig: noop,
        saveNow: async () => normalizedConfig,
        reload: async () => normalizedConfig,
        factoryReset: noopAsync,
    }), [normalizedConfig]);

    const themeContextValue = useMemo(() => ({
        theme: previewTheme,
        loading: false,
        error: null,
        siteMode: previewMode,
        adminMode: previewMode,
        isAdminRoute: false,
        effectiveMode: previewMode,
        saveTheme: noopAsync,
        fetchTheme: noopAsync,
        toggleUserMode: noop,
        toggleAdminMode: noop,
        borderTargets: previewBorderTargets,
        setBorderTargets: noop,
    }), [previewBorderTargets, previewMode, previewTheme]);

    const widgetContextValue = useMemo(() => ({
        widgetConfig,
        loading: false,
        error: null,
        saveWidgetConfig: noopAsync,
        savePollVote: noopAsync,
        fetchWidgetConfig: noopAsync,
        updateField: noop,
    }), [widgetConfig]);

    return (
        <ConfigContext.Provider value={configContextValue}>
            <NavigationProvider>
                <EventsProvider>
                    <SiteContentProvider>
                        <OrgChartProvider>
                            <ExternalLinksProvider>
                                <ThemeContext.Provider value={themeContextValue}>
                                    <WidgetContext.Provider value={widgetContextValue}>
                                        {children}
                                    </WidgetContext.Provider>
                                </ThemeContext.Provider>
                            </ExternalLinksProvider>
                        </OrgChartProvider>
                    </SiteContentProvider>
                </EventsProvider>
            </NavigationProvider>
        </ConfigContext.Provider>
    );
}

export default function BackupSiteLivePreview({ config }) {
    const containerRef = useRef(null);
    const contentRef = useRef(null);
    const [scale, setScale] = useState(1);
    const normalizedConfig = useMemo(() => validateAndNormalize(config), [config]);
    const previewTheme = useMemo(() => toPreviewTheme(normalizedConfig), [normalizedConfig]);

    useEffect(() => {
        if (!containerRef.current) return undefined;

        const observer = new ResizeObserver((entries) => {
            const { width } = entries[0].contentRect;
            if (!width) return;
            setScale(width / DESKTOP_WIDTH);
        });

        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!contentRef.current) return;
        applyThemeToElement(contentRef.current, previewTheme);
    }, [previewTheme]);

    return (
        <div
            ref={containerRef}
            className="relative w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 shadow-2xl dark:border-white/10"
            style={{ aspectRatio: `${DESKTOP_WIDTH} / ${DESKTOP_HEIGHT}` }}
        >
            <div
                ref={contentRef}
                data-backup-site-live-preview-scroll
                className="custom-scrollbar absolute right-0 top-0 origin-top-right overflow-y-auto overflow-x-hidden bg-[var(--color-bg-base)] overscroll-contain"
                style={{
                    width: `${DESKTOP_WIDTH}px`,
                    height: `${DESKTOP_HEIGHT}px`,
                    transform: `scale(${scale})`,
                }}
            >
                <BackupPreviewProviders config={normalizedConfig}>
                    <div className="pointer-events-none min-h-full w-full select-none pb-32">
                        <Home isPreview />
                    </div>
                </BackupPreviewProviders>
            </div>
        </div>
    );
}
