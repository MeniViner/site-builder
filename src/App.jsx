import React, { useState, useEffect } from 'react';
import {
  Search, Rocket, BarChart, Briefcase, Camera,
  Users, Crosshair, AlertTriangle, Calendar,
  Quote, User, ChevronLeft, Undo2, FileText,
  Target, GraduationCap, Map, Clock, Image as ImageIcon,
  ChevronDown
} from 'lucide-react';

// --- נתונים ודאטה ---

const HERO_BACKGROUNDS = [
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=2000',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&q=80&w=2000'
];

const CATEGORIES = [
  { id: 'training', label: 'הכשרות', icon: Rocket },
  { id: 'operations', label: 'אג"ם', icon: Crosshair },
  { id: 'hq', label: 'מפקדה', icon: Users },
  { id: 'unit_graph', label: 'גרף יחידה', icon: BarChart },
  { id: 'basic_files', label: 'תיקי יסוד', icon: Briefcase },
  { id: 'gallery', label: 'גלריית יחידה', icon: Camera },
  { id: 'safety', label: 'בטיחות', icon: AlertTriangle },
];

const CARDS_BY_CATEGORY = {
  training: [
    { id: 'kakatz', title: 'קק"צ', icon: GraduationCap },
    { id: 'mekadadim', title: 'קורס מפקדים', icon: Users },
    { id: 'kamas', title: 'קמ"ס', icon: Target },
    { id: 'shalit', title: 'שליט/בקרים', icon: Map },
    { id: 'lohamim', title: 'מסלול לוחם', icon: Crosshair },
  ],
  operations: [
    { id: 'reports', title: 'דו"חות מבצעיים', icon: FileText },
    { id: 'drills', title: 'תרגילים', icon: Target },
    { id: 'procedures', title: 'נהלים ופקודות', icon: Briefcase },
  ],
  hq: [
    { id: 'hr', title: 'שלישות ומשאבי אנוש', icon: Users },
    { id: 'logistics', title: 'לוגיסטיקה', icon: Briefcase },
  ]
};

const SUB_LINKS = [
  { label: 'חניכי הקורס', icon: Users },
  { label: 'גאנט הקורס', icon: Calendar },
  { label: 'אימונים', icon: Target },
  { label: 'תיקי סדרה', icon: FileText },
  { label: 'סגל', icon: User },
];

const MONTHLY_EVENTS = [
  { id: 1, date: '04', month: 'נוב', title: 'בוחן מסלול פלוגתי', time: '08:00' },
  { id: 2, date: '12', month: 'נוב', title: 'כנס סגל פיקוד', time: '14:30' },
  { id: 3, date: '18', month: 'נוב', title: 'תרגיל יחידתי מסכם', time: 'כל היום' },
  { id: 4, date: '25', month: 'נוב', title: 'מסדר דמעות - קק"צ', time: '10:00' },
];

// --- רכיבים (Components) ---

const FlipCard = ({ title, icon: IconComponent }) => {
  const [isFlipped, setIsFlipped] = useState(false);

  const handleLinkClick = (e) => {
    e.stopPropagation();
    // ניתוב עתידי
  };

  return (
    <div
      className="relative w-full h-56 cursor-pointer [perspective:1000px] group"
      onClick={() => setIsFlipped(!isFlipped)}
    >
      <div
        className={`w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >
        {/* צד קדמי */}
        <div className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-[#1a1d24] to-[#111318] border border-gray-800 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(220,38,38,0.15)] transition-all rounded-xl p-6 flex flex-col items-center justify-center text-gray-200">
          <div className="bg-black/40 border border-gray-800/50 p-4 rounded-xl mb-4 text-red-500 group-hover:scale-110 transition-transform duration-300">
            {IconComponent && <IconComponent size={36} strokeWidth={1.5} />}
          </div>
          <h3 className="text-xl font-bold text-white tracking-wide">{title}</h3>
          <div className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-500 font-medium tracking-wider uppercase">
            <span>לכניסה</span>
            <ChevronDown size={12} className="-rotate-90" />
          </div>
        </div>

        {/* צד אחורי */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-[#111318] to-[#0a0c0f] border border-gray-800 rounded-xl p-5 flex flex-col shadow-2xl">
          <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-3">
            <h3 className="text-base font-bold text-white/90">{title}</h3>
            <button
              className="text-gray-500 hover:text-red-500 transition-colors bg-gray-900/50 rounded-md p-1"
              onClick={(e) => { e.stopPropagation(); setIsFlipped(false); }}
            >
              <Undo2 size={16} />
            </button>
          </div>

          {/* קישורים - wrap לפי אורך הטקסט */}
          <div className="flex flex-wrap gap-1.5 flex-1 content-center">
            {SUB_LINKS.map((link, idx) => {
              const LinkIcon = link.icon;
              return (
                <button
                  key={idx}
                  onClick={handleLinkClick}
                  className="flex items-center gap-1.5 text-right bg-white/5 hover:bg-red-500/10 hover:text-red-400 px-3 py-2 rounded-lg transition-all text-xs text-gray-300 group/btn whitespace-nowrap"
                >
                  {LinkIcon && <LinkIcon size={13} className="text-gray-500 group-hover/btn:text-red-400 shrink-0" />}
                  <span>{link.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [activeCategory, setActiveCategory] = useState('training');
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setBgIndex((prevIndex) => (prevIndex + 1) % HERO_BACKGROUNDS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const currentCards = CARDS_BY_CATEGORY[activeCategory] || [];
  const selectedCategoryObj = CATEGORIES.find(c => c.id === activeCategory);
  const CategoryIconLarge = selectedCategoryObj?.icon;

  return (
    <div dir="rtl" className="h-screen overflow-y-auto overflow-x-hidden bg-[#0a0c0f] text-right selection:bg-red-500/30 selection:text-white scroll-smooth">

      {/* ==================== אזור 1: Hero ==================== */}
      <section className="relative min-h-screen flex flex-col">
        {HERO_BACKGROUNDS.map((bg, index) => (
          <div
            key={index}
            className="absolute inset-0 w-full h-full bg-cover bg-center transition-opacity duration-1000 ease-in-out"
            style={{
              backgroundImage: `url(${bg})`,
              opacity: bgIndex === index ? 1 : 0,
              zIndex: 0
            }}
          />
        ))}
        <div className="absolute inset-0 bg-black/50 z-0"></div>

        <div className="relative z-10 flex flex-col h-full flex-1">

          {/* Top Bar - 3 columns: מופעי החודש (visual right) | search center | דבר מפקד (visual left) */}
          <header className="w-full py-5 px-6 lg:px-12 grid grid-cols-3 items-start gap-4" style={{ zoom: 1.5 }}>

            {/* עמודה ימנית ויזואלית (RTL first): לוגו + מופעי החודש */}
            <div className="flex flex-col gap-3">
              {/* לוגו */}
              <div className="flex items-center gap-3 text-white">
                <div className="w-12 h-12 rounded-full border border-red-500/50 flex items-center justify-center bg-black/60 backdrop-blur-md shadow-lg shadow-red-900/20">
                  <span className="font-bold text-center text-[9px] leading-tight text-gray-200">
                    חמ"מ<br /><span className="text-red-500 text-[11px]">7134</span>
                  </span>
                </div>
                <h1 className="text-lg font-black hidden md:block tracking-wide drop-shadow-md">
                  פורטל ידע <span className="text-red-500">מבצעי</span>
                </h1>
              </div>

              {/* מופעי החודש - ימין למעלה */}
              <div className="w-full bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ direction: 'rtl' }}>
                {/* כותרת */}
                <div className="bg-[#1a1d24] px-4 py-3 flex items-center justify-between">
                  <h2 className="text-white text-sm font-bold">מופעי החודש</h2>
                  <Calendar className="text-red-500 shrink-0" size={17} />
                </div>
                {/* אירועים */}
                <div className="flex flex-col divide-y divide-gray-100">
                  {MONTHLY_EVENTS.map((event) => (
                    <div key={event.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                      {/* תאריך - קלנדר */}
                      <div className="shrink-0 flex flex-col items-center justify-center bg-red-500 text-white rounded-lg w-12 h-12 shadow-sm">
                        <span className="text-lg font-black leading-none">{event.date}</span>
                        <span className="text-[10px] font-semibold leading-none opacity-90 mt-0.5">{event.month}</span>
                      </div>
                      {/* פרטים */}
                      <div className="flex flex-col flex-1 min-w-0">
                        <h4 className="text-gray-800 text-sm font-bold leading-snug truncate">{event.title}</h4>
                        <span className="text-gray-400 text-xs mt-0.5 flex items-center gap-1">
                          <Clock size={10} className="shrink-0" />
                          {event.time}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* פוטר */}
                <div className="px-4 py-2.5 border-t border-gray-100 flex justify-center">
                  <button className="text-red-500 text-xs font-semibold hover:text-red-600 transition-colors flex items-center gap-1">
                    לצפייה ביומן המלא
                    <span className="text-base leading-none">←</span>
                  </button>
                </div>
              </div>
            </div>

            {/* עמודה אמצעית: חיפוש */}
            <div className="flex justify-center items-start pt-2">
              <div className="w-full max-w-md relative">
                <input
                  type="text"
                  placeholder="חיפוש מהיר: נהלים, פקודות, תיקים..."
                  className="w-full bg-black/40 backdrop-blur-md text-white placeholder-gray-400 border border-white/10 hover:border-white/20 focus:border-red-500 focus:bg-black/60 transition-all rounded-full py-3 pr-12 pl-6 outline-none shadow-xl"
                />
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              </div>
            </div>

            {/* עמודה שמאלית ויזואלית (RTL last): דבר המפקד */}
            <div className="flex justify-start items-start ">
              <div className="w-full top-20 bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-5 flex items-start gap-4 shadow-2xl relative overflow-hidden group">
                <div className="absolute right-0 top-0 w-1 h-full bg-red-600/80"></div>

                <div className="w-13 h-13 shrink-0 bg-gray-800/80 rounded-full border-2 border-white/10 flex items-center justify-center" style={{ width: '52px', height: '52px' }}>
                  <User size={22} className="text-gray-400" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Quote size={14} className="text-red-400" />
                    <h2 className="text-sm font-bold text-white">דבר מפקד בית הספר</h2>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed font-normal">
                    "המקצועיות שלנו היא מגן הברזל של הלוחמים בשטח. מצוינות בהדרכה ובידע אינה רשות, היא החובה שלנו בכל יום מחדש."
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed mt-2">
                    בית הספר שלנו מהווה את עמוד השדרה של ההכשרה המקצועית. כל מדריך, כל חניך וכל סגל — שותפים למשימה אחת: להכשיר לוחמים מוכנים ומיומנים.
                  </p>
                  <span className="text-xs font-semibold text-gray-500 mt-3 block">- סא"ל א. ישראלי</span>
                </div>
              </div>
            </div>

          </header>

          {/* Scroll Arrow */}
          <div className="mt-auto pb-8 flex justify-center w-full animate-bounce opacity-50">
            <div className="bg-black/50 border border-white/10 text-white rounded-full p-2 backdrop-blur-sm">
              <ChevronLeft size={20} className="-rotate-90" />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== אזור 2: תוכן וניווט ==================== */}
      <section className="min-h-screen bg-[#0a0c0f] py-16 px-6 lg:px-12 flex flex-col items-center relative">

        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-red-900/10 blur-[120px] rounded-full pointer-events-none"></div>

        <div className="w-full max-w-[1400px] flex flex-col gap-12 relative z-10">

          {/* ניווט קטגוריות */}
          <div className="w-full bg-[#111318] rounded-2xl border border-gray-800 p-2 overflow-x-auto flex items-center justify-start xl:justify-center gap-2 sticky top-4 z-20 shadow-2xl">
            {CATEGORIES.map((category) => {
              const CategoryIcon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setActiveCategory(category.id)}
                  className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium transition-all text-sm whitespace-nowrap ${activeCategory === category.id
                    ? 'bg-red-600 text-white shadow-[0_4px_15px_rgba(220,38,38,0.3)]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  {CategoryIcon && <CategoryIcon size={18} />}
                  {category.label}
                </button>
              );
            })}
          </div>

          {/* תוכן הקטגוריה */}
          <div className="mt-4">
            <div className="flex items-center gap-4 mb-10 px-2 border-b border-gray-800 pb-4">
              <div className="bg-red-500/10 text-red-500 p-3 rounded-xl border border-red-500/20">
                {CategoryIconLarge && <CategoryIconLarge size={24} />}
              </div>
              <h2 className="text-2xl font-bold text-white tracking-wide">{selectedCategoryObj?.label}</h2>
            </div>

            {currentCards.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {currentCards.map((card) => (
                  <FlipCard key={card.id} title={card.title} icon={card.icon} />
                ))}
              </div>
            ) : (
              <div className="w-full bg-[#111318] border border-dashed border-gray-800 rounded-3xl h-64 flex flex-col items-center justify-center text-gray-600">
                <ImageIcon size={48} className="mb-4 opacity-30" />
                <p className="text-xl font-medium">התוכן טרם הוזן</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
