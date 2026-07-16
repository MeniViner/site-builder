import React, { createContext, useMemo, useContext, useCallback } from 'react';
import { useConfig } from './ConfigProvider';
import { normalizeLinkTarget } from '../utils/linkTargets';
import { useOptimisticBranchPersistence } from './useOptimisticBranchPersistence';

const ExternalLinksContext = createContext();

export const useExternalLinks = () => useContext(ExternalLinksContext);

function toLegacyLink(item, index) {
    const visual = item?.visual || { type: 'none' };
    const imageUrl = visual.type === 'image' ? visual.imageUrl || '' : '';
    const icon = visual.type === 'icon' ? visual.icon || '' : '';

    return {
        id: String(item?.id ?? `${index + 1}`),
        title: item?.title ?? '',
        url: normalizeLinkTarget(item?.url ?? ''),
        icon,
        iconUrl: imageUrl,
        image: imageUrl,
        order: Number.isFinite(Number(item?.order)) ? Number(item.order) : index,
    };
}

function toLegacyLinks(items) {
    const source = Array.isArray(items) ? items : [];
    return source.map((item, index) => toLegacyLink(item, index));
}

function toV1Visual(link) {
    const image = typeof link?.iconUrl === 'string' && link.iconUrl.trim()
        ? link.iconUrl
        : (typeof link?.image === 'string' && link.image.trim() ? link.image : '');
    const icon = typeof link?.icon === 'string' && link.icon.trim() ? link.icon : '';

    if (image) return { type: 'image', imageUrl: image };
    if (icon) return { type: 'icon', icon };
    return { type: 'none' };
}

function toV1Links(links) {
    const source = Array.isArray(links) ? links : [];
    return source.map((link, index) => ({
        id: String(link?.id ?? `${index + 1}`),
        title: link?.title ?? '',
        url: normalizeLinkTarget(link?.url ?? ''),
        visual: toV1Visual(link),
        order: Number.isFinite(Number(link?.order)) ? Number(link.order) : index,
    }));
}

export const ExternalLinksProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();

    const patchExternalLinksConfig = useCallback((prev, items) => ({
        ...prev,
        externalLinks: {
            ...prev.externalLinks,
            items,
        },
    }), []);

    const {
        value: persistedLinks,
        commit,
        flush,
        retry,
        saving,
        dirty,
        saveError,
        saveStatus,
    } = useOptimisticBranchPersistence({
        sourceValue: config?.externalLinks?.items,
        normalizeValue: toV1Links,
        patchConfig: patchExternalLinksConfig,
        updateConfig,
        saveNow,
    });

    const externalLinks = useMemo(
        () => toLegacyLinks(persistedLinks),
        [persistedLinks]
    );

    const loading = status === 'loading';

    const fetchExternalLinks = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch {
            return false;
        }
    }, [reload]);

    const saveExternalLinks = useCallback((newLinksOrUpdater) => commit((currentItems) => {
        const currentLinks = toLegacyLinks(currentItems);
        const nextLinks = typeof newLinksOrUpdater === 'function'
            ? newLinksOrUpdater(currentLinks)
            : newLinksOrUpdater;
        return toV1Links(nextLinks);
    }), [commit]);

    return (
        <ExternalLinksContext.Provider
            value={{
                externalLinks,
                loading,
                error: saveError?.message || error,
                saving,
                dirty,
                saveStatus,
                retrySave: retry,
                flushSave: flush,
                saveExternalLinks,
                fetchExternalLinks,
            }}
        >
            {children}
        </ExternalLinksContext.Provider>
    );
};
