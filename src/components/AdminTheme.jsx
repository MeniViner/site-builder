import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { useConfig } from '../context/ConfigProvider';
import ThemeLivePreview from './ThemeLivePreview';
import {
    AlertTriangle, Palette, Sun, Moon, Monitor,
    Hexagon, Eye, EyeOff,
    LayoutGrid, List, Globe, CircleDot, PanelBottom, PanelRight, CheckCircle2, Sparkles, Wand2, Bot, Undo2, Redo2, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import { normalizeBorderStyle, panelStyle } from '../utils/borderStyles';
import Tooltip from './Tooltip';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';
import AIService from '../services/AIService';
import { parseJsonFromModel } from '../utils/aiJson';
import { getSafeAiRuntimeConfig } from '../config/ai.config';
import { UI_FEATURES } from '../config/uiFeatures.config';

const AI_DESIGN_SECTION_ID = 'aiDesignAssistant';
const BASE_SETTINGS_NAV = [
    { id: 'primaryColor', label: 'צבע ראשי' },
    { id: 'displayMode', label: 'מצב תצוגה' },
    { id: 'borderStyle', label: 'סגנון מסגרות' },
    { id: 'widgetHeight', label: 'גובה ווידגט' },
    { id: 'heroEffects', label: 'אזור עליון' },
    { id: 'regularLinksLayout', label: 'קטגוריות וקישורים' },
    { id: 'externalLinksLayout', label: 'קישורים חיצוניים' },
];

const COLOR_SWATCHES = [
    { hex: '#dc2626', label: 'אדום' },
    { hex: '#ea580c', label: 'כתום' },
    { hex: '#d97706', label: 'ענבר' },
    { hex: '#ffd700', label: 'צהוב' },
    { hex: '#16a34a', label: 'ירוק' },
    { hex: '#0891b2', label: 'תכלת' },
    { hex: '#2563eb', label: 'כחול' },
    { hex: '#7c3aed', label: 'סגול' },
    { hex: '#db2777', label: 'ורוד' },
    { hex: '#64748b', label: 'אפור-כחול' },
    { hex: '#78716c', label: 'אפור' },
    { hex: '#7B3F00', label: 'חום' },
];

const DISPLAY_MODES = [
    { value: 'user-toggle', label: 'בחירת משתמש', description: 'המשתמש בוחר בעצמו', icon: Monitor },
    { value: 'dark', label: 'כהה', description: 'מצב כהה קבוע', icon: Moon },
    { value: 'light', label: 'בהיר', description: 'מצב בהיר קבוע', icon: Sun },
];

const BORDER_STYLES = [
    { value: 'standard', label: 'סטנדרטי', description: 'פינות מעוגלות, נקיות ואלגנטיות ללא חיתוך טקטי.' },
    { value: 'square', label: 'מרובע', description: 'זוויות 90° חדות לגמרי, בלי עיגול בכלל.' },
    { value: 'cyber', label: 'סייבר', description: 'חיתוך א-סימטרי חד שנותן תחושת ממשק עתידני מתקדם.' },
    { value: 'armor', label: 'שריון', description: 'ארבע פינות מחוסמות במבנה כמעט משושה, מדויק ויוקרתי.' },
    { value: 'shield', label: 'מגן', description: 'פינות עליונות חתוכות עם בסיס יציב ונקי כמו לוח פיקוד.' },
    { value: 'blade', label: 'להב', description: 'חיתוך אלכסוני אגרסיבי בתחתית למראה חד, מהיר ולוחמני.' },
];

const BORDER_TARGET_OPTIONS = [
    { key: 'commander', label: 'דבר המפקד', description: 'הפאנל הראשי של דבר המפקד בהירו.' },
    { key: 'widget', label: 'ווידגט דף הבית', description: 'הכרטיס הדינמי בצד השמאלי התחתון.' },
    { key: 'search', label: 'שורת חיפוש', description: 'מסגרת החיפוש העליונה באתר.' },
    { key: 'topNav', label: 'כפתורי ניווט עליונים', description: 'ניהול, החלפת מצב תצוגה וכרטיס הברכה.' },
    { key: 'sideNav', label: 'כפתורי צד ', description: 'רק מלבני ה-L1 בסרגל הצד הימני.' },
    { key: 'flipCards', label: 'כרטיסיות מתהפכות', description: 'החזית והגב של כרטיסי הגריד המסתובבים.' },
    { key: 'extLinks', label: 'כרטיסי קישורים חיצוניים', description: 'כרטיסי הפוטר והסרגל הצף במצב כרטיסים.' },
    { key: 'hqDash', label: 'מרכז פיקוד HQ', description: 'כרטיסי ה-HQ Dashboard בתצוגת מרכז פיקוד.' },
];

const REGULAR_LINK_LAYOUTS = [
    { value: 'sidebar-right', label: 'כפתורי צד ', description: 'סרגל ניווט צדדי קבוע בצד ימין', icon: PanelRight },
    { value: 'grid', label: 'כרטיסיות מתהפכות', description: 'כרטיסי Flip בתצוגת גריד', icon: LayoutGrid },
    // { value: 'compact', label: 'Compact List', description: 'רשימה מינימליסטית עם שורות פשוטות', icon: List },
    { value: 'hq', label: 'תצוגת מרכז פיקוד', description: 'עיצוב מרכז פיקוד מינימליסטי', icon: List },
];

const EXTERNAL_LINK_LAYOUTS = [
    { value: 'cards', label: 'Cards', description: 'כרטיסים עם אייקון וכותרת', icon: LayoutGrid },
    { value: 'minimal', label: 'Minimal Icons', description: 'עיגולי אייקון בשורה — כותרת ב-hover', icon: CircleDot },
    { value: 'floating', label: 'Floating Bar', description: 'פס עגול עם אייקונים וטקסט', icon: PanelBottom },
];

/** אפשרויות תצוגה תחת בחירת פריסת קישורים חיצוניים — ברירת true כשהשדה undefined */
const EXTERNAL_LINK_DISPLAY_TOGGLES = [
    {
        field: 'externalLinksFixed',
        defaultTrue: false,
        title: 'הצג כפס נעוץ',
        subtitle: 'הקישורים יישארו קבועים בתחתית המסך ויהיו תמיד גלויים גם בגלילה.',
        helpTitle: 'פס נעוץ',
        helpDescription: 'נעוץ: הקישורים יוצגו בפס קבוע בתחתית המסך (תמיד גלוי בגלילה).',
    },
    {
        field: 'externalLinksBordered',
        defaultTrue: true,
        title: 'הצג את הלינקים בתחום עם מסגרת (בורדר)',
        subtitle: 'כאשר כבוי — הקישורים יוצגו ללא מסגרת מסביב.',
        helpTitle: 'מסגרת לקישורים חיצוניים',
        helpDescription: 'כאשר האפשרות פעילה, לכל קישור חיצוני תהיה מסגרת ברורה סביבו.',
    },
    {
        field: 'externalLinksShowBackground',
        defaultTrue: true,
        title: 'הצג רקע סביב קישורים חיצוניים',
        subtitle: 'כאשר כבוי — הפס/הכרטיסים יוצגו בלי רקע לבן ומטושטש (שקוף).',
        helpTitle: 'רקע לקישורים חיצוניים',
        helpDescription: 'כאשר האפשרות פעילה, הקישורים יוצגו על גבי רקע בולט יותר ולא ישבו ישירות על הדף.',
    },
];

const WIDGET_HEIGHT_OPTIONS = [
    { value: 'full', label: 'מלא', description: 'נמתח כמעט עד סרגל הניווט העליון' },
    { value: 'high', label: 'גבוה', description: 'תופס שטח אנכי מורחב' },
    { value: 'medium', label: 'בינוני', description: 'איזון בין שטח תוכן לנראות ההירו' },
    { value: 'low', label: 'נמוך', description: 'גובה ברירת מחדל (המצב הנוכחי)' },
];

const SAVE_DEBOUNCE_MS = 500;
const VALID_DISPLAY_MODE = new Set(DISPLAY_MODES.map((item) => item.value));
const VALID_BORDER_STYLE = new Set(BORDER_STYLES.map((item) => item.value));
const VALID_WIDGET_HEIGHT = new Set(WIDGET_HEIGHT_OPTIONS.map((item) => item.value));
const VALID_REGULAR_LAYOUT = new Set(REGULAR_LINK_LAYOUTS.map((item) => item.value));
const VALID_EXTERNAL_LAYOUT = new Set(EXTERNAL_LINK_LAYOUTS.map((item) => item.value));
const DISPLAY_MODE_LABELS = Object.fromEntries(DISPLAY_MODES.map((item) => [item.value, item.label]));
const BORDER_STYLE_LABELS = Object.fromEntries(BORDER_STYLES.map((item) => [item.value, item.label]));
const WIDGET_HEIGHT_LABELS = Object.fromEntries(WIDGET_HEIGHT_OPTIONS.map((item) => [item.value, item.label]));
const REGULAR_LAYOUT_LABELS = Object.fromEntries(REGULAR_LINK_LAYOUTS.map((item) => [item.value, item.label]));
const EXTERNAL_LAYOUT_LABELS = Object.fromEntries(EXTERNAL_LINK_LAYOUTS.map((item) => [item.value, item.label]));
const AI_THEME_RUNTIME_CONFIG = getSafeAiRuntimeConfig();
const AI_SENTENCE_PICKER_CONFIG = [
    { field: 'displayMode', label: 'מצב תצוגה', options: DISPLAY_MODES.map((item) => ({ value: item.value, label: item.label, type: 'display' })) },
    { field: 'borderStyle', label: 'סוג מסגרת', options: BORDER_STYLES.map((item) => ({ value: item.value, label: item.label, type: 'border' })) },
    { field: 'regularLinksLayout', label: 'תצוגת קטגוריות וקישורים', options: REGULAR_LINK_LAYOUTS.map((item) => ({ value: item.value, label: item.label, type: 'layout' })) },
    { field: 'externalLinksLayout', label: 'קישורים חיצוניים', options: EXTERNAL_LINK_LAYOUTS.map((item) => ({ value: item.value, label: item.label, type: 'layout' })) },
    { field: 'widgetHeight', label: 'גובה ווידג׳ט', options: WIDGET_HEIGHT_OPTIONS.map((item) => ({ value: item.value, label: item.label, type: 'height' })) },
    { field: 'useTintedBackground', label: 'אפקט צבע רקע', options: [{ value: true, label: 'עם אפקט', type: 'tint' }, { value: false, label: 'ללא אפקט', type: 'tint' }] },
    { field: 'primaryColor', label: 'צבע ראשי', options: COLOR_SWATCHES.map((item) => ({ value: item.hex, label: item.label, type: 'color' })) },
];

const AI_QUICK_FIELD_HELP = {
    displayMode: 'קובע אם האתר יוצג כהה, בהיר או לפי בחירת המשתמש.',
    borderStyle: 'משנה את אופי הפינות והמסגרות בכל רכיבי הממשק.',
    regularLinksLayout: 'משפיע על פריסת קטגוריות הניווט והקישורים הפנימיים בדף הבית.',
    externalLinksLayout: 'משנה את צורת ההצגה של קישורים חיצוניים (כרטיסים/אייקונים/פס צף).',
    widgetHeight: 'קובע כמה מקום אנכי יקבל הווידג׳ט המרכזי בדף.',
    useTintedBackground: 'מוסיף או מסיר גוון צבע ראשי ברקע הכללי של האתר.',
    primaryColor: 'הצבע הראשי שמשפיע על כפתורים, הדגשות ואלמנטים בולטים.',
};

const AI_SENTENCE_SEGMENTS = [
    { field: 'displayMode', text: 'אני רוצה שהאתר שלי יראה במצב תצוגה' },
    { field: 'borderStyle', text: 'עם סוג מסגרת' },
    { field: 'regularLinksLayout', text: 'ותצוגת קטגוריות וקישורים' },
    { field: 'externalLinksLayout', text: 'וקישורים חיצוניים' },
    { field: 'widgetHeight', text: 'וגובה ווידג׳ט' },
    { field: 'useTintedBackground', text: 'ועם אפקט צבע רקע' },
    { field: 'primaryColor', text: 'וצבע ראשי' },
];

const AI_FIELD_LABELS = {
    primaryColor: 'צבע ראשי',
    displayMode: 'מצב תצוגה',
    borderStyle: 'סגנון מסגרות',
    widgetHeight: 'גובה ווידגט',
    regularLinksLayout: 'תצוגת קטגוריות וקישורים',
    externalLinksLayout: 'תצוגת קישורים חיצוניים',
    useTintedBackground: 'השתקפות צבע ברקע',
    tintedBackgroundStrength: 'עוצמת השתקפות צבע',
    showNavCategories: 'הצגת קטגוריות בניווט עליון',
    heroGrayscale: 'תמונת הירו בגווני אפור',
    externalLinksFixed: 'קישורים חיצוניים כפס נעוץ',
    externalLinksBordered: 'מסגרת לקישורים חיצוניים',
    externalLinksShowBackground: 'רקע לקישורים חיצוניים',
    heroGlassEffect: 'אפקט זכוכית',
    heroGlassStrength: 'עוצמת זכוכית אזור עליון',
    topNavGlassEffect: 'אפקט זכוכית ניווט עליון',
    topNavGlassStrength: 'עוצמת זכוכית ניווט עליון',
};

const AI_THEME_TOKEN_GROUPS = [
    {
        id: 'display-mode',
        label: 'מצב תצוגה',
        options: DISPLAY_MODES.map((item) => ({
            id: `display:${item.value}`,
            label: item.label,
            prompt: `displayMode צריך להיות "${item.value}"`,
        })),
    },
    {
        id: 'border-style',
        label: 'מסגרות',
        options: BORDER_STYLES.map((item) => ({
            id: `border:${item.value}`,
            label: item.label,
            prompt: `borderStyle צריך להיות "${item.value}"`,
        })),
    },
    {
        id: 'layout',
        label: 'פריסות ניווט וקישורים',
        options: [
            ...REGULAR_LINK_LAYOUTS.map((item) => ({
                id: `regular-layout:${item.value}`,
                label: `פנימי: ${item.label}`,
                prompt: `regularLinksLayout צריך להיות "${item.value}"`,
            })),
            ...EXTERNAL_LINK_LAYOUTS.map((item) => ({
                id: `external-layout:${item.value}`,
                label: `חיצוני: ${item.label}`,
                prompt: `externalLinksLayout צריך להיות "${item.value}"`,
            })),
        ],
    },
    {
        id: 'behavior',
        label: 'התנהגות והדגשות',
        options: [
            { id: 'tint:on', label: 'רקע עם השתקפות צבע', prompt: 'useTintedBackground=true עם חוזק בינוני-גבוה.' },
            { id: 'tint:off', label: 'רקע ניטרלי', prompt: 'useTintedBackground=false ורקע נקי.' },
            { id: 'nav:on', label: 'הצג קטגוריות בניווט עליון', prompt: 'showNavCategories=true כשהניווט הפנימי מאפשר.' },
            { id: 'nav:off', label: 'הסתר קטגוריות בניווט עליון', prompt: 'showNavCategories=false.' },
            { id: 'hero:grayscale', label: 'תמונת הירו אפור', prompt: 'heroGrayscale=true למראה רשמי ומאופק.' },
            { id: 'hero:color', label: 'תמונת הירו צבעונית', prompt: 'heroGrayscale=false לשמירת צבעוניות.' },
            { id: 'external:fixed', label: 'קישורים חיצוניים נעוצים', prompt: 'externalLinksFixed=true.' },
            { id: 'external:bordered', label: 'קישורים עם מסגרת', prompt: 'externalLinksBordered=true ו-externalLinksShowBackground=true.' },
        ],
    },
    {
        id: 'widget-height',
        label: 'גובה ווידג׳ט',
        options: WIDGET_HEIGHT_OPTIONS.map((item) => ({
            id: `widget-height:${item.value}`,
            label: item.label,
            prompt: `widgetHeight צריך להיות "${item.value}"`,
        })),
    },
    {
        id: 'palette',
        label: 'צבעים מהמערכת',
        options: COLOR_SWATCHES.slice(0, 8).map((item) => ({
            id: `color:${item.hex}`,
            label: item.label,
            prompt: `primaryColor צריך להיות "${item.hex}"`,
        })),
    },
];

const AI_THEME_TOKEN_LOOKUP = Object.fromEntries(
    AI_THEME_TOKEN_GROUPS
        .flatMap((group) => group.options.map((option) => [option.id, { ...option, groupLabel: group.label }]))
);
function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function asObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asText(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function flattenNavigationLabels(items, carry = []) {
    asArray(items).forEach((item) => {
        const label = asText(item?.label) || asText(item?.title);
        if (label) {
            carry.push(label);
        }
        const nested = asArray(item?.children).length > 0 ? item?.children : item?.subLinks;
        flattenNavigationLabels(nested, carry);
    });
    return carry;
}

function sampleTextValues(items, fields, limit = 6) {
    const samples = [];
    asArray(items).forEach((item) => {
        if (samples.length >= limit) return;
        const source = asObject(item);
        const text = fields
            .map((field) => asText(source[field]))
            .find((value) => value.length > 0);
        if (text) {
            samples.push(text);
        }
    });
    return samples;
}

function buildThemeAiContextSnapshot(config, draft, borderTargets) {
    const hero = asObject(config?.content?.hero);
    const commander = asObject(config?.content?.commander);
    const widgets = asObject(config?.widgets);
    const widgetsData = asObject(widgets.data);
    const navItems = asArray(config?.navigation?.items);
    const navLabels = flattenNavigationLabels(navItems, []);

    const eventsItems = asArray(asObject(widgetsData.events).items);
    const alertsItems = asArray(asObject(widgetsData.alerts).items);
    const outstandingItems = asArray(asObject(widgetsData.outstanding).items);
    const pollsItems = asArray(asObject(widgetsData.polls).items);
    const newsItems = asArray(asObject(widgetsData.news).items);
    const phonebookItems = asArray(asObject(widgetsData.phonebook).items);
    const shuttlesItems = asArray(asObject(widgetsData.shuttles).items);
    const celebrationsItems = asArray(asObject(widgetsData.celebrations).items);
    const heritageItems = asArray(asObject(widgetsData.heritage).items);
    const tipsItems = asArray(asObject(widgetsData.tips).items);
    const externalLinks = asArray(config?.externalLinks?.items);

    return {
        themeDraft: {
            primaryColor: draft?.primaryColor,
            displayMode: draft?.displayMode,
            borderStyle: draft?.borderStyle,
            widgetHeight: draft?.widgetHeight,
            regularLinksLayout: draft?.regularLinksLayout,
            externalLinksLayout: draft?.externalLinksLayout,
            useTintedBackground: draft?.useTintedBackground,
            tintedBackgroundStrength: draft?.tintedBackgroundStrength,
            showNavCategories: draft?.showNavCategories,
            heroGrayscale: draft?.heroGrayscale,
            externalLinksFixed: draft?.externalLinksFixed,
            externalLinksBordered: draft?.externalLinksBordered,
            externalLinksShowBackground: draft?.externalLinksShowBackground,
            borderTargets: borderTargets || {},
        },
        designControls: {
            displayModes: DISPLAY_MODES.map(({ value, label }) => ({ value, label })),
            borderStyles: BORDER_STYLES.map(({ value, label }) => ({ value, label })),
            widgetHeights: WIDGET_HEIGHT_OPTIONS.map(({ value, label }) => ({ value, label })),
            regularLayouts: REGULAR_LINK_LAYOUTS.map(({ value, label }) => ({ value, label })),
            externalLayouts: EXTERNAL_LINK_LAYOUTS.map(({ value, label }) => ({ value, label })),
            colorPalette: COLOR_SWATCHES.map(({ hex, label }) => ({ hex, label })),
            borderTargets: BORDER_TARGET_OPTIONS.map(({ key, label }) => ({ key, label, enabled: !!borderTargets?.[key] })),
        },
        siteSignals: {
            hero: {
                siteName: asText(hero.siteName),
                title: asText(hero.title),
                subtitle: asText(hero.subtitle),
                description: asText(hero.description),
                backgroundImageCount: asArray(hero.backgroundImageUrls).length,
            },
            commander: {
                sectionTitle: asText(commander.sectionTitle),
                roleLabel: asText(commander.roleLabel),
                messagesCount: asArray(commander.messages).length,
                messageSamples: sampleTextValues(commander.messages, ['text', 'message', 'title'], 4),
            },
            navigation: {
                itemsCount: navLabels.length,
                sampleLabels: navLabels.slice(0, 16),
            },
            widgets: {
                active: asArray(widgets.active).slice(0, 6),
                counts: {
                    events: eventsItems.length,
                    alerts: alertsItems.length,
                    outstanding: outstandingItems.length,
                    polls: pollsItems.length,
                    news: newsItems.length,
                    phonebook: phonebookItems.length,
                    shuttles: shuttlesItems.length,
                    celebrations: celebrationsItems.length,
                    heritage: heritageItems.length,
                    tips: tipsItems.length,
                    externalLinks: externalLinks.length,
                },
                samples: {
                    events: sampleTextValues(eventsItems, ['title', 'name', 'text'], 4),
                    alerts: sampleTextValues(alertsItems, ['title', 'text'], 4),
                    news: sampleTextValues(newsItems, ['title', 'text'], 4),
                    phonebook: sampleTextValues(phonebookItems, ['name', 'department'], 4),
                },
            },
        },
    };
}

function buildThemeAiPrompt({ instruction, contextSnapshot }) {
    return [
        'אתה מעצב UI/UX מומחה לפורטל ארגוני בעברית.',
        'מטרה: לייצר עדכון עיצוב שמתאים למה שכבר קיים באתר, בלי לשנות תכנים.',
        'החזר JSON בלבד (ללא markdown, ללא הסברים).',
        'מותר להחזיר רק את השדות הבאים:',
        '{',
        '  "primaryColor": "#RRGGBB",',
        '  "displayMode": "dark|light|user-toggle",',
        '  "borderStyle": "standard|square|cyber|armor|shield|blade",',
        '  "widgetHeight": "full|high|medium|low",',
        '  "regularLinksLayout": "sidebar-right|grid|hq",',
        '  "externalLinksLayout": "cards|minimal|floating",',
        '  "useTintedBackground": true/false,',
        '  "tintedBackgroundStrength": 0-100,',
        '  "showNavCategories": true/false,',
        '  "heroGrayscale": true/false,',
        '  "heroGlassEffect": true/false,',
        '  "heroGlassStrength": 0-100,',
        '  "topNavGlassEffect": true/false,',
        '  "topNavGlassStrength": 0-100,',
        '  "externalLinksFixed": true/false,',
        '  "externalLinksBordered": true/false,',
        '  "externalLinksShowBackground": true/false',
        '}',
        'כללים:',
        '- שמור נגישות גבוהה וניגודיות טובה.',
        '- אל תשתמש בערכים שלא קיימים בסכימה.',
        '- עבור primaryColor מותר לבחור כל צבע חוקי בפורמט #RRGGBB, כולל צבע מותאם אישית שלא מופיע בפלטת הצבעים.',
        '- אם regularLinksLayout הוא sidebar-right אז showNavCategories צריך להיות false.',
        '- אם אינך בטוח לגבי שדה מסוים, השאר אותו כפי שהוא כיום.',
        `הנחיה טבעית: ${instruction}`,
        `קונטקסט האתר: ${JSON.stringify(contextSnapshot)}`,
    ].join('\n');
}

function resolveThemePayload(parsed) {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const nested = parsed.themePatch;
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
            return nested;
        }
        return parsed;
    }
    return {};
}

function formatThemeFieldValue(field, value) {
    if (field === 'primaryColor') return String(value || '').toUpperCase();
    if (field === 'displayMode') return DISPLAY_MODE_LABELS[value] || String(value);
    if (field === 'borderStyle') return BORDER_STYLE_LABELS[value] || String(value);
    if (field === 'widgetHeight') return WIDGET_HEIGHT_LABELS[value] || String(value);
    if (field === 'regularLinksLayout') return REGULAR_LAYOUT_LABELS[value] || String(value);
    if (field === 'externalLinksLayout') return EXTERNAL_LAYOUT_LABELS[value] || String(value);
    if (field === 'tintedBackgroundStrength') return `${Number(value)}%`;
    if (typeof value === 'boolean') return value ? 'כן' : 'לא';
    if (value === null || value === undefined || value === '') return '-';
    return String(value);
}

function normalizeAiThemePayload(payload, fallback) {
    const next = { ...fallback };
    const primaryColor = String(payload?.primaryColor || '').trim();
    if (/^#[0-9A-Fa-f]{6}$/.test(primaryColor)) {
        next.primaryColor = primaryColor;
    }

    const displayMode = String(payload?.displayMode || '').trim();
    if (VALID_DISPLAY_MODE.has(displayMode)) {
        next.displayMode = displayMode;
    }

    const borderStyle = String(payload?.borderStyle || '').trim();
    if (VALID_BORDER_STYLE.has(borderStyle)) {
        next.borderStyle = borderStyle;
    }

    const widgetHeight = String(payload?.widgetHeight || '').trim();
    if (VALID_WIDGET_HEIGHT.has(widgetHeight)) {
        next.widgetHeight = widgetHeight;
    }

    const regularLinksLayout = String(payload?.regularLinksLayout || '').trim();
    if (VALID_REGULAR_LAYOUT.has(regularLinksLayout)) {
        next.regularLinksLayout = regularLinksLayout;
    }

    const externalLinksLayout = String(payload?.externalLinksLayout || '').trim();
    if (VALID_EXTERNAL_LAYOUT.has(externalLinksLayout)) {
        next.externalLinksLayout = externalLinksLayout;
    }

    if (typeof payload?.useTintedBackground === 'boolean') {
        next.useTintedBackground = payload.useTintedBackground;
    }
    if (typeof payload?.showNavCategories === 'boolean') {
        next.showNavCategories = payload.showNavCategories;
    }
    if (typeof payload?.heroGrayscale === 'boolean') {
        next.heroGrayscale = payload.heroGrayscale;
    }
    if (typeof payload?.heroGlassEffect === 'boolean') {
        next.heroGlassEffect = payload.heroGlassEffect;
    }
    if (typeof payload?.topNavGlassEffect === 'boolean') {
        next.topNavGlassEffect = payload.topNavGlassEffect;
    }
    if (typeof payload?.externalLinksFixed === 'boolean') {
        next.externalLinksFixed = payload.externalLinksFixed;
    }
    if (typeof payload?.externalLinksBordered === 'boolean') {
        next.externalLinksBordered = payload.externalLinksBordered;
    }
    if (typeof payload?.externalLinksShowBackground === 'boolean') {
        next.externalLinksShowBackground = payload.externalLinksShowBackground;
    }
    if (Number.isFinite(Number(payload?.tintedBackgroundStrength))) {
        next.tintedBackgroundStrength = Math.max(0, Math.min(100, Math.round(Number(payload.tintedBackgroundStrength))));
    }
    if (Number.isFinite(Number(payload?.heroGlassStrength))) {
        next.heroGlassStrength = Math.max(0, Math.min(100, Math.round(Number(payload.heroGlassStrength))));
    }
    if (Number.isFinite(Number(payload?.topNavGlassStrength))) {
        next.topNavGlassStrength = Math.max(0, Math.min(100, Math.round(Number(payload.topNavGlassStrength))));
    }

    return next;
}

export default function AdminTheme() {
    const location = useLocation();
    const { config } = useConfig();
    const { theme, loading, error, saveTheme, borderTargets, setBorderTargets } = useTheme();
    const showAiUi = UI_FEATURES.showAiUi;
    const showQuickDesignComposer = UI_FEATURES.showQuickDesignComposer;
    const showDesignAssistantSection = showAiUi || showQuickDesignComposer;
    const designAssistantLabel = showQuickDesignComposer ? 'עיצוב מהיר' : 'עוזר AI לעיצוב';
    const settingsNav = useMemo(() => {
        if (!showDesignAssistantSection) return BASE_SETTINGS_NAV;
        return [...BASE_SETTINGS_NAV, { id: AI_DESIGN_SECTION_ID, label: designAssistantLabel }];
    }, [showDesignAssistantSection, designAssistantLabel]);
    const aiEnabled = showAiUi && AIService.isEnabled();
    const [draft, setDraft] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [customColor, setCustomColor] = useState('');
    const [aiPrompt, setAiPrompt] = useState('שדרג את העיצוב למראה מקצועי, מאוזן ונגיש עבור פורטל ארגוני עמוס תוכן.');
    const [aiSentenceSelections, setAiSentenceSelections] = useState({
        displayMode: 'dark',
        borderStyle: 'shield',
        regularLinksLayout: 'sidebar-right',
        externalLinksLayout: 'cards',
        widgetHeight: 'full',
        useTintedBackground: true,
        primaryColor: '#0891b2',
    });
    const [aiSelectedTokenByGroup, setAiSelectedTokenByGroup] = useState({});
    const [aiOpenPickerField, setAiOpenPickerField] = useState('');
    const [aiIsGenerating, setAiIsGenerating] = useState(false);
    const [aiRawOutput, setAiRawOutput] = useState('');
    const [aiModelUsed, setAiModelUsed] = useState('');
    const [aiErrorMessage, setAiErrorMessage] = useState('');
    const [aiSuggestedTheme, setAiSuggestedTheme] = useState(null);
    const [aiThemeHistory, setAiThemeHistory] = useState({ items: [], index: -1 });
    const [aiTypingRunId, setAiTypingRunId] = useState(0);
    const [aiTypedChars, setAiTypedChars] = useState(0);
    const fallbackSettingId = settingsNav[0]?.id || 'primaryColor';
    const tabFromQuery = (() => {
        const tab = new URLSearchParams(location.search).get('tab');
        return settingsNav.some((t) => t.id === tab) ? tab : null;
    })();
    const [activeSettingId, setActiveSettingId] = useState(tabFromQuery || fallbackSettingId);
    const colorInputRef = useRef(null);
    const saveTimeoutRef = useRef(null);
    const latestDraftRef = useRef(null);
    const latestThemeRef = useRef(null);
    const aiSentenceInitializedRef = useRef(false);

    useEffect(() => {
        if (!tabFromQuery) return;
        if (tabFromQuery === activeSettingId) return;
        setActiveSettingId(tabFromQuery);
    }, [tabFromQuery, activeSettingId]);

    useEffect(() => {
        if (settingsNav.some((item) => item.id === activeSettingId)) return;
        setActiveSettingId(fallbackSettingId);
    }, [settingsNav, activeSettingId, fallbackSettingId]);

    useEffect(() => {
        if (theme) {
            setDraft({ ...theme, borderStyle: normalizeBorderStyle(theme.borderStyle) });
            setCustomColor(theme.primaryColor || '#0891b2');
            if (!aiSentenceInitializedRef.current) {
                setAiSentenceSelections({
                    displayMode: theme.displayMode || 'dark',
                    borderStyle: normalizeBorderStyle(theme.borderStyle || 'shield'),
                    regularLinksLayout: 'sidebar-right',
                    externalLinksLayout: 'cards',
                    widgetHeight: 'full',
                    useTintedBackground: typeof theme.useTintedBackground === 'boolean' ? theme.useTintedBackground : true,
                    primaryColor: theme.primaryColor || '#0891b2',
                });
                aiSentenceInitializedRef.current = true;
            }
        }
    }, [theme]);

    useEffect(() => {
        latestDraftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        latestThemeRef.current = theme;
    }, [theme]);

    useEffect(() => {
        if (!aiOpenPickerField) return undefined;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setAiOpenPickerField('');
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [aiOpenPickerField]);

    useEffect(() => {
        if (!showQuickDesignComposer) return;
        if (activeSettingId !== AI_DESIGN_SECTION_ID) return;
        setAiTypingRunId((prev) => prev + 1);
    }, [activeSettingId, showQuickDesignComposer]);

    const triggerAutoSave = useCallback((nextDraft) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
            if (!nextDraft || !theme || JSON.stringify(nextDraft) === JSON.stringify(theme)) return;
            setIsSaving(true);
            const success = await saveTheme(nextDraft);
            setIsSaving(false);
            if (!success) {
                toast.error('שגיאה בשמירת הגדרות העיצוב. אנא נסה שוב.');
            }
            saveTimeoutRef.current = null;
        }, SAVE_DEBOUNCE_MS);
    }, [theme, saveTheme]);

    useEffect(() => () => {
        if (!saveTimeoutRef.current) return;
        clearTimeout(saveTimeoutRef.current);
        const pendingDraft = latestDraftRef.current;
        const currentTheme = latestThemeRef.current;
        if (pendingDraft && currentTheme && JSON.stringify(pendingDraft) !== JSON.stringify(currentTheme)) {
            saveTheme(pendingDraft);
        }
    }, [saveTheme]);

    const updateField = (field, value) => {
        setDraft(prev => {
            const next = { ...prev, [field]: value };
            if (field === 'regularLinksLayout' && value === 'sidebar-right') {
                next.showNavCategories = false;
            }
            triggerAutoSave(next);
            return next;
        });
    };

    const handleColorSwatchClick = (hex) => {
        updateField('primaryColor', hex);
        setCustomColor(hex);
    };

    const handleCustomColorChange = (hex) => {
        setCustomColor(hex);
        if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            updateField('primaryColor', hex);
        }
    };

    const handleNativePickerChange = (e) => {
        const hex = e.target.value;
        setCustomColor(hex);
        updateField('primaryColor', hex);
    };

    const handleNavSettingClick = (id) => {
        setActiveSettingId(id);
    };

    const handleBorderTargetToggle = (key) => {
        setBorderTargets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const activePickerConfig = AI_SENTENCE_PICKER_CONFIG.find((item) => item.field === aiOpenPickerField) || null;
    const getPickerLabel = (field, value) => {
        if (field === 'displayMode') return DISPLAY_MODE_LABELS[value] || value;
        if (field === 'borderStyle') return BORDER_STYLE_LABELS[value] || value;
        if (field === 'regularLinksLayout') return REGULAR_LAYOUT_LABELS[value] || value;
        if (field === 'externalLinksLayout') return EXTERNAL_LAYOUT_LABELS[value] || value;
        if (field === 'widgetHeight') return WIDGET_HEIGHT_LABELS[value] || value;
        if (field === 'useTintedBackground') return value ? 'עם אפקט' : 'ללא אפקט';
        if (field === 'primaryColor') {
            const match = COLOR_SWATCHES.find((item) => item.hex === value);
            return match?.label || String(value || '').toUpperCase();
        }
        return String(value ?? '');
    };
    const aiFullSentence = AI_SENTENCE_SEGMENTS.map((segment) => segment.text).join(' ');
    useEffect(() => {
        if (!showQuickDesignComposer) return undefined;
        if (activeSettingId !== AI_DESIGN_SECTION_ID) return undefined;
        setAiTypedChars(0);
        if (!aiFullSentence) return undefined;
        let typed = 0;
        const timer = window.setInterval(() => {
            typed += 1;
            setAiTypedChars(typed);
            if (typed >= aiFullSentence.length) {
                window.clearInterval(timer);
            }
        }, 22);
        return () => window.clearInterval(timer);
    }, [aiTypingRunId, aiFullSentence, activeSettingId, showQuickDesignComposer]);
    const applyAiTheme = (parsedPatch) => {
        const normalized = normalizeAiThemePayload(parsedPatch, draft);
        setDraft((prev) => {
            const next = { ...prev, ...normalized };
            triggerAutoSave(next);
            return next;
        });
        if (normalized.primaryColor) {
            setCustomColor(normalized.primaryColor);
        }
        toast.success('הצעת AI הוחלה על עיצוב האתר');
    };

    const pushAiThemeTransition = useCallback((beforeSnapshot, afterSnapshot) => {
        const before = { ...beforeSnapshot };
        const after = { ...afterSnapshot };
        setAiThemeHistory((prev) => {
            const keptItems = prev.index >= 0 ? prev.items.slice(0, prev.index + 1) : [];
            const baseItems = keptItems.length ? [...keptItems] : [];
            const lastBase = baseItems[baseItems.length - 1];
            if (!lastBase || JSON.stringify(lastBase) !== JSON.stringify(before)) {
                baseItems.push(before);
            }
            const lastBeforeAfter = baseItems[baseItems.length - 1];
            if (lastBeforeAfter && JSON.stringify(lastBeforeAfter) === JSON.stringify(after)) {
                return { items: baseItems, index: baseItems.length - 1 };
            }
            const items = [...baseItems, after];
            return { items, index: items.length - 1 };
        });
    }, []);

    const pushAiThemeSnapshot = useCallback((snapshot) => {
        const normalized = { ...snapshot };
        setAiThemeHistory((prev) => {
            const keptItems = prev.index >= 0 ? prev.items.slice(0, prev.index + 1) : prev.items.slice(0, prev.items.length);
            const last = keptItems[keptItems.length - 1];
            if (last && JSON.stringify(last) === JSON.stringify(normalized)) {
                return prev;
            }
            const items = [...keptItems, normalized];
            return { items, index: items.length - 1 };
        });
    }, []);

    const clearAiSelections = () => {
        setAiSelectedTokenByGroup({});
    };

    const handleAiSentenceSelectionChange = (field, value) => {
        setAiSentenceSelections((prev) => ({ ...prev, [field]: value }));
    };

    const handleApplyQuickThemeFromSentence = () => {
        const nextSelectionPatch = normalizeAiThemePayload({
            displayMode: aiSentenceSelections.displayMode,
            borderStyle: aiSentenceSelections.borderStyle,
            regularLinksLayout: aiSentenceSelections.regularLinksLayout,
            externalLinksLayout: aiSentenceSelections.externalLinksLayout,
            widgetHeight: aiSentenceSelections.widgetHeight,
            useTintedBackground: Boolean(aiSentenceSelections.useTintedBackground),
            primaryColor: aiSentenceSelections.primaryColor,
        }, draft);

        if (JSON.stringify(nextSelectionPatch) === JSON.stringify(draft)) {
            toast.info('לא זוהה שינוי חדש להחלה בעיצוב המהיר.');
            return;
        }

        const nextTheme = {
            ...draft,
            ...nextSelectionPatch,
            ...(nextSelectionPatch.regularLinksLayout === 'sidebar-right' ? { showNavCategories: false } : {}),
        };
        pushAiThemeTransition(draft, nextTheme);
        setDraft(nextTheme);
        triggerAutoSave(nextTheme);

        if (nextSelectionPatch.primaryColor) {
            setCustomColor(nextSelectionPatch.primaryColor);
        }

        toast.success('עיצוב מהיר הוחל בהצלחה.');
    };

    const handleAiTokenToggle = (groupId, tokenId) => {
        setAiSelectedTokenByGroup((prev) => {
            const current = prev[groupId] || '';
            if (current === tokenId) {
                const next = { ...prev };
                delete next[groupId];
                return next;
            }
            return { ...prev, [groupId]: tokenId };
        });
    };

    const handleGenerateAiTheme = async () => {
        if (!aiEnabled) {
            toast.error('שירות ה-AI כבוי. יש להפעיל את ההגדרות בקובץ ENV.');
            return;
        }

        const instruction = aiPrompt.trim();
        if (!instruction) {
            toast.error('כתוב בקשה קצרה כדי לייצר עיצוב עם AI.');
            return;
        }

        setAiIsGenerating(true);
        setAiErrorMessage('');
        setAiRawOutput('');

        try {
            const contextSnapshot = buildThemeAiContextSnapshot(config, draft, borderTargets);
            const prompt = buildThemeAiPrompt({
                instruction,
                contextSnapshot,
            });
            let streamed = '';
            const result = await AIService.ask(prompt, {
                model: AI_THEME_RUNTIME_CONFIG.defaultModel,
                onToken: (token) => {
                    streamed += token;
                    setAiRawOutput((prev) => prev + token);
                },
            });
            const content = String(result?.content || streamed || '').trim();
            setAiRawOutput(content);
            setAiModelUsed(result?.modelUsed || result?.model || '');

            const parsed = parseJsonFromModel(content);
            const resolvedPayload = resolveThemePayload(parsed);
            const normalized = normalizeAiThemePayload(resolvedPayload, draft);
            setAiSuggestedTheme(normalized);

            if (JSON.stringify(normalized) === JSON.stringify(draft)) {
                toast.info('התקבלה תשובה, אבל אין שינוי ביחס לעיצוב הקיים. נסה הנחיה מדויקת יותר.');
            } else {
                const nextTheme = { ...draft, ...normalized };
                pushAiThemeTransition(draft, nextTheme);
                applyAiTheme(normalized);
            }
        } catch (error) {
            const message = error?.message || 'יצירת עיצוב ב-AI נכשלה.';
            setAiErrorMessage(message);
            setAiSuggestedTheme(null);
            toast.error(message);
        } finally {
            setAiIsGenerating(false);
        }
    };

    const handleApplyAiTheme = () => {
        if (!aiSuggestedTheme) {
            toast.error('אין הצעת AI מוכנה ליישום.');
            return;
        }
        pushAiThemeTransition(draft, { ...draft, ...aiSuggestedTheme });
        applyAiTheme(aiSuggestedTheme);
    };

    const handleUndoAiTheme = () => {
        if (aiThemeHistory.index <= 0) {
            toast.error('אין שינוי קודם לחזרה.');
            return;
        }
        const targetSnapshot = aiThemeHistory.items[aiThemeHistory.index - 1];
        setDraft((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(targetSnapshot)) {
                return prev;
            }
            const restored = { ...targetSnapshot };
            triggerAutoSave(restored);
            return restored;
        });
        setCustomColor(targetSnapshot.primaryColor || '#0891b2');
        setAiThemeHistory((prev) => ({ ...prev, index: Math.max(0, prev.index - 1) }));
        toast.success('חזרת לשינוי הקודם.');
    };

    const handleRedoAiTheme = () => {
        const nextIndex = aiThemeHistory.index + 1;
        if (nextIndex >= aiThemeHistory.items.length) {
            toast.error('אין שינוי קדימה.');
            return;
        }
        const targetSnapshot = aiThemeHistory.items[nextIndex];
        setDraft((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(targetSnapshot)) {
                return prev;
            }
            const restored = { ...targetSnapshot };
            triggerAutoSave(restored);
            return restored;
        });
        setCustomColor(targetSnapshot.primaryColor || '#0891b2');
        setAiThemeHistory((prev) => ({ ...prev, index: prev.index + 1 }));
        toast.success('עברת לשינוי הבא.');
    };

    if (loading && !theme) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען הגדרות עיצוב...</div>;
    }

    if (!draft) return null;

    const showSection = (id) => activeSettingId === id;
    const aiDiffRows = aiSuggestedTheme
        ? Object.entries(aiSuggestedTheme)
            .filter(([field, nextValue]) => JSON.stringify(nextValue) !== JSON.stringify(draft[field]))
            .map(([field, nextValue]) => ({
                field,
                label: AI_FIELD_LABELS[field] || field,
                currentValue: formatThemeFieldValue(field, draft[field]),
                nextValue: formatThemeFieldValue(field, nextValue),
            }))
        : [];
    const isTintedBackgroundEnabled = draft.useTintedBackground !== false;
    const tintStrength = Number.isFinite(Number(draft.tintedBackgroundStrength))
        ? Math.min(100, Math.max(0, Math.round(Number(draft.tintedBackgroundStrength))))
        : 72;

    return (
        <div dir="rtl" className="h-full flex flex-col bg-gray-50 dark:bg-[#12141a] text-gray-900 dark:text-white font-heebo relative">

            {/* Fixed Header */}
            <div className="sticky top-0 z-50 bg-gray-50/95 dark:bg-[#12141a]/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 px-6 pt-6 pb-4 sm:px-10 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">ניהול עיצוב האתר</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">התאם צבעים, מצב תצוגה, סגנון מסגרות ואפקטים באתר</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <AdminPageHelpButton pageId="theme" tabId={activeSettingId} />
                        {isSaving && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full shadow-sm">
                                <div className="w-3.5 h-3.5 border-[2px] border-primary border-t-transparent rounded-full animate-spin" style={{ borderColor: draft.primaryColor, borderTopColor: 'transparent' }} />
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">שומר...</span>
                            </div>
                        )}
                    </div>
                </div>

                <nav className="  flex items-center gap-2 overflow-x-auto p-1 custom-scrollbar w-full">
                    {settingsNav.map(({ id, label, destructive }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => handleNavSettingClick(id)}
                            className={` flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition whitespace-nowrap ${destructive
                                ? activeSettingId === id
                                    ? 'bg-red-600 text-white shadow-md ring-2 ring-red-500/40 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                    : 'bg-white dark:bg-white/5 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-500/35 shadow-sm hover:shadow'
                                : activeSettingId === id
                                    ? 'bg-primary-600 text-white shadow-md ring-2 ring-primary-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                    : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-transparent shadow-sm hover:shadow'
                                }`}
                        >
                            {id === AI_DESIGN_SECTION_ID && <Sparkles size={16} className="text-primary-400" />}
                            {label}

                        </button>
                    ))}
                </nav>
            </div>

            {error && (
                <div className="mx-6 sm:mx-10 mt-6 p-4 bg-primary-50 dark:bg-primary-900/20 border border-primary-500/50 rounded-xl flex items-center gap-3 shadow-sm">
                    <AlertTriangle className="text-primary-500 shrink-0" />
                    <span className="text-sm font-medium text-primary-800 dark:text-primary-200">{error}</span>
                </div>
            )}

            <div className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-0 lg:grid lg:grid-cols-[0.92fr_1.08fr] lg:items-start lg:gap-6 2xl:gap-8">
                <div className="space-y-10 order-2 lg:order-1 lg:min-w-0 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pl-2 custom-scrollbar">
                    {/* ==================== AI DESIGN ASSISTANT ==================== */}
                    {showSection(AI_DESIGN_SECTION_ID) && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-200 dark:border-white/10">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <Sparkles size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">{designAssistantLabel}</h2>
                                        <HelpTooltipButton
                                            title={designAssistantLabel}
                                            description={showAiUi
                                                ? 'כתוב כאן בקשה בשפה טבעית. המערכת שולחת ל-AI את הקונטקסט של האתר והגדרות העיצוב כדי להציע עיצוב שמתאים למה שכבר קיים.'
                                                : 'בחירה מהירה של פרמטרים קיימים בעיצוב והחלה מיידית על האתר.'}
                                        />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">
                                        {showAiUi
                                            ? 'יצירת כיוון עיצובי חכם לפי כל נתוני האתר, עם הצעות בחירה מהירות מתוך האפשרויות הקיימות.'
                                            : 'הרכבה מהירה של עיצוב מתוך האפשרויות המובנות, עם החלה ישירה ושמירה אוטומטית.'}
                                    </p>
                                </div>
                            </div>

                            {showAiUi && (
                                <>
                                    {!aiEnabled && (
                                        <div className="mb-5 rounded-2xl border border-amber-300/40 bg-amber-100/70 px-4 py-3 text-amber-900 shadow-sm dark:bg-amber-900/20 dark:text-amber-100">
                                            <div className="flex items-start gap-2">
                                                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="font-bold text-sm">שירות AI כבוי כרגע</div>
                                                    <div className="text-xs mt-1">להפעלה: `VITE_ALPHA_AI_ENABLED=true` ולוודא `VITE_ALPHA_AI_API_BASE` תקין.</div>
                                                    <div className="text-[11px] mt-1 opacity-80">apiBase: {AI_THEME_RUNTIME_CONFIG.apiBase}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-white to-primary/5 p-4 sm:p-5 dark:from-primary/15 dark:via-[#1a1f2b] dark:to-[#141924]">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-black text-gray-900 dark:text-white">כתוב מה תרצה לשנות בעיצוב</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">כאן אפשר לתאר בקצרה מה תרצה לשנות בעיצוב, לדוג' צבעים, פריסה וסגנון כללי.</div>
                                            </div>
                                            <div>
                                                <button
                                                    type="button"
                                                    onClick={handleGenerateAiTheme}
                                                    disabled={!aiEnabled || aiIsGenerating}
                                                    className="inline-flex  gap-2 h-9 items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <Wand2 size={14} />
                                                    {aiIsGenerating ? 'שולח...' : 'שלח'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <input
                                                type="text"
                                                value={aiPrompt}
                                                onChange={(event) => setAiPrompt(event.target.value)}
                                                placeholder='לדוגמה: "תעשה עיצוב כהה ויוקרתי עם צבע ראשי כחול, ניווט צדדי ומינימום עומס ויזואלי"'
                                                className="w-full rounded-xl border border-gray-300 dark:border-white/10 bg-white/90 dark:bg-[#111723] px-4 py-3 text-sm text-gray-900 dark:text-white outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {showQuickDesignComposer && (
                                <div className="mt-5 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#171c27]/80 p-4 sm:p-5">
                                    <button
                                        type="button"
                                        onClick={() => setAiTypingRunId((prev) => prev + 1)}
                                        className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500 transition hover:text-primary dark:text-gray-400 dark:hover:text-primary"
                                    >
                                        הרכבה מהירה במשפט אחד
                                    </button>
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 leading-8">
                                        {AI_SENTENCE_SEGMENTS.map((segment, index) => {
                                            const charsBefore = AI_SENTENCE_SEGMENTS
                                                .slice(0, index)
                                                .reduce((sum, item) => sum + item.text.length + 1, 0);
                                            const charsForThisSegment = Math.max(0, aiTypedChars - charsBefore);
                                            const typedText = segment.text.slice(0, charsForThisSegment);
                                            const isSegmentComplete = typedText.length >= segment.text.length;
                                            if (!typedText) return null;
                                            return (
                                                <React.Fragment key={segment.field}>
                                                    <span className="relative inline-block pe-1">
                                                        {typedText}
                                                        <Tooltip text={AI_QUICK_FIELD_HELP[segment.field]}>
                                                            <button type="button" className="absolute -top-7 -left-2 inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-gray-300/80 bg-white/95 text-[8px] font-black text-gray-600 transition hover:border-primary/50 hover:text-primary dark:border-white/20 dark:bg-[#171c27] dark:text-gray-300">?</button>
                                                        </Tooltip>
                                                    </span>
                                                    {isSegmentComplete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setAiOpenPickerField(segment.field)}
                                                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-gray-300/90 bg-white/90 px-3 text-sm font-bold text-gray-900 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:border-primary/50 hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                                                        >
                                                            {segment.field === 'primaryColor' && (
                                                                <span className="h-3.5 w-3.5 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: aiSentenceSelections.primaryColor }} />
                                                            )}
                                                            {getPickerLabel(segment.field, aiSentenceSelections[segment.field])}
                                                        </button>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                                        הבחירות מהמשפט מוחלות ישירות על הגדרות העיצוב.
                                    </p>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleApplyQuickThemeFromSentence}
                                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:opacity-90"
                                        >
                                            <CheckCircle2 size={14} />
                                            החל עיצוב מהיר
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleUndoAiTheme}
                                            disabled={aiThemeHistory.index <= 0}
                                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-gray-300/90 bg-white/90 px-4 text-sm font-bold text-gray-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:border-primary/50 hover:text-primary hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
                                        >
                                            <Undo2 size={14} />
                                            חזור
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRedoAiTheme}
                                            disabled={aiThemeHistory.index + 1 >= aiThemeHistory.items.length}
                                            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-gray-300/90 bg-white/90 px-4 text-sm font-bold text-gray-700 shadow-[0_8px_20px_rgba(15,23,42,0.08)] backdrop-blur-md transition hover:border-primary/50 hover:text-primary hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/20 dark:bg-white/10 dark:text-gray-200 dark:hover:bg-white/15"
                                        >
                                            <Redo2 size={14} />
                                            קדימה
                                        </button>
                                    </div>
                                </div>
                            )}

                            {showQuickDesignComposer && aiOpenPickerField && activePickerConfig && (
                                <div
                                    className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[1px]"
                                    onClick={() => setAiOpenPickerField('')}
                                >
                                    <div
                                        className="w-full max-w-2xl max-h-[86vh] overflow-auto rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#121825] p-4 shadow-2xl"
                                        onClick={(event) => event.stopPropagation()}
                                    >
                                        <div className="mb-3 flex items-center justify-between border-b border-gray-200 dark:border-white/10 pb-3">
                                            <h3 className="text-base font-black text-gray-900 dark:text-white">בחירת {activePickerConfig.label}</h3>
                                            <button
                                                type="button"
                                                onClick={() => setAiOpenPickerField('')}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-primary/40 hover:text-primary transition"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {activePickerConfig.options.map((option) => {
                                                const isActive = aiSentenceSelections[activePickerConfig.field] === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => {
                                                            handleAiSentenceSelectionChange(activePickerConfig.field, option.value);
                                                            setAiOpenPickerField('');
                                                        }}
                                                        className={`rounded-xl border p-3 text-right transition ${isActive
                                                            ? 'border-primary/60 bg-primary/10'
                                                            : 'border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 hover:border-primary/35'
                                                            }`}
                                                    >
                                                        <div className="mb-2 text-sm font-bold text-gray-900 dark:text-white">{option.label}</div>
                                                        {activePickerConfig.field === 'borderStyle' && (
                                                            <div className="h-10 w-full border border-gray-300 dark:border-white/20 bg-white/60 dark:bg-white/5" style={panelStyle(option.value, 10)} />
                                                        )}
                                                        {activePickerConfig.field === 'primaryColor' && (
                                                            <div className="flex items-center gap-2">
                                                                <span className="h-6 w-6 rounded-full border border-black/10 dark:border-white/20" style={{ backgroundColor: option.value }} />
                                                                <span className="text-xs text-gray-500 dark:text-gray-400">{String(option.value).toUpperCase()}</span>
                                                            </div>
                                                        )}
                                                        {activePickerConfig.field === 'displayMode' && (
                                                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                                {option.value === 'dark' && <div className="h-8 w-16 rounded-md border border-gray-700 bg-gray-900" />}
                                                                {option.value === 'light' && <div className="h-8 w-16 rounded-md border border-gray-300 bg-gray-50" />}
                                                                {option.value === 'user-toggle' && (
                                                                    <div className="inline-flex rounded-md border border-gray-300 dark:border-white/15 overflow-hidden">
                                                                        <span className="px-2 py-1 bg-gray-900 text-white">כהה</span>
                                                                        <span className="px-2 py-1 bg-gray-50 text-gray-700">בהיר</span>
                                                                    </div>
                                                                )}
                                                                <span>תצוגה לדוגמה</span>
                                                            </div>
                                                        )}
                                                        {activePickerConfig.field === 'regularLinksLayout' && (
                                                            <div className="h-10 rounded-md border border-gray-300 dark:border-white/20 bg-white/70 dark:bg-white/5 p-1.5">
                                                                {option.value === 'sidebar-right' && (
                                                                    <div className="h-full grid grid-cols-[1fr_28%] gap-1">
                                                                        <span className="rounded bg-primary/30" />
                                                                        <span className="rounded bg-primary/75" />
                                                                    </div>
                                                                )}
                                                                {option.value === 'grid' && (
                                                                    <div className="h-full grid grid-cols-3 gap-1">
                                                                        <span className="rounded bg-primary/65" />
                                                                        <span className="rounded bg-primary/45" />
                                                                        <span className="rounded bg-primary/75" />
                                                                    </div>
                                                                )}
                                                                {option.value === 'hq' && (
                                                                    <div className="h-full flex flex-col gap-1">
                                                                        <span className="h-2 rounded bg-primary/70" />
                                                                        <div className="grid grid-cols-2 gap-1 flex-1">
                                                                            <span className="rounded bg-primary/45" />
                                                                            <span className="rounded bg-primary/60" />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {activePickerConfig.field === 'externalLinksLayout' && (
                                                            <div className="h-10 rounded-md border border-gray-300 dark:border-white/20 bg-white/70 dark:bg-white/5 p-1.5">
                                                                {option.value === 'cards' && (
                                                                    <div className="h-full grid grid-cols-2 gap-1">
                                                                        <span className="rounded bg-primary/65" />
                                                                        <span className="rounded bg-primary/45" />
                                                                    </div>
                                                                )}
                                                                {option.value === 'minimal' && (
                                                                    <div className="h-full flex items-center justify-center gap-1.5">
                                                                        <span className="h-3 w-3 rounded-full bg-primary/70" />
                                                                        <span className="h-3 w-3 rounded-full bg-primary/55" />
                                                                        <span className="h-3 w-3 rounded-full bg-primary/40" />
                                                                    </div>
                                                                )}
                                                                {option.value === 'floating' && (
                                                                    <div className="h-full flex items-center justify-center">
                                                                        <span className="h-4 w-20 rounded-full bg-primary/65" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                        {activePickerConfig.field === 'widgetHeight' && (
                                                            <div className="rounded-lg border border-gray-300 dark:border-white/20 bg-white/70 dark:bg-white/5 p-2">
                                                                <div className="mb-1 text-[10px] text-gray-500 dark:text-gray-400">גובה אזור הווידג׳ט</div>
                                                                <div className={`mx-auto w-14 rounded-md border border-primary/40 bg-primary/25 transition-all ${
                                                                    option.value === 'full' ? 'h-16' : option.value === 'high' ? 'h-14' : option.value === 'medium' ? 'h-10' : 'h-7'
                                                                }`} />
                                                            </div>
                                                        )}
                                                        {activePickerConfig.field === 'useTintedBackground' && (
                                                            <div className={`rounded-lg border border-gray-300 dark:border-white/20 p-2 text-[10px] ${
                                                                option.value ? 'bg-primary/10 text-primary-700 dark:text-primary-300' : 'bg-gray-100/80 dark:bg-white/5 text-gray-600 dark:text-gray-300'
                                                            }`}>
                                                                <div className="mb-1 font-bold">{option.value ? 'רקע עם גוון צבע' : 'רקע ניטרלי'}</div>
                                                                <div className={`h-6 rounded ${
                                                                    option.value ? 'bg-gradient-to-r from-primary/35 via-primary/15 to-transparent' : 'bg-gradient-to-r from-gray-300/40 via-gray-200/30 to-transparent dark:from-white/15 dark:via-white/10'
                                                                }`} />
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* <div className="mt-6 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#171c27]/80 p-4 sm:p-5">
                                <div className="flex items-center justify-between gap-3 mb-4">
                                    <div>
                                        <div className="text-sm font-black text-gray-900 dark:text-white">בחירה מהירה מתוך מה שכבר קיים במערכת</div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">אפשר לבחור אפשרות אחת מכל קטגוריה, וה-AI יחבר את כולן יחד עם הפרומפט שלך.</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={clearAiSelections}
                                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-white/10 bg-white/80 dark:bg-white/5 px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:border-primary/40 hover:text-primary transition"
                                    >
                                        <RotateCcw size={13} />
                                        נקה בחירות
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {AI_THEME_TOKEN_GROUPS.map((group) => (
                                        <div key={group.id}>
                                            <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">{group.label}</div>
                                            <div className="flex flex-wrap gap-2">
                                                {group.options.map((option) => {
                                                    const isSelected = aiSelectedTokenByGroup[group.id] === option.id;
                                                    return (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            onClick={() => handleAiTokenToggle(group.id, option.id)}
                                                            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${isSelected
                                                                ? 'bg-primary text-white border border-primary'
                                                                : 'bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-white/10 hover:border-primary/35'
                                                                }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div> */}

                            {showAiUi && (
                                <>
                                    {aiErrorMessage && (
                                        <div className="mt-5 rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                                            <div className="font-bold mb-1">שגיאה בתגובת AI</div>
                                            <div>{aiErrorMessage}</div>
                                        </div>
                                    )}

                                    {aiSuggestedTheme && (
                                        <div className="mt-5 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5">
                                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-black text-gray-900 dark:text-white">תקציר הצעת העיצוב</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">בדוק את השינויים שמחכים ליישום לפני שמירה.</div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={handleUndoAiTheme}
                                                        disabled={aiThemeHistory.index <= 0 || aiIsGenerating}
                                                        title="חזור שינוי אחד אחורה"
                                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <Undo2 size={16} />
                                                    </button>
                                                    <div className="min-w-14 text-center text-xs font-black text-gray-600 dark:text-gray-300">
                                                        {Math.max(0, aiThemeHistory.index + 1)}/{aiThemeHistory.items.length}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={handleRedoAiTheme}
                                                        disabled={aiThemeHistory.index + 1 >= aiThemeHistory.items.length || aiIsGenerating}
                                                        title="התקדם לשינוי הבא"
                                                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 text-gray-700 dark:text-gray-200 transition hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <Redo2 size={16} />
                                                    </button>
                                                    <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2.5 text-sm font-bold text-primary">
                                                        ההצעה האחרונה הוחלה אוטומטית
                                                    </span>
                                                </div>
                                            </div>

                                            {aiDiffRows.length === 0 ? (
                                                <div className="mt-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#1a1f2a] px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                                                    ה-AI החזיר ערכים זהים לעיצוב הנוכחי. נסה לדייק את הבקשה או לבחור תגיות שונות.
                                                </div>
                                            ) : (
                                                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    {aiDiffRows.map((row) => (
                                                        <div key={row.field} className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#1a1f2a] p-3">
                                                            <div className="text-xs font-bold text-gray-700 dark:text-gray-200 mb-1">{row.label}</div>
                                                            <div className="text-[11px] text-gray-500 dark:text-gray-400">נוכחי: <span className="font-semibold">{row.currentValue}</span></div>
                                                            <div className="text-[11px] text-primary mt-1">חדש: <span className="font-semibold">{row.nextValue}</span></div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {aiRawOutput && (
                                        <details className="mt-5 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#171c27]/80 p-4">
                                            <summary className="cursor-pointer text-xs font-bold text-gray-600 dark:text-gray-300">פלט AI גולמי (לבדיקה)</summary>
                                            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] text-gray-700 dark:text-gray-300">{aiRawOutput}</pre>
                                        </details>
                                    )}
                                </>
                            )}
                        </section>
                    )}

                    {/* ==================== PRIMARY COLOR ==================== */}
                    {showSection('primaryColor') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <Palette size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">צבע ראשי</h2>
                                        <HelpTooltipButton title="צבע ראשי" description="זה הצבע המוביל של האתר, והוא ישפיע על כפתורים, הדגשות וקישורים." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">הצבע הדומיננטי שחל על כפתורים, קישורים ואלמנטים מודגשים</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-4 gap-3 mb-5">
                                {COLOR_SWATCHES.map((swatch) => (
                                    <button
                                        onClick={() => handleColorSwatchClick(swatch.hex)}
                                        className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${draft.primaryColor === swatch.hex
                                            ? 'border-gray-400 dark:border-white/40 bg-gray-100 dark:bg-white/5 ring-2 ring-gray-300 dark:ring-white/20'
                                            : 'border-transparent hover:border-gray-300 dark:hover:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5'
                                            }`}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-lg shadow-lg transition-transform group-hover:scale-110"
                                            style={{ backgroundColor: swatch.hex }}
                                        />
                                        <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">{swatch.label}</span>
                                        {draft.primaryColor === swatch.hex && (
                                            <div className="absolute -top-1 -left-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: swatch.hex }} />
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-white/5">
                                <HelpLabel
                                    as="span"
                                    className="text-sm font-bold text-gray-500 dark:text-gray-400 shrink-0"
                                    wrapperClassName="flex items-center gap-2 shrink-0"
                                    helpTitle="צבע מותאם אישית"
                                    helpDescription="כאן אפשר לבחור גוון מדויק בעזרת בורר צבע או להזין קוד צבע ידני."
                                >
                                    צבע מותאם אישית
                                </HelpLabel>
                                <div className="flex items-center gap-2 flex-1">
                                    <Tooltip text="פתח בורר צבע">
                                        <button
                                            onClick={() => colorInputRef.current?.click()}
                                            className="w-10 h-10 rounded-lg border-2 border-gray-700 cursor-pointer shadow-inner shrink-0 hover:border-gray-500 transition"
                                            style={{ backgroundColor: draft.primaryColor }}
                                        />
                                    </Tooltip>
                                    <input
                                        ref={colorInputRef}
                                        type="color"
                                        value={draft.primaryColor}
                                        onChange={handleNativePickerChange}
                                        className="sr-only"
                                    />
                                    <input
                                        type="text"
                                        value={customColor}
                                        onChange={(e) => handleCustomColorChange(e.target.value)}
                                        className="flex-1 bg-gray-100 dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-primary-500 transition font-mono dir-ltr text-left"
                                        placeholder="#dc2626"
                                        dir="ltr"
                                        maxLength={7}
                                    />
                                </div>
                            </div>

                            <div className="mt-5 p-4 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <div className="mb-1 flex items-center gap-2">
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">השתקפות צבע על רקעי האתר - מומלץ!</h3>
                                            <HelpTooltipButton
                                                title="השתקפות צבע"
                                                description="מוסיף גוון עדין של הצבע הראשי לרקעים, כדי ליצור מראה אחיד יותר."
                                            />
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                                            מחיל גוון עדין של הצבע הראשי שבחרת על כלל רקעי האתר והכרטיסיות. כיבוי אפשרות זו ישאיר את רקעי האתר בגוון קלאסי (אפור/שחור נקי).
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-center gap-1.5 shrink-0">
                                        <button
                                            dir="ltr"
                                            type="button"
                                            role="switch"
                                            aria-checked={isTintedBackgroundEnabled}
                                            onClick={() => updateField('useTintedBackground', !isTintedBackgroundEnabled)}
                                            className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition-all duration-300 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#12141a] ${isTintedBackgroundEnabled
                                                ? 'bg-primary-600 border-primary-400/70 shadow-[0_0_16px_var(--color-primary-hex)]'
                                                : 'bg-gray-300 dark:bg-gray-700 border-gray-400/60 dark:border-gray-500/60'
                                                }`}
                                            aria-label="הפעלת השתקפות צבע על רקעים"
                                        >
                                            <span
                                                className={`inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] transform-gpu transition-transform duration-300 ease-out ${isTintedBackgroundEnabled ? 'translate-x-9' : 'translate-x-1'
                                                    }`}
                                            />
                                        </button>
                                        <span className={`text-[10px] font-bold tracking-wide ${isTintedBackgroundEnabled ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                            {isTintedBackgroundEnabled ? 'מופעל' : 'כבוי'}
                                        </span>
                                    </div>
                                </div>
                                <div className={`mt-4 pt-4 border-t border-gray-200 dark:border-white/10 ${isTintedBackgroundEnabled ? '' : 'opacity-60'}`} dir="ltr"   >
                                    <div className="flex items-center justify-between mb-2" dir="rtl">
                                        <span className="text-xs font-bold text-gray-700 dark:text-gray-300 ">עוצמת חוזק ההשפעה</span>
                                        <span className="text-xs font-black text-primary">{tintStrength}%</span>
                                    </div>
                                    <input
                                        dir="ltr"
                                        type="range"
                                        min={0}
                                        max={100}
                                        step={1}
                                        value={tintStrength}
                                        disabled={!isTintedBackgroundEnabled}
                                        onChange={(e) => updateField('tintedBackgroundStrength', Number(e.target.value))}
                                        className="tint-strength-slider w-full cursor-pointer disabled:cursor-not-allowed"
                                        style={{ '--slider-fill': `${tintStrength}%` }}
                                        aria-label="עוצמת השתקפות צבע על רקעים"
                                    />
                                    <div className="mt-1 flex items-center justify-between text-[10px] font-semibold text-gray-500 dark:text-gray-400">
                                        <span>0</span>
                                        <span>50</span>
                                        <span>100</span>
                                    </div>
                                    <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400" dir="rtl">
                                        עובד גם בתצוגה בהירה וגם בכהה. בתצוגה בהירה מומלץ בד״כ בין 45%–75%, ובכהה אפשר גם גבוה יותר.
                                    </p>
                                </div>
                            </div>

                        </section>
                    )}

                    {/* ==================== DISPLAY MODE ==================== */}
                    {showSection('displayMode') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <Sun size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">מצב תצוגה</h2>
                                        <HelpTooltipButton title="מצב תצוגה" description="כאן מחליטים אם האתר יהיה בהיר, כהה או ייתן למשתמש לבחור לבד." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">קבע האם האתר יוצג במצב כהה, בהיר, או בבחירת המשתמש</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {DISPLAY_MODES.map((mode) => {
                                    const isActive = draft.displayMode === mode.value;
                                    const Icon = mode.icon;

                                    return (
                                        <div key={mode.value} className="relative">
                                            <button
                                                onClick={() => updateField('displayMode', mode.value)}
                                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                    ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
                                                    : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                    }`}
                                            >
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-primary-500/15' : 'bg-gray-100 dark:bg-white/5'
                                                    }`}>
                                                    <Icon size={22} className={isActive ? 'text-primary-400' : 'text-gray-500'} />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{mode.label}</h3>
                                                    <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{mode.description}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-primary-500 bg-primary-500' : 'border-gray-600'
                                                    }`}>
                                                    {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== BORDER STYLES ==================== */}
                    {showSection('borderStyle') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <Hexagon size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">סגנון מסגרות</h2>
                                        <HelpTooltipButton title="סגנון מסגרות" description="כאן בוחרים את צורת המסגרות והפינות של חלקים שונים באתר." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">בחר את סגנון הפינות והמסגרות של אלמנטים באתר</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {BORDER_STYLES.map((style) => {
                                    const isActive = normalizeBorderStyle(draft.borderStyle) === style.value;

                                    return (
                                        <div key={style.value} className="relative">
                                            <button
                                                onClick={() => updateField('borderStyle', style.value)}
                                                className={`relative w-full p-5 rounded-xl border-2 text-right transition-all ${isActive
                                                    ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
                                                    : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                    }`}
                                            >
                                                <div
                                                    className="w-full h-16 bg-gradient-to-br from-gray-600/30 to-gray-700/20 border border-white/10 mb-4"
                                                    style={panelStyle(style.value, 14)}
                                                />
                                                <h3 className={`font-bold text-sm mb-1 ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                                    {style.label}
                                                </h3>
                                                <p className={`text-xs ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                                                    {style.description}
                                                </p>
                                                {isActive && (
                                                    <div className="absolute top-3 left-12 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                                                        <div className="w-2 h-2 bg-white rounded-full" />
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-6 rounded-2xl border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#171a22]/80 p-5">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${(draft.commanderPanelBordered !== false || draft.widgetPanelBordered !== false) ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400'}`}>
                                            {(draft.commanderPanelBordered !== false || draft.widgetPanelBordered !== false) ? <Eye size={18} /> : <EyeOff size={18} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-black text-gray-900 dark:text-white">מסגרת בהירו העליון</h3>
                                                <HelpTooltipButton title="מסגרת בהירו העליון" description="כאן מחליטים אם לאזור דבר המפקד והווידג׳ט העליון תהיה מסגרת גלויה." />
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">פיצול שליטה נפרדת לדבר המפקד ולווידג׳ט בהירו: מסגרת פעילה או ללא מסגרת.</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">דבר מפקד</span>
                                            <button
                                                type="button"
                                                onClick={() => updateField('commanderPanelBordered', !(draft.commanderPanelBordered !== false))}
                                                className={`relative w-11 h-6 rounded-full border transition-all ${draft.commanderPanelBordered !== false ? 'bg-primary border-primary/70' : 'bg-gray-200 dark:bg-[#252528] border-gray-300 dark:border-white/10'}`}
                                                aria-label="הפעלת מסגרת לדבר המפקד"
                                            >
                                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${draft.commanderPanelBordered !== false ? 'right-0.5' : 'right-[21px]'}`} />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300">ווידג׳ט</span>
                                            <button
                                                type="button"
                                                onClick={() => updateField('widgetPanelBordered', !(draft.widgetPanelBordered !== false))}
                                                className={`relative w-11 h-6 rounded-full border transition-all ${draft.widgetPanelBordered !== false ? 'bg-primary border-primary/70' : 'bg-gray-200 dark:bg-[#252528] border-gray-300 dark:border-white/10'}`}
                                                aria-label="הפעלת מסגרת לווידג׳ט בהירו"
                                            >
                                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-all ${draft.widgetPanelBordered !== false ? 'right-0.5' : 'right-[21px]'}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 rounded-[28px] border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-[#171a22]/80  overflow-hidden">
                                <div className="px-6 sm:px-7 pt-6 pb-5 border-b border-gray-200 dark:border-white/10 bg-gradient-to-l from-primary/10 via-transparent to-transparent">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                            <Hexagon size={18} className="text-primary" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-lg font-black text-gray-900 dark:text-white">החלת סגנון מותאם (Targets)</h3>
                                                <HelpTooltipButton title="איפה להחיל את הסגנון" description="כאן בוחרים על אילו חלקים באתר יחול סגנון המסגרת שבחרת." />
                                            </div>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">בחר על אילו אלמנטים יחול החיתוך הטקטי. אלמנטים כבויים יישארו עם פינות מעוגלות רגילות.</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
                                    {(() => {
                                        const layout = draft.regularLinksLayout;
                                        const externalLayout = draft.externalLinksLayout;
                                        const availabilityMap = {
                                            commander: true,
                                            widget: true,
                                            search: true,
                                            topNav: layout !== 'sidebar-right',
                                            sideNav: layout === 'sidebar-right',
                                            flipCards: layout === 'grid',
                                            hqDash: layout === 'hq',
                                            extLinks: externalLayout === 'cards' || externalLayout === 'floating',
                                        };

                                        return BORDER_TARGET_OPTIONS.map((target) => {
                                            const isEnabled = !!borderTargets?.[target.key];
                                            const isAvailable = availabilityMap[target.key];
                                            const disabledNote = !isAvailable
                                                ? 'כרגע לא קיים אלמנט זה בתצורת הקטגוריות הנוכחית.'
                                                : undefined;

                                            return (
                                                <Tooltip key={target.key} text={disabledNote}>
                                                    <button
                                                        type="button"
                                                        onClick={() => !isAvailable ? undefined : handleBorderTargetToggle(target.key)}
                                                        className={`group relative w-full overflow-hidden rounded-2xl border text-right p-4 transition-all min-h-[112px] h-full ${isEnabled
                                                            ? 'bg-primary/10 border-primary/30 shadow-[0_18px_40px_-28px_var(--color-primary-hex)]'
                                                            : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                            } ${!isAvailable ? 'cursor-not-allowed opacity-60 dark:opacity-80' : ''}`}
                                                        disabled={!isAvailable}
                                                    >
                                                        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary via-primary/40 to-transparent opacity-80" />
                                                        <div className="flex items-start gap-4">
                                                            <div className={`mt-0.5 relative w-12 h-7 rounded-full border transition-all ${isEnabled
                                                                ? 'bg-primary border-primary/60'
                                                                : 'bg-gray-200 dark:bg-[#252528] border-gray-300 dark:border-white/10'
                                                                }`}>
                                                                <div className={`absolute top-0.5 w-[22px] h-[22px] rounded-full shadow-md transition-all flex items-center justify-center ${isEnabled
                                                                    ? 'right-0.5 bg-white text-primary'
                                                                    : 'right-[25px] bg-white dark:bg-gray-300 text-gray-400'
                                                                    }`}>
                                                                    {isEnabled && <CheckCircle2 size={12} strokeWidth={3} />}
                                                                </div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <div className="flex items-center justify-between gap-3 mb-1">
                                                                    <h4 className={`font-bold text-sm ${isEnabled ? 'text-gray-900 dark:text-white' : 'text-gray-800 dark:text-gray-200'}`}>{target.label}</h4>
                                                                    <span className={`text-[10px] font-bold tracking-[0.2em] uppercase ${isEnabled ? 'text-primary' : 'text-gray-400 dark:text-gray-500'}`}>
                                                                        {isEnabled ? 'ON' : 'OFF'}
                                                                    </span>
                                                                </div>
                                                                <p className={`text-xs leading-5 ${isEnabled ? 'text-gray-700 dark:text-gray-300' : 'text-gray-500 dark:text-gray-500'}`}>
                                                                    {target.description}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </button>
                                                </Tooltip>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ==================== WIDGET HEIGHT ==================== */}
                    {showSection('widgetHeight') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <PanelBottom size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">גובה הווידגט הדינמי</h2>
                                        <HelpTooltipButton title="גובה הווידג׳ט" description="כאן קובעים כמה מקום הווידג׳ט הראשי יתפוס בגובה המסך." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">שליטה בגובה Section 3 בלבד, תוך שמירה על יישור תחתון קבוע</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {WIDGET_HEIGHT_OPTIONS.map((option) => {
                                    const isActive = draft.widgetHeight === option.value;

                                    return (
                                        <div key={option.value} className="relative">
                                            <button
                                                onClick={() => updateField('widgetHeight', option.value)}
                                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                    ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
                                                    : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                    }`}
                                            >
                                                <div className="flex-1">
                                                    <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{option.label}</h3>
                                                    <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{option.description}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-primary-500 bg-primary-500' : 'border-gray-600'}`}>
                                                    {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== HERO EFFECTS ==================== */}
                    {showSection('heroEffects') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <Sparkles size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">אזור עליון</h2>
                                        <HelpTooltipButton title="אפקטים לאזור העליון" description="כאן מפעילים אפקטים עדינים על החלק העליון של דף הבית בלבד." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">אפשרויות ויזואליות לאזור ההירו, הווידג׳ט ודבר המפקד.</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#1e212b] space-y-5">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-black text-gray-900 dark:text-white">אפקט זכוכית - אזור עליון</h3>
                                                <HelpTooltipButton
                                                    title="אפקט זכוכית באזור העליון"
                                                    description="מפעיל שכבת זכוכית על אזור ההירו העליון. ברירת מחדל כבויה לשמירה על התאמה לאתרים קיימים."
                                                />
                                            </div>
                                            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                                                שליטה נפרדת בהפעלה ובעוצמה של שכבת הזכוכית באזור ההירו.
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                                            <button
                                                dir="ltr"
                                                type="button"
                                                role="switch"
                                                aria-checked={draft.heroGlassEffect === true}
                                                onClick={() => updateField('heroGlassEffect', draft.heroGlassEffect !== true)}
                                                className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition-all duration-300 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#12141a] ${draft.heroGlassEffect === true
                                                    ? 'bg-primary-600 border-primary-400/70 shadow-[0_0_16px_var(--color-primary-hex)]'
                                                    : 'bg-gray-300 dark:bg-gray-700 border-gray-400/60 dark:border-gray-500/60'
                                                    }`}
                                                aria-label="הפעלת אפקט זכוכית באזור העליון"
                                            >
                                                <span className={`inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] transform-gpu transition-transform duration-300 ease-out ${draft.heroGlassEffect === true ? 'translate-x-9' : 'translate-x-1'}`} />
                                            </button>
                                            <span className={`text-[10px] font-bold tracking-wide ${draft.heroGlassEffect === true ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {draft.heroGlassEffect === true ? 'מופעל' : 'כבוי'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`mt-4 pt-4 border-t border-gray-200 dark:border-white/10 ${draft.heroGlassEffect === true ? '' : 'opacity-60'}`} dir="ltr">
                                        <div className="mb-2 flex items-center justify-between" dir="rtl">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">עוצמת אפקט זכוכית</span>
                                            <span className="text-xs font-black text-primary">{Math.max(0, Math.min(100, Number(draft.heroGlassStrength) || 58))}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={Math.max(0, Math.min(100, Number(draft.heroGlassStrength) || 58))}
                                            disabled={draft.heroGlassEffect !== true}
                                            onChange={(e) => updateField('heroGlassStrength', Number(e.target.value))}
                                            className="tint-strength-slider w-full cursor-pointer disabled:cursor-not-allowed"
                                            style={{ '--slider-fill': `${Math.max(0, Math.min(100, Number(draft.heroGlassStrength) || 58))}%` }}
                                            aria-label="עוצמת אפקט זכוכית באזור העליון"
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-base font-black text-gray-900 dark:text-white">אפקט זכוכית - ניווט עליון</h3>
                                                <HelpTooltipButton
                                                    title="אפקט זכוכית בניווט העליון"
                                                    description="מפעיל אפקט זכוכית על כל פס ה־Navbar העליון, כולל כפתורים ושורת החיפוש."
                                                />
                                            </div>
                                            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                                                שליטה נפרדת בהפעלה ובעוצמה של שכבת הזכוכית לניווט העליון.
                                            </p>
                                        </div>
                                        <div className="flex flex-col items-center gap-1.5 shrink-0">
                                            <button
                                                dir="ltr"
                                                type="button"
                                                role="switch"
                                                aria-checked={draft.topNavGlassEffect === true}
                                                onClick={() => updateField('topNavGlassEffect', draft.topNavGlassEffect !== true)}
                                                className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition-all duration-300 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#12141a] ${draft.topNavGlassEffect === true
                                                    ? 'bg-primary-600 border-primary-400/70 shadow-[0_0_16px_var(--color-primary-hex)]'
                                                    : 'bg-gray-300 dark:bg-gray-700 border-gray-400/60 dark:border-gray-500/60'
                                                    }`}
                                                aria-label="הפעלת אפקט זכוכית בניווט העליון"
                                            >
                                                <span className={`inline-block h-6 w-6 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.28)] transform-gpu transition-transform duration-300 ease-out ${draft.topNavGlassEffect === true ? 'translate-x-9' : 'translate-x-1'}`} />
                                            </button>
                                            <span className={`text-[10px] font-bold tracking-wide ${draft.topNavGlassEffect === true ? 'text-primary-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                                {draft.topNavGlassEffect === true ? 'מופעל' : 'כבוי'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className={`mt-4 pt-4 border-t border-gray-200 dark:border-white/10 ${draft.topNavGlassEffect === true ? '' : 'opacity-60'}`} dir="ltr">
                                        <div className="mb-2 flex items-center justify-between" dir="rtl">
                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">עוצמת אפקט זכוכית</span>
                                            <span className="text-xs font-black text-primary">{Math.max(0, Math.min(100, Number(draft.topNavGlassStrength) || 62))}%</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            step={1}
                                            value={Math.max(0, Math.min(100, Number(draft.topNavGlassStrength) || 62))}
                                            disabled={draft.topNavGlassEffect !== true}
                                            onChange={(e) => updateField('topNavGlassStrength', Number(e.target.value))}
                                            className="tint-strength-slider w-full cursor-pointer disabled:cursor-not-allowed"
                                            style={{ '--slider-fill': `${Math.max(0, Math.min(100, Number(draft.topNavGlassStrength) || 62))}%` }}
                                            aria-label="עוצמת אפקט זכוכית בניווט העליון"
                                        />
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ==================== REGULAR LINKS LAYOUT ==================== */}
                    {showSection('regularLinksLayout') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <LayoutGrid size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">תצוגת קטגוריות וקישורים</h2>
                                        <HelpTooltipButton title="קטגוריות וקישורים" description="כאן בוחרים איך האזורים והקישורים הפנימיים יוצגו באתר למשתמשים." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">בחר את אופן הצגת הקטגוריות והקישורים הפנימיים באתר</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {REGULAR_LINK_LAYOUTS.map((layout) => {
                                    const isActive = draft.regularLinksLayout === layout.value;
                                    const Icon = layout.icon;
                                    return (
                                        <div key={layout.value} className="relative">
                                            <button
                                                onClick={() => updateField('regularLinksLayout', layout.value)}
                                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                    ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
                                                    : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                    }`}
                                            >
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-primary-500/15' : 'bg-gray-100 dark:bg-white/5'}`}>
                                                    <Icon size={22} className={isActive ? 'text-primary-400' : 'text-gray-500'} />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{layout.label}</h3>
                                                    <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{layout.description}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-primary-500 bg-primary-500' : 'border-gray-600'}`}>
                                                    {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="mt-8 pt-8 border-t border-gray-200 dark:border-white/10">
                                <Tooltip text={draft.regularLinksLayout === 'sidebar-right' ? 'לא ניתן להציג ניווט עליון כאשר תפריט צד נבחר' : undefined}>
                                    <div
                                        className={`flex items-center justify-between p-5 bg-gray-100 dark:bg-[#1e212b] rounded-xl border border-gray-200 dark:border-white/5 transition-opacity ${draft.regularLinksLayout === 'sidebar-right' ? 'opacity-50 pointer-events-none' : ''}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${draft.showNavCategories ? 'bg-green-500/15' : 'bg-gray-100 dark:bg-white/5'}`}>
                                                {draft.showNavCategories ? <Eye size={20} className="text-green-400" /> : <EyeOff size={20} className="text-gray-500" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">הצגת קטגוריות בניווט עליון</h3>
                                                    <HelpTooltipButton title="קטגוריות בניווט עליון" description="האפשרות הזאת קובעת אם שמות הקטגוריות יוצגו בסרגל העליון של האתר." />
                                                </div>
                                                <p className="text-xs text-gray-400 dark:text-gray-500">הצג/הסתר את הקטגוריות בסרגל הניווט העליון של האתר</p>
                                            </div>
                                        </div>
                                        <label className="relative cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={draft.showNavCategories}
                                                disabled={draft.regularLinksLayout === 'sidebar-right'}
                                                onChange={(e) => updateField('showNavCategories', e.target.checked)}
                                            />
                                            <div className="w-12 h-7 bg-gray-200 dark:bg-[#252528] rounded-full peer-checked:bg-green-600 transition-colors" />
                                            <div className="absolute top-0.5 left-0.5 w-6 h-6 bg-gray-300 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-transform shadow-sm" />
                                        </label>
                                    </div>
                                </Tooltip>
                            </div>
                        </section>
                    )}

                    {/* ==================== EXTERNAL LINKS LAYOUT ==================== */}
                    {showSection('externalLinksLayout') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-200 dark:border-white/10 pb-4">
                                <div className="bg-primary-500/10 p-2.5 rounded-lg border border-primary-500/20">
                                    <Globe size={20} className="text-primary-400" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">תצוגת קישורים חיצוניים</h2>
                                        <HelpTooltipButton title="קישורים חיצוניים" description="כאן מחליטים איך רשימת הקישורים החיצוניים תיראה בחלק התחתון של האתר." />
                                    </div>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">בחר את אופן הצגת הקישורים החיצוניים בפוטר</p>
                                </div>
                            </div>
                            <div className="space-y-3 mb-5">
                                {EXTERNAL_LINK_LAYOUTS.map((layout) => {
                                    const isActive = draft.externalLinksLayout === layout.value;
                                    const Icon = layout.icon;
                                    return (
                                        <div key={layout.value} className="relative">
                                            <button
                                                onClick={() => updateField('externalLinksLayout', layout.value)}
                                                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                    ? 'bg-primary-500/10 border-primary-500/40 ring-1 ring-primary-500/20'
                                                    : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                    }`}
                                            >
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-primary-500/15' : 'bg-gray-100 dark:bg-white/5'}`}>
                                                    <Icon size={22} className={isActive ? 'text-primary-400' : 'text-gray-500'} />
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{layout.label}</h3>
                                                    <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{layout.description}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-primary-500 bg-primary-500' : 'border-gray-600'}`}>
                                                    {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                                </div>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex flex-col gap-3 pt-5 border-t border-gray-200 dark:border-white/5" dir="rtl">
                                {EXTERNAL_LINK_DISPLAY_TOGGLES.map((row) => {
                                    const raw = draft[row.field];
                                    const isOn = row.defaultTrue ? raw !== false : !!raw;
                                    return (
                                        <div
                                            key={row.field}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] px-4 py-3"
                                        >
                                            <div className="min-w-0 flex-1 text-start">
                                                <div className="flex items-center gap-2 justify-start">
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{row.title}</div>
                                                    <HelpTooltipButton
                                                        title={row.helpTitle}
                                                        description={row.helpDescription}
                                                        buttonClassName="shrink-0"
                                                        iconSize={12}
                                                    />
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{row.subtitle}</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateField(row.field, !isOn)}
                                                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition ${isOn
                                                    ? 'bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/40'
                                                    : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-white/10'
                                                    }`}
                                            >
                                                {isOn ? 'פעיל' : 'כבוי'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    
                </div>

                <div className="order-1 lg:order-2 lg:min-w-[660px] lg:self-start">
                    <div className="sticky top-[128px]">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">תצוגה מקדימה </p>
                            <span className="text-[10px] font-bold tracking-widest uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">Live</span>
                        </div>

                        {/* Monitor bezel + stand wrapper for live preview */}
                        <div className="flex flex-col items-center gap-2">
                            {/* Monitor bezel / screen frame */}
                            <div className="w-full bg-transparent flex justify-center">
                                <div className="border-[6px] lg:border-[8px] border-[#1e212b] rounded-2xl md:rounded-3xl bg-[#1e212b] shadow-2xl relative z-10 overflow-hidden w-full">
                                    <ThemeLivePreview draft={draft} displayModeOverride={draft.displayMode} />
                                </div>
                            </div>

                            {/* Monitor stand (neck + base + shadow) */}
                            <div className="flex flex-col items-center relative z-0 -mt-1">
                                {/* The Monitor Neck */}
                                <div className="w-16 md:w-20 h-8 md:h-12 bg-gradient-to-b from-[#1e212b] to-gray-600 shadow-inner" />

                                {/* The Monitor Base */}
                                <div className="w-40 md:w-56 h-4 md:h-6 bg-gradient-to-b from-gray-500 to-gray-800 rounded-t-xl md:rounded-t-2xl shadow-2xl border-b-4 border-gray-900 relative">
                                    {/* Base highlight for realism */}
                                    <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-white/20" />
                                </div>

                                {/* Desk shadow effect */}
                                <div className="w-48 md:w-64 h-2 bg-black/20 blur-md rounded-full mt-1" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
