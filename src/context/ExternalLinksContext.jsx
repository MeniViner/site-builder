import React, { createContext, useMemo, useContext, useCallback } from 'react';
import { useConfig } from './ConfigProvider';
import { normalizeLinkTarget } from '../utils/linkTargets';
import { spLog } from '../utils/spAppLog';

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

    const externalLinks = useMemo(
        () => toLegacyLinks(config?.externalLinks?.items),
        [config?.externalLinks?.items]
    );

    const loading = status === 'loading' || status === 'saving';

    const fetchExternalLinks = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch (err) {
            return false;
        }
    }, [reload]);

    const saveExternalLinks = useCallback(
        async (newLinks) => {
            try {
                const mapped = toV1Links(newLinks);
                updateConfig((prev) => ({
                    ...prev,
                    externalLinks: {
                        ...prev.externalLinks,
                        items: mapped,
                    },
                }));
                await saveNow();
                return true;
            } catch (err) {
                spLog.error('ExternalLinksContext: failed to save external links.', err);
                return false;
            }
        },
        [saveNow, updateConfig]
    );

    return (
        <ExternalLinksContext.Provider
            value={{
                externalLinks,
                loading,
                error,
                saveExternalLinks,
                fetchExternalLinks,
            }}
        >
            {children}
        </ExternalLinksContext.Provider>
    );
};
