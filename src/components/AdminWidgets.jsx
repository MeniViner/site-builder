import React, { useState, useEffect } from 'react';
import { useWidget } from '../context/WidgetContext';
import {
    Save, AlertTriangle, Calendar, Bell, Check, LayoutGrid,
    Award, Timer, Rss, BookUser
} from 'lucide-react';

const AVAILABLE_WIDGETS = [
    {
        id: 'events',
        label: 'לוח אירועים',
        description: 'הצגת אירועים קרובים מיון לפי תאריך, עם אפשרות סינון ועריכה מלאה דרך ממשק הניהול.',
        icon: Calendar,
        color: 'red',
    },
    {
        id: 'alerts',
        label: 'לוח הודעות',
        description: 'הצגת הודעות ועדכונים שוטפים ליחידה. כולל תמיכה בסינון לפי קטגוריה ודחיפות.',
        icon: Bell,
        color: 'amber',
    },
    {
        id: 'outstanding',
        label: 'מצטייני היחידה',
        description: 'הצגת חיילים מצטיינים עם תמונה, תפקיד ותיאור קצר.',
        icon: Award,
        color: 'emerald',
    },
    {
        id: 'countdown',
        label: 'ספירה לאחור / שעון עצר',
        description: 'תצוגת טיימר ספירה לאחור לעבר תאריך יעד מוגדר עם כותרת מותאמת אישית.',
        icon: Timer,
        color: 'sky',
    },
    {
        id: 'news',
        label: 'מבזקים ועדכונים',
        description: 'רשימת עדכונים שוטפים ומבזקים חשובים. ניתן לסמן פריטים כדחופים.',
        icon: Rss,
        color: 'orange',
    },
    {
        id: 'phonebook',
        label: 'ספר טלפונים',
        description: 'רשימת אנשי קשר עם שם, מחלקה ומספר טלפון להתקשרות מהירה.',
        icon: BookUser,
        color: 'violet',
    },
];

const COLOR_MAP = {
    red: { activeBg: 'bg-red-500/10', activeBorder: 'border-red-500/40', activeRing: 'ring-red-500/30', iconBg: 'bg-red-500/15', iconText: 'text-red-400', badgeBg: 'bg-red-600' },
    amber: { activeBg: 'bg-amber-500/10', activeBorder: 'border-amber-500/40', activeRing: 'ring-amber-500/30', iconBg: 'bg-amber-500/15', iconText: 'text-amber-400', badgeBg: 'bg-amber-600' },
    emerald: { activeBg: 'bg-emerald-500/10', activeBorder: 'border-emerald-500/40', activeRing: 'ring-emerald-500/30', iconBg: 'bg-emerald-500/15', iconText: 'text-emerald-400', badgeBg: 'bg-emerald-600' },
    sky: { activeBg: 'bg-sky-500/10', activeBorder: 'border-sky-500/40', activeRing: 'ring-sky-500/30', iconBg: 'bg-sky-500/15', iconText: 'text-sky-400', badgeBg: 'bg-sky-600' },
    orange: { activeBg: 'bg-orange-500/10', activeBorder: 'border-orange-500/40', activeRing: 'ring-orange-500/30', iconBg: 'bg-orange-500/15', iconText: 'text-orange-400', badgeBg: 'bg-orange-600' },
    violet: { activeBg: 'bg-violet-500/10', activeBorder: 'border-violet-500/40', activeRing: 'ring-violet-500/30', iconBg: 'bg-violet-500/15', iconText: 'text-violet-400', badgeBg: 'bg-violet-600' },
};

export default function AdminWidgets() {
    const { widgetConfig, loading, error, saveWidgetConfig } = useWidget();
    const [selected, setSelected] = useState('events');
    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState(null);

    useEffect(() => {
        if (widgetConfig?.activeWidget) setSelected(widgetConfig.activeWidget);
    }, [widgetConfig]);

    const hasChanges = widgetConfig && selected !== widgetConfig.activeWidget;

    const handleSave = async () => {
        setIsSaving(true);
        setSaveMessage(null);
        const success = await saveWidgetConfig({ ...widgetConfig, activeWidget: selected });
        setIsSaving(false);
        setSaveMessage(success
            ? { type: 'success', text: 'הווידגט הפעיל עודכן בהצלחה!' }
            : { type: 'error', text: 'שגיאה בשמירה. אנא נסה שוב.' }
        );
        setTimeout(() => setSaveMessage(null), 4000);
    };

    if (loading && !widgetConfig) {
        return <div className="p-8 text-center text-gray-500 dark:text-gray-400">טוען הגדרות ווידגטים...</div>;
    }

    return (
        <div dir="rtl" className="min-h-screen bg-gray-100 dark:bg-[#1e212b] text-gray-900 dark:text-white font-heebo p-8">

            {/* Header */}
            <div className="flex justify-between items-center mb-8 border-b border-gray-300 dark:border-white/10 pb-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white">הגדרות תצוגת ווידגט</h1>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">בחר את הווידגט שיוצג באזור הדינמי (Section 3) באתר. לניהול תוכן הווידגט — לחץ על הקישור הרלוונטי בתפריט הצד.</p>
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
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/50 border border-red-500 rounded-lg flex items-center gap-3">
                    <AlertTriangle className="text-red-400 shrink-0" />
                    <span className="text-red-700 dark:text-red-200">{error}</span>
                </div>
            )}

            {saveMessage && (
                <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${saveMessage.type === 'success' ? 'bg-green-50 dark:bg-green-900/50 border border-green-500' : 'bg-red-50 dark:bg-red-900/50 border border-red-500'}`}>
                    <span className={saveMessage.type === 'success' ? 'text-green-700 dark:text-green-200' : 'text-red-700 dark:text-red-200'}>{saveMessage.text}</span>
                </div>
            )}

            {/* Selector cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                {AVAILABLE_WIDGETS.map((widget) => {
                    const isSelected = selected === widget.id;
                    const isLive = widgetConfig?.activeWidget === widget.id;
                    const colors = COLOR_MAP[widget.color];
                    const Icon = widget.icon;

                    return (
                        <button
                            key={widget.id}
                            onClick={() => setSelected(widget.id)}
                            className={`relative text-right p-6 rounded-2xl border-2 transition-all duration-200 group ${isSelected
                                ? `${colors.activeBg} ${colors.activeBorder} ring-2 ${colors.activeRing} shadow-lg`
                                : 'bg-white dark:bg-[#232733] border-gray-200 dark:border-white/5 hover:border-gray-300 dark:hover:border-white/15 hover:bg-gray-50 dark:hover:bg-[#272b38]'
                                }`}
                        >
                            {isLive && (
                                <div className={`absolute top-3 left-3 ${colors.badgeBg} text-white text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider`}>
                                    פעיל כעת
                                </div>
                            )}
                            <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-5 ${isSelected ? colors.iconBg : 'bg-gray-100 dark:bg-white/5'} transition-colors`}>
                                <Icon size={28} className={isSelected ? colors.iconText : 'text-gray-500'} />
                            </div>
                            <h3 className={`text-xl font-bold mb-2 ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                                {widget.label}
                            </h3>
                            <p className={`text-sm leading-relaxed ${isSelected ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                                {widget.description}
                            </p>
                            <div className={`mt-5 flex items-center gap-2 text-sm font-bold ${isSelected ? colors.iconText : 'text-gray-400 dark:text-gray-600'}`}>
                                {isSelected
                                    ? <><Check size={16} /><span>נבחר</span></>
                                    : <span className="group-hover:text-gray-500 dark:group-hover:text-gray-400 transition">לחץ לבחירה</span>
                                }
                            </div>
                        </button>
                    );
                })}

                {/* Placeholder */}
                <div className="relative p-6 rounded-2xl border-2 border-dashed border-gray-300 dark:border-white/10 flex flex-col items-center justify-center text-center min-h-[200px]">
                    <LayoutGrid size={36} className="text-gray-400 dark:text-gray-700 mb-3" />
                    <h3 className="text-lg font-bold text-gray-400 dark:text-gray-600 mb-1">ווידגטים נוספים</h3>
                    <p className="text-sm text-gray-400 dark:text-gray-600">ווידגטים חדשים יתווספו בעדכונים עתידיים.</p>
                </div>
            </div>

            {hasChanges && (
                <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/30 border border-amber-500/30 rounded-xl flex items-center gap-3">
                    <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                    <span className="text-amber-700 dark:text-amber-200 text-sm font-medium">
                        יש שינויים שלא נשמרו — לחץ "שמור שינויים" כדי לעדכן את הווידגט הפעיל.
                    </span>
                </div>
            )}
        </div>
    );
}
