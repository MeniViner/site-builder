import { DEFAULT_CONFIG_V1 } from '../config/AppSchema';
import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { cloneDefaultSampleAdminUsers } from '../config/defaultUsers';
import { ensureSharePointTextFileExists, upsertSharePointTextFile } from '../utils/sharepointUtils';
import { spLog } from '../utils/spAppLog';
import { DEFAULT_ACTIVE_WIDGETS, mergeWidgetSettings } from '../utils/widgetDisplay';
import { resolveDefaultMasterConfigFileUrl } from './ConfigAdapter';

const clone = (value) => JSON.parse(JSON.stringify(value));

const asString = (value, fallback = '') => (typeof value === 'string' ? value : fallback);

const toLegacyEventsPayload = (defaults) => {
    const eventsBranch = defaults?.widgets?.data?.events || {};
    return {
        displayCount: Number.isFinite(Number(eventsBranch.displayCount)) ? Number(eventsBranch.displayCount) : 3,
        displayMode: asString(eventsBranch.displayMode, 'default'),
        events: Array.isArray(eventsBranch.items) ? clone(eventsBranch.items) : [],
    };
};

const toLegacyNavigationPayload = (defaults) => {
    const level1 = Array.isArray(defaults?.navigation?.items) ? defaults.navigation.items : [];

    return level1.map((node, l1Index) => {
        const children = Array.isArray(node?.children) ? node.children : [];
        const l1Id = asString(node?.id, `nav_${l1Index + 1}`);

        return {
            id: l1Id,
            label: asString(node?.label, ''),
            icon: asString(node?.icon, ''),
            url: asString(node?.url, ''),
            children: children.map((child, l2Index) => {
                const subLinks = Array.isArray(child?.children) ? child.children : [];
                const l2Id = asString(child?.id, `${l1Id}_sub_${l2Index + 1}`);
                const title = asString(child?.label, asString(child?.title, ''));

                return {
                    id: l2Id,
                    title,
                    label: title,
                    icon: asString(child?.icon, ''),
                    url: asString(child?.url, ''),
                    subLinks: subLinks.map((link, l3Index) => ({
                        id: asString(link?.id, `${l2Id}_link_${l3Index + 1}`),
                        label: asString(link?.label, asString(link?.title, '')),
                        icon: asString(link?.icon, ''),
                        url: asString(link?.url, ''),
                    })),
                };
            }),
        };
    });
};

const toLegacyThemePayload = (defaults) => {
    const theme = defaults?.theme || {};
    const layout = defaults?.layout || {};

    return {
        primaryColor: asString(theme.primaryColor, '#0891b2'),
        displayMode: asString(theme.displayMode, 'dark'),
        borderStyle: asString(theme.borderStyle, 'cyber'),
        useTintedBackground: theme?.backgrounds?.tinted?.enabled ?? true,
        tintedBackgroundStrength: Number.isFinite(Number(theme?.backgrounds?.tinted?.strength))
            ? Number(theme.backgrounds.tinted.strength)
            : 72,
        borderTargets: clone(theme?.borderTargets || {}),
        heroGrayscale: theme?.backgrounds?.hero?.grayscale ?? false,
        heroPanelsBordered: layout?.hero?.panelsBordered ?? true,
        commanderPanelBordered: layout?.hero?.commanderPanelBordered ?? false,
        widgetPanelBordered: layout?.hero?.widgetPanelBordered ?? layout?.hero?.panelsBordered ?? true,
        showNavCategories: layout?.navigation?.showCategories ?? false,
        regularLinksLayout: asString(layout?.navigation?.mode, 'sidebar-right'),
        externalLinksLayout: asString(layout?.externalLinks?.mode, 'cards'),
        externalLinksFixed: layout?.externalLinks?.fixed ?? false,
        externalLinksBordered: layout?.externalLinks?.bordered ?? true,
        externalLinksShowBackground: layout?.externalLinks?.showBackground ?? true,
        widgetHeight: asString(layout?.hero?.widgetHeight, 'full'),
        linksLayout: 'cards',
    };
};

const toLegacySiteContentPayload = (defaults) => {
    const content = defaults?.content || {};
    const hero = content?.hero || {};
    const commander = content?.commander || {};

    return {
        hero: {
            siteName: asString(hero.siteName, ''),
            title: asString(hero.title, ''),
            subtitle: asString(hero.subtitle, ''),
            logo: asString(hero.logoUrl, ''),
            description: asString(hero.description, ''),
            backgroundImages: Array.isArray(hero.backgroundImageUrls) ? clone(hero.backgroundImageUrls) : [],
        },
        commander: {
            image: asString(commander.imageUrl, ''),
            sectionTitle: asString(commander.sectionTitle, ''),
            roleLabel: asString(commander.roleLabel, ''),
            decorativeElement: asString(commander.decorativeElement, 'line-diamond-line'),
            messages: Array.isArray(commander.messages) ? clone(commander.messages) : [],
        },
        overlayImage: clone(content.overlayImage || {}),
    };
};

const toLegacyWidgetsPayload = (defaults) => {
    const widgets = defaults?.widgets || {};
    const data = widgets?.data || {};
    const events = data?.events || {};
    const countdown = data?.countdown || {};

    const countdownItems = Array.isArray(countdown.items) ? clone(countdown.items) : [];
    const activeCountdownId = countdown.activeItemId ? String(countdown.activeItemId) : null;
    const activeCountdown = countdownItems.find((item) => String(item?.id) === activeCountdownId) || countdownItems[0] || null;

    const pollsBranch = data?.polls || {};
    const activePollId = pollsBranch.activePollId ? String(pollsBranch.activePollId) : null;
    const polls = (Array.isArray(pollsBranch.items) ? pollsBranch.items : []).map((poll, index) => {
        const id = String(poll?.id ?? `${index + 1}`);
        return {
            ...clone(poll),
            id,
            active: activePollId !== null && activePollId === id,
        };
    });

    const activeWidgets = Array.isArray(widgets.active) && widgets.active.length > 0
        ? widgets.active.slice(0, 3)
        : [...DEFAULT_ACTIVE_WIDGETS];

    return {
        activeWidgets,
        activeWidget: activeWidgets[0] || DEFAULT_ACTIVE_WIDGETS[0],
        rotationInterval: Number.isFinite(Number(widgets?.carousel?.rotationIntervalSeconds))
            ? Number(widgets.carousel.rotationIntervalSeconds)
            : 8,
        widgetSettings: mergeWidgetSettings(widgets.display || {}),
        events: Array.isArray(events.items) ? clone(events.items) : [],
        displayCount: Number.isFinite(Number(events.displayCount)) ? Number(events.displayCount) : 3,
        displayMode: asString(events.displayMode, 'default'),
        alerts: Array.isArray(data?.alerts?.items) ? clone(data.alerts.items) : [],
        outstanding: Array.isArray(data?.outstanding?.items)
            ? data.outstanding.items.map((item) => ({
                ...clone(item),
                image: asString(item?.imageUrl, asString(item?.image, '')),
            }))
            : [],
        countdown: {
            title: asString(activeCountdown?.title, ''),
            targetDate: asString(activeCountdown?.targetDate, ''),
            details: asString(activeCountdown?.details, ''),
            showDetails: activeCountdown?.showDetails ?? false,
            switchIntervalSeconds: Number.isFinite(Number(countdown.switchIntervalSeconds))
                ? Number(countdown.switchIntervalSeconds)
                : 8,
            activeItemId: activeCountdown ? String(activeCountdown.id) : null,
            items: countdownItems.map((item, index) => ({
                id: String(item?.id ?? `countdown-${index + 1}`),
                title: asString(item?.title, ''),
                targetDate: asString(item?.targetDate, ''),
                details: asString(item?.details, ''),
                showDetails: item?.showDetails ?? false,
            })),
        },
        news: Array.isArray(data?.news?.items) ? clone(data.news.items) : [],
        phonebook: Array.isArray(data?.phonebook?.items) ? clone(data.phonebook.items) : [],
        shuttles: Array.isArray(data?.shuttles?.items) ? clone(data.shuttles.items) : [],
        polls,
        celebrations: Array.isArray(data?.celebrations?.items) ? clone(data.celebrations.items) : [],
        heritage: Array.isArray(data?.heritage?.items) ? clone(data.heritage.items) : [],
        tips: Array.isArray(data?.tips?.items) ? clone(data.tips.items) : [],
    };
};

const toLegacyExternalLinksPayload = (defaults) => {
    const items = Array.isArray(defaults?.externalLinks?.items) ? defaults.externalLinks.items : [];

    return items.map((item, index) => {
        const visual = item?.visual || { type: 'none' };
        const image = visual.type === 'image' ? asString(visual.imageUrl, '') : '';
        const icon = visual.type === 'icon' ? asString(visual.icon, '') : '';

        return {
            id: asString(item?.id, String(index + 1)),
            title: asString(item?.title, ''),
            url: asString(item?.url, ''),
            icon,
            iconUrl: image,
            image,
            order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
        };
    });
};

const buildBootstrapFileDefinitions = () => {
    const defaults = clone(DEFAULT_CONFIG_V1);

    return [
        {
            key: 'master',
            label: 'קונפיגורציית מאסטר',
            serverRelativeUrl: resolveDefaultMasterConfigFileUrl(),
            contentType: 'text/plain; charset=utf-8',
            text: JSON.stringify(defaults, null, 2),
        },
        {
            key: 'users',
            label: 'משתמשים',
            serverRelativeUrl: SHAREPOINT_CONFIG.usersFileServerRelativeUrl,
            text: JSON.stringify(cloneDefaultSampleAdminUsers(), null, 2),
        },
        {
            key: 'events',
            label: 'אירועים',
            serverRelativeUrl: SHAREPOINT_CONFIG.fileServerRelativeUrl,
            text: JSON.stringify(toLegacyEventsPayload(defaults), null, 2),
        },
        {
            key: 'navigation',
            label: 'ניווט',
            serverRelativeUrl: SHAREPOINT_CONFIG.navFileServerRelativeUrl,
            text: JSON.stringify(toLegacyNavigationPayload(defaults), null, 2),
        },
        {
            key: 'site-content',
            label: 'תוכן אתר',
            serverRelativeUrl: SHAREPOINT_CONFIG.siteContentFileServerRelativeUrl,
            text: JSON.stringify(toLegacySiteContentPayload(defaults), null, 2),
        },
        {
            key: 'theme',
            label: 'עיצוב',
            serverRelativeUrl: SHAREPOINT_CONFIG.themeFileServerRelativeUrl,
            text: JSON.stringify(toLegacyThemePayload(defaults), null, 2),
        },
        {
            key: 'widgets',
            label: 'ווידגטים',
            serverRelativeUrl: SHAREPOINT_CONFIG.widgetsFileServerRelativeUrl,
            text: JSON.stringify(toLegacyWidgetsPayload(defaults), null, 2),
        },
        {
            key: 'external-links',
            label: 'קישורים חיצוניים',
            serverRelativeUrl: SHAREPOINT_CONFIG.externalLinksFileServerRelativeUrl,
            text: JSON.stringify(toLegacyExternalLinksPayload(defaults), null, 2),
        },
    ].filter((file) => typeof file.serverRelativeUrl === 'string' && file.serverRelativeUrl.trim().length > 0);
};

let bootstrapOncePromise = null;

export const ensureSharePointBootstrapFiles = async () => {
    if (SHAREPOINT_CONFIG.useMock) {
        return [];
    }

    if (bootstrapOncePromise) {
        return bootstrapOncePromise;
    }

    bootstrapOncePromise = (async () => {
        const files = buildBootstrapFileDefinitions();
        const summary = [];

        spLog.boot(`Bootstrap SharePoint: בודק/יוצר קבצי מערכת (${files.length})...`);

        for (const file of files) {
            try {
                const result = await ensureSharePointTextFileExists({
                    serverRelativeUrl: file.serverRelativeUrl,
                    text: file.text,
                    contentType: file.contentType || 'text/plain; charset=utf-8',
                });

                summary.push({
                    key: file.key,
                    created: result.created,
                    serverRelativeUrl: file.serverRelativeUrl,
                });

                if (result.created) {
                    spLog.success(`Bootstrap: נוצר קובץ ${file.label}`);
                } else {
                    spLog.file(`Bootstrap: קובץ כבר קיים ${file.label}`);
                }
            } catch (error) {
                summary.push({
                    key: file.key,
                    created: false,
                    serverRelativeUrl: file.serverRelativeUrl,
                    error: error?.message || String(error),
                });
                spLog.warn(`Bootstrap: נכשל ביצירת ${file.label} (${file.serverRelativeUrl})`, error);
            }
        }

        return summary;
    })();

    return bootstrapOncePromise;
};

export const overwriteSharePointBootstrapFiles = async () => {
    if (SHAREPOINT_CONFIG.useMock) {
        return [];
    }

    const files = buildBootstrapFileDefinitions();
    const summary = [];

    spLog.boot(`Factory reset: מעדכן קבצי מערכת לברירות מחדל (${files.length})...`);

    for (const file of files) {
        try {
            const { response } = await upsertSharePointTextFile({
                serverRelativeUrl: file.serverRelativeUrl,
                text: file.text,
                contentType: file.contentType || 'text/plain; charset=utf-8',
            });

            const ok = Boolean(response?.ok);
            summary.push({
                key: file.key,
                ok,
                status: response?.status ?? null,
                serverRelativeUrl: file.serverRelativeUrl,
            });

            if (ok) {
                spLog.success(`Factory reset: עודכן קובץ ${file.label}`);
            } else {
                spLog.warn(
                    `Factory reset: שמירת ${file.label} חזרה עם סטטוס ${response?.status ?? 'unknown'}`
                );
            }
        } catch (error) {
            summary.push({
                key: file.key,
                ok: false,
                status: null,
                serverRelativeUrl: file.serverRelativeUrl,
                error: error?.message || String(error),
            });
            spLog.warn(`Factory reset: נכשל בעדכון ${file.label} (${file.serverRelativeUrl})`, error);
        }
    }

    return summary;
};
