import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../context/ThemeContext';
import {
    Save, AlertTriangle, Palette, Sun, Moon, Monitor,
    Square, Hexagon, Eye, EyeOff, Image as ImageIcon
} from 'lucide-react';

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
    { hex: '#78716c', label: 'חום' },
];

const DISPLAY_MODES = [
    { value: 'dark', label: 'כהה', description: 'מצב כהה קבוע', icon: Moon },
    { value: 'light', label: 'בהיר', description: 'מצב בהיר קבוע', icon: Sun },
    { value: 'user-toggle', label: 'בחירת משתמש', description: 'המשתמש בוחר בעצמו', icon: Monitor },
];

const BORDER_STYLES = [
    { value: 'standard', label: 'סטנדרטי', description: 'פינות מעוגלות רגילות' },
    { value: 'tactical-1', label: 'טקטי 1', description: 'חיתוך פינות אלכסוני' },
    { value: 'tactical-2', label: 'טקטי 2', description: 'חיתוך צדדי חד' },
    { value: 'tactical-3', label: 'טקטי 3', description: 'מסגרת צבאית מלאה' },
];

export default function AdminTheme() {
    const { theme, loading, error, saveTheme } = useTheme();
    const [draft, setDraft] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);
    const [customColor, setCustomColor] = useState('');
    const colorInputRef = useRef(null);

    useEffect(() => {
        if (theme) {
            setDraft({ ...theme });
            setCustomColor(theme.primaryColor || '#dc2626');
        }
    }, [theme]);

    if (loading && !theme) {
        return <div className="p-8 text-center text-gray-400">טוען הגדרות עיצוב...</div>;
    }

    if (!draft) return null;

    const updateField = (field, value) => {
        setDraft(prev => ({ ...prev, [field]: value }));
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

    const hasChanges = theme && JSON.stringify(draft) !== JSON.stringify(theme);

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        const success = await saveTheme(draft);
        setIsSaving(false);
        if (success) {
            setSaveMessage({ type: 'success', text: 'הגדרות העיצוב נשמרו בהצלחה!' });
        } else {
            setSaveMessage({ type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' });
        }
        setTimeout(() => setSaveMessage(null), 4000);
    };

    return (
        <div dir="rtl" className="min-h-screen bg-[#1e212b] text-white font-heebo p-8">
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-white">ניהול עיצוב האתר</h1>
                    <p className="text-sm text-gray-500 mt-1">התאם צבעים, מצב תצוגה, סגנון מסגרות ואפקטים ויזואליים</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold transition shadow-lg shadow-red-900/20"
                >
                    <Save size={18} />
                    <span>{isSaving ? 'שומר...' : 'שמור שינויים'}</span>
                </button>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-900/50 border border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-red-400 shrink-0" />
                    <span className="text-red-200">{error}</span>
                </div>
            )}

            {saveMessage && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${saveMessage.type === 'success' ? 'bg-green-900/50 border border-green-500' : 'bg-red-900/50 border border-red-500'}`}>
                    <span className={saveMessage.type === 'success' ? 'text-green-200' : 'text-red-200'}>{saveMessage.text}</span>
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {/* ==================== PRIMARY COLOR ==================== */}
                <section className="bg-[#232733] border border-white/5 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                            <Palette size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">צבע ראשי</h2>
                            <p className="text-sm text-gray-500">הצבע הדומיננטי שחל על כפתורים, קישורים ואלמנטים מודגשים</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-5 gap-3 mb-5">
                        {COLOR_SWATCHES.map((swatch) => (
                            <button
                                key={swatch.hex}
                                onClick={() => handleColorSwatchClick(swatch.hex)}
                                className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                                    draft.primaryColor === swatch.hex
                                        ? 'border-white/40 bg-white/5 ring-2 ring-white/20'
                                        : 'border-transparent hover:border-white/10 hover:bg-white/5'
                                }`}
                                title={swatch.label}
                            >
                                <div
                                    className="w-10 h-10 rounded-lg shadow-lg transition-transform group-hover:scale-110"
                                    style={{ backgroundColor: swatch.hex }}
                                />
                                <span className="text-[11px] text-gray-400 font-medium">{swatch.label}</span>
                                {draft.primaryColor === swatch.hex && (
                                    <div className="absolute -top-1 -left-1 w-5 h-5 bg-white rounded-full flex items-center justify-center shadow">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: swatch.hex }} />
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 pt-4 border-t border-white/5">
                        <label className="text-sm font-bold text-gray-400 shrink-0">צבע מותאם:</label>
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
                                className="flex-1 bg-[#1e212b] border border-gray-700/50 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-red-500 transition font-mono dir-ltr text-left"
                                placeholder="#dc2626"
                                dir="ltr"
                                maxLength={7}
                            />
                        </div>
                    </div>

                    {/* Live Preview */}
                    <div className="mt-5 p-4 bg-[#1e212b] rounded-xl border border-white/5">
                        <p className="text-xs text-gray-500 mb-3 font-bold">תצוגה מקדימה:</p>
                        <div className="flex items-center gap-3">
                            <button
                                className="px-5 py-2 rounded-lg text-white font-bold text-sm shadow-lg transition"
                                style={{ backgroundColor: draft.primaryColor }}
                            >
                                כפתור לדוגמה
                            </button>
                            <span className="text-sm font-bold" style={{ color: draft.primaryColor }}>
                                טקסט מודגש
                            </span>
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: draft.primaryColor }} />
                        </div>
                    </div>
                </section>

                {/* ==================== DISPLAY MODE ==================== */}
                <section className="bg-[#232733] border border-white/5 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                            <Sun size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">מצב תצוגה</h2>
                            <p className="text-sm text-gray-500">קבע האם האתר יוצג במצב כהה, בהיר, או בבחירת המשתמש</p>
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
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-right transition-all ${
                                        isActive
                                            ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                            : 'bg-[#1e212b] border-white/5 hover:border-white/15'
                                    }`}
                                >
                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                                        isActive ? 'bg-red-500/15' : 'bg-white/5'
                                    }`}>
                                        <Icon size={22} className={isActive ? 'text-red-400' : 'text-gray-500'} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className={`font-bold ${isActive ? 'text-white' : 'text-gray-300'}`}>{mode.label}</h3>
                                        <p className={`text-sm ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>{mode.description}</p>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                                        isActive ? 'border-red-500 bg-red-500' : 'border-gray-600'
                                    }`}>
                                        {isActive && <div className="w-2 h-2 bg-white rounded-full" />}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>

                {/* ==================== BORDER STYLES ==================== */}
                <section className="bg-[#232733] border border-white/5 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                            <Hexagon size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">סגנון מסגרות</h2>
                            <p className="text-sm text-gray-500">בחר את סגנון הפינות והמסגרות של אלמנטים באתר</p>
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
                                    className={`relative p-5 rounded-xl border-2 text-right transition-all ${
                                        isActive
                                            ? 'bg-red-500/10 border-red-500/40 ring-1 ring-red-500/20'
                                            : 'bg-[#1e212b] border-white/5 hover:border-white/15'
                                    }`}
                                >
                                    <div
                                        className={`w-full h-16 bg-gradient-to-br from-gray-600/30 to-gray-700/20 border border-white/10 mb-4 ${previewClasses[style.value] || 'rounded-xl'}`}
                                    />
                                    <h3 className={`font-bold text-sm mb-1 ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                        {style.label}
                                    </h3>
                                    <p className={`text-xs ${isActive ? 'text-gray-300' : 'text-gray-600'}`}>
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

                {/* ==================== TOGGLES ==================== */}
                <section className="bg-[#232733] border border-white/5 rounded-xl p-6 space-y-0">
                    {/* Nav Categories Toggle */}
                    <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-4">
                        <div className="bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                            <Eye size={20} className="text-red-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">הגדרות נוספות</h2>
                            <p className="text-sm text-gray-500">שליטה בנראות אלמנטים ואפקטים ויזואליים</p>
                        </div>
                    </div>

                    {/* Toggle: Show Nav Categories */}
                    <div className="flex items-center justify-between p-5 bg-[#1e212b] rounded-xl border border-white/5 mb-4">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${draft.showNavCategories ? 'bg-green-500/15' : 'bg-white/5'}`}>
                                {draft.showNavCategories ? <Eye size={20} className="text-green-400" /> : <EyeOff size={20} className="text-gray-500" />}
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">הצגת קטגוריות בניווט עליון</h3>
                                <p className="text-xs text-gray-500">הצג/הסתר את הקטגוריות בסרגל הניווט העליון של האתר</p>
                            </div>
                        </div>
                        <label className="relative cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={draft.showNavCategories}
                                onChange={(e) => updateField('showNavCategories', e.target.checked)}
                            />
                            <div className="w-12 h-7 bg-[#252528] rounded-full peer-checked:bg-green-600 transition-colors" />
                            <div className="absolute top-0.5 left-0.5 w-6 h-6 bg-gray-300 rounded-full peer-checked:translate-x-5 peer-checked:bg-white transition-transform shadow-sm" />
                        </label>
                    </div>

                    {/* Toggle: Hero Grayscale */}
                    <div className="flex items-center justify-between p-5 bg-[#1e212b] rounded-xl border border-white/5">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${draft.heroGrayscale ? 'bg-gray-500/15' : 'bg-amber-500/15'}`}>
                                <ImageIcon size={20} className={draft.heroGrayscale ? 'text-gray-400' : 'text-amber-400'} />
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-sm">אפקט תמונות רקע</h3>
                                <p className="text-xs text-gray-500">בחר בין תצוגה צבעונית לשחור-לבן עבור תמונות ה-Hero</p>
                            </div>
                        </div>
                        <div className="flex items-center bg-[#252528] rounded-xl p-1 gap-1">
                            <button
                                onClick={() => updateField('heroGrayscale', false)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    !draft.heroGrayscale
                                        ? 'bg-amber-600 text-white shadow'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                צבעוני
                            </button>
                            <button
                                onClick={() => updateField('heroGrayscale', true)}
                                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                                    draft.heroGrayscale
                                        ? 'bg-gray-600 text-white shadow'
                                        : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                שחור לבן
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            {hasChanges && (
                <div className="mt-8 p-4 bg-amber-900/30 border border-amber-500/30 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                    <span className="text-amber-200 text-sm font-medium">
                        יש שינויים שלא נשמרו — לחץ "שמור שינויים" כדי להחיל את העיצוב החדש.
                    </span>
                </div>
            )}
        </div>
    );
}
