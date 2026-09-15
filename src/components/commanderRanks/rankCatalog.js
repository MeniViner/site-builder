export const RANK_FAMILIES = Object.freeze({
    enlisted: { id: 'enlisted', label: 'חוגרים', context: 'sleeve' },
    nco: { id: 'nco', label: 'נגדים', context: 'shoulder' },
    officer: { id: 'officer', label: 'קצינים', context: 'shoulder' },
    civilian: { id: 'civilian', label: 'אזרח עובד צה"ל', context: 'identity' },
});

export const RANK_CATALOG = Object.freeze({
    'טוראי': { family: 'enlisted', renderer: 'none', orientation: 'landscape', marks: [], ariaLabel: 'טוראי, ללא סמל דרגה' },
    'רב"ט': { family: 'enlisted', renderer: 'referenceAsset', orientation: 'landscape', asset: 'rav-turai.svg', ariaLabel: 'רב טוראי, שני פסי חוגרים' },
    'סמל': { family: 'enlisted', renderer: 'referenceAsset', orientation: 'landscape', asset: 'samal.svg', ariaLabel: 'סמל, שלושה פסי חוגרים' },
    'סמ"ר': { family: 'enlisted', renderer: 'referenceAsset', orientation: 'landscape', asset: 'samar.png', ariaLabel: 'סמל ראשון, שלושה פסי חוגרים וסמל עלה גפן' },
    'רס"ל': { family: 'nco', renderer: 'referenceAsset', orientation: 'landscape', asset: 'rasal.svg', ariaLabel: 'רב סמל, סמל סיטרואן אחד' },
    'רס"ר': { family: 'nco', renderer: 'referenceAsset', orientation: 'landscape', asset: 'rasar.svg', ariaLabel: 'רב סמל ראשון, שני סמלי סיטרואן' },
    'רס"ם': { family: 'nco', renderer: 'referenceAsset', orientation: 'landscape', asset: 'rasam.svg', ariaLabel: 'רב סמל מתקדם, סמל סיטרואן וכוכב' },
    'רס"ב': { family: 'nco', renderer: 'referenceAsset', orientation: 'landscape', asset: 'rasab.png', ariaLabel: 'רב סמל בכיר, שני סמלי סיטרואן וכוכב' },
    'רנ"ג': { family: 'nco', renderer: 'referenceAsset', orientation: 'landscape', asset: 'ranag.svg', ariaLabel: 'רב נגד, שלושה סמלי סיטרואן וכוכב' },
    'סג"ם': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'sagam.png', ariaLabel: 'סגן משנה, ארון אחד עם ענף זית' },
    'סגן': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'segen.png', ariaLabel: 'סגן, שני ארונות' },
    'סרן': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'seren.png', ariaLabel: 'סרן, שלושה ארונות' },
    'רס"ן': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'rasan.png', ariaLabel: 'רב סרן, עלה קצונה אחד' },
    'סא"ל': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'saal.png', ariaLabel: 'סגן אלוף, שני עלי קצונה' },
    'אל"ם': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'alam.png', ariaLabel: 'אלוף משנה, שלושה עלי קצונה' },
    'תא"ל': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'taal.png', ariaLabel: 'תת אלוף, חרב וענף זית מוצלבים' },
    'אלוף': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'aluf.png', ariaLabel: 'אלוף, חרב וענף זית מוצלבים ועלה קצונה אחד' },
    'רא"ל': { family: 'officer', renderer: 'referenceAsset', orientation: 'portrait', asset: 'raal.png', ariaLabel: 'רב אלוף, חרב וענף זית מוצלבים ושני עלי קצונה' },
    'אזרח עובד צה"ל': { family: 'civilian', renderer: 'civilian', orientation: 'landscape', marks: [], ariaLabel: 'עובד צה"ל, זיהוי אזרחי ללא דרגה צבאית' },
});

export const RANK_GROUPS = Object.freeze([
    { ...RANK_FAMILIES.enlisted, ranks: ['טוראי', 'רב"ט', 'סמל', 'סמ"ר'] },
    { ...RANK_FAMILIES.nco, ranks: ['רס"ל', 'רס"ר', 'רס"ם', 'רס"ב', 'רנ"ג'] },
    { ...RANK_FAMILIES.officer, ranks: ['סג"ם', 'סגן', 'סרן', 'רס"ן', 'סא"ל', 'אל"ם', 'תא"ל', 'אלוף', 'רא"ל'] },
    { ...RANK_FAMILIES.civilian, ranks: ['אזרח עובד צה"ל'] },
]);

export function getRankDefinition(rank) {
    return RANK_CATALOG[rank] || RANK_CATALOG['אל"ם'];
}

export function resolveRankOrientation(rank, orientation = 'native') {
    return orientation === 'portrait' || orientation === 'landscape'
        ? orientation
        : getRankDefinition(rank).orientation;
}
