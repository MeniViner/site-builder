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

export function clampCommanderImageValue(value, range) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return range.defaultValue;
    return Math.min(range.max, Math.max(range.min, Math.round(parsed)));
}

export function getCommanderImageSettings(commander = {}) {
    return {
        imageScale: clampCommanderImageValue(commander?.imageScale, COMMANDER_IMAGE_SCALE),
        imageOffsetX: clampCommanderImageValue(commander?.imageOffsetX, COMMANDER_IMAGE_OFFSET_X),
    };
}

export function normalizeCommanderImageSettings(commander = {}) {
    return {
        ...commander,
        ...getCommanderImageSettings(commander),
    };
}
