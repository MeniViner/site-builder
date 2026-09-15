export const COMMANDER_IMAGE_SCALE = {
    min: 25,
    max: 300,
    defaultValue: 100,
};

export const COMMANDER_IMAGE_OFFSET_X = {
    min: -160,
    max: 160,
    defaultValue: 0,
};

export const COMMANDER_IMAGE_OFFSET_Y = {
    min: -160,
    max: 160,
    defaultValue: 0,
};

export const DEFAULT_COMMANDER_IMAGE_PATH = '/images/אייל זמיר.png';
export const DEFAULT_COMMANDER_RANK = 'אל"ם';
export const DEFAULT_COMMANDER_RANK_STYLE = 'formal';
export const DEFAULT_COMMANDER_RANK_BACKDROP = true;
export const DEFAULT_COMMANDER_RANK_ORIENTATION = 'native';
export const DEFAULT_COMMANDER_RANK_ROTATION = 0;
export const DEFAULT_COMMANDER_RANK_MIRRORED = false;

export const COMMANDER_IMAGE_SOURCE = Object.freeze({
    custom: 'custom',
    default: 'default',
    none: 'none',
    rank: 'rank',
});

export const COMMANDER_RANK_STYLES = Object.freeze([
    { id: 'formal', label: 'ייצוגי' },
    { id: 'ceremonial', label: 'טקסי' },
    { id: 'minimal', label: 'נקי' },
    { id: 'field', label: 'מבצעי' },
]);

const RANK_STYLE_IDS = new Set(COMMANDER_RANK_STYLES.map((style) => style.id));
const RANK_ORIENTATION_IDS = new Set(['native', 'landscape', 'portrait']);
const REMOVED_COMMANDER_RANKS = new Set(['קמ"א', 'קא"ב']);

const LEGACY_BUILTIN_IMAGE_PATH = /^\/images\/commander-avatars\/commander-(?:slate|navy|teal|sand)\.svg$/;

export function clampCommanderImageValue(value, range) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return range.defaultValue;
    return Math.min(range.max, Math.max(range.min, Math.round(parsed)));
}

export function getCommanderImageSettings(commander = {}) {
    return {
        imageScale: clampCommanderImageValue(commander?.imageScale, COMMANDER_IMAGE_SCALE),
        imageOffsetX: clampCommanderImageValue(commander?.imageOffsetX, COMMANDER_IMAGE_OFFSET_X),
        imageOffsetY: clampCommanderImageValue(commander?.imageOffsetY, COMMANDER_IMAGE_OFFSET_Y),
    };
}

export function getCommanderImageSourceSettings(commander = {}) {
    const existingImage = typeof commander?.image === 'string'
        ? commander.image
        : (typeof commander?.imageUrl === 'string' ? commander.imageUrl : '');
    const existingCustomImage = typeof commander?.customImageUrl === 'string'
        ? commander.customImageUrl
        : '';
    const usedLegacyBuiltin = commander?.imageSource === 'builtin'
        || LEGACY_BUILTIN_IMAGE_PATH.test(existingImage);
    const explicitSource = Object.values(COMMANDER_IMAGE_SOURCE).includes(commander?.imageSource)
        ? commander.imageSource
        : null;
    const imageSource = usedLegacyBuiltin
        ? COMMANDER_IMAGE_SOURCE.default
        : explicitSource
            || (existingImage === DEFAULT_COMMANDER_IMAGE_PATH
                ? COMMANDER_IMAGE_SOURCE.default
                : existingImage
                    ? COMMANDER_IMAGE_SOURCE.custom
                    : COMMANDER_IMAGE_SOURCE.none);
    const customImageUrl = imageSource === COMMANDER_IMAGE_SOURCE.custom
        ? (existingCustomImage || existingImage)
        : existingCustomImage;
    const imageUrl = imageSource === COMMANDER_IMAGE_SOURCE.default
        ? DEFAULT_COMMANDER_IMAGE_PATH
        : imageSource === COMMANDER_IMAGE_SOURCE.none || imageSource === COMMANDER_IMAGE_SOURCE.rank
            ? ''
            : customImageUrl;

    return { imageSource, imageAvatar: '', customImageUrl, imageUrl };
}

export function normalizeCommanderImageSettings(commander = {}) {
    const source = getCommanderImageSourceSettings(commander);
    const requestedImageRank = typeof commander?.imageRank === 'string'
        ? commander.imageRank.trim()
        : DEFAULT_COMMANDER_RANK;
    const imageRank = requestedImageRank && !REMOVED_COMMANDER_RANKS.has(requestedImageRank)
        ? requestedImageRank
        : DEFAULT_COMMANDER_RANK;
    const imageRankStyle = RANK_STYLE_IDS.has(commander?.imageRankStyle)
        ? commander.imageRankStyle
        : DEFAULT_COMMANDER_RANK_STYLE;
    const imageRankBackdrop = typeof commander?.imageRankBackdrop === 'boolean'
        ? commander.imageRankBackdrop
        : DEFAULT_COMMANDER_RANK_BACKDROP;
    const imageRankOrientation = RANK_ORIENTATION_IDS.has(commander?.imageRankOrientation)
        ? commander.imageRankOrientation
        : DEFAULT_COMMANDER_RANK_ORIENTATION;
    const requestedRankRotation = Number(commander?.imageRankRotation);
    const imageRankRotation = Number.isFinite(requestedRankRotation)
        ? ((Math.round(requestedRankRotation / 90) * 90) % 360 + 360) % 360
        : DEFAULT_COMMANDER_RANK_ROTATION;
    const imageRankMirrored = typeof commander?.imageRankMirrored === 'boolean'
        ? commander.imageRankMirrored
        : DEFAULT_COMMANDER_RANK_MIRRORED;
    return {
        ...commander,
        ...getCommanderImageSettings(commander),
        imageSource: source.imageSource,
        imageAvatar: source.imageAvatar,
        imageRank,
        imageRankStyle,
        imageRankBackdrop,
        imageRankOrientation,
        imageRankRotation,
        imageRankMirrored,
        customImageUrl: source.customImageUrl,
        image: source.imageUrl,
        imageUrl: source.imageUrl,
    };
}
