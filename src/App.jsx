import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import AdminEvents from './components/AdminEvents';
import EventsList from './components/EventsList';
import {
  Search, ChevronLeft, ChevronRight, Target,
  Rocket, BarChart, Briefcase, Camera, Users, Crosshair,
  AlertTriangle, Calendar, Quote, User, Undo2, FileText,
  GraduationCap, Map, Clock, Image as ImageIcon
} from 'lucide-react';

const BACKGROUNDS = [
  '/images/לח1.jpeg',
  '/images/לח2.jpeg',
  '/images/לח3.jpg',
  '/images/לח4.webp',
  '/images/לח5.jpeg',
  '/images/לח7.jpg'
];

import { DynamicIcon } from './components/DynamicIcon';
import { useNavigation } from './context/NavigationContext';
import { useAuth } from './context/AuthContext';
import AdminHub from './components/AdminHub';

export const FlipCard = ({ id, title, icon: iconName, subLinks = [], url, isFlipped, onFlip }) => {
  const handleLinkClick = (e) => {
    e.stopPropagation();
  };

  const handleCardClick = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    onFlip(isFlipped ? null : id);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    onFlip(null);
  };

  return (
    <div
      className="relative w-full h-56 cursor-pointer [perspective:1000px] group"
      onClick={handleCardClick}
    >
      <div
        className={`w-full h-full transition-transform duration-500 [transform-style:preserve-3d] ${isFlipped ? '[transform:rotateY(180deg)]' : ''}`}
      >
        <div className="absolute inset-0 [backface-visibility:hidden] bg-gradient-to-br from-[#1a1c23] to-[#111318] border border-gray-800 group-hover:border-red-500/50 group-hover:shadow-[0_0_20px_rgba(220,38,38,0.15)] transition-all rounded-xl p-6 flex flex-col items-center justify-center text-gray-200">
          <div className="bg-black/40 border border-gray-800/50 p-4 rounded-xl mb-4 text-red-500 group-hover:scale-110 transition-transform duration-300">
            <DynamicIcon name={iconName} size={36} strokeWidth={1.5} />
          </div>
          <h3 className="text-xl font-bold text-white tracking-wide">{title}</h3>
          <div className="mt-4 flex items-center justify-center gap-1 text-xs text-gray-500 font-medium tracking-wider uppercase">
            <span>לכניסה</span>
            <ChevronLeft size={12} className="-rotate-90" aria-hidden />
          </div>
        </div>

        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-gradient-to-br from-[#111318] to-[#0a0c0f] border border-gray-800 rounded-xl p-5 flex flex-col shadow-2xl">
          <div className="flex justify-between items-center mb-3 border-b border-gray-800 pb-3">
            <h3 className="text-base font-bold text-white/90">{title}</h3>
            <button
              type="button"
              className="text-gray-500 hover:text-red-500 transition-colors bg-gray-900/50 rounded-md p-1"
              onClick={handleClose}
              aria-label="סגור"
            >
              <Undo2 size={16} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 flex-1 content-center">
            {(subLinks || []).map((link, idx) => {
              const LinkIcon = link.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={handleLinkClick}
                  className="flex items-center gap-1.5 text-right bg-white/5 hover:bg-red-500/10 hover:text-red-400 px-3 py-2 rounded-lg transition-all text-sm text-gray-300 group/btn whitespace-nowrap"
                >
                  <DynamicIcon name={link.icon} size={14} className="text-gray-500 group-hover/btn:text-red-400 shrink-0" />
                  <span>{link.label}</span>
                  {link.url ? (
                    <a href={link.url} target="_blank" rel="noreferrer" className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

function Home() {
  const navigate = useNavigate();
  const onOpenAdmin = () => navigate('/admin');
  const [bgIndex, setBgIndex] = useState(0);
  const [flippedCardId, setFlippedCardId] = useState(null);

  const { navItems, loading } = useNavigation();
  const { currentUser } = useAuth();

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'בוקר טוב';
    if (hour >= 12 && hour < 16) return 'צהריים טובים';
    if (hour >= 16 && hour < 18) return 'אחה"צ טובים';
    if (hour >= 18 && hour < 22) return 'ערב טוב';
    return 'לילה טוב';
  };
  const userName = currentUser?.displayName || 'אורח';

  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex(prev => (prev + 1) % BACKGROUNDS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleNavTo = (cat) => {
    if (cat.url) {
      window.open(cat.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const el = document.getElementById(cat.id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleFlip = (id) => {
    setFlippedCardId(id);
  };

  return (
    <div dir="rtl" className="min-h-screen relative bg-[#0c0d12] text-white font-heebo selection:bg-red-500/30">

      {/* Background Section (Fixed so it stays while scrolling) */}
      <div className="fixed inset-0 z-0 bg-[#0c0d12]">
        {BACKGROUNDS.map((bg, idx) => (
          <img
            key={idx}
            src={bg}
            alt={`bg-${idx}`}
            className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-1000 mix-blend-luminosity brightness-75 contrast-125 ${idx === bgIndex ? 'opacity-50' : 'opacity-0'}`}
          />
        ))}

        {/* Exact Grid lines */}
        <div className="absolute inset-0 z-10 grid-overlay pointer-events-none opacity-70" />

        {/* Dark black around the edges (vignette and gradients) */}
        <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_center,transparent_30%,#0c0d12_100%)] opacity-90 pointer-events-none" />
        <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#0c0d12] via-[#0c0d12]/40 to-transparent h-full pointer-events-none" />
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-[#0c0d12]/80 via-transparent to-transparent h-1/2 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 z-10 w-2/3 bg-gradient-to-l from-[#0c0d12] via-[#0c0d12]/60 to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 left-0 z-10 w-1/4 bg-gradient-to-r from-[#0c0d12] to-transparent pointer-events-none" />
      </div>

      <div className="relative z-20 flex flex-col w-full h-full">

        {/* Top Navbar */}
        <nav className="w-full  px-8 py-6 flex items-center justify-between border-b border-white/5 bg-gradient-to-b from-black/80 to-transparent sticky top-0 z-[100] bg-[#0c0d12]/20 backdrop-blur-md">

          {/* Left side in RTL (Visually Right) */}
          <div className="flex items-center gap-8 lg:gap-10">
            <div className="flex items-center gap-3 cursor-pointer group" onClick={() => window.scrollTo(0, 0)}>
              {/* <img src="/logo_1734_rmbg.png" alt="Logo" className="h-[44px] w-auto drop-shadow-[0_0_8px_rgba(220,38,38,0.5)] transition-transform duration-300 group-hover:scale-105" /> */}
              <div className="text-white font-bold text-xl relative shrink-0">
                בית הספר
                <div className="absolute -bottom-7 left-0 right-0 h-1 bg-red-600 rounded-t-sm" />
              </div>
            </div>
            {navItems.map(cat => (
              <div key={cat.id} onClick={() => handleNavTo(cat)} className="text-gray-400 hover:text-white transition font-medium cursor-pointer text-sm tracking-wide">
                {cat.label}
              </div>
            ))}
          </div>

          {/* Right side in RTL (Visually Left) */}
          <div className="flex flex-row-reverse items-center gap-3">
            <div
              className="relative flex items-center w-64 md:w-80 h-10 group"
              style={{ filter: 'drop-shadow(0 0 4px rgba(220, 38, 38, 0.2))' }}
            >
              <div
                className="absolute inset-0 bg-red-900/50"
                style={{ clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)' }}
              />
              <div
                className="absolute inset-[1px] bg-[#0c0d12]"
                style={{ clipPath: 'polygon(11px 0, 100% 0, 100% calc(100% - 11px), calc(100% - 11px) 100%, 0 100%, 0 11px)' }}
              />
              <div
                className="absolute inset-[3px] bg-[#8b1a1a] transition-colors group-hover:bg-red-700/90"
                style={{ clipPath: 'polygon(9px 0, 100% 0, 100% calc(100% - 9px), calc(100% - 9px) 100%, 0 100%, 0 9px)' }}
              />
              <div
                className="absolute inset-[4px] bg-white flex items-center px-3"
                style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
              >
                <Search size={22} className="text-[#8b1a1a] shrink-0" strokeWidth={2} />
                <input
                  type="text"
                  placeholder="חיפוש באתר..."
                  className="flex-1 w-full bg-transparent border-none outline-none text-gray-800 placeholder-gray-500 text-sm font-medium mr-2"
                />
              </div>
            </div>
            <button onClick={onOpenAdmin} className="bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-white px-6 h-10 font-bold transition rounded-sm text-sm whitespace-nowrap hidden sm:block">
              ניהול
            </button>
            <div className="flex items-center text-white px-4 h-10 whitespace-nowrap bg-[#12141a]/60 border border-white/10 rounded-sm">
              <span className="text-gray-300 font-medium ml-1.5">{getGreeting()}</span>
              <span className="font-bold text-red-400">{userName}</span>
            </div>
          </div>
        </nav>

        {/* Main Hero Content */}
        <main className="w-full relative min-h-[calc(100vh-80px)] xl:h-[calc(100vh-80px)] flex flex-col pt-4 [@media(max-height:850px)]:pt-2 lg:pt-8 xl:pt-12">
          {/* Text Block - Align to Right */}
          <div className="flex-1 flex flex-col justify-center px-4 sm:px-8 lg:px-12 xl:px-24 pointer-events-auto z-20">
            <div className="w-full lg:w-[75%] xl:w-[65%] text-right self-end md:self-auto">
              <div className="text-red-500 font-bold lg:text-lg [@media(max-height:850px)]:text-sm mb-1 mr-1">ברוכים הבאים</div>
              <div className="flex flex-col md:flex-row md:items-center  gap-2 md:gap-4 lg:gap-6 [@media(max-height:850px)]:gap-4 mb-4 xl:mb-6 [@media(max-height:850px)]:mb-2 mt-1">
                <img src="/logo_1734_rmbg.png" alt="Logo החמם" className="h-[70px] md:h-[90px] lg:h-[110px] xl:h-[130px] 2xl:h-[160px] [@media(max-height:850px)]:h-[70px] xl:[@media(max-height:850px)]:h-[80px] w-auto drop-shadow-[0_0_15px_rgba(220,38,38,0.5)] transition-transform duration-500 hover:scale-105" />
                <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-[4.2rem] 2xl:text-7xl [@media(max-height:850px)]:text-4xl lg:[@media(max-height:850px)]:text-5xl font-black text-white drop-shadow-lg tracking-tight leading-tight lg:leading-none break-words">
                  בית הספר לחמ"ם <br /> 7134
                </h1>
              </div>
              <p className="text-gray-300 text-base md:text-lg lg:text-xl xl:text-2xl [@media(max-height:850px)]:text-xl [@media(max-height:850px)]:leading-tight leading-relaxed mb-4 lg:mb-8 [@media(max-height:850px)]:mb-3 drop-shadow-md max-w-2xl break-words">
                מרכז ההכשרות המוביל בצה"ל למקצועות החמ"ם.<br />
                אנו אמונים על רצף ההכשרה, פיתוח מקצועי מתמיד ושמירה על כשירות עליונה בתחום המערכות המתקדמות.
              </p>
              {/* <button onClick={() => handleNavTo('training')} className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-3 px-8 py-3 lg:py-4 font-bold transition rounded-sm shadow-[0_0_20px_rgba(220,38,38,0.3)]">
                <span className="text-lg">למעבר להכשרות</span>
                <ChevronLeft size={22} className="mt-0.5" />
              </button> */}
            </div>
          </div>

          {/* Bottom Panels Container */}
          <div className="w-full px-8 lg:px-12 xl:px-24 pb-6 lg:pb-10 xl:pb-12 flex flex-col lg:flex-row items-center lg:items-center xl:items-end justify-between gap-6 lg:gap-6 xl:gap-10 pointer-events-auto z-30 mt-8 [@media(max-height:850px)]:-mt-2 lg:mt-auto">

            {/* RIGHT BOX - "דבר המפקד" */}
            <div className="w-full lg:flex-1 lg:max-w-[700px] h-auto lg:h-[260px] xl:h-[300px] 2xl:min-h-[320px] [@media(max-height:850px)]:h-[220px] relative shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)] filter drop-shadow-[0_0_8px_rgba(220,38,38,0.1)] group">
              <div
                className="absolute inset-0 bg-gradient-to-b from-gray-400/30 to-gray-800/20"
                style={{ clipPath: 'polygon(30px 0, 100% 0, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0 100%, 0 30px)' }}
              />
              <div
                className="absolute inset-[1px] bg-[#0c0d12]/40 backdrop-blur-xl"
                style={{ clipPath: 'polygon(29px 0, 100% 0, 100% calc(100% - 29px), calc(100% - 29px) 100%, 0 100%, 0 29px)' }}
              />
              <div
                className="absolute inset-[1px] bg-gradient-to-br from-white/5 to-transparent backdrop-blur-sm mix-blend-overlay"
                style={{ clipPath: 'polygon(29px 0, 100% 0, 100% calc(100% - 29px), calc(100% - 29px) 100%, 0 100%, 0 29px)' }}
              />
              <div className="relative  p-6 [@media(max-height:850px)]:p-4 flex flex-col sm:flex-row items-stretch h-full w-full">
                <div className="w-full sm:w-[45%] relative shrink-0 sm:-ml-4 flex items-center justify-center overflow-visible mb-6 sm:mb-0 isolate">
                  {/* רקע אדום – מאחורי תמונת המפקד */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-[40%] -translate-y-[60%] w-28 lg:w-32 xl:w-36 h-28 lg:h-32 xl:h-36 bg-red-600 z-[1] hidden sm:block shadow-[0_0_25px_rgba(220,38,38,0.7),0_0_50px_rgba(220,38,38,0.4)]" aria-hidden="true" />
                  <img
                    src="/images/פורטרט.png"
                    className="w-full sm:w-44 lg:w-52 xl:w-60 h-40 sm:h-full object-contain object-center relative z-[2] border-b sm:border-b-0 border-gray-800"
                    alt="Commander"
                  />
                </div>

                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] z-20" />

                <div className="flex-1 flex flex-col justify-between items-start sm:border-r border-gray-800/80 sm:pr-6 [@media(max-height:850px)]:pr-4 pt-2 pb-1 relative z-20 overflow-hidden">
                  <div className="w-full">
                    <div className="text-red-500 text-xs xl:text-sm [@media(max-height:850px)]:text-sm font-bold mb-1 opacity-90 tracking-wide">מפקד היחידה</div>
                    <h2 className="text-2xl lg:text-3xl xl:text-4xl font-black text-white mb-2 xl:mb-4  leading-tight">דבר המפקד</h2>
                    <p className="text-gray-300 text-[13px] xl:text-[14px] [@media(max-height:850px)]:text-[14px] leading-snug xl:leading-relaxed [@media(max-height:850px)]:leading-tight mb-4 xl:mb-6 [@media(max-height:850px)]:mb-2 font-medium xl:line-clamp-none line-clamp-3 [@media(max-height:850px)]:line-clamp-3">
                      "מפקדים ולוחמים, אנו ניצבים בחזית העשייה המבצעית. מצופה מכם לחתור למצוינות, להפגין מקצועיות חסרת פשרות, ולהוביל את העשייה בכל משימה אליה נדרש. יחד ננצח."
                    </p>
                    <div className="text-gray-500 text-xs xl:text-sm [@media(max-height:850px)]:text-sm tracking-wider opacity-70">סא"ל א', מפקד בית הספר</div>
                  </div>

                  {/* Pagination */}
                  <div className="flex gap-0.5 mt-6 sm:absolute sm:bottom-0 sm:left-0">
                    <button className="bg-red-600 w-10 h-10 flex items-center justify-center text-white hover:bg-red-700 transition"><ChevronRight size={18} /></button>
                    <button className="bg-red-600 w-10 h-10 flex items-center justify-center text-white hover:bg-red-700 transition"><ChevronLeft size={18} /></button>
                  </div>
                </div>
              </div>
            </div>

            {/* LEFT BOX - "מופעי החודש" */}
            <div className="w-full lg:w-[320px] xl:w-[380px] h-auto lg:h-[320px] xl:h-[380px] 2xl:h-[420px] [@media(max-height:850px)]:h-[380px] relative shrink-0 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.8)] filter drop-shadow-[0_0_8px_rgba(220,38,38,0.1)] group">
              <div
                className="absolute inset-0 bg-gradient-to-b from-gray-400/40 to-gray-800/30"
                style={{ clipPath: 'polygon(30px 0, 100% 0, 100% calc(100% - 30px), calc(100% - 30px) 100%, 0 100%, 0 30px)' }}
              />
              <div
                className="absolute inset-[1px] bg-[#0c0d12]/30 backdrop-blur-3xl"
                style={{ clipPath: 'polygon(29px 0, 100% 0, 100% calc(100% - 29px), calc(100% - 29px) 100%, 0 100%, 0 29px)' }}
              />
              <div
                className="absolute inset-[1px] bg-gradient-to-br from-white/10 to-transparent mix-blend-overlay backdrop-blur-sm"
                style={{ clipPath: 'polygon(29px 0, 100% 0, 100% calc(100% - 29px), calc(100% - 29px) 100%, 0 100%, 0 29px)' }}
              />

              {/* Bottom Red Glow Line Component */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px] bg-red-500 shadow-[0_0_15px_rgba(239,68,68,1)] z-20" />

              <div className="p-6 pt-7 [@media(max-height:850px)]:p-4 [@media(max-height:850px)]:pt-4 relative z-10 w-full h-full flex flex-col">
                <h2 className="text-2xl [@media(max-height:850px)]:text-xl font-black text-white mb-6 [@media(max-height:850px)]:mb-3 border-b border-white/20 pb-2 text-shadow-sm">מופעי החודש</h2>

                <div className="overflow-hidden flex-1 relative mask-image-bottom">
                  <div className="absolute inset-0 overflow-y-auto pr-2 custom-scrollbar">
                    <EventsList />
                  </div>
                </div>

              </div>
            </div>
          </div>
        </main>

        {/* BELOW HERO - CONTENT & CATEGORIES */}
        <div className="relative z-10 w-full mt-[10vh] pb-24 px-6 lg:px-12 flex flex-col gap-16 bg-[#0c0d12]/90 backdrop-blur-xl border-t border-red-500/20 pt-16">
          {loading ? (
            <div className="w-full h-64 flex items-center justify-center text-gray-500">טוען קטגוריות...</div>
          ) : navItems.filter(c => c.children && c.children.length > 0 && !c.url).map((cat) => {
            const cards = cat.children;

            return (
              <section
                key={cat.id}
                id={cat.id}
                className="scroll-mt-32 max-w-[1400px] mx-auto w-full"
              >
                <div className="flex items-center gap-4 mb-8 px-2 pb-4 relative">
                  <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-red-600/50 via-red-600/20 to-transparent" />
                  <div className="bg-red-500/10 text-red-500 p-3 rounded-xl border border-red-500/20">
                    <DynamicIcon name={cat.icon} size={24} />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-wide">{cat.label}</h2>
                </div>

                {cards.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {cards.map((card) => {
                      const cardUniqueId = `${cat.id}-${card.id}`;
                      return (
                        <FlipCard
                          key={card.id}
                          id={cardUniqueId}
                          title={card.title || card.label}
                          icon={card.icon}
                          subLinks={card.subLinks}
                          url={card.url}
                          isFlipped={flippedCardId === cardUniqueId}
                          onFlip={handleFlip}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="w-full bg-gradient-to-br from-[#1a1c23] to-[#111318] border border-dashed border-gray-800 rounded-3xl h-64 flex flex-col items-center justify-center text-gray-600">
                    <div className="bg-white/5 border border-white/10 p-5 rounded-2xl mb-4">
                      <ImageIcon size={40} className="opacity-30 text-gray-500" />
                    </div>
                    <p className="text-xl font-medium text-gray-500">התוכן טרם הוזן</p>
                  </div>
                )}
              </section>
            );
          })}
        </div>

      </div >
    </div >
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/*" element={<AdminHub />} />
    </Routes>
  );
}
