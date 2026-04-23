// src/context/WidgetContext.jsx
import React, { createContext, useMemo, useContext, useCallback, useEffect, useState } from 'react';
import { useConfig } from './ConfigProvider';
import { DEFAULT_ACTIVE_WIDGETS, mergeWidgetSettings } from '../utils/widgetDisplay';
import WidgetService from '../services/WidgetService';

export const WidgetContext = createContext();

export const useWidget = () => useContext(WidgetContext);

const VALID_WIDGET_IDS = new Set([
    'events',
    'alerts',
    'outstanding',
    'countdown',
    'news',
    'phonebook',
    'shuttles',
    'polls',
    'celebrations',
    'heritage',
    'tips',
]);

function normalizeActiveWidgets(value, fallback = DEFAULT_ACTIVE_WIDGETS) {
    const source = Array.isArray(value)
        ? value
        : (typeof value === 'string' ? [value] : []);
    const next = [];
    const seen = new Set();

    source.forEach((item) => {
        const id = typeof item === 'string' ? item : '';
        if (!VALID_WIDGET_IDS.has(id) || seen.has(id)) return;
        seen.add(id);
        next.push(id);
    });

    if (next.length === 0) return [...fallback];
    return next.slice(0, 3);
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

function resolvePollActiveId(polls) {
    const source = Array.isArray(polls) ? polls : [];
    const activePoll = source.find((poll) => poll?.active === true);
    return activePoll?.id ? String(activePoll.id) : null;
}

function toV1Polls(polls) {
    const source = Array.isArray(polls) ? polls : [];
    const items = source.map((poll, index) => {
        const id = String(poll?.id ?? `${index + 1}`);
        return {
            id,
            question: poll?.question ?? '',
            options: Array.isArray(poll?.options)
                ? poll.options.map((option, optionIndex) => ({
                    id: String(option?.id ?? `${id}-opt-${optionIndex + 1}`),
                    text: option?.text ?? '',
                    votes: Number.isFinite(Number(option?.votes)) ? Number(option.votes) : 0,
                    voters: Array.isArray(option?.voters)
                        ? option.voters.map((voter, voterIndex) => ({
                            id: String(voter?.id ?? `${id}-opt-${optionIndex + 1}-voter-${voterIndex + 1}`),
                            name: typeof voter === 'string'
                                ? voter
                                : (voter?.name ?? voter?.displayName ?? ''),
                            email: typeof voter === 'string' ? '' : (voter?.email ?? ''),
                            loginName: typeof voter === 'string' ? '' : (voter?.loginName ?? ''),
                            personalNumber: typeof voter === 'string' ? '' : (voter?.personalNumber ?? ''),
                            votedAt: typeof voter === 'string' ? '' : (voter?.votedAt ?? ''),
                        }))
                        : [],
                }))
                : [],
        };
    });

    const activePollId = resolvePollActiveId(source);
    return { activePollId, items };
}

function toLegacyWidgetConfig(widgets) {
    const source = widgets || {};
    const data = source.data || {};
    const display = mergeWidgetSettings(source.display || {});

    const activeWidgets = normalizeActiveWidgets(source.active, DEFAULT_ACTIVE_WIDGETS);
    const eventsBranch = data.events || {};
    const eventItems = Array.isArray(eventsBranch.items)
        ? eventsBranch.items
        : (Array.isArray(eventsBranch.events)
            ? eventsBranch.events
            : (Array.isArray(source.events) ? source.events : []));
    const alertItems = Array.isArray(data.alerts?.items)
        ? data.alerts.items
        : (Array.isArray(source.alerts) ? source.alerts : []);

    return {
        activeWidgets,
        // Polyfill for legacy consumers (e.g. App.jsx) that still read a single widget id.
        activeWidget: activeWidgets[0] || 'events',
        rotationInterval: Number.isFinite(Number(source.carousel?.rotationIntervalSeconds))
            ? Number(source.carousel.rotationIntervalSeconds)
            : 8,
        widgetSettings: display,
        ...display,
        events: eventItems,
        displayCount: Number.isFinite(Number(eventsBranch.displayCount)) ? Number(eventsBranch.displayCount) : 3,
        displayMode: typeof eventsBranch.displayMode === 'string' ? eventsBranch.displayMode : 'default',
        alerts: alertItems,
        outstanding: Array.isArray(data.outstanding?.items)
            ? data.outstanding.items.map((item) => ({
                ...item,
                image: item?.imageUrl ?? item?.image ?? '',
            }))
            : [],
        countdown: (() => {
            const { items, activeItemId } = normalizeCountdownItems(data.countdown || {});
            const activeItem = items.find((item) => item.id === activeItemId) || null;
            return {
                title: activeItem?.title ?? data.countdown?.title ?? '',
                targetDate: activeItem?.targetDate ?? data.countdown?.targetDate ?? '',
                details: activeItem?.details ?? data.countdown?.details ?? '',
                showDetails: activeItem?.showDetails ?? data.countdown?.showDetails ?? false,
                switchIntervalSeconds: Number.isFinite(Number(data.countdown?.switchIntervalSeconds))
                    ? Math.min(30, Math.max(3, Number(data.countdown.switchIntervalSeconds)))
                    : 8,
                items,
                activeItemId,
            };
        })(),
        news: Array.isArray(data.news?.items) ? data.news.items : [],
        phonebook: Array.isArray(data.phonebook?.items) ? data.phonebook.items : [],
        shuttles: Array.isArray(data.shuttles?.items) ? data.shuttles.items : [],
        polls: toLegacyPolls(data.polls),
        celebrations: Array.isArray(data.celebrations?.items) ? data.celebrations.items : [],
        heritage: Array.isArray(data.heritage?.items) ? data.heritage.items : [],
        tips: Array.isArray(data.tips?.items) ? data.tips.items : [],
    };
}

function pickDisplaySettingsFromFlatConfig(flatConfig, currentDisplay) {
    const directDisplayCandidates = {};
    Object.keys(currentDisplay || {}).forEach((key) => {
        const candidate = flatConfig?.[key];
        if (
            candidate
            && typeof candidate === 'object'
            && candidate.itemsPerView !== undefined
            && candidate.intervalMs !== undefined
        ) {
            directDisplayCandidates[key] = candidate;
        }
    });

    return mergeWidgetSettings(flatConfig?.widgetSettings || directDisplayCandidates || currentDisplay || {});
}

function toV1WidgetPatch(flatConfig, prevWidgets) {
    const prev = prevWidgets || {};
    const prevData = prev.data || {};
    const prevDisplay = prev.display || {};
    const input = flatConfig || {};

    const activeWidgets = normalizeActiveWidgets(
        input.activeWidgets ?? input.activeWidget ?? prev.active ?? DEFAULT_ACTIVE_WIDGETS,
        Array.isArray(prev.active) && prev.active.length > 0 ? prev.active : DEFAULT_ACTIVE_WIDGETS
    );

    const rotationInterval = Number.isFinite(Number(input.rotationInterval))
        ? Number(input.rotationInterval)
        : Number(prev.carousel?.rotationIntervalSeconds ?? 8);

    const displaySettings = pickDisplaySettingsFromFlatConfig(input, prevDisplay);
    const polls = toV1Polls(input.polls ?? toLegacyPolls(prevData.polls));

    return {
        ...prev,
        active: activeWidgets,
        carousel: {
            ...prev.carousel,
            rotationIntervalSeconds: rotationInterval,
        },
        display: displaySettings,
        data: {
            ...prevData,
            events: {
                ...prevData.events,
                items: Array.isArray(input.events) ? input.events : (prevData.events?.items || []),
                displayCount: Number.isFinite(Number(input.displayCount))
                    ? Number(input.displayCount)
                    : Number(prevData.events?.displayCount ?? 3),
                displayMode: typeof input.displayMode === 'string'
                    ? input.displayMode
                    : (prevData.events?.displayMode || 'default'),
            },
            alerts: {
                items: Array.isArray(input.alerts) ? input.alerts : (prevData.alerts?.items || []),
            },
            outstanding: {
                items: Array.isArray(input.outstanding)
                    ? input.outstanding.map((item) => ({
                        ...item,
                        imageUrl: item?.imageUrl ?? item?.image ?? '',
                    }))
                    : (prevData.outstanding?.items || []),
            },
            countdown: (() => {
                if (!input.countdown || typeof input.countdown !== 'object') {
                    const fallback = prevData.countdown || { title: '', targetDate: '', details: '', showDetails: false, items: [], activeItemId: null };
                    const normalizedFallback = normalizeCountdownItems(fallback);
                    const activeFallback = normalizedFallback.items.find((item) => item.id === normalizedFallback.activeItemId) || null;
                    return {
                        ...fallback,
                        title: activeFallback?.title ?? fallback.title ?? '',
                        targetDate: activeFallback?.targetDate ?? fallback.targetDate ?? '',
                        details: activeFallback?.details ?? fallback.details ?? '',
                        showDetails: activeFallback?.showDetails ?? fallback.showDetails ?? false,
                        switchIntervalSeconds: Number.isFinite(Number(fallback.switchIntervalSeconds))
                            ? Math.min(30, Math.max(3, Number(fallback.switchIntervalSeconds)))
                            : 8,
                        items: normalizedFallback.items,
                        activeItemId: normalizedFallback.activeItemId,
                    };
                }

                const normalized = normalizeCountdownItems(input.countdown);
                const active = normalized.items.find((item) => item.id === normalized.activeItemId) || null;
                return {
                    title: active?.title ?? input.countdown.title ?? '',
                    targetDate: active?.targetDate ?? input.countdown.targetDate ?? '',
                    details: active?.details ?? input.countdown.details ?? '',
                    showDetails: active?.showDetails ?? input.countdown.showDetails ?? false,
                    switchIntervalSeconds: Number.isFinite(Number(input.countdown.switchIntervalSeconds))
                        ? Math.min(30, Math.max(3, Number(input.countdown.switchIntervalSeconds)))
                        : 8,
                    items: normalized.items,
                    activeItemId: normalized.activeItemId,
                };
            })(),
            news: {
                items: Array.isArray(input.news) ? input.news : (prevData.news?.items || []),
            },
            phonebook: {
                items: Array.isArray(input.phonebook) ? input.phonebook : (prevData.phonebook?.items || []),
            },
            shuttles: {
                items: Array.isArray(input.shuttles) ? input.shuttles : (prevData.shuttles?.items || []),
            },
            polls,
            celebrations: {
                items: Array.isArray(input.celebrations) ? input.celebrations : (prevData.celebrations?.items || []),
            },
            heritage: {
                items: Array.isArray(input.heritage) ? input.heritage : (prevData.heritage?.items || []),
            },
            tips: {
                items: Array.isArray(input.tips) ? input.tips : (prevData.tips?.items || []),
            },
        },
    };
}

export const WidgetProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();
    const [sharedPolls, setSharedPolls] = useState(null);
    const [sharedWidgetSnapshot, setSharedWidgetSnapshot] = useState(null);

    const baseWidgetConfig = useMemo(
        () => toLegacyWidgetConfig(config?.widgets),
        [config?.widgets]
    );

    const widgetConfig = useMemo(() => {
        if (!Array.isArray(sharedPolls)) {
            return baseWidgetConfig;
        }

        return {
            ...baseWidgetConfig,
            polls: sharedPolls,
        };
    }, [baseWidgetConfig, sharedPolls]);

    const loading = status === 'loading';

    const loadSharedPolls = useCallback(async () => {
        try {
            const storedWidgetConfig = await WidgetService.getWidgetConfig();
            const storedPolls = Array.isArray(storedWidgetConfig?.polls) ? storedWidgetConfig.polls : [];
            setSharedWidgetSnapshot(storedWidgetConfig || {});
            setSharedPolls(storedPolls);
            return true;
        } catch (err) {
            console.warn('WidgetContext: failed to load shared polls from widgets_data.txt', err);
            return false;
        }
    }, []);

    useEffect(() => {
        loadSharedPolls();
    }, [loadSharedPolls]);

    const fetchWidgetConfig = useCallback(async () => {
        try {
            await reload();
            await loadSharedPolls();
            return true;
        } catch {
            return false;
        }
    }, [reload, loadSharedPolls]);

    const persistPollsToSharedStore = useCallback(async (polls) => {
        try {
            const normalizedPolls = Array.isArray(polls) ? polls : [];
            const baseSharedConfig = sharedWidgetSnapshot && typeof sharedWidgetSnapshot === 'object'
                ? sharedWidgetSnapshot
                : await WidgetService.getWidgetConfig();

            const nextSharedConfig = {
                ...(baseSharedConfig || {}),
                polls: normalizedPolls,
            };

            const saved = await WidgetService.saveWidgetConfig(nextSharedConfig);
            const savedPolls = Array.isArray(saved?.polls) ? saved.polls : normalizedPolls;
            setSharedWidgetSnapshot(saved || nextSharedConfig);
            setSharedPolls(savedPolls);
            return true;
        } catch (err) {
            console.error('WidgetContext: failed to persist polls to widgets_data.txt', err);
            return false;
        }
    }, [sharedWidgetSnapshot]);

    const saveWidgetConfig = useCallback(async (newWidgetConfig) => {
        const hasPollsPayload = Object.prototype.hasOwnProperty.call(newWidgetConfig || {}, 'polls');
        let pollsSaved = true;

        if (hasPollsPayload) {
            pollsSaved = await persistPollsToSharedStore(newWidgetConfig?.polls);
        }

        try {
            updateConfig((prev) => ({
                ...prev,
                widgets: toV1WidgetPatch(newWidgetConfig, prev.widgets),
            }));
            await saveNow();
            return pollsSaved;
        } catch (err) {
            console.error(err);
            return false;
        }
    }, [persistPollsToSharedStore, saveNow, updateConfig]);

    const savePollVote = useCallback(async (nextPolls) => {
        const previousPolls = Array.isArray(sharedPolls) ? sharedPolls : [];
        const normalizedPolls = Array.isArray(nextPolls) ? nextPolls : [];
        setSharedPolls(normalizedPolls);

        const success = await persistPollsToSharedStore(normalizedPolls);
        if (!success) {
            setSharedPolls(previousPolls);
        }

        return success;
    }, [persistPollsToSharedStore, sharedPolls]);

    const updateField = useCallback((field, value) => {
        const nextConfig = {
            ...widgetConfig,
            [field]: value,
        };
        return saveWidgetConfig(nextConfig);
    }, [saveWidgetConfig, widgetConfig]);

    return (
        <WidgetContext.Provider
            value={{
                widgetConfig,
                loading,
                error,
                saveWidgetConfig,
                savePollVote,
                fetchWidgetConfig,
                updateField,
            }}
        >
            {children}
        </WidgetContext.Provider>
    );
};
