const POSITION_MODES = ['fixed', 'absolute'];
const DISPLAY_AREAS = ['fixed-site', 'hero-full', 'hero-content'];
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
    borderStyle: 'none',
    positionMode: 'fixed',
    displayArea: 'fixed-site',
    anchor: 'middle-center',
    offsetX: 50,
    offsetY: 50,
    zIndex: 180,
    blendEffect: true,
};

function clampNumber(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.round(parsed)));
}

function getEnumValue(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

function normalizeDisplayArea(value) {
    if (value === 'site') return 'fixed-site';
    if (value === 'hero') return 'hero-full';
    return value;
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
        displayArea: getEnumValue(normalizeDisplayArea(next.displayArea), DISPLAY_AREAS, DEFAULT_OVERLAY_IMAGE.displayArea),
        anchor: getEnumValue(next.anchor, ANCHORS, DEFAULT_OVERLAY_IMAGE.anchor),
        offsetX: clampNumber(next.offsetX, 0, 100, DEFAULT_OVERLAY_IMAGE.offsetX),
        offsetY: clampNumber(next.offsetY, 0, 100, DEFAULT_OVERLAY_IMAGE.offsetY),
        zIndex: clampNumber(next.zIndex, 1, 9999, DEFAULT_OVERLAY_IMAGE.zIndex),
        blendEffect: typeof next.blendEffect === 'boolean' ? next.blendEffect : DEFAULT_OVERLAY_IMAGE.blendEffect,
    };
}

export const getOverlayStyle = (config, isPreview = false) => {
    const normalized = normalizeOverlayImageConfig(config);
    const position = (isPreview && normalized.positionMode === 'fixed') ? 'absolute' : normalized.positionMode;

    let style = {
        position,
        width: `${normalized.width}px`,
        height: `${normalized.height}px`,
        opacity: normalized.opacity / 100,
        objectFit: normalized.objectFit,
        zIndex: normalized.zIndex,
    };

    const x = normalized.offsetX || 0;
    const y = normalized.offsetY || 0;
    const w = normalized.width;
    const h = normalized.height || normalized.width;

    if (normalized.anchor.includes('left')) {
        style.left = `calc(${x}% - (${x} * ${w}px / 100))`;
    } else if (normalized.anchor.includes('right')) {
        style.right = `calc(${x}% - (${x} * ${w}px / 100))`;
    } else if (normalized.anchor.includes('center')) {
        // Keep center anchor safe at both edges while preserving full 0-100 slider travel.
        style.left = `calc(${x}% - (${x} * ${w}px / 100))`;
    }

    if (normalized.anchor.includes('top')) {
        style.top = `calc(${y}% - (${y} * ${h}px / 100))`;
    } else if (normalized.anchor.includes('bottom')) {
        style.bottom = `calc(${y}% - (${y} * ${h}px / 100))`;
    } else if (normalized.anchor.includes('middle')) {
        // Same safe travel model for vertical center anchoring.
        style.top = `calc(${y}% - (${y} * ${h}px / 100))`;
    }

    if (normalized.blendEffect) {
        style.filter = 'drop-shadow(0 0 40px var(--color-bg-base)) drop-shadow(0 0 80px var(--color-bg-base))';
    }

    return style;
};
