import { SHAREPOINT_CONFIG } from '../config/sharepoint.config';
import { getSiteId } from './storage/storageBackend';
import { uploadImage } from '../utils/sharepointUtils';

const DATABASE_NAME = 'site-builder-gallery-media-v1';
const STORE_NAME = 'gallery-media';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const LOCAL_MEDIA_PREFIX = 'gallery-media://';

function createId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
    });
}

function openMediaDatabase() {
    if (typeof indexedDB === 'undefined') {
        return Promise.reject(new Error('אחסון מדיה מקומי אינו זמין בדפדפן זה.'));
    }

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Failed to open local media storage'));
    });
}

async function withStore(mode, callback) {
    const db = await openMediaDatabase();
    try {
        const transaction = db.transaction(STORE_NAME, mode);
        const result = await callback(transaction.objectStore(STORE_NAME));
        await new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error('Local media transaction failed'));
            transaction.onabort = () => reject(transaction.error || new Error('Local media transaction was aborted'));
        });
        return result;
    } finally {
        db.close();
    }
}

function supportsImageFile(file) {
    const type = String(file?.type || '').toLowerCase();
    return type.startsWith('image/') || /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(String(file?.name || ''));
}

export function isLocalGalleryMediaReference(value) {
    return typeof value === 'string' && value.startsWith(LOCAL_MEDIA_PREFIX);
}

function idFromReference(reference) {
    return isLocalGalleryMediaReference(reference)
        ? reference.slice(LOCAL_MEDIA_PREFIX.length).trim()
        : '';
}

export async function getImageDimensions(file) {
    if (typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return { width: 1600, height: 900 };
    }

    const objectUrl = URL.createObjectURL(file);
    try {
        return await new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve({
                width: Number(image.naturalWidth || image.width) || 1600,
                height: Number(image.naturalHeight || image.height) || 900,
            });
            image.onerror = () => resolve({ width: 1600, height: 900 });
            image.src = objectUrl;
        });
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function putLocalGalleryMedia(file) {
    const id = createId();
    const dimensions = await getImageDimensions(file);
    const record = {
        id,
        siteId: getSiteId(),
        blob: file,
        fileName: String(file.name || '').slice(0, 255),
        mimeType: String(file.type || '').slice(0, 160),
        sizeBytes: Number(file.size) || 0,
        width: dimensions.width,
        height: dimensions.height,
        createdAt: new Date().toISOString(),
    };
    await withStore('readwrite', async (store) => requestResult(store.put(record)));

    return {
        mediaRef: `${LOCAL_MEDIA_PREFIX}${id}`,
        width: record.width,
        height: record.height,
        media: {
            fileName: record.fileName,
            mimeType: record.mimeType,
            sizeBytes: record.sizeBytes,
        },
    };
}

/**
 * Stores production files through the existing SharePoint media mechanism. During
 * local/mock development, image bytes live in IndexedDB and the master config holds
 * only a stable gallery-media reference plus metadata.
 */
export async function uploadGalleryImage(file) {
    if (!file || !supportsImageFile(file)) {
        throw new Error('יש לבחור קובץ תמונה נתמך.');
    }
    if (Number(file.size) > MAX_IMAGE_BYTES) {
        throw new Error('גודל התמונה חורג מהמגבלה של 20MB.');
    }

    if (SHAREPOINT_CONFIG.useMock) {
        return putLocalGalleryMedia(file);
    }

    const dimensions = await getImageDimensions(file);
    const mediaRef = await uploadImage(file, 'ImageGallery');
    return {
        mediaRef,
        width: dimensions.width,
        height: dimensions.height,
        media: {
            fileName: String(file.name || '').slice(0, 255),
            mimeType: String(file.type || '').slice(0, 160),
            sizeBytes: Number(file.size) || 0,
        },
    };
}

export async function resolveLocalGalleryMedia(reference) {
    const id = idFromReference(reference);
    if (!id) return null;
    const record = await withStore('readonly', async (store) => requestResult(store.get(id)));
    if (!record?.blob) return null;
    return record;
}

export async function deleteLocalGalleryMedia(reference) {
    const id = idFromReference(reference);
    if (!id) return false;
    await withStore('readwrite', async (store) => requestResult(store.delete(id)));
    return true;
}
