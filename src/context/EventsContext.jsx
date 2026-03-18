import React, { createContext, useMemo, useContext, useCallback } from 'react';
import { useConfig } from './ConfigProvider';

const EventsContext = createContext();

export const useEvents = () => useContext(EventsContext);

function toLegacyEvents(eventsBranch) {
    const branch = eventsBranch || {};
    return {
        events: Array.isArray(branch.items) ? branch.items : [],
        displayCount: Number.isFinite(Number(branch.displayCount)) ? Number(branch.displayCount) : 3,
        displayMode: typeof branch.displayMode === 'string' ? branch.displayMode : 'default',
    };
}

export const EventsProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();

    const { events, displayCount, displayMode } = useMemo(
        () => toLegacyEvents(config?.widgets?.data?.events),
        [config?.widgets?.data?.events]
    );

    const loading = status === 'loading';

    const fetchEvents = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch (err) {
            return false;
        }
    }, [reload]);

    const saveEvents = useCallback(
        async (newEvents, newDisplayCount, newDisplayMode) => {
            try {
                updateConfig((prev) => ({
                    ...prev,
                    widgets: {
                        ...(prev?.widgets || {}),
                        data: {
                            ...(prev?.widgets?.data || {}),
                            events: {
                                ...(prev?.widgets?.data?.events || {}),
                                items: Array.isArray(newEvents) ? newEvents : [],
                                displayCount: Number.isFinite(Number(newDisplayCount))
                                    ? Number(newDisplayCount)
                                    : Number(prev?.widgets?.data?.events?.displayCount ?? 3),
                                displayMode: typeof newDisplayMode === 'string'
                                    ? newDisplayMode
                                    : (prev?.widgets?.data?.events?.displayMode || 'default'),
                            },
                        },
                    },
                }));
                await saveNow();
                return true;
            } catch (err) {
                console.error(err);
                return false;
            }
        },
        [saveNow, updateConfig]
    );

    return (
        <EventsContext.Provider
            value={{
                events,
                displayCount,
                displayMode,
                loading,
                error,
                saveEvents,
                fetchEvents,
            }}
        >
            {children}
        </EventsContext.Provider>
    );
};
