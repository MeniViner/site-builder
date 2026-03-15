import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext';
import ThemeLivePreview from './ThemeLivePreview';
import {
    AlertTriangle, Palette, Sun, Moon, Monitor,
    Hexagon, Eye, EyeOff, Image as ImageIcon,
    LayoutGrid, List, Columns, Globe, CircleDot, PanelBottom, PanelRight, Info, CheckCircle2
} from 'lucide-react';
import { toast } from 'react-toastify';

const SETTINGS_NAV = [
    { id: 'primaryColor', label: 'צבע ראשי' },
    { id: 'displayMode', label: 'מצב תצוגה' },
    { id: 'borderStyle', label: 'סגנון מסגרות' },
    { id: 'widgetHeight', label: 'גובה ווידגט' },
    { id: 'toggles', label: 'הגדרות נוספות' },
    { id: 'regularLinksLayout', label: 'קטגוריות וקישורים' },
    { id: 'externalLinksLayout', label: 'קישורים חיצוניים' },
];

const COLOR_SWATCHES = [
    { hex: '#dc2626', label: 'אדום' },
    { hex: '#ea580c', label: 'כתום' },
    { hex: '#d97706', label: 'ענבר' },
    { hex: '#16a34a', label: 'ירוק' },
    { hex: '#0891b2', label: 'ציאן' },
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
    { value: 'standard', label: 'סטנדרטי', description: 'פינות מעוגלות רגילות' },
    { value: 'tactical-1', label: 'טקטי 1', description: 'חיתוך פינות אלכסוני' },
    { value: 'tactical-2', label: 'טקטי 2', description: 'חיתוך צדדי חד' },
    { value: 'tactical-3', label: 'טקטי 3', description: 'מסגרת צבאית מלאה' },
];

const REGULAR_LINK_LAYOUTS = [
    { value: 'grid', label: 'Grid', description: 'כרטיסי Flip בתצוגת גריד', icon: LayoutGrid },
    { value: 'compact', label: 'Compact List', description: 'רשימה מינימליסטית עם שורות פשוטות', icon: List },
    { value: 'hq', label: 'HQ Dashboard', description: 'עיצוב מרכז פיקוד טקטי מתקדם', icon: Columns },
    { value: 'sidebar-right', label: 'תפריט צד טקטי', description: 'סרגל ניווט צדדי קבוע בצד ימין', icon: PanelRight },
];

const EXTERNAL_LINK_LAYOUTS = [
    { value: 'cards', label: 'Cards', description: 'כרטיסים עם אייקון וכותרת', icon: LayoutGrid },
    { value: 'minimal', label: 'Minimal Icons', description: 'עיגולי אייקון בשורה — כותרת ב-hover', icon: CircleDot },
    { value: 'floating', label: 'Floating Bar', description: 'פס עגול עם אייקונים וטקסט', icon: PanelBottom },
];

const WIDGET_HEIGHT_OPTIONS = [
    { value: 'full', label: 'מלא', description: 'נמתח כמעט עד סרגל הניווט העליון' },
    { value: 'high', label: 'גבוה', description: 'תופס שטח אנכי מורחב' },
    { value: 'medium', label: 'בינוני', description: 'איזון בין שטח תוכן לנראות ההירו' },
    { value: 'low', label: 'נמוך', description: 'גובה ברירת מחדל (המצב הנוכחי)' },
];

const SAVE_DEBOUNCE_MS = 500;

export default function AdminTheme() {
    const { theme, loading, error, saveTheme } = useTheme();
    const [draft, setDraft] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [customColor, setCustomColor] = useState('');
    const [activeSettingId, setActiveSettingId] = useState(null);
    const colorInputRef = useRef(null);
    const saveTimeoutRef = useRef(null);

    useEffect(() => {
        if (theme) {
            setDraft({ ...theme });
            setCustomColor(theme.primaryColor || '#dc2626');
        }
    }, [theme]);

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

    useEffect(() => () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); }, []);

    if (loading && !theme) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען הגדרות עיצוב...</div>;
    }

    if (!draft) return null;

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
        setActiveSettingId(prev => (prev === id ? null : id));
    };

    const showSection = (id) => activeSettingId === null || activeSettingId === id;

    return (
        <div dir="rtl" className="h-full flex flex-col bg-gray-50 dark:bg-[#12141a] text-gray-900 dark:text-white font-heebo relative">

            {/* Fixed Header */}
            <div className="sticky top-0 z-50 bg-gray-50/95 dark:bg-[#12141a]/95 backdrop-blur-md border-b border-gray-200 dark:border-white/5 px-6 pt-6 pb-4 sm:px-10 shadow-sm shrink-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">ניהול עיצוב האתר</h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">התאם צבעים, מצב תצוגה, סגנון מסגרות ואפקטים באתר</p>
                    </div>
                    {isSaving && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full shadow-sm">
                            <div className="w-3.5 h-3.5 border-[2px] border-primary border-t-transparent rounded-full animate-spin" style={{ borderColor: draft.primaryColor, borderTopColor: 'transparent' }} />
                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">שומר...</span>
                        </div>
                    )}
                </div>

                <nav className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar w-full">
                    {SETTINGS_NAV.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => handleNavSettingClick(id)}
                            className={`px-4 py-2 rounded-lg text-sm font-bold transition whitespace-nowrap ${activeSettingId === id
                                ? 'bg-red-600 text-white shadow-md ring-2 ring-red-500/30 ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#12141a]'
                                : 'bg-white dark:bg-white/5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white border border-gray-200 dark:border-transparent shadow-sm hover:shadow'
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </nav>
            </div>

            {error && (
                <div className="mx-6 sm:mx-10 mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-500/50 rounded-xl flex items-center gap-3 shadow-sm">
                    <AlertTriangle className="text-red-500 shrink-0" />
                    <span className="text-sm font-medium text-red-800 dark:text-red-200">{error}</span>
                </div>
            )}

            <div className="flex-1 overflow-visible p-6 sm:p-10 space-y-10 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-10">
                <div className="space-y-10 order-2 lg:order-1">
                    {/* ==================== PRIMARY COLOR ==================== */}
                    {showSection('primaryColor') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <Palette size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">צבע ראשי</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">הצבע הדומיננטי שחל על כפתורים, קישורים ואלמנטים מודגשים</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-5 gap-3 mb-5">
                                {COLOR_SWATCHES.map((swatch) => (
                                    <button
                                        key={swatch.hex}
                                        onClick={() => handleColorSwatchClick(swatch.hex)}
                                        className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${draft.primaryColor === swatch.hex
                                            ? 'border-gray-400 dark:border-white/40 bg-gray-100 dark:bg-white/5 ring-2 ring-gray-300 dark:ring-white/20'
                                            : 'border-transparent hover:border-gray-300 dark:hover:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5'
                                            }`}
                                        title={swatch.label}
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
                                <label className="text-sm font-bold text-gray-500 dark:text-gray-400 shrink-0">צבע מותאם:</label>
                                <div className="flex items-center gap-2 flex-1">
                                    <button
                                        onClick={() => colorInputRef.current?.click()}
                                        className="w-10 h-10 rounded-lg border-2 border-gray-700 cursor-pointer shadow-inner shrink-0 hover:border-gray-500 transition"
                                        style={{ backgroundColor: draft.primaryColor }}
                                        title="פתח בורר צבע"
                                    />
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
                                        className="flex-1 bg-gray-100 dark:bg-[#1e212b] border border-gray-300 dark:border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-red-500 transition font-mono dir-ltr text-left"
                                        placeholder="#dc2626"
                                        dir="ltr"
                                        maxLength={7}
                                    />
                                </div>
                            </div>

                        </section>
                    )}

                    {/* ==================== DISPLAY MODE ==================== */}
                    {showSection('displayMode') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <Sun size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">מצב תצוגה</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">קבע האם האתר יוצג במצב כהה, בהיר, או בבחירת המשתמש</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {DISPLAY_MODES.map((mode) => {
                                    const isActive = draft.displayMode === mode.value;
                                    const Icon = mode.icon;

                                    return (
                                        <button
                                            key={mode.value}
                                            onClick={() => updateField('displayMode', mode.value)}
                                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                                : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                }`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-red-500/15' : 'bg-gray-100 dark:bg-white/5'
                                                }`}>
                                                <Icon size={22} className={isActive ? 'text-red-400' : 'text-gray-500'} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{mode.label}</h3>
                                                <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{mode.description}</p>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-red-500 bg-red-500' : 'border-gray-600'
                                                }`}>
                                                {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== BORDER STYLES ==================== */}
                    {showSection('borderStyle') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <Hexagon size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">סגנון מסגרות</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">בחר את סגנון הפינות והמסגרות של אלמנטים באתר</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                {BORDER_STYLES.map((style) => {
                                    const isActive = draft.borderStyle === style.value;

                                    const previewClasses = {
                                        standard: 'rounded-xl',
                                        'tactical-1': 'tactical-clip-1',
                                        'tactical-2': 'tactical-clip-2',
                                        'tactical-3': 'tactical-clip-3',
                                    };

                                    return (
                                        <button
                                            key={style.value}
                                            onClick={() => updateField('borderStyle', style.value)}
                                            className={`relative p-5 rounded-xl border-2 text-right transition-all ${isActive
                                                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                                : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                }`}
                                        >
                                            <div
                                                className={`w-full h-16 bg-gradient-to-br from-gray-600/30 to-gray-700/20 border border-white/10 mb-4 ${previewClasses[style.value] || 'rounded-xl'}`}
                                            />
                                            <h3 className={`font-bold text-sm mb-1 ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                                {style.label}
                                            </h3>
                                            <p className={`text-xs ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>
                                                {style.description}
                                            </p>
                                            {isActive && (
                                                <div className="absolute top-3 left-3 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                                                    <div className="w-2 h-2 bg-white rounded-full" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== WIDGET HEIGHT ==================== */}
                    {showSection('widgetHeight') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <PanelBottom size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">גובה הווידגט הדינמי</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">שליטה בגובה Section 3 בלבד, תוך שמירה על יישור תחתון קבוע</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {WIDGET_HEIGHT_OPTIONS.map((option) => {
                                    const isActive = draft.widgetHeight === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            onClick={() => updateField('widgetHeight', option.value)}
                                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                                : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                }`}
                                        >
                                            <div className="flex-1">
                                                <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{option.label}</h3>
                                                <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{option.description}</p>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-red-500 bg-red-500' : 'border-gray-600'}`}>
                                                {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== TOGGLES ==================== */}
                    {showSection('toggles') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0 space-y-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <Eye size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">הגדרות נוספות</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">שליטה בנראות אלמנטים ואפקטים ויזואליים</p>
                                </div>
                            </div>

                            {/* Toggle: Show Nav Categories */}
                            <div
                                className={`flex items-center justify-between p-5 bg-gray-100 dark:bg-[#1e212b] rounded-xl border border-gray-200 dark:border-white/5 mb-4 transition-opacity ${draft.regularLinksLayout === 'sidebar-right' ? 'opacity-50 pointer-events-none' : ''}`}
                                title={draft.regularLinksLayout === 'sidebar-right' ? 'לא ניתן להציג ניווט עליון כאשר תפריט צד נבחר' : undefined}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${draft.showNavCategories ? 'bg-green-500/15' : 'bg-gray-100 dark:bg-white/5'}`}>
                                        {draft.showNavCategories ? <Eye size={20} className="text-green-400" /> : <EyeOff size={20} className="text-gray-500" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">הצגת קטגוריות בניווט עליון</h3>
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

                            {/* Toggle: Hero Grayscale */}
                            <div className="flex items-center justify-between p-5 bg-gray-100 dark:bg-[#1e212b] rounded-xl border border-gray-200 dark:border-white/5">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${draft.heroGrayscale ? 'bg-gray-500/15' : 'bg-amber-500/15'}`}>
                                        <ImageIcon size={20} className={draft.heroGrayscale ? 'text-gray-400' : 'text-amber-400'} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white text-sm">אפקט תמונות רקע</h3>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">בחר בין תצוגה צבעונית לשחור-לבן עבור תמונות ה-Hero</p>
                                    </div>
                                </div>
                                <div className="flex items-center bg-gray-200 dark:bg-[#252528] rounded-xl p-1 gap-1">
                                    <button
                                        onClick={() => updateField('heroGrayscale', false)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${!draft.heroGrayscale
                                            ? 'bg-amber-600 text-white shadow'
                                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        צבעוני
                                    </button>
                                    <button
                                        onClick={() => updateField('heroGrayscale', true)}
                                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${draft.heroGrayscale
                                            ? 'bg-gray-600 text-white shadow'
                                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                            }`}
                                    >
                                        שחור לבן
                                    </button>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* ==================== REGULAR LINKS LAYOUT ==================== */}
                    {showSection('regularLinksLayout') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <LayoutGrid size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">תצוגת קטגוריות וקישורים</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">בחר את אופן הצגת הקטגוריות והקישורים הפנימיים באתר</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {REGULAR_LINK_LAYOUTS.map((layout) => {
                                    const isActive = draft.regularLinksLayout === layout.value;
                                    const Icon = layout.icon;
                                    return (
                                        <button
                                            key={layout.value}
                                            onClick={() => updateField('regularLinksLayout', layout.value)}
                                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                                : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                }`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-red-500/15' : 'bg-gray-100 dark:bg-white/5'}`}>
                                                <Icon size={22} className={isActive ? 'text-red-400' : 'text-gray-500'} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{layout.label}</h3>
                                                <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{layout.description}</p>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-red-500 bg-red-500' : 'border-gray-600'}`}>
                                                {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ==================== EXTERNAL LINKS LAYOUT ==================== */}
                    {showSection('externalLinksLayout') && (
                        <section className="pb-8 border-b border-gray-200 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-200 dark:border-white/10 pb-4">
                                <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                                    <Globe size={20} className="text-red-400" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">תצוגת קישורים חיצוניים</h2>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">בחר את אופן הצגת הקישורים החיצוניים בפוטר</p>
                                </div>
                            </div>
                            <div className="space-y-3 mb-5">
                                {EXTERNAL_LINK_LAYOUTS.map((layout) => {
                                    const isActive = draft.externalLinksLayout === layout.value;
                                    const Icon = layout.icon;
                                    return (
                                        <button
                                            key={layout.value}
                                            onClick={() => updateField('externalLinksLayout', layout.value)}
                                            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${isActive
                                                ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                                : 'bg-gray-100 dark:bg-[#1e212b] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15'
                                                }`}
                                        >
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isActive ? 'bg-red-500/15' : 'bg-gray-100 dark:bg-white/5'}`}>
                                                <Icon size={22} className={isActive ? 'text-red-400' : 'text-gray-500'} />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className={`font-bold ${isActive ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{layout.label}</h3>
                                                <p className={`text-sm ${isActive ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600'}`}>{layout.description}</p>
                                            </div>
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${isActive ? 'border-red-500 bg-red-500' : 'border-gray-600'}`}>
                                                {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="space-y-4 pt-5 border-t border-gray-200 dark:border-white/5">
                                <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl bg-gray-50 dark:bg-[#1e212b] hover:bg-gray-100 dark:hover:bg-white/5 transition">
                                    <input
                                        type="checkbox"
                                        checked={!!draft.externalLinksFixed}
                                        onChange={(e) => updateField('externalLinksFixed', e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-500 focus:ring-red-500"
                                    />
                                    <div>
                                        <span className="font-medium text-gray-800 dark:text-gray-200">הצג כפס נעוץ</span>
                                        <span
                                            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 dark:bg-white/10 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/20 transition-colors cursor-help mr-1.5 align-middle"
                                            title="נעוץ: הקישורים יוצגו בפס קבוע בתחתית המסך (תמיד גלוי בגלילה)."
                                            aria-label="הסבר על פס נעוץ"
                                        >
                                            <Info size={12} strokeWidth={2.5} />
                                        </span>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">הקישורים יישארו קבועים בתחתית המסך ויהיו תמיד גלויים גם בגלילה.</p>
                                    </div>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl bg-gray-50 dark:bg-[#1e212b] hover:bg-gray-100 dark:hover:bg-white/5 transition">
                                    <input
                                        type="checkbox"
                                        checked={draft.externalLinksBordered !== false}
                                        onChange={(e) => updateField('externalLinksBordered', e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-500 focus:ring-red-500"
                                    />
                                    <div>
                                        <span className="font-medium text-gray-800 dark:text-gray-200">הצג את הלינקים בתחום עם מסגרת (בורדר)</span>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">כאשר כבוי — הקישורים יוצגו ללא מסגרת מסביב.</p>
                                    </div>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl bg-gray-50 dark:bg-[#1e212b] hover:bg-gray-100 dark:hover:bg-white/5 transition">
                                    <input
                                        type="checkbox"
                                        checked={draft.externalLinksShowBackground !== false}
                                        onChange={(e) => updateField('externalLinksShowBackground', e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-red-500 focus:ring-red-500"
                                    />
                                    <div>
                                        <span className="font-medium text-gray-800 dark:text-gray-200">הצג רקע סביב קישורים חיצוניים</span>
                                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">כאשר כבוי — הפס/הכרטיסים יוצגו בלי רקע לבן ומטושטש (שקוף).</p>
                                    </div>
                                </label>
                            </div>
                        </section>
                    )}
                </div>

                <div className="order-1 lg:order-2">
                    <div className="sticky top-[140px]">
                        <div className="flex items-center justify-between mb-3 px-1">
                            <p className="text-sm font-bold text-gray-500 dark:text-gray-400">תצוגה מקדימה </p>
                            <span className="text-[10px] font-bold tracking-widest uppercase bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">Live</span>
                        </div>
                        <ThemeLivePreview draft={draft} />
                    </div>
                </div>
            </div>
        </div>
    );
}
