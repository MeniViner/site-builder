const POSITION_MODES = ['fixed', 'absolute'];
const DISPLAY_AREAS = ['site', 'hero'];
const BORDER_STYLES = ['none', 'standard', 'square', 'cyber', 'armor', 'shield', 'blade'];
const OBJECT_FITS = ['contain', 'cover'];
const ANCHORS = [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'middle-center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
];

export const DEFAULT_OVERLAY_IMAGE = {
    enabled: false,
    imageUrl: '',
    width: 240,
    height: 180,
    opacity: 100,
    objectFit: 'contain',
    borderStyle: 'standard',
    positionMode: 'fixed',
    displayArea: 'site',
    anchor: 'bottom-left',
    offsetX: 0,
    offsetY: 0,
    zIndex: 180,
};

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function getEnumValue(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

export function normalizeOverlayImageConfig(config) {
    const next = config && typeof config === 'object' ? config : {};

    return {
        enabled: Boolean(next.enabled),
        imageUrl: typeof next.imageUrl === 'string' ? next.imageUrl : '',
        width: clampNumber(next.width, 48, 1800, DEFAULT_OVERLAY_IMAGE.width),
        height: clampNumber(next.height, 48, 1800, DEFAULT_OVERLAY_IMAGE.height),
        opacity: clampNumber(next.opacity, 0, 100, DEFAULT_OVERLAY_IMAGE.opacity),
        objectFit: getEnumValue(next.objectFit, OBJECT_FITS, DEFAULT_OVERLAY_IMAGE.objectFit),
        borderStyle: getEnumValue(next.borderStyle, BORDER_STYLES, DEFAULT_OVERLAY_IMAGE.borderStyle),
        positionMode: getEnumValue(next.positionMode, POSITION_MODES, DEFAULT_OVERLAY_IMAGE.positionMode),
        displayArea: getEnumValue(next.displayArea, DISPLAY_AREAS, DEFAULT_OVERLAY_IMAGE.displayArea),
        anchor: getEnumValue(next.anchor, ANCHORS, DEFAULT_OVERLAY_IMAGE.anchor),
        offsetX: clampNumber(next.offsetX, 0, 100, DEFAULT_OVERLAY_IMAGE.offsetX),
        offsetY: clampNumber(next.offsetY, 0, 100, DEFAULT_OVERLAY_IMAGE.offsetY),
        zIndex: clampNumber(next.zIndex, 1, 9999, DEFAULT_OVERLAY_IMAGE.zIndex),
    };
}

export const getOverlayStyle = (config, isPreview = false) => {
    const normalized = normalizeOverlayImageConfig(config);
    const position = isPreview && normalized.positionMode === 'fixed' ? 'absolute' : normalized.positionMode;

    const style = {
        position,
        width: `${normalized.width}px`,
        height: `${normalized.height}px`,
        zIndex: normalized.zIndex,
    };

    if (normalized.anchor.includes('top')) {
        style.top = `${normalized.offsetY || 0}%`;
    } else if (normalized.anchor.includes('bottom')) {
        style.bottom = `${normalized.offsetY || 0}%`;
    } else if (normalized.anchor.includes('middle')) {
        style.top = '50%';
    }

    if (normalized.anchor.includes('left')) {
        style.left = `${normalized.offsetX || 0}%`;
    } else if (normalized.anchor.includes('right')) {
        style.right = `${normalized.offsetX || 0}%`;
    } else if (normalized.anchor.includes('center')) {
        style.left = '50%';
    }

    let translateX = '0%';
    let translateY = '0%';

    if (normalized.anchor.includes('center')) {
        translateX = `calc(-50% + ${normalized.offsetX || 0}%)`;
    }
    if (normalized.anchor.includes('middle')) {
        translateY = `calc(-50% + ${normalized.offsetY || 0}%)`;
    }

    if (translateX !== '0%' || translateY !== '0%') {
        style.transform = `translate(${translateX}, ${translateY})`;
    }

    return style;
};
