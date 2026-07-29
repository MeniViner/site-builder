/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useMemo } from 'react';
import {
    getActiveImageGalleries,
    normalizeImageGalleryBranch,
    normalizeImageGalleryRecord,
} from '../utils/imageGallery';
import { useConfig } from './ConfigProvider';

const ImageGalleryContext = createContext(null);

export function ImageGalleryProvider({ children }) {
    const { config, status, error, updateConfig, saveNow, reload } = useConfig();
    const galleryBranch = useMemo(
        () => normalizeImageGalleryBranch(config?.imageGalleries),
        [config?.imageGalleries],
    );
    const galleries = galleryBranch.items;
    const activeGalleries = useMemo(
        () => getActiveImageGalleries(galleryBranch),
        [galleryBranch],
    );

    const saveGalleries = useCallback(async (nextValueOrUpdater) => {
        const current = normalizeImageGalleryBranch(config?.imageGalleries).items;
        const candidate = typeof nextValueOrUpdater === 'function'
            ? nextValueOrUpdater(current)
            : nextValueOrUpdater;
        const nextBranch = normalizeImageGalleryBranch({ items: candidate });

        updateConfig((previous) => ({
            ...previous,
            imageGalleries: nextBranch,
        }));
        await saveNow();
        return nextBranch.items;
    }, [config?.imageGalleries, saveNow, updateConfig]);

    const saveGallery = useCallback(async (galleryLike) => {
        const normalizedGallery = normalizeImageGalleryRecord(galleryLike, galleries.length);
        return saveGalleries((current) => {
            const existingIndex = current.findIndex((gallery) => gallery.id === normalizedGallery.id);
            if (existingIndex === -1) return [...current, normalizedGallery];
            return current.map((gallery) => (gallery.id === normalizedGallery.id ? normalizedGallery : gallery));
        });
    }, [galleries.length, saveGalleries]);

    const deleteGallery = useCallback(
        async (galleryId) => saveGalleries((current) => current.filter((gallery) => gallery.id !== galleryId)),
        [saveGalleries],
    );

    const value = useMemo(() => ({
        galleryBranch,
        galleries,
        activeGalleries,
        loading: status === 'loading',
        saving: status === 'saving',
        error,
        saveGalleries,
        saveGallery,
        deleteGallery,
        reload,
    }), [activeGalleries, deleteGallery, error, galleries, galleryBranch, reload, saveGallery, saveGalleries, status]);

    return <ImageGalleryContext.Provider value={value}>{children}</ImageGalleryContext.Provider>;
}

export function useImageGalleries() {
    const context = useContext(ImageGalleryContext);
    if (!context) throw new Error('useImageGalleries must be used within ImageGalleryProvider');
    return context;
}

export default ImageGalleryContext;
