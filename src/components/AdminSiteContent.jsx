import React, { useEffect, useRef, useState } from 'react';
import { useSiteContent } from '../context/SiteContentContext';
import { useConfig } from '../context/ConfigProvider';
import { useTheme } from '../context/ThemeContext';
import SiteContentLivePreview from './SiteContentLivePreview';
import {
    AlertTriangle, Plus, Trash2, Edit2, X,
    Image as ImageIcon, Type, MessageSquare,
    ChevronDown, ChevronUp, Upload, Loader2, Sparkles
} from 'lucide-react';
import { uploadImage } from '../utils/sharepointUtils';
import { resolveSiteImageUrl } from '../utils/assetUrl';
import Tooltip from './Tooltip';
import { DEFAULT_OVERLAY_IMAGE, normalizeOverlayImageConfig } from '../utils/overlayImageConfig';
import { confirmToast } from '../utils/confirmToast';
import { AdminPageHelpButton, HelpLabel, HelpTooltipButton } from './AdminHelp';
import { toast } from 'react-toastify';
import AdminAIActionCard from './AdminAIActionCard';
import AdminAIHelp from './AdminAIHelp';
import AIService from '../services/AIService';
import { getSafeAiRuntimeConfig } from '../config/ai.config';

const MAX_COMMANDER_MESSAGES = 5;

const SETTINGS_NAV = [
    { id: 'hero-content', label: 'טקסט Hero', description: 'שם האתר, כותרות ותיאור' },
    { id: 'hero-backgrounds', label: 'תמונות רקע', description: 'ניהול תמונות הרקע המתחלפות' },
    { id: 'commander-profile', label: 'פרטי מפקד', description: 'תמונה, כותרת ותפקיד המפקד' },
    { id: 'commander-messages', label: 'הודעות מפקד', description: 'ניהול הודעות וניווט בין הודעות' },
    { id: 'overlay-image', label: 'אלמנט תמונה', description: 'תמונה צפה עם מיקום, גודל וסגנון מסגרת' },
    { id: 'factoryReset', label: 'איפוס נתוני אתר', description: 'איפוס נתוני אתר לברירת מחדל', destructive: true },
];

const HERO_DEFAULTS = {
    siteName: '',
    title: '',
    subtitle: '',
    logo: '',
    description: '',
    backgroundImages: [],
};

const COMMANDER_DEFAULTS = {
    image: '',
    sectionTitle: '',
    roleLabel: '',
    decorativeElement: 'line-diamond-line',
    messages: [],
};

const OVERLAY_POSITION_OPTIONS = [
    { value: 'fixed', label: 'Fixed', description: 'נשאר על המסך גם בזמן גלילה' },
    { value: 'absolute', label: 'Absolute', description: 'ממוקם בנקודה קבועה בדף עצמו' },
];

const OVERLAY_DISPLAY_AREA_OPTIONS = [
    { value: 'fixed-site', label: 'בכל מקום באתר ', description: 'האלמנט יוכל להופיע בכל מקום באתר' },
    { value: 'hero-full', label: 'אזור ההירו המלא ', description: 'האלמנט יוכל להופיע רק באזור העליון' },
    { value: 'hero-content', label: 'בתוך הכותרת בלבד ', description: 'האלמנט יוכל להופיע רק בתוך אזור כותרת האתר' },
];

const OVERLAY_ANCHOR_OPTIONS = [
    { value: 'top-left', label: 'למעלה שמאל' },
    { value: 'top-center', label: 'למעלה מרכז' },
    { value: 'top-right', label: 'למעלה ימין' },
    { value: 'middle-left', label: 'אמצע שמאל' },
    { value: 'middle-center', label: 'אמצע מרכז' },
    { value: 'middle-right', label: 'אמצע ימין' },
    { value: 'bottom-left', label: 'למטה שמאל' },
    { value: 'bottom-center', label: 'למטה מרכז' },
    { value: 'bottom-right', label: 'למטה ימין' },
];

const OVERLAY_BORDER_STYLE_OPTIONS = [
    { value: 'none', label: 'ללא מסגרת' },
    { value: 'standard', label: 'סטנדרטי' },
    { value: 'square', label: 'מרובע' },
    { value: 'cyber', label: 'סייבר' },
    { value: 'armor', label: 'שריון' },
    { value: 'shield', label: 'מגן' },
    { value: 'blade', label: 'להב' },
];

const OVERLAY_OBJECT_FIT_OPTIONS = [
    { value: 'contain', label: 'Contain', description: 'התמונה כולה תישאר גלויה בתוך המסגרת' },
    { value: 'cover', label: 'Cover', description: 'התמונה תמלא את המסגרת (יכול להיחתך חלק)' },
];

const inputCls = 'w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10 dark:border-gray-700/50 dark:bg-[#1e212b] dark:text-white';
const AI_SITE_CONTENT_RUNTIME = getSafeAiRuntimeConfig();

function asText(value, fallback = '') {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return trimmed || fallback;
}

function normalizeAiCommanderMessages(messages) {
    if (!Array.isArray(messages)) return [];

    return messages
        .map((entry, index) => {
            if (typeof entry === 'string') {
                const text = entry.trim();
                if (!text) return null;
                return {
                    id: `msg_${Date.now()}_${index}`,
                    text,
                    signature: '',
                };
            }

            const text = asText(entry?.text);
            if (!text) return null;

            return {
                id: asText(entry?.id, `msg_${Date.now()}_${index}`),
                text,
                signature: asText(entry?.signature),
            };
        })
        .filter(Boolean)
        .slice(0, MAX_COMMANDER_MESSAGES);
}

function normalizeAiSiteContentPayload(payload, fallbackHero, fallbackCommander) {
    const heroPayload = payload?.hero || {};
    const commanderPayload = payload?.commander || {};

    const nextHero = {
        ...fallbackHero,
        siteName: asText(heroPayload.siteName, fallbackHero.siteName),
        title: asText(heroPayload.title, fallbackHero.title).split('\n').slice(0, 2).join('\n'),
        subtitle: asText(heroPayload.subtitle, fallbackHero.subtitle),
        description: asText(heroPayload.description, fallbackHero.description).split('\n').slice(0, 3).join('\n'),
    };

    const nextCommander = {
        ...fallbackCommander,
        sectionTitle: asText(commanderPayload.sectionTitle, fallbackCommander.sectionTitle),
        roleLabel: asText(commanderPayload.roleLabel, fallbackCommander.roleLabel),
    };

    if (Array.isArray(commanderPayload.messages)) {
        nextCommander.messages = normalizeAiCommanderMessages(commanderPayload.messages);
    }

    return {
        hero: nextHero,
        commander: nextCommander,
    };
}

export default function AdminSiteContent() {
    const { siteContent, loading, error, saveSiteContent } = useSiteContent();
    const { theme: themeSettings, saveTheme } = useTheme();
    const { factoryReset } = useConfig();
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [activeSettingId, setActiveSettingId] = useState(SETTINGS_NAV[0].id);
    const [isResetting, setIsResetting] = useState(false);
    const [hero, setHero] = useState(HERO_DEFAULTS);
    const [commander, setCommander] = useState(COMMANDER_DEFAULTS);
    const [overlayImage, setOverlayImage] = useState(DEFAULT_OVERLAY_IMAGE);
    const [editingMessage, setEditingMessage] = useState(null);
    const [uploadingHeroIndex, setUploadingHeroIndex] = useState(null);
    const [uploadingCommander, setUploadingCommander] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [uploadingOverlayImage, setUploadingOverlayImage] = useState(false);
    const [improvingTargetKey, setImprovingTargetKey] = useState('');
    const heroFileInputRef = useRef(null);
    const logoFileInputRef = useRef(null);
    const commanderFileInputRef = useRef(null);
    const overlayImageFileInputRef = useRef(null);
    const lastSavedRef = useRef(null);
    const isAiEnabled = AIService.isEnabled();

    useEffect(() => {
        if (!siteContent) return;

        const nextHero = {
            ...HERO_DEFAULTS,
            ...(siteContent.hero || {}),
            backgroundImages: [...(siteContent.hero?.backgroundImages || [])],
        };
        const nextCommander = {
            ...COMMANDER_DEFAULTS,
            ...(siteContent.commander || {}),
            messages: [...(siteContent.commander?.messages || [])],
        };
        const nextOverlayImage = normalizeOverlayImageConfig(siteContent.overlayImage);

        setHero(nextHero);
        setCommander(nextCommander);
        setOverlayImage(nextOverlayImage);
        lastSavedRef.current = JSON.stringify({ hero: nextHero, commander: nextCommander, overlayImage: nextOverlayImage });
    }, [siteContent]);

    useEffect(() => {
        const current = JSON.stringify({ hero, commander, overlayImage });
        if (!lastSavedRef.current || current === lastSavedRef.current) return;

        const timeoutId = setTimeout(async () => {
            setIsSaving(true);
            setSaveMessage(null);
            const success = await saveSiteContent({ hero, commander, overlayImage });
            setIsSaving(false);
            if (success) {
                lastSavedRef.current = current;
            } else {
                setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
            }
        }, 1200);

        return () => clearTimeout(timeoutId);
    }, [hero, commander, overlayImage, saveSiteContent]);

    const updateHeroField = (field, value) => {
        setHero((prev) => ({ ...prev, [field]: value }));
    };

    const updateCommanderField = (field, value) => {
        setCommander((prev) => ({ ...prev, [field]: value }));
    };

    const clampOverlayNumber = (value, min, max, fallback) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, Math.round(parsed)));
    };

    const updateOverlayField = (field, value) => {
        setOverlayImage((prev) => normalizeOverlayImageConfig({ ...prev, [field]: value }));
    };

    const updateOverlayNumberField = (field, value, min, max) => {
        setOverlayImage((prev) => {
            const fallback = Number.isFinite(prev[field]) ? prev[field] : DEFAULT_OVERLAY_IMAGE[field];
            return {
                ...prev,
                [field]: clampOverlayNumber(value, min, max, fallback),
            };
        });
    };

    const removeBackgroundImage = (index) => {
        setHero((prev) => ({
            ...prev,
            backgroundImages: prev.backgroundImages.filter((_, i) => i !== index),
        }));
    };

    const moveBackgroundImage = (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= hero.backgroundImages.length) return;

        setHero((prev) => {
            const nextImages = [...prev.backgroundImages];
            [nextImages[index], nextImages[targetIndex]] = [nextImages[targetIndex], nextImages[index]];
            return {
                ...prev,
                backgroundImages: nextImages,
            };
        });
    };

    const handleHeroGrayscaleChange = async (nextGrayscale) => {
        if (!themeSettings) return;
        const success = await saveTheme({ ...themeSettings, heroGrayscale: nextGrayscale });
        if (!success) {
            toast.error('שגיאה בשמירת אפקט תמונות הרקע. אנא נסה שוב.');
        }
    };

    const handleHeroFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingHeroIndex(hero.backgroundImages.length);
        try {
            const url = await uploadImage(file, 'Hero');
            setHero((prev) => ({ ...prev, backgroundImages: [...prev.backgroundImages, url] }));
        } catch (err) {
            console.error('שגיאה בהעלאת תמונת רקע:', err);
            setSaveMessage({ type: 'error', text: `שגיאה בהעלאת תמונה: ${err.message}` });
            setTimeout(() => setSaveMessage(null), 4000);
        } finally {
            setUploadingHeroIndex(null);
            if (heroFileInputRef.current) heroFileInputRef.current.value = '';
        }
    };

    const handleCommanderFileUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingCommander(true);
        try {
            const url = await uploadImage(file, 'Commander');
            setCommander((prev) => ({ ...prev, image: url }));
        } catch (err) {
            console.error('שגיאה בהעלאת תמונת מפקד:', err);
            setSaveMessage({ type: 'error', text: `שגיאה בהעלאת תמונה: ${err.message}` });
            setTimeout(() => setSaveMessage(null), 4000);
        } finally {
            setUploadingCommander(false);
            if (commanderFileInputRef.current) commanderFileInputRef.current.value = '';
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingLogo(true);
        try {
            const url = await uploadImage(file, 'Logo');
            setHero((prev) => ({ ...prev, logo: url }));
        } catch (err) {
            console.error('שגיאה בהעלאת תמונת לוגו:', err);
            setSaveMessage({ type: 'error', text: `שגיאה בהעלאת תמונה: ${err.message}` });
            setTimeout(() => setSaveMessage(null), 4000);
        } finally {
            setUploadingLogo(false);
            if (logoFileInputRef.current) logoFileInputRef.current.value = '';
        }
    };

    const handleOverlayImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingOverlayImage(true);
        try {
            const url = await uploadImage(file, 'Overlay');
            setOverlayImage((prev) => normalizeOverlayImageConfig({
                ...prev,
                imageUrl: url,
                enabled: true,
            }));
        } catch (err) {
            console.error('שגיאה בהעלאת תמונת אלמנט:', err);
            setSaveMessage({ type: 'error', text: `שגיאה בהעלאת תמונה: ${err.message}` });
            setTimeout(() => setSaveMessage(null), 4000);
        } finally {
            setUploadingOverlayImage(false);
            if (overlayImageFileInputRef.current) overlayImageFileInputRef.current.value = '';
        }
    };

    /** מסיר את התמונה ומאפס את כל שדות האלמנט לברירת המחדל */
    const clearOverlayImage = () => {
        setOverlayImage(normalizeOverlayImageConfig({}));
        if (overlayImageFileInputRef.current) overlayImageFileInputRef.current.value = '';
    };

    const addMessage = () => {
        if (commander.messages.length >= MAX_COMMANDER_MESSAGES) return;

        setEditingMessage({
            id: Date.now().toString(),
            text: '',
            signature: '',
            isNew: true,
        });
    };

    const saveMessageEdit = (e) => {
        e.preventDefault();
        const updated = {
            id: editingMessage.id || Date.now().toString(),
            text: String(editingMessage.text || '').trim(),
            signature: String(editingMessage.signature || '').trim(),
        };

        if (editingMessage.isNew) {
            setCommander((prev) => ({
                ...prev,
                messages: [...prev.messages, updated],
            }));
        } else {
            setCommander((prev) => ({
                ...prev,
                messages: prev.messages.map((message) => (
                    message.id === updated.id ? updated : message
                )),
            }));
        }

        setEditingMessage(null);
    };

    const handleImproveEditingMessageText = async () => {
        const source = String(editingMessage?.text || '').trim();
        if (!source) {
            toast.error('אין טקסט הודעה לשיפור.');
            return;
        }
        const targetKey = `editing-message-${editingMessage.id || 'new'}`;
        setImprovingTargetKey(targetKey);
        try {
            const improved = await improveTextWithAi({
                text: source,
                fieldTitle: 'הודעת מפקד',
                rules: 'עד 4 שורות. שפה בטוחה, סמכותית, אנושית ובהירה. בלי קלישאות.',
                maxLines: 4,
            });
            setEditingMessage((prev) => (prev ? { ...prev, text: improved } : prev));
            toast.success('הודעת המפקד שופרה');
        } catch (error) {
            toast.error(error?.message || 'שיפור הודעת המפקד נכשל');
        } finally {
            setImprovingTargetKey('');
        }
    };

    const removeMessage = (id) => {
        confirmToast({
            title: 'מחיקת הודעה',
            message: 'האם למחוק הודעה זו?',
            confirmText: 'מחק',
            cancelText: 'ביטול',
            type: 'warning',
        }).then((confirmed) => {
            if (!confirmed) return;
            setCommander((prev) => ({
                ...prev,
                messages: prev.messages.filter((message) => message.id !== id),
            }));
        });
    };

    const moveMessage = (index, direction) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= commander.messages.length) return;

        setCommander((prev) => {
            const messages = [...prev.messages];
            [messages[index], messages[targetIndex]] = [messages[targetIndex], messages[index]];
            return { ...prev, messages };
        });
    };

    const handleFactoryReset = async () => {
        if (isResetting || typeof factoryReset !== 'function') return;
        setIsResetting(true);
        try {
            await factoryReset();
        } finally {
            setIsResetting(false);
        }
    };

    const buildSiteContentAiPrompt = (instruction) => {
        const snapshot = {
            hero: {
                siteName: hero.siteName,
                title: hero.title,
                subtitle: hero.subtitle,
                description: hero.description,
            },
            commander: {
                sectionTitle: commander.sectionTitle,
                roleLabel: commander.roleLabel,
                messages: commander.messages.map((item) => ({
                    text: item.text,
                    signature: item.signature,
                })),
            },
        };

        return [
            'אתה קופירייטר לפורטל צבאי/ארגוני בעברית.',
            'החזר JSON בלבד וללא טקסט נוסף.',
            'סכימה מחייבת:',
            '{',
            '  "hero": {',
            '    "siteName": "string",',
            '    "subtitle": "string",',
            '    "title": "string (עד 2 שורות)",',
            '    "description": "string (עד 3 שורות)"',
            '  },',
            '  "commander": {',
            '    "sectionTitle": "string",',
            '    "roleLabel": "string",',
            '    "messages": [',
            '      { "text": "string", "signature": "string" }',
            '    ]',
            '  }',
            '}',
            'חוקים:',
            `- עד ${MAX_COMMANDER_MESSAGES} הודעות מפקד.`,
            '- ניסוח קצר, מקצועי, לא סיסמאות ריקות.',
            '- שמור על שפה טבעית וברורה.',
            `תוכן קיים: ${JSON.stringify(snapshot)}`,
            `בקשת המשתמש: ${instruction}`,
        ].join('\n');
    };

    const applyAiSiteContent = (parsed) => {
        const normalized = normalizeAiSiteContentPayload(parsed, hero, commander);
        setHero(normalized.hero);
        setCommander(normalized.commander);
        setActiveSettingId('hero-content');
        setEditingMessage(null);
        toast.success('הצעת AI הוחלה על תוכן האתר');
    };

    const cleanImprovedText = (rawText, maxLines = 3) => {
        const cleaned = String(rawText || '')
            .replace(/^```[\s\S]*?\n/, '')
            .replace(/```$/g, '')
            .replace(/^["'`]+|["'`]+$/g, '')
            .trim();
        const limitedLines = cleaned
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .slice(0, maxLines);
        return limitedLines.join('\n');
    };

    const improveTextWithAi = async ({ text, fieldTitle, rules, maxLines }) => {
        if (!isAiEnabled) {
            throw new Error('שירות ה-AI כבוי כרגע.');
        }
        const prompt = [
            'אתה עורך לשוני מומחה לתוכן ארגוני בעברית.',
            'שפר את הטקסט הבא כך שיהיה ברור, מקצועי, ענייני וקצר.',
            'החזר טקסט בלבד ללא הסברים, ללא כותרות, ללא markdown וללא מירכאות.',
            `שדה: ${fieldTitle}`,
            `חוקים: ${rules}`,
            `טקסט לשיפור: ${text}`,
        ].join('\n');
        const result = await AIService.ask(prompt, {
            model: AI_SITE_CONTENT_RUNTIME.defaultModel,
            fallbackModels: AI_SITE_CONTENT_RUNTIME.fallbackModels,
            requestMode: AI_SITE_CONTENT_RUNTIME.requestMode,
            useSmartFallback: AI_SITE_CONTENT_RUNTIME.useSmartFallback,
        });
        const improved = cleanImprovedText(result?.content, maxLines);
        if (!improved) {
            throw new Error('לא התקבל טקסט משופר מה-AI.');
        }
        return improved;
    };

    const handleImproveHeroDescription = async () => {
        const source = String(hero.description || '').trim();
        if (!source) {
            toast.error('אין תיאור לשיפור.');
            return;
        }
        setImprovingTargetKey('hero-description');
        try {
            const improved = await improveTextWithAi({
                text: source,
                fieldTitle: 'תיאור Hero',
                rules: 'עד 3 שורות. לשמור על ניסוח ייצוגי, קריא ומדויק.',
                maxLines: 3,
            });
            updateHeroField('description', improved);
            toast.success('התיאור שופר בהצלחה');
        } catch (error) {
            toast.error(error?.message || 'שיפור התיאור נכשל');
        } finally {
            setImprovingTargetKey('');
        }
    };

    const showSection = (id) => activeSettingId === id;
    const isHeroContentTab = showSection('hero-content');
    const isHeroBackgroundsTab = showSection('hero-backgrounds');
    const isCommanderProfileTab = showSection('commander-profile');
    const isCommanderMessagesTab = showSection('commander-messages');
    const isOverlayImageTab = showSection('overlay-image');
    const isFactoryResetTab = showSection('factoryReset');
    const heroTabActive = isHeroContentTab || isHeroBackgroundsTab;
    const commanderTabActive = isCommanderProfileTab || isCommanderMessagesTab;

    if (loading && !siteContent) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען תוכן אתר...</div>;
    }

    return (
        <div dir="rtl" className="h-full flex flex-col bg-gray-50 dark:bg-[#12141a] text-gray-900 dark:text-white font-heebo relative">
            <div className="sticky top-0 z-30 bg-gray-50/95 dark:bg-[#12141a]/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 px-6 pt-6 pb-4 sm:px-10 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">ניהול המידע</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">עריכה חיה של תוכן ההירו ודבר המפקד, באותו מבנה עבודה כמו מסך עיצוב האתר</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <AdminPageHelpButton pageId="site-content" tabId={activeSettingId} />
                        <AdminAIActionCard
                            compact
                            compactLabel="AI"
                            title="עוזר AI לתוכן האתר"
                            description="ייצור מהיר של טקסטי Hero ו'דבר המפקד' בהתאם לבריף שתכתוב."
                            inputLabel="איזה תוכן תרצה לייצר?"
                            inputPlaceholder='דוגמה: "נסח כותרת ותיאור אתר ליחידה טכנולוגית עם דגש על חדשנות, מקצועיות ושירות"'
                            defaultInput="נסח תכנים רשמיים וקצרים למסך הבית"
                            buildPrompt={buildSiteContentAiPrompt}
                            onApply={applyAiSiteContent}
                            applyButtonLabel="החל על התוכן"
                            generateButtonLabel="ייצר תוכן"
                            primaryPanelTabLabel="תוכן האתר"
                            secondaryPanelTabLabel="שאלות ותפעול"
                            secondaryPanelTitle="עוזר AI לניווט ותפעול"
                            secondaryPanel={<AdminAIHelp embedded />}
                        />
                        {isSaving && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full shadow-sm">
                                <div className="w-3.5 h-3.5 border-[2px] border-primary border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">שומר...</span>
                            </div>
                        )}
                    </div>
                </div>

                <nav className="flex items-center gap-2 overflow-x-auto p-1 custom-scrollbar w-full">
                    {SETTINGS_NAV.map(({ id, label, destructive }) => (
                        <button
                            key={id}
                            onClick={() => setActiveSettingId(id)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition whitespace-nowrap ${activeSettingId === id
                                ? destructive
                                    ? 'bg-red-600 text-white shadow-md ring-2 ring-red-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                    : 'bg-primary-600 text-white shadow-md ring-2 ring-primary-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                : destructive
                                    ? 'bg-white dark:bg-white/5 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-900 dark:hover:text-red-200 border border-red-200 dark:border-red-500/35 shadow-sm hover:shadow'
                                    : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-transparent shadow-sm hover:shadow'
                                }`}
                        >
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

            {saveMessage?.type === 'error' && (
                <div className="mx-6 sm:mx-10 mt-6 p-4 rounded-xl flex items-center gap-3 bg-red-50 dark:bg-red-900/50 border border-red-300 dark:border-red-500 shadow-sm">
                    <AlertTriangle className="text-red-500 shrink-0" />
                    <span className="text-red-700 dark:text-red-200">{saveMessage.text}</span>
                </div>
            )}

            <div className="flex-1 overflow-hidden p-4 sm:p-6 lg:p-8 space-y-8 lg:space-y-0 lg:flex lg:flex-row-reverse lg:items-start lg:gap-6 2xl:gap-8">
                <div className="lg:flex-[1.08] lg:basis-[54%] lg:max-w-[52vw] lg:min-w-[660px] lg:shrink-0 lg:self-start">
                    <div className="sticky top-[128px]">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">תצוגה מקדימה </p>
                            <span className="text-[10px] font-bold tracking-widest uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">Live</span>
                        </div>

                        <div className="flex flex-col items-center gap-2">
                            <div className="w-full bg-transparent flex justify-center">
                                <div className="border-[6px] lg:border-[8px] border-[#1e212b] rounded-2xl md:rounded-3xl bg-[#1e212b] shadow-2xl relative z-10 overflow-hidden w-full">
                                    <SiteContentLivePreview draft={{ hero, commander, overlayImage }} zoom={1.38} />
                                </div>
                            </div>

                            <div className="flex flex-col items-center relative z-0 -mt-1">
                                <div className="w-16 md:w-20 h-8 md:h-12 bg-gradient-to-b from-[#1e212b] to-gray-600 shadow-inner" />
                                <div className="w-40 md:w-56 h-4 md:h-6 bg-gradient-to-b from-gray-500 to-gray-800 rounded-t-xl md:rounded-t-2xl shadow-2xl border-b-4 border-gray-900 relative">
                                    <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-white/20" />
                                </div>
                                <div className="w-48 md:w-64 h-2 bg-black/20 blur-md rounded-full mt-1" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-10 lg:flex-[0.92] lg:basis-[46%] lg:min-w-0 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto lg:pl-2 custom-scrollbar">
                    {heroTabActive && (
                        <section className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm">
                            <div className="flex items-start justify-between gap-4 mb-8 pb-5 border-b border-gray-200 dark:border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary-500/10 p-2.5 rounded-xl border border-primary-500/20">
                                        {isHeroBackgroundsTab ? <ImageIcon size={20} className="text-primary-400" /> : <Type size={20} className="text-primary-400" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{isHeroBackgroundsTab ? 'תמונות רקע' : 'טקסט אזור הפתיחה'}</h2>
                                            <HelpTooltipButton
                                                title={isHeroBackgroundsTab ? 'תמונות רקע' : 'טקסט אזור הפתיחה'}
                                                description={isHeroBackgroundsTab ? 'כאן מנהלים את כל התמונות שמתחלפות ברקע החלק העליון של האתר.' : 'כאן משנים את הטקסטים הראשיים שרואים מיד כשנכנסים לאתר.'}
                                            />
                                        </div>
                                        <p className="text-sm text-gray-400 dark:text-gray-500">{SETTINGS_NAV.find((item) => item.id === activeSettingId)?.description}</p>
                                    </div>
                                </div>
                            </div>

                            <div className={`grid grid-cols-1 ${isHeroContentTab && isHeroBackgroundsTab ? 'xl:grid-cols-2' : ''} gap-8`}>
                                {isHeroContentTab && (
                                    <div className="space-y-5">
                                        <div>
                                            <HelpLabel
                                                as="span"
                                                className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                wrapperClassName="mb-2 flex items-center gap-2"
                                                helpTitle="שם האתר"
                                                helpDescription="השם שיופיע בתפריט העליון של האתר."
                                            >
                                                שם האתר (בתפריט העליון)
                                            </HelpLabel>
                                            <input
                                                type="text"
                                                value={hero.siteName ?? ''}
                                                onChange={(e) => updateHeroField('siteName', e.target.value)}
                                                className={inputCls}
                                                placeholder='לדוגמה: "שם האתר"'
                                            />
                                            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">מוצג בתפריט העליון בצבע הראשי</p>
                                        </div>

                                        <div>
                                            <HelpLabel
                                                as="span"
                                                className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                wrapperClassName="mb-2 flex items-center gap-2"
                                                helpTitle="תמונת לוגו"
                                                helpDescription="הלוגו שמופיע באזור העליון של האתר. אפשר להעלות חדש או להסיר את הקיים."
                                            >
                                                תמונת לוגו
                                            </HelpLabel>
                                            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-[#1b1f2a] border border-gray-200 dark:border-white/5 rounded-2xl">
                                                <div className="w-20 h-20 rounded-xl bg-white dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center shrink-0">
                                                    {hero.logo ? (
                                                        <img src={resolveSiteImageUrl(hero.logo)} alt="Logo" className="w-full h-full object-contain" />
                                                    ) : (
                                                        <div className="text-gray-400 text-[10px] text-center px-1">אין לוגו</div>
                                                    )}
                                                </div>
                                                <div className="flex-1 flex flex-col gap-2">
                                                    <label
                                                        className={`flex items-center justify-center gap-2 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition font-bold text-xs cursor-pointer ${uploadingLogo ? 'opacity-50 pointer-events-none' : ''}`}
                                                    >
                                                        {uploadingLogo ? (
                                                            <>
                                                                <Loader2 size={14} className="animate-spin" />
                                                                <span>מעלה...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Upload size={14} />
                                                                <span>{hero.logo ? 'החלף לוגו' : 'העלה לוגו'}</span>
                                                            </>
                                                        )}
                                                        <input
                                                            ref={logoFileInputRef}
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleLogoUpload}
                                                            className="hidden"
                                                            disabled={uploadingLogo}
                                                        />
                                                    </label>
                                                    {hero.logo && (
                                                        <button
                                                            onClick={() => updateHeroField('logo', '')}
                                                            className="text-[10px] font-bold text-red-400 hover:text-red-300 transition text-right px-1"
                                                        >
                                                            הסר לוגו
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <HelpLabel
                                                as="span"
                                                className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                wrapperClassName="mb-2 flex items-center gap-2"
                                                helpTitle="תת-כותרת עליונה"
                                                helpDescription="שורת פתיחה קצרה שמופיעה מעל הכותרת הראשית."
                                            >
                                                תת-כותרת עליונה
                                            </HelpLabel>
                                            <input
                                                type="text"
                                                value={hero.subtitle}
                                                onChange={(e) => updateHeroField('subtitle', e.target.value)}
                                                className={inputCls}
                                                placeholder='לדוגמה: "ברוכים הבאים"'
                                            />
                                        </div>

                                        <div>
                                            <HelpLabel
                                                as="span"
                                                className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                wrapperClassName="mb-2 flex items-center gap-2"
                                                helpTitle="כותרת ראשית"
                                                helpDescription="הכותרת הגדולה שרואים במרכז אזור הפתיחה."
                                                helpItems={[
                                                    'אפשר להשתמש בשתי שורות לכל היותר.',
                                                ]}
                                            >
                                                כותרת ראשית
                                            </HelpLabel>
                                            <textarea
                                                value={hero.title}
                                                onChange={(e) => {
                                                    const lines = e.target.value.split(/\n/);
                                                    updateHeroField('title', lines.slice(0, 2).join('\n'));
                                                }}
                                                rows={2}
                                                className={`${inputCls} resize-none`}
                                                placeholder='לדוגמה: "צוות אלפא"'
                                            />
                                            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">עד 2 שורות. השתמש ב-Enter לשבירת שורה</p>
                                        </div>

                                        <div>
                                            <div className="mb-2 flex items-center justify-between gap-2" >
                                                <HelpLabel
                                                    
                                                    as="span"
                                                    className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                    wrapperClassName="flex items-center gap-2"
                                                    helpTitle="תיאור"
                                                    helpDescription="טקסט הסבר קצר שמופיע מתחת לכותרת הראשית."
                                                    helpItems={[
                                                        'מומלץ לשמור על עד שלוש שורות כדי שהמסך יישאר נקי.',
                                                    ]}
                                                >
                                                    תיאור
                                                </HelpLabel>
                                            </div>
                                            <div className="relative" >
                                                <textarea
                                                    
                                                    value={hero.description}
                                                    onChange={(e) => {
                                                        const lines = e.target.value.split(/\n/);
                                                        updateHeroField('description', lines.slice(0, 3).join('\n'));
                                                    }}
                                                    rows={3}
                                                    className={`${inputCls} resize-none text-sm  `}
                                                    placeholder="תיאור קצר שמופיע מתחת לכותרת..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleImproveHeroDescription}
                                                    disabled={!isAiEnabled || improvingTargetKey === 'hero-description' || !hero.description.trim()}
                                                    className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-white/10 bg-white/95 dark:bg-[#202534] px-2 py-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {improvingTargetKey === 'hero-description' ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                                    שפר טקסט
                                                </button>
                                            </div>
                                            <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">עד 3 שורות</p>
                                        </div>
                                    </div>
                                )}

                                {isHeroBackgroundsTab && (
                                    <div className="bg-gray-50 dark:bg-[#1b1f2a] border border-gray-200 dark:border-white/5 rounded-2xl p-5">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="flex items-center gap-2">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                    <ImageIcon size={16} className="text-gray-400 dark:text-gray-500" />
                                                    תמונות רקע מתחלפות
                                                </label>
                                                <HelpTooltipButton
                                                    title="תמונות רקע מתחלפות"
                                                    description="אלו התמונות שמתחלפות ברקע העליון של האתר."
                                                    items={[
                                                        'כדאי לבחור תמונות חדות ולא עמוסות מדי.',
                                                        'רצוי לבדוק שהטקסט עדיין נקרא היטב מעל התמונה.',
                                                    ]}
                                                />
                                            </div>
                                            <label
                                                className={`flex items-center gap-1 text-xs bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg transition font-medium cursor-pointer ${uploadingHeroIndex !== null ? 'opacity-50 pointer-events-none' : ''}`}
                                            >
                                                {uploadingHeroIndex !== null ? (
                                                    <>
                                                        <Loader2 size={14} className="animate-spin" />
                                                        <span>מעלה...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload size={14} />
                                                        <span>העלה תמונה</span>
                                                    </>
                                                )}
                                                <input
                                                    ref={heroFileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleHeroFileUpload}
                                                    className="hidden"
                                                    disabled={uploadingHeroIndex !== null}
                                                />
                                            </label>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4 pb-4 border-b border-gray-200 dark:border-white/10">
                                            <div className="flex items-center gap-4 min-w-0">
                                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${(themeSettings?.heroGrayscale ?? false) ? 'bg-gray-500/15' : 'bg-primary-500/15'}`}>
                                                    <ImageIcon size={20} className={(themeSettings?.heroGrayscale ?? false) ? 'text-gray-400' : 'text-primary-400'} />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">אפקט תמונות רקע</h3>
                                                        <HelpTooltipButton title="אפקט תמונות רקע" description="כאן בוחרים אם תמונות הרקע יוצגו בצבע מלא או בשחור לבן." />
                                                    </div>
                                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">בחר בין תצוגה צבעונית לשחור-לבן עבור תמונות ה-Hero</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center bg-gray-200 dark:bg-[#252528] rounded-xl p-1 gap-1 shrink-0 self-end sm:self-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleHeroGrayscaleChange(false)}
                                                    disabled={!themeSettings}
                                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!(themeSettings?.heroGrayscale ?? false)
                                                        ? 'bg-primary-600 text-white shadow'
                                                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                                        }`}
                                                >
                                                    צבעוני
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleHeroGrayscaleChange(true)}
                                                    disabled={!themeSettings}
                                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${(themeSettings?.heroGrayscale ?? false)
                                                        ? 'bg-gray-600 text-white shadow'
                                                        : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                                        }`}
                                                >
                                                    שחור לבן
                                                </button>
                                            </div>
                                        </div>

                                        <div className="space-y-2 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                                            {hero.backgroundImages.map((img, idx) => (
                                                <div key={`${img}-${idx}`} className="flex items-center gap-3 group rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-[#151821] px-3 py-2">
                                                    <div className="flex flex-col items-center gap-0.5 w-7 shrink-0">
                                                        <span className="text-xs text-gray-400 dark:text-gray-600 text-center font-bold">{idx + 1}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveBackgroundImage(idx, -1)}
                                                            disabled={idx === 0}
                                                            className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 disabled:cursor-not-allowed transition"
                                                            aria-label="הזז תמונה למעלה"
                                                        >
                                                            <ChevronUp size={12} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveBackgroundImage(idx, 1)}
                                                            disabled={idx === hero.backgroundImages.length - 1}
                                                            className="inline-flex h-4 w-4 items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-25 disabled:cursor-not-allowed transition"
                                                            aria-label="הזז תמונה למטה"
                                                        >
                                                            <ChevronDown size={12} />
                                                        </button>
                                                    </div>
                                                    <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center shrink-0">
                                                        <img src={resolveSiteImageUrl(img)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = 'none'; }} />
                                                    </div>
                                                    <span className="flex-1 text-sm text-blue-600 dark:text-blue-300 truncate dir-ltr text-left" dir="ltr">
                                                        {img.startsWith('data:') ? `תמונה מקומית (${Math.round(img.length / 1024)}KB)` : img}
                                                    </span>
                                                    <Tooltip text="הסר">
                                                        <button
                                                            onClick={() => removeBackgroundImage(idx)}
                                                            className="p-1.5 text-gray-400 dark:text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition opacity-0 group-hover:opacity-100"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </Tooltip>
                                                </div>
                                            ))}

                                            {uploadingHeroIndex !== null && (
                                                <div className="flex items-center gap-3 py-2 text-gray-400 text-sm">
                                                    <Loader2 size={16} className="animate-spin text-primary-400" />
                                                    <span>מעלה תמונה...</span>
                                                </div>
                                            )}

                                            {hero.backgroundImages.length === 0 && uploadingHeroIndex === null && (
                                                <div className="text-center py-10 text-gray-400 dark:text-gray-600 text-sm border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl">
                                                    אין תמונות רקע. לחץ על "העלה תמונה" להוספה.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {commanderTabActive && (
                        <section className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm">
                            <div className="flex items-start justify-between gap-4 mb-8 pb-5 border-b border-gray-200 dark:border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary-500/10 p-2.5 rounded-xl border border-primary-500/20">
                                        <MessageSquare size={20} className="text-primary-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{isCommanderProfileTab ? 'פרטי מפקד' : 'הודעות מפקד'}</h2>
                                            <HelpTooltipButton
                                                title={isCommanderProfileTab ? 'פרטי מפקד' : 'הודעות מפקד'}
                                                description={isCommanderProfileTab ? 'כאן מגדירים את האזור שמציג את פרטי המפקד והתמונה שלו.' : 'כאן מנהלים את ההודעות שמופיעות באזור דבר המפקד.'}
                                            />
                                        </div>
                                        <p className="text-sm text-gray-400 dark:text-gray-500">{SETTINGS_NAV.find((item) => item.id === activeSettingId)?.description}</p>
                                    </div>
                                </div>
                            </div>

                            {isCommanderProfileTab && (
                                <>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
                                        <div>
                                            <input
                                                type="text"
                                                value={commander.sectionTitle}
                                                onChange={(e) => updateCommanderField('sectionTitle', e.target.value)}
                                                className={inputCls}
                                                placeholder="דבר המפקד"
                                            />
                                        </div>

                                        <div>
                                            <input
                                                type="text"
                                                value={commander.roleLabel}
                                                onChange={(e) => updateCommanderField('roleLabel', e.target.value)}
                                                className={inputCls}
                                                placeholder="שם מפקד היחידה"
                                            />
                                        </div>

                                        <div>
                                            <label
                                                className={`flex items-center justify-center gap-2 w-full bg-gray-50 dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 border-dashed rounded-xl px-3 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-primary/50 hover:text-gray-700 dark:hover:text-gray-300 transition cursor-pointer ${uploadingCommander ? 'opacity-50 pointer-events-none' : ''}`}
                                            >
                                                {uploadingCommander ? (
                                                    <>
                                                        <Loader2 size={16} className="animate-spin text-primary-400" />
                                                        <span>מעלה תמונה...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload size={16} />
                                                        <span>{commander.image ? 'החלף תמונה' : 'העלה תמונת מפקד'}</span>
                                                    </>
                                                )}
                                                <input
                                                    ref={commanderFileInputRef}
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleCommanderFileUpload}
                                                    className="hidden"
                                                    disabled={uploadingCommander}
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    {commander.image && (
                                        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#1b1f2a] p-4">
                                            <div className="w-24 h-24 rounded-xl bg-white dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center">
                                                <img
                                                    src={resolveSiteImageUrl(commander.image)}
                                                    alt="תצוגה מקדימה"
                                                    className="w-full h-full object-contain"
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="text-sm text-gray-400 dark:text-gray-500">תצוגה מקדימה של תמונת המפקד</div>
                                                <button
                                                    onClick={() => updateCommanderField('image', '')}
                                                    className="text-xs text-red-400 hover:text-red-300 transition text-right"
                                                >
                                                    הסר תמונה
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* אלמנט עיצובי (כשיש רק הודעה אחת) */}
                                    {commander.messages.length === 1 && (
                                        <div className="mb-6">
                                            <HelpLabel
                                                as="span"
                                                className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                wrapperClassName="mb-3 flex items-center gap-2"
                                                helpTitle="אלמנט עיצובי"
                                                helpDescription="כאן בוחרים קישוט קטן שיופיע במקום כפתורי הניווט כשיש רק הודעה אחת."
                                            >
                                                אלמנט עיצובי (כשיש רק הודעה אחת)
                                            </HelpLabel>

                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                {[
                                                    { id: 'line-diamond-line', label: 'קו • יהלום • קו' },
                                                    { id: 'dots', label: 'נקודות' },
                                                    { id: 'line', label: 'קו בלבד' },
                                                    { id: 'double-line', label: 'שני קווים' },
                                                ].map((option) => {
                                                    const isActive = (commander.decorativeElement ?? 'line-diamond-line') === option.id;
                                                    return (
                                                        <button
                                                            key={option.id}
                                                            type="button"
                                                            onClick={() => updateCommanderField('decorativeElement', option.id)}
                                                            aria-pressed={isActive}
                                                            className={`flex flex-col items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-[#232733] ${isActive
                                                                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300 shadow-sm'
                                                                : 'border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] text-gray-700 dark:text-gray-300 hover:border-primary/40 hover:bg-primary-500/5'
                                                                }`}
                                                        >
                                                            <span className="text-[11px]">{option.label}</span>
                                                            <div className="w-full flex items-center justify-center">
                                                                {option.id === 'line-diamond-line' && (
                                                                    <div className="flex items-center gap-1 text-primary">
                                                                        <div className="w-6 h-[2px] rounded-full bg-current" />
                                                                        <div className="w-2 h-2 rotate-45 border border-current" />
                                                                        <div className="w-4 h-[2px] rounded-full bg-current" />
                                                                    </div>
                                                                )}
                                                                {option.id === 'dots' && (
                                                                    <div className="flex items-center gap-1.5 text-primary">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-current" />
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-current/70" />
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-current/40" />
                                                                    </div>
                                                                )}
                                                                {option.id === 'line' && (
                                                                    <div className="w-10 h-[2px] rounded-full bg-primary" />
                                                                )}
                                                                {option.id === 'double-line' && (
                                                                    <div className="flex flex-col gap-1 w-10">
                                                                        <div className="w-full h-[2px] rounded-full bg-primary" />
                                                                        <div className="w-7 h-[2px] rounded-full bg-primary/80 self-end" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            <p className="text-xs text-gray-400 dark:text-gray-600 mt-2">
                                                מוצג במקום כפתורי הניווט כשיש רק הודעה אחת
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {isCommanderMessagesTab && (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-200">
                                                הודעות מפקד
                                                <span className="text-sm font-normal text-gray-400 dark:text-gray-500 mr-2">
                                                    ({commander.messages.length}/{MAX_COMMANDER_MESSAGES})
                                                </span>
                                            </h3>
                                            <HelpTooltipButton
                                                title="הודעות מפקד"
                                                description="כאן מוסיפים ומסדרים את ההודעות שמתחלפות באזור דבר המפקד."
                                                items={[
                                                    'אפשר לשמור עד חמש הודעות.',
                                                    'אם יש רק הודעה אחת, כפתורי המעבר יוסתרו אוטומטית באתר.',
                                                ]}
                                            />
                                        </div>
                                        <button
                                            onClick={addMessage}
                                            disabled={commander.messages.length >= MAX_COMMANDER_MESSAGES}
                                            className="flex items-center gap-1.5 text-sm bg-primary-600 hover:bg-primary-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition font-bold"
                                        >
                                            <Plus size={16} />
                                            <span>הוסף הודעה</span>
                                        </button>
                                    </div>

                                    {commander.messages.length === 0 ? (
                                        <div className="text-center py-12 border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl text-gray-400 dark:text-gray-600">
                                            <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
                                            <p className="text-base font-medium">אין הודעות מפקד. לחץ על "הוסף הודעה" ליצירת הודעה ראשונה.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {commander.messages.map((msg, idx) => (
                                                <div key={msg.id} className="bg-gray-50 dark:bg-[#1b1f2a] border border-gray-200 dark:border-white/5 rounded-2xl p-5 flex gap-4 group relative">
                                                    <div className="flex flex-col items-center gap-1 shrink-0 pt-1">
                                                        <span className="text-xs text-gray-400 dark:text-gray-600 font-bold mb-1">{idx + 1}</span>
                                                        <Tooltip text="הזז למעלה">
                                                            <button
                                                                onClick={() => moveMessage(idx, -1)}
                                                                disabled={idx === 0}
                                                                className="p-1 text-gray-400 dark:text-gray-600 hover:text-gray-900 dark:hover:text-white disabled:opacity-20 transition rounded"
                                                            >
                                                                <ChevronUp size={14} />
                                                            </button>
                                                        </Tooltip>
                                                        <Tooltip text="הזז למטה">
                                                            <button
                                                                onClick={() => moveMessage(idx, 1)}
                                                                disabled={idx === commander.messages.length - 1}
                                                                className="p-1 text-gray-400 dark:text-gray-600 hover:text-gray-900 dark:hover:text-white disabled:opacity-20 transition rounded"
                                                            >
                                                                <ChevronDown size={14} />
                                                            </button>
                                                        </Tooltip>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed line-clamp-3 mb-2">{msg.text || '(הודעה ריקה)'}</p>
                                                        <p className="text-gray-400 dark:text-gray-500 text-xs">{msg.signature || '(ללא חתימה)'}</p>
                                                    </div>

                                                    <div className="flex items-start gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Tooltip text="ערוך">
                                                            <button
                                                                onClick={() => setEditingMessage({ ...msg, isNew: false })}
                                                                className="p-2 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded-lg transition"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                        </Tooltip>
                                                        <Tooltip text="מחק">
                                                            <button
                                                                onClick={() => removeMessage(msg.id)}
                                                                className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 hover:text-red-400 rounded-lg transition"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </Tooltip>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {commander.messages.length === 1 && (
                                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-500/20 rounded-lg px-4 py-2">
                                            כאשר קיימת רק הודעה אחת, כפתורי הניווט יוסתרו אוטומטית בחזית האתר ויוחלפו באלמנט עיצובי.
                                        </p>
                                    )}
                                </>
                            )}
                        </section>
                    )}

                    {isOverlayImageTab && (
                        <section className="bg-white dark:bg-[#232733] border border-gray-200 dark:border-white/5 rounded-3xl p-6 sm:p-8 shadow-sm">
                            <div className="flex items-start justify-between gap-4 mb-8 pb-5 border-b border-gray-200 dark:border-white/10">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary-500/10 p-2.5 rounded-xl border border-primary-500/20">
                                        <ImageIcon size={20} className="text-primary-400" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">אלמנט תמונה חדש</h2>
                                            <HelpTooltipButton
                                                title="אלמנט תמונה"
                                                description="זהו פריט תמונה נוסף שאפשר להציג מעל האתר או בתוך אזור הפתיחה."
                                                items={[
                                                    'הוא לא מחליף את תמונות הרקע, אלא מתווסף מעליהן.',
                                                    'כאן קובעים אם להציג אותו, איפה לשים אותו וכמה בולט הוא יהיה.',
                                                ]}
                                            />
                                        </div>
                                        <p className="text-sm text-gray-400 dark:text-gray-500">העלאה, גודל, בורדרים, מיקום והתנהגות בגלילה</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => updateOverlayField('enabled', !overlayImage.enabled)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition ${overlayImage.enabled
                                        ? 'bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/40'
                                        : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-white/10'
                                        }`}
                                >
                                    {overlayImage.enabled ? 'פעיל' : 'כבוי'}
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div className="flex flex-col gap-6">
                                    <div className="rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1b1f2a] p-4 w-full">
                                        <div className="w-full h-44 sm:h-48 rounded-xl bg-white dark:bg-[#141824] border border-gray-300 dark:border-gray-700/50 overflow-hidden flex items-center justify-center mb-3">
                                            {overlayImage.imageUrl ? (
                                                <img
                                                    src={resolveSiteImageUrl(overlayImage.imageUrl)}
                                                    alt="Overlay preview"
                                                    className="w-full h-full"
                                                    style={{ objectFit: overlayImage.objectFit, opacity: overlayImage.opacity / 100 }}
                                                />
                                            ) : (
                                                <span className="text-xs text-gray-400 dark:text-gray-600">אין תמונה</span>
                                            )}
                                        </div>

                                        <label
                                            className={`flex items-center justify-center gap-2 bg-white dark:bg-white/5 hover:bg-gray-100 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg transition font-bold text-xs cursor-pointer ${uploadingOverlayImage ? 'opacity-50 pointer-events-none' : ''}`}
                                        >
                                            {uploadingOverlayImage ? (
                                                <>
                                                    <Loader2 size={14} className="animate-spin" />
                                                    <span>מעלה...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={14} />
                                                    <span>{overlayImage.imageUrl ? 'החלף תמונה' : 'העלה תמונה'}</span>
                                                </>
                                            )}
                                            <input
                                                ref={overlayImageFileInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleOverlayImageUpload}
                                                className="hidden"
                                                disabled={uploadingOverlayImage}
                                            />
                                        </label>

                                        {overlayImage.imageUrl && (
                                            <Tooltip
                                                text="מסיר את התמונה ומאפס את כל ההגדרות לברירת המחדל (גודל, מיקום, בורדר, גלילה וכו׳)"
                                                wrapperClassName="block w-full"
                                            >
                                                <button
                                                    type="button"
                                                    onClick={clearOverlayImage}
                                                    className="w-full mt-2 text-[11px] font-bold text-red-500 hover:text-red-400 transition"
                                                >
                                                    הסר תמונה
                                                </button>
                                            </Tooltip>
                                        )}
                                    </div>

                                    <div className="space-y-5">
                                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-white/10 pb-2">
                                            גודל ושקיפות
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div>
                                                <HelpLabel
                                                    as="span"
                                                    className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                    wrapperClassName="mb-2 flex items-center gap-2"
                                                    helpTitle="רוחב"
                                                    helpDescription="כמה מקום התמונה תתפוס לרוחב."
                                                >
                                                    רוחב (px)
                                                </HelpLabel>
                                                <input
                                                    type="number"
                                                    min={48}
                                                    max={1800}
                                                    value={overlayImage.width}
                                                    onChange={(e) => updateOverlayNumberField('width', e.target.value, 48, 1800)}
                                                    className={`${inputCls} dir-ltr text-left`}
                                                    dir="ltr"
                                                />
                                            </div>
                                            <div>
                                                <HelpLabel
                                                    as="span"
                                                    className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                    wrapperClassName="mb-2 flex items-center gap-2"
                                                    helpTitle="גובה"
                                                    helpDescription="כמה מקום התמונה תתפוס לגובה."
                                                >
                                                    גובה (px)
                                                </HelpLabel>
                                                <input
                                                    type="number"
                                                    min={48}
                                                    max={1800}
                                                    value={overlayImage.height}
                                                    onChange={(e) => updateOverlayNumberField('height', e.target.value, 48, 1800)}
                                                    className={`${inputCls} dir-ltr text-left`}
                                                    dir="ltr"
                                                />
                                            </div>
                                            <div>
                                                <HelpLabel
                                                    as="span"
                                                    className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                    wrapperClassName="mb-2 flex items-center gap-2"
                                                    helpTitle="שקיפות"
                                                    helpDescription="קובע כמה התמונה תהיה בולטת או שקופה."
                                                >
                                                    שקיפות (%)
                                                </HelpLabel>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    value={overlayImage.opacity}
                                                    onChange={(e) => updateOverlayNumberField('opacity', e.target.value, 0, 100)}
                                                    className={`${inputCls} dir-ltr text-left`}
                                                    dir="ltr"
                                                />
                                            </div>
                                            <div>
                                                <HelpLabel
                                                    as="span"
                                                    className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                    wrapperClassName="mb-2 flex items-center gap-2"
                                                    helpTitle="סדר שכבות - z-index"
                                                    helpDescription="קובע אם התמונה תופיע מעל אלמנטים אחרים או מתחתיהם."
                                                >

                                                    סדר שכבות
                                                </HelpLabel>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={9999}
                                                    value={overlayImage.zIndex}
                                                    onChange={(e) => updateOverlayNumberField('zIndex', e.target.value, 1, 9999)}
                                                    className={`${inputCls} dir-ltr text-left`}
                                                    dir="ltr"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className=" flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-white/10 pb-2">
                                                מיקום ועיגון האלמנט במסך
                                                <HelpTooltipButton
                                                    title="מיקום אובייקט התמונה באתר"
                                                    description="מיקומו המדויק בו הוא יופיע באתר - שימו לב!  מכיוון שמסכים שונים מוצגים בגדלים שונים, ייתכנו סטיות קלות לצדדים. לכן אין להסתמך על המוצג בתצוגה המקדימה. יש לבדוק בדף הבית כיצד ואיפה האלמנט מופיע בפועל ולתקן בהתאם"
                                                />

                                            </h3>

                                            {/* <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">נקודת עיגון באתר</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {OVERLAY_ANCHOR_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => updateOverlayField('anchor', option.value)}
                                                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${overlayImage.anchor === option.value
                                                            ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300'
                                                            : 'border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] text-gray-600 dark:text-gray-300 hover:border-primary/40'
                                                            }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div> */}
                                            <div>
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">מיקום אופקי (% מרוחב המסך)</label>
                                                        <HelpTooltipButton
                                                            title="מיקום אופקי"
                                                            description="כמה ימינה או שמאלה התמונה תופיע."
                                                        />
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={overlayImage.offsetX}
                                                        onChange={(e) => updateOverlayNumberField('offsetX', e.target.value, 0, 100)}
                                                        className="w-32 rounded-lg border border-gray-300 dark:border-gray-700/60 bg-white dark:bg-[#1e212b] px-3 py-1.5 text-sm dir-ltr text-left"
                                                        dir="ltr"
                                                    />
                                                </div>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    value={overlayImage.offsetX}
                                                    onChange={(e) => updateOverlayNumberField('offsetX', e.target.value, 0, 100)}
                                                    className="w-full accent-primary"
                                                />
                                            </div>

                                            <div>
                                                <div className="flex items-center justify-between gap-3 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <label className="text-sm font-bold text-gray-700 dark:text-gray-300">מיקום אנכי (% מגובה המסך)</label>
                                                        <HelpTooltipButton
                                                            title="מיקום אנכי"
                                                            description="כמה למעלה או למטה התמונה תופיע."
                                                        />
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={overlayImage.offsetY}
                                                        onChange={(e) => updateOverlayNumberField('offsetY', e.target.value, 0, 100)}
                                                        className="w-32 rounded-lg border border-gray-300 dark:border-gray-700/60 bg-white dark:bg-[#1e212b] px-3 py-1.5 text-sm dir-ltr text-left"
                                                        dir="ltr"
                                                    />
                                                </div>
                                                <input
                                                    type="range"
                                                    min={0}
                                                    max={100}
                                                    value={overlayImage.offsetY}
                                                    onChange={(e) => updateOverlayNumberField('offsetY', e.target.value, 0, 100)}
                                                    className="w-full accent-primary"
                                                />
                                            </div>
                                        </div>

{/* 
                                        <div>
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <div className="flex items-center gap-2">
                                                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300">שקיפות</label>
                                                    <HelpTooltipButton
                                                        title="מחוון שקיפות"
                                                        description="אפשר לגרור את המחוון כדי לשנות מהר את רמת השקיפות."
                                                    />
                                                </div>
                                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">{overlayImage.opacity}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={0}
                                                max={100}
                                                value={overlayImage.opacity}
                                                onChange={(e) => updateOverlayNumberField('opacity', e.target.value, 0, 100)}
                                                className="w-full accent-primary"
                                            />
                                        </div> */}

                                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-white/10 pb-2 pt-1">
                                            בורדר ומילוי התמונה
                                        </h3>
                                        {/* <div>
                                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">סגנון בורדר</label>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                {OVERLAY_BORDER_STYLE_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => updateOverlayField('borderStyle', option.value)}
                                                        className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${overlayImage.borderStyle === option.value
                                                            ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300'
                                                            : 'border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] text-gray-600 dark:text-gray-300 hover:border-primary/40'
                                                            }`}
                                                    >
                                                        {option.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div> */}

                                        <div>
                                            <HelpLabel
                                                as="span"
                                                className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                                wrapperClassName="mb-3 flex items-center gap-2"
                                                helpTitle="Object Fit"
                                                helpDescription="כאן בוחרים אם לשמור את כל התמונה גלויה או למלא את המסגרת גם במחיר של חיתוך קצוות."
                                            >
                                                התאמת התמונה למסגרת
                                            </HelpLabel>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {OVERLAY_OBJECT_FIT_OPTIONS.map((option) => (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => updateOverlayField('objectFit', option.value)}
                                                        className={`text-right rounded-xl border px-4 py-3 transition ${overlayImage.objectFit === option.value
                                                            ? 'border-primary-500 bg-primary-500/10'
                                                            : 'border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] hover:border-primary/40'
                                                            }`}
                                                    >
                                                        <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{option.label}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <h3 className=" flex items-center gap-2 text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-white/10 pb-2 pt-1">
                                            התנהגות בגלילה
                                            <HelpTooltipButton
                                                title="התנהגות בגלילה"
                                                description="ייתכן ולא יוצג שינוי בתצוגה המקדימה - יש לבדוק בדף הבית האם מושפע לפי ההגדרה הנבחרת "
                                            />
                                        </h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {OVERLAY_POSITION_OPTIONS.map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateOverlayField('positionMode', option.value)}
                                                    className={`text-right rounded-xl border px-4 py-3 transition ${overlayImage.positionMode === option.value
                                                        ? 'border-primary-500 bg-primary-500/10'
                                                        : 'border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] hover:border-primary/40'
                                                        }`}
                                                >
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{option.label}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</div>
                                                </button>
                                            ))}
                                        </div>

                                        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-200 border-b border-gray-200 dark:border-white/10 pb-2 pt-1">
                                            אזור תצוגה באתר
                                        </h3>
                                        <p className="text-xs text-gray-400 dark:text-gray-600">באיזה אזור מותר לאלמנט התמונה להופיע</p>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {OVERLAY_DISPLAY_AREA_OPTIONS.map((option) => (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => updateOverlayField('displayArea', option.value)}
                                                    className={`text-right rounded-xl border px-4 py-3 transition ${overlayImage.displayArea === option.value
                                                        ? 'border-primary-500 bg-primary-500/10'
                                                        : 'border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] hover:border-primary/40'
                                                        }`}
                                                >
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">{option.label}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{option.description}</div>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700/70 bg-gray-50 dark:bg-[#1b1f2a] px-4 py-3">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-sm font-bold text-gray-800 dark:text-gray-200">הטמעת רקע (שילוב טשטוש ברקע)</div>
                                                    <HelpTooltipButton
                                                        title="הטמעת רקע"
                                                        description="מוסיף סביב התמונה אפקט רך שעוזר לה להשתלב טוב יותר עם הרקע."
                                                    />
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">Glow חיצוני עדין סביב האלמנט</div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => updateOverlayField('blendEffect', !overlayImage.blendEffect)}
                                                className={`px-4 py-2 rounded-xl text-xs font-bold transition ${overlayImage.blendEffect
                                                    ? 'bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/40'
                                                    : 'bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-white/10'
                                                    }`}
                                            >
                                                {overlayImage.blendEffect ? 'פעיל' : 'כבוי'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {!overlayImage.imageUrl && (
                                    <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-500/20 rounded-lg px-3 py-2">
                                        כדי להציג את האלמנט באתר, צריך להעלות תמונה ולהפעיל את האפשרות.
                                    </p>
                                )}
                            </div>
                        </section>
                    )}
                    {isFactoryResetTab && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/25">
                                    <AlertTriangle size={20} className="text-red-500 dark:text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">איפוס נתוני אתר לברירת מחדל</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        מחיקה מלאה של הגדרות, עיצוב, ניווט ותוכן הווידג&apos;טים — שחזור למצב יצרן
                                    </p>
                                </div>
                            </div>
                            <div className="rounded-xl border border-red-300/70 bg-red-50/70 p-5 dark:border-red-500/40 dark:bg-red-900/20">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 rounded-lg bg-red-100 p-2 text-red-600 dark:bg-red-500/20 dark:text-red-300">
                                        <AlertTriangle size={18} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-sm font-black text-red-700 dark:text-red-200">אזהרה</h3>
                                        <p className="mt-1 text-xs leading-5 text-red-700/80 dark:text-red-100/80">
                                            פעולה זו תמחק את כלל ההגדרות, העיצוב, הניווט ותוכן הווידג&apos;טים ותשחזר את האתר למצב יצרן.
                                        </p>
                                        <button
                                            type="button"
                                            onClick={handleFactoryReset}
                                            disabled={isResetting || isSaving}
                                            className="mt-4 inline-flex items-center rounded-lg border border-red-500/60 bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            {isResetting ? 'מבצע איפוס...' : 'איפוס נתוני אתר לברירת מחדל'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>

            {editingMessage && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/30 dark:bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-gray-100 dark:bg-[#1e212b] border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800/80">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                {editingMessage.isNew ? 'הוסף הודעת מפקד' : 'עריכת הודעה'}
                            </h2>
                            <button onClick={() => setEditingMessage(null)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition">
                                <X size={20} />
                            </button>
                        </div>

                        <form onSubmit={saveMessageEdit} className="p-6 flex flex-col gap-5">
                            <div>
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <HelpLabel
                                        as="span"
                                        className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                        wrapperClassName="flex items-center gap-2"
                                        helpTitle="תוכן ההודעה"
                                        helpDescription="הטקסט המלא שיופיע באזור דבר המפקד."
                                    >
                                        תוכן ההודעה
                                    </HelpLabel>
                                    <button
                                        type="button"
                                        onClick={handleImproveEditingMessageText}
                                        disabled={!isAiEnabled || improvingTargetKey === `editing-message-${editingMessage.id || 'new'}` || !editingMessage.text?.trim()}
                                        className="inline-flex items-center gap-1 rounded-md border border-gray-300 dark:border-white/10 bg-white dark:bg-white/5 px-2 py-1 text-[11px] font-bold text-gray-600 dark:text-gray-300 hover:border-primary/40 hover:text-primary transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {improvingTargetKey === `editing-message-${editingMessage.id || 'new'}` ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        שפר טקסט
                                    </button>
                                </div>
                                <textarea
                                    name="text"
                                    value={editingMessage.text}
                                    onChange={(e) => setEditingMessage((prev) => ({ ...prev, text: e.target.value }))}
                                    required
                                    rows={5}
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-primary-500 transition text-sm resize-none leading-relaxed"
                                    placeholder="הזן את תוכן הודעת המפקד..."
                                />
                            </div>

                            <div>
                                <HelpLabel
                                    as="span"
                                    className="block text-sm font-bold text-gray-700 dark:text-gray-300"
                                    wrapperClassName="mb-2 flex items-center gap-2"
                                    helpTitle="חתימה"
                                    helpDescription="שדה קצר לשם הכותב או לתפקיד שלו, כפי שיופיע מתחת להודעה."
                                >
                                    חתימה
                                </HelpLabel>
                                <input
                                    name="signature"
                                    type="text"
                                    value={editingMessage.signature}
                                    onChange={(e) => setEditingMessage((prev) => ({ ...prev, signature: e.target.value }))}
                                    className="w-full bg-gray-50 dark:bg-[#151821] border border-gray-300 dark:border-gray-700/50 rounded-xl px-4 py-3 text-gray-900 dark:text-white outline-none focus:border-primary-500 transition text-sm"
                                    placeholder='לדוגמה: סא"ל א׳, מפקד בית הספר'
                                />
                            </div>

                            <div className="flex gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800/80">
                                <button type="submit" className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl font-bold transition">
                                    שמור
                                </button>
                                <button type="button" onClick={() => setEditingMessage(null)} className="flex-1 bg-white dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 text-gray-900 dark:text-white py-3 rounded-xl font-bold transition">
                                    ביטול
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
