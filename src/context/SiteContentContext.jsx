/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useMemo, useContext, useCallback } from 'react';
import { useConfig } from './ConfigProvider';
import { spLog } from '../utils/spAppLog';
import { normalizeCommanderImageSettings } from '../utils/commanderImage';

export const SiteContentContext = createContext();

export const useSiteContent = () => useContext(SiteContentContext);

const SAFE_EMPTY_MESSAGE = { id: '__empty__', text: '', signature: '' };
const LEGACY_FIELD_MAP = {
    'hero.backgroundImageUrls': 'hero.backgroundImages',
    'hero.logoUrl': 'hero.logo',
    'commander.imageUrl': 'commander.image',
};

function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function ensureLegacySiteContentContract(content) {
    const source = isObject(content) ? content : {};
    const hero = isObject(source.hero) ? source.hero : {};
    const commander = isObject(source.commander) ? source.commander : {};

    const logoUrl = typeof hero.logoUrl === 'string'
        ? hero.logoUrl
        : (typeof hero.logo === 'string' ? hero.logo : '');
    const backgroundImageUrls = Array.isArray(hero.backgroundImageUrls)
        ? [...hero.backgroundImageUrls]
        : (Array.isArray(hero.backgroundImages) ? [...hero.backgroundImages] : []);
    const messages = Array.isArray(commander.messages) && commander.messages.length > 0
        ? commander.messages
            .filter((item) => isObject(item))
            .map((item, index) => ({
                id: typeof item.id === 'string' ? item.id : String(index + 1),
                text: typeof item.text === 'string' ? item.text : '',
                signature: typeof item.signature === 'string' ? item.signature : '',
            }))
        : [{ ...SAFE_EMPTY_MESSAGE }];
    const normalizedCommander = normalizeCommanderImageSettings(commander);

    return {
        hero: {
            siteName: typeof hero.siteName === 'string' ? hero.siteName : '',
            title: typeof hero.title === 'string' ? hero.title : '',
            subtitle: typeof hero.subtitle === 'string' ? hero.subtitle : '',
            logo: logoUrl,
            logoUrl,
            description: typeof hero.description === 'string' ? hero.description : '',
            backgroundImages: backgroundImageUrls,
            backgroundImageUrls,
        },
        commander: {
            image: normalizedCommander.image,
            imageUrl: normalizedCommander.imageUrl,
            imageSource: normalizedCommander.imageSource,
            imageAvatar: normalizedCommander.imageAvatar,
            customImageUrl: normalizedCommander.customImageUrl,
            sectionTitle: typeof commander.sectionTitle === 'string' ? commander.sectionTitle : '',
            roleLabel: typeof commander.roleLabel === 'string' ? commander.roleLabel : '',
            decorativeElement: typeof commander.decorativeElement === 'string'
                ? commander.decorativeElement
                : 'line-diamond-line',
            messages,
            imageScale: normalizedCommander.imageScale,
            imageOffsetX: normalizedCommander.imageOffsetX,
            imageOffsetY: normalizedCommander.imageOffsetY,
        },
        overlayImage: isObject(source.overlayImage) ? { ...source.overlayImage } : {},
    };
}

function normalizeMessagesWithFallback(messages, fallbackMessages = []) {
    const fallback = Array.isArray(fallbackMessages) ? fallbackMessages : [];
    const source = Array.isArray(messages) ? messages : fallback;

    return source
        .filter((item) => isObject(item))
        .map((item, index) => ({
            id: typeof item.id === 'string' ? item.id : String(index + 1),
            text: typeof item.text === 'string' ? item.text : '',
            signature: typeof item.signature === 'string' ? item.signature : '',
        }))
        .filter((item) => !(item.id === SAFE_EMPTY_MESSAGE.id && !item.text && !item.signature));
}

function toV1SiteContent(payload, previousContent = {}) {
    const prev = isObject(previousContent) ? previousContent : {};
    const prevHero = isObject(prev.hero) ? prev.hero : {};
    const prevCommander = isObject(prev.commander) ? prev.commander : {};
    const prevOverlayImage = isObject(prev.overlayImage) ? prev.overlayImage : {};

    const draft = isObject(payload) ? payload : {};
    const hero = isObject(draft.hero) ? draft.hero : {};
    const commander = isObject(draft.commander) ? draft.commander : {};
    const overlayImage = isObject(draft.overlayImage) ? draft.overlayImage : {};

    const heroBackgroundImageUrls = Array.isArray(hero.backgroundImages)
        ? hero.backgroundImages
        : (Array.isArray(hero.backgroundImageUrls)
            ? hero.backgroundImageUrls
            : (Array.isArray(prevHero.backgroundImageUrls) ? prevHero.backgroundImageUrls : []));

    const commanderMessages = normalizeMessagesWithFallback(
        commander.messages,
        prevCommander.messages
    );
    const normalizedCommander = normalizeCommanderImageSettings({
        ...prevCommander,
        ...commander,
    });
    const safeOverlayDisplayArea = typeof overlayImage.displayArea === 'string'
        ? overlayImage.displayArea
        : (typeof prevOverlayImage.displayArea === 'string' ? prevOverlayImage.displayArea : 'fixed-site');
    const safeOverlayBlendEffect = overlayImage.blendEffect ?? prevOverlayImage.blendEffect ?? true;

    return {
        hero: {
            siteName: typeof hero.siteName === 'string' ? hero.siteName : (prevHero.siteName ?? ''),
            title: typeof hero.title === 'string' ? hero.title : (prevHero.title ?? ''),
            subtitle: typeof hero.subtitle === 'string' ? hero.subtitle : (prevHero.subtitle ?? ''),
            logoUrl: typeof hero.logo === 'string'
                ? hero.logo
                : (typeof hero.logoUrl === 'string' ? hero.logoUrl : (prevHero.logoUrl ?? '')),
            description: typeof hero.description === 'string' ? hero.description : (prevHero.description ?? ''),
            backgroundImageUrls: heroBackgroundImageUrls,
        },
        commander: {
            imageUrl: normalizedCommander.imageUrl,
            imageSource: normalizedCommander.imageSource,
            imageAvatar: normalizedCommander.imageAvatar,
            customImageUrl: normalizedCommander.customImageUrl,
            sectionTitle: typeof commander.sectionTitle === 'string'
                ? commander.sectionTitle
                : (prevCommander.sectionTitle ?? ''),
            roleLabel: typeof commander.roleLabel === 'string'
                ? commander.roleLabel
                : (prevCommander.roleLabel ?? ''),
            decorativeElement: typeof commander.decorativeElement === 'string'
                ? commander.decorativeElement
                : (prevCommander.decorativeElement ?? 'line-diamond-line'),
            messages: commanderMessages,
            imageScale: normalizedCommander.imageScale,
            imageOffsetX: normalizedCommander.imageOffsetX,
            imageOffsetY: normalizedCommander.imageOffsetY,
        },
        overlayImage: {
            ...prevOverlayImage,
            ...overlayImage,
            displayArea: safeOverlayDisplayArea,
            blendEffect: safeOverlayBlendEffect,
        },
    };
}

function setByPath(target, path, value) {
    const parts = path.split('.').filter(Boolean);
    if (parts.length === 0) return target;

    const result = isObject(target) ? { ...target } : {};
    let cursor = result;

    for (let index = 0; index < parts.length - 1; index += 1) {
        const key = parts[index];
        cursor[key] = isObject(cursor[key]) ? { ...cursor[key] } : {};
        cursor = cursor[key];
    }

    cursor[parts[parts.length - 1]] = value;
    return result;
}

function toLegacyFieldPath(path) {
    return LEGACY_FIELD_MAP[path] || path;
}

function toLegacyContentForEdit(content) {
    return ensureLegacySiteContentContract(content);
}

function normalizeContentPatchWithPrev(prevContent, patch) {
    const prevLegacy = toLegacyContentForEdit(prevContent);
    const incomingLegacy = isObject(patch) ? patch : {};

    const mergedLegacy = {
        ...prevLegacy,
        ...incomingLegacy,
        hero: {
            ...(isObject(prevLegacy.hero) ? prevLegacy.hero : {}),
            ...(isObject(incomingLegacy.hero) ? incomingLegacy.hero : {}),
        },
        commander: {
            ...(isObject(prevLegacy.commander) ? prevLegacy.commander : {}),
            ...(isObject(incomingLegacy.commander) ? incomingLegacy.commander : {}),
        },
        overlayImage: {
            ...(isObject(prevLegacy.overlayImage) ? prevLegacy.overlayImage : {}),
            ...(isObject(incomingLegacy.overlayImage) ? incomingLegacy.overlayImage : {}),
        },
    };

    return toV1SiteContent(mergedLegacy, prevContent);
}

function toV1FromFieldUpdate(prevContent, fieldPath, value) {
    const legacyPath = toLegacyFieldPath(fieldPath);
    const prevLegacy = toLegacyContentForEdit(prevContent);
    let nextLegacy = setByPath(prevLegacy, legacyPath, value);
    if (fieldPath === 'commander.image' || fieldPath === 'commander.imageUrl') {
        const imageUrl = typeof value === 'string' ? value : '';
        nextLegacy = {
            ...nextLegacy,
            commander: {
                ...nextLegacy.commander,
                image: imageUrl,
                imageUrl,
                imageSource: imageUrl ? 'custom' : 'none',
                imageAvatar: '',
                customImageUrl: imageUrl,
            },
        };
    }
    return toV1SiteContent(nextLegacy, prevContent);
}

function toFilteredMessages(messages) {
    return Array.isArray(messages)
        ? messages
            .filter((item) => isObject(item))
            .map((item, index) => ({
                id: typeof item.id === 'string' ? item.id : String(index + 1),
                text: typeof item.text === 'string' ? item.text : '',
                signature: typeof item.signature === 'string' ? item.signature : '',
            }))
        : [];
}

export const SiteContentProvider = ({ children }) => {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();

    const siteContent = useMemo(
        () => ensureLegacySiteContentContract(config?.content),
        [config?.content]
    );

    const loading = status === 'loading';

    const fetchSiteContent = useCallback(async () => {
        try {
            await reload();
            return true;
        } catch {
            return false;
        }
    }, [reload]);

    const saveSiteContent = useCallback(
        async (newContent) => {
            try {
                updateConfig((prev) => ({
                    ...prev,
                    content: {
                        ...prev.content,
                        ...normalizeContentPatchWithPrev(prev.content, newContent),
                    },
                }));
                await saveNow();
                return true;
            } catch (err) {
                spLog.error('SiteContentContext: failed to save site content.', err);
                return false;
            }
        },
        [saveNow, updateConfig]
    );

    const updateField = useCallback((field, value) => {
        if (!field || typeof field !== 'string') return;

        updateConfig((prev) => {
            const nextContentV1 = toV1FromFieldUpdate(prev.content, field, value);

            return {
                ...prev,
                content: {
                    ...prev.content,
                    ...nextContentV1,
                    commander: {
                        ...(prev.content?.commander || {}),
                        ...(nextContentV1.commander || {}),
                        messages: toFilteredMessages(nextContentV1.commander?.messages),
                    },
                },
            };
        });
    }, [updateConfig]);

    return (
        <SiteContentContext.Provider
            value={{
                siteContent,
                loading,
                error,
                saveSiteContent,
                updateField,
                fetchSiteContent,
            }}
        >
            {children}
        </SiteContentContext.Provider>
    );
};
