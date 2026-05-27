// Hebrew search + labels for lucide icon names.
// Purpose: allow searching icons by Hebrew terms (and show nicer labels).
import { ICON_CATEGORIES } from './iconsData';

const EXPLICIT_HE = {
  Home: ['בית', 'דף הבית', 'מסך הבית'],
  Search: ['חיפוש', 'חפש', 'איתור'],
  Settings: ['הגדרות', 'הגדרה', 'כלים'],
  Info: ['מידע', 'אינפו', 'עזרה'],
  Check: ['אישור', 'וי', 'בדיקה'],
  X: ['סגור', 'ביטול', 'איקס'],
  User: ['משתמש', 'אדם', 'פרופיל'],
  Users: ['משתמשים', 'אנשים', 'קבוצה'],
  Phone: ['טלפון', 'שיחה', 'חיוג'],
  PhoneCall: ['טלפון', 'שיחה', 'חיוג', 'נייד', 'phone', 'call', 'mobile'],
  Smartphone: ['טלפון נייד', 'נייד', 'סלולרי', 'phone', 'mobile'],
  Mail: ['מייל', 'דוא״ל', 'דואר', 'הודעה', 'תקשורת', 'email', 'mail'],
  MailOpen: ['מייל', 'דואר פתוח', 'email', 'mail'],
  AtSign: ['מייל', 'דואר', 'שטרודל', 'email', 'mail'],
  Calendar: ['יומן', 'לוח שנה', 'תאריך', 'אירוע', 'calendar', 'date', 'event'],
  CalendarDays: ['לוח שנה', 'תאריך', 'אירוע', 'calendar', 'date', 'event'],
  Clock: ['שעה', 'שעון', 'זמן'],
  Bell: ['התראות', 'פעמון', 'הודעה'],
  Map: ['מפה'],
  MapPin: ['מיקום', 'נעץ', 'סיכה'],
  MapPinned: ['מפה', 'מיקום', 'נעוץ'],
  Link: ['קישור', 'לינק'],
  ExternalLink: ['קישור חיצוני', 'יציאה'],
  Folder: ['תיקייה', 'תיק'],
  FolderOpen: ['תיקייה פתוחה', 'תיק פתוח'],
  FileText: ['מסמך', 'טקסט', 'קובץ טקסט', 'קובץ', 'document', 'file', 'pdf'],
  File: ['קובץ', 'מסמך', 'file', 'document'],
  FileSpreadsheet: ['אקסל', 'טבלה', 'קובץ נתונים', 'excel', 'spreadsheet', 'data'],
  FileChartColumn: ['דוח', 'גרף', 'נתונים', 'report', 'chart', 'data'],
  Image: ['תמונה', 'תמונות'],
  Video: ['וידאו', 'סרטון'],
  Music: ['מוזיקה', 'שיר', 'צליל'],
  Trash: ['אשפה', 'מחיקה'],
  Edit: ['עריכה', 'ערוך'],
  Save: ['שמירה', 'שמור'],
  Download: ['הורדה', 'הורד'],
  Upload: ['העלאה', 'העלה'],
  RefreshCw: ['רענון', 'רענן'],
  Shield: ['מגן', 'אבטחה', 'צבא', 'חייל', 'army', 'security'],
  ShieldCheck: ['אבטחה', 'מוגן', 'בדוק', 'צבא', 'army', 'unit'],
  ShieldBan: ['חסום', 'איסור', 'מניעה', 'אבטחה'],
  Swords: ['צבא', 'חייל', 'יחידה', 'לחימה', 'army', 'soldier', 'military'],
  Medal: ['מדליה', 'דרגה', 'אות', 'צבא', 'rank', 'army'],
  Badge: ['תג', 'דרגה', 'זיהוי', 'צבא', 'rank', 'badge'],
  BadgeCheck: ['תג מאושר', 'אישור', 'דרגה', 'צבא', 'badge', 'rank'],
  Siren: ['אזעקה', 'התראה', 'חירום'],
  Building2: ['בניין', 'מבנה', 'משרד', 'יחידה', 'ארגון', 'organization', 'unit'],
  Network: ['רשת', 'מבנה ארגוני', 'יחידה', 'organization', 'unit'],
  RadioTower: ['תקשורת', 'אנטנה', 'חמ״ל', 'צבא', 'radio', 'command'],
  Flag: ['דגל', 'סימון', 'יחידה', 'צבא', 'army', 'unit'],
  IdCard: ['תעודה', 'זיהוי', 'מספר אישי', 'id', 'identity'],
  Car: ['רכב', 'מכונית'],
  Bus: ['אוטובוס'],
  Train: ['רכבת'],
  Plane: ['מטוס', 'טיסה'],
  Ship: ['ספינה', 'ים'],
  Bike: ['אופניים'],
  Coffee: ['קפה', 'שתייה חמה'],
  Pizza: ['פיצה', 'אוכל'],
  Apple: ['תפוח', 'פרי'],
  Wheat: ['חיטה', 'דגן', 'לחם'],
  Dumbbell: ['כושר', 'משקולות', 'אימון'],
};

const WORD_HE = {
  Activity: ['פעילות'],
  Aid: ['סיוע'],
  Alarm: ['אזעקה'],
  Alert: ['התראה'],
  Anchor: ['עוגן'],
  Aperture: ['צמצם'],
  Apple: ['תפוח'],
  Archive: ['ארכיון'],
  Area: ['אזור'],
  Arrow: ['חץ'],
  At: ['שטרודל', '@'],
  Audio: ['אודיו', 'שמע'],
  Award: ['פרס'],
  Back: ['אחורה'],
  Backpack: ['תרמיל'],
  Backup: ['גיבוי'],
  Badge: ['תג'],
  Bag: ['תיק'],
  Ban: ['חסימה'],
  Bank: ['בנק'],
  Banknote: ['שטר'],
  Bar: ['עמודה'],
  Battery: ['סוללה'],
  Bell: ['פעמון', 'התראה'],
  Big: ['גדול'],
  Bike: ['אופניים'],
  Bluetooth: ['בלוטות׳'],
  Book: ['ספר'],
  Bookmark: ['סימנייה'],
  Bottle: ['בקבוק'],
  Briefcase: ['תיק עבודה'],
  Brush: ['מברשת'],
  Building: ['בניין'],
  Bus: ['אוטובוס'],
  Calculator: ['מחשבון'],
  Calendar: ['יומן'],
  Call: ['שיחה'],
  Camera: ['מצלמה'],
  Cap: ['כובע'],
  Car: ['רכב'],
  Card: ['כרטיס'],
  Cart: ['עגלה'],
  Ccw: ['נגד כיוון השעון'],
  Charging: ['טעינה'],
  Chart: ['גרף'],
  Check: ['אישור'],
  Chevron: ['חץ קטן'],
  Chevrons: ['חצים קטנים'],
  Circle: ['עיגול'],
  Clapperboard: ['לוח צילום'],
  Clipboard: ['לוח'],
  Clock: ['שעון'],
  Cloud: ['ענן'],
  Code: ['קוד'],
  Cog: ['גלגל שיניים'],
  Command: ['פקודה'],
  Compass: ['מצפן'],
  Connected: ['מחובר'],
  Contact: ['איש קשר'],
  Copy: ['העתקה'],
  Corner: ['פינה'],
  Cpu: ['מעבד'],
  Credit: ['אשראי'],
  Crop: ['חיתוך'],
  Cross: ['צלב'],
  Crosshair: ['כוונת'],
  Cup: ['כוס'],
  Cw: ['עם כיוון השעון'],
  Dashboard: ['לוח מחוונים'],
  Database: ['מסד נתונים'],
  Days: ['ימים'],
  Deciduous: ['נשיר'],
  Diagonal: ['אלכסון'],
  Digit: ['ספרה'],
  Dollar: ['דולר'],
  Down: ['למטה'],
  Download: ['הורדה'],
  Drive: ['כונן'],
  Drizzle: ['טפטוף'],
  Droplet: ['טיפה'],
  Dumbbell: ['משקולת'],
  Edit: ['עריכה'],
  External: ['חיצוני'],
  Eye: ['עין'],
  Face: ['פנים'],
  Factory: ['מפעל'],
  Feather: ['נוצה'],
  File: ['קובץ'],
  Files: ['קבצים'],
  Film: ['פילם'],
  Filter: ['סינון'],
  Fingerprint: ['טביעת אצבע'],
  First: ['ראשון'],
  Flag: ['דגל'],
  Flame: ['להבה'],
  Flower: ['פרח'],
  Fog: ['ערפל'],
  Folder: ['תיקייה'],
  Forward: ['העבר'],
  Forwarded: ['מועבר'],
  Frown: ['עצוב'],
  Full: ['מלא'],
  Gamepad: ['שלט משחק'],
  Gem: ['אבן חן'],
  Gift: ['מתנה'],
  Graduation: ['סיום לימודים'],
  Grid: ['רשת'],
  Hammer: ['פטיש'],
  Handshake: ['לחיצת יד'],
  Hard: ['קשיח'],
  Hash: ['סולמית'],
  Headphones: ['אוזניות'],
  Heart: ['לב'],
  Home: ['בית'],
  Horizontal: ['אופקי'],
  Hourglass: ['שעון חול'],
  Icon: ['אייקון'],
  Image: ['תמונה'],
  In: ['פנימה'],
  Inbox: ['דואר נכנס'],
  Incoming: ['נכנס'],
  Info: ['מידע'],
  Key: ['מפתח'],
  Keyboard: ['מקלדת'],
  Landmark: ['ציון דרך'],
  Laptop: ['מחשב נייד'],
  Layout: ['פריסה'],
  Leaf: ['עלה'],
  Left: ['שמאל'],
  Lightning: ['ברק'],
  Line: ['קו'],
  Link: ['קישור'],
  List: ['רשימה'],
  Lock: ['נעילה'],
  Log: ['יומן'],
  Low: ['נמוך'],
  Luggage: ['מזוודה'],
  Mail: ['מייל'],
  Mailbox: ['תיבת דואר'],
  Map: ['מפה'],
  Marked: ['מסומן'],
  Maximize: ['הגדלה'],
  Medium: ['בינוני'],
  Megaphone: ['מגפון'],
  Meh: ['ניטרלי'],
  Menu: ['תפריט'],
  Message: ['הודעה'],
  Mic: ['מיקרופון'],
  Microchip: ['שבב'],
  Minimize: ['מזעור'],
  Minus: ['הפחתה'],
  Missed: ['הוחמצה'],
  Modem: ['מודם'],
  Monitor: ['מסך'],
  Moon: ['ירח'],
  More: ['עוד'],
  Mountain: ['הר'],
  Mouse: ['עכבר'],
  Move: ['הזזה'],
  Music: ['מוזיקה'],
  Navigation: ['ניווט'],
  Note: ['פתק'],
  Off: ['כבוי'],
  Open: ['פתוח'],
  Out: ['החוצה'],
  Outgoing: ['יוצא'],
  Paintbrush: ['מברשת צבע'],
  Palette: ['פלטה'],
  Paperclip: ['אטב'],
  Pause: ['השהיה'],
  Pen: ['עט'],
  Percent: ['אחוז'],
  Phone: ['טלפון'],
  Pie: ['עוגה'],
  Piggy: ['חזירון'],
  Pill: ['כדור'],
  Pin: ['נעץ'],
  Pine: ['אורן'],
  Pinned: ['נעוץ'],
  Pizza: ['פיצה'],
  Plane: ['מטוס'],
  Play: ['נגן'],
  Plus: ['הוספה'],
  Power: ['כיבוי'],
  Pulse: ['דופק'],
  Qr: ['קוד QR'],
  Question: ['שאלה'],
  Quote: ['ציטוט'],
  Radio: ['רדיו'],
  Rain: ['גשם'],
  Receipt: ['קבלה'],
  Receiver: ['מקלט'],
  Refresh: ['רענון'],
  Repeat: ['חזרה'],
  Reply: ['השב'],
  Reset: ['איפוס'],
  Right: ['ימין'],
  Ring: ['צלצול'],
  Rotate: ['סיבוב'],
  Round: ['עגול'],
  Route: ['מסלול'],
  Router: ['נתב'],
  Rss: ['פיד'],
  Save: ['שמירה'],
  Scan: ['סריקה'],
  Scissors: ['מספריים'],
  Search: ['חיפוש'],
  Send: ['שלח'],
  Server: ['שרת'],
  Settings: ['הגדרות'],
  Share: ['שיתוף'],
  Shield: ['מגן'],
  Ship: ['ספינה'],
  Shopping: ['קניות'],
  Sign: ['סימן'],
  Siren: ['סירנה'],
  Skip: ['דלג'],
  Slider: ['מחוון'],
  Sliders: ['מחוונים'],
  Smartphone: ['סמארטפון'],
  Smile: ['חיוך'],
  Snow: ['שלג'],
  Snowflake: ['פתית שלג'],
  Soda: ['סודה'],
  Sparkles: ['נצנוצים'],
  Speaker: ['רמקול'],
  Sprout: ['נבט'],
  Square: ['ריבוע'],
  Star: ['כוכב'],
  Stethoscope: ['סטטוסקופ'],
  Sticky: ['דביק'],
  Stop: ['עצור'],
  Store: ['חנות'],
  Sun: ['שמש'],
  Sync: ['סנכרון'],
  Syringe: ['מזרק'],
  Tablet: ['טאבלט'],
  Tag: ['תגית'],
  Tags: ['תגיות'],
  Target: ['מטרה'],
  Template: ['תבנית'],
  Terminal: ['טרמינל'],
  Text: ['טקסט'],
  Thermometer: ['מדחום'],
  Thumbs: ['אגודל'],
  Ticket: ['כרטיס'],
  Timer: ['טיימר'],
  Toggle: ['מתג'],
  Tool: ['כלי'],
  Train: ['רכבת'],
  Trash: ['אשפה'],
  Tree: ['עץ'],
  Trending: ['מגמה'],
  Triangle: ['משולש'],
  Tv: ['טלוויזיה'],
  Umbrella: ['מטרייה'],
  Unlock: ['ביטול נעילה'],
  Up: ['למעלה'],
  Upload: ['העלאה'],
  Usb: ['USB'],
  User: ['משתמש'],
  Users: ['משתמשים'],
  Vertical: ['אנכי'],
  Video: ['וידאו'],
  Volume: ['עוצמה'],
  Wand: ['שרביט'],
  Warehouse: ['מחסן'],
  Warning: ['אזהרה'],
  Watch: ['שעון יד'],
  Webcam: ['מצלמת רשת'],
  Wheat: ['חיטה'],
  Wifi: ['וויפיי'],
  Wind: ['רוח'],
  Wine: ['יין'],
  Wrench: ['מפתח ברגים'],
  X: ['איקס'],
  Zap: ['חשמל'],
  Zoom: ['זום'],
};

function splitCamelCase(name) {
  if (!name) return [];
  // Split: "ArrowLeftCircle" -> ["Arrow","Left","Circle"]
  return String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function splitAlphaNumericToken(token) {
  if (!token) return [];
  const pieces = String(token).match(/[A-Za-z]+|\d+/g);
  return Array.isArray(pieces) ? pieces : [String(token)];
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

const LATIN_TO_HE = {
  a: 'א',
  b: 'ב',
  c: 'ק',
  d: 'ד',
  e: 'ה',
  f: 'פ',
  g: 'ג',
  h: 'ה',
  i: 'י',
  j: 'ג׳',
  k: 'ק',
  l: 'ל',
  m: 'מ',
  n: 'נ',
  o: 'ו',
  p: 'פ',
  q: 'ק',
  r: 'ר',
  s: 'ס',
  t: 'ט',
  u: 'ו',
  v: 'ו',
  w: 'ו',
  x: 'קס',
  y: 'י',
  z: 'ז',
};

function transliterateToken(token) {
  const source = String(token || '');
  if (!source) return '';
  return source
    .toLowerCase()
    .split('')
    .map((char) => LATIN_TO_HE[char] || char)
    .join('');
}

function getTokenHebrewCandidates(token) {
  if (!token) return [];
  if (/^\d+$/.test(token)) return [token];

  const direct = WORD_HE[token];
  if (Array.isArray(direct) && direct.length > 0) return direct;

  const normalizedToken = token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
  const normalized = WORD_HE[normalizedToken];
  if (Array.isArray(normalized) && normalized.length > 0) return normalized;

  const transliterated = transliterateToken(token);
  return transliterated ? [transliterated] : [];
}

function getIconNameTokens(iconName) {
  const camelParts = splitCamelCase(iconName);
  return camelParts.flatMap(splitAlphaNumericToken).filter(Boolean);
}

function getInferredHebrewLabel(iconName) {
  const translated = getIconNameTokens(iconName)
    .map((token) => getTokenHebrewCandidates(token)[0])
    .filter(Boolean);
  return translated.join(' ').trim();
}

export function getIconHebrewKeywords(iconName) {
  if (!iconName) return [];

  const explicit = EXPLICIT_HE[iconName] || [];
  const parts = splitCamelCase(iconName);
  const tokens = getIconNameTokens(iconName);
  const inferred = tokens.flatMap(getTokenHebrewCandidates);
  const inferredLabel = getInferredHebrewLabel(iconName);

  return uniq([
    ...explicit,
    inferredLabel,
    ...inferred,
    // also allow searching by the raw english name
    iconName,
    ...parts,
    ...tokens,
  ]);
}

export function getIconHebrewLabel(iconName) {
  const explicit = EXPLICIT_HE[iconName];
  if (explicit?.[0]) return explicit[0];
  return getInferredHebrewLabel(iconName);
}

export function getIconSearchHaystack(iconName) {
  const raw = getIconHebrewKeywords(iconName).join(' ').toLowerCase();
  return `${raw} ${normalizeIconSearchText(raw)}`.trim();
}

const HEBREW_FINAL_LETTERS = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

function normalizeHebrewFinalLetters(value) {
  return String(value || '').replace(/[ךםןףץ]/g, (char) => HEBREW_FINAL_LETTERS[char] || char);
}

export function normalizeIconSearchText(value) {
  return normalizeHebrewFinalLetters(String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0591-\u05C7]/g, '')
    .toLowerCase())
    .replace(/[^\p{L}\p{N}@]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getAllIconEntries(categories = ICON_CATEGORIES) {
  const entries = [];
  const seen = new Set();

  (Array.isArray(categories) ? categories : []).forEach((category) => {
    const icons = Array.isArray(category?.icons) ? category.icons : [];
    icons.forEach((name) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      entries.push({
        name,
        categoryId: category?.id || '',
        categoryLabel: category?.label || '',
      });
    });
  });

  return entries;
}

export function getIconSearchMetadata(iconName, { categories = ICON_CATEGORIES } = {}) {
  const name = String(iconName || '').trim();
  const entry = getAllIconEntries(categories).find((item) => item.name === name) || {
    name,
    categoryId: '',
    categoryLabel: '',
  };
  const label = getIconHebrewLabel(name);
  const keywords = getIconHebrewKeywords(name);
  const haystackParts = [
    name,
    label,
    entry.categoryId,
    entry.categoryLabel,
    ...keywords,
  ];

  return {
    name,
    label,
    categoryId: entry.categoryId,
    categoryLabel: entry.categoryLabel,
    keywords,
    haystack: normalizeIconSearchText(haystackParts.join(' ')),
  };
}

function scoreIconMetadata(metadata, queryTokens) {
  if (queryTokens.length === 0) return 1;

  const normalizedName = normalizeIconSearchText(metadata.name);
  const normalizedLabel = normalizeIconSearchText(metadata.label);
  const normalizedCategory = normalizeIconSearchText(`${metadata.categoryId} ${metadata.categoryLabel}`);

  return queryTokens.reduce((score, token) => {
    if (normalizedName === token) return score + 120;
    if (normalizedName.startsWith(token)) return score + 90;
    if (normalizedLabel === token) return score + 85;
    if (normalizedLabel.startsWith(token)) return score + 70;
    if (metadata.haystack.includes(token)) return score + 40;
    if (normalizedCategory.includes(token)) return score + 25;
    return -Infinity;
  }, 0);
}

export function searchIcons(query = '', {
  categories = ICON_CATEGORIES,
  iconNames,
  limit = Infinity,
} = {}) {
  const allowedNames = Array.isArray(iconNames) ? new Set(iconNames) : null;
  const normalizedQuery = normalizeIconSearchText(query);
  const queryTokens = normalizedQuery ? normalizedQuery.split(' ') : [];

  return getAllIconEntries(categories)
    .filter((entry) => !allowedNames || allowedNames.has(entry.name))
    .map((entry) => {
      const metadata = getIconSearchMetadata(entry.name, { categories });
      return {
        ...metadata,
        score: scoreIconMetadata(metadata, queryTokens),
      };
    })
    .filter((entry) => entry.score > -Infinity)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.name.localeCompare(right.name);
    })
    .slice(0, Number.isFinite(limit) ? Math.max(0, limit) : undefined);
}

export function searchIconNames(query = '', options = {}) {
  return searchIcons(query, options).map((icon) => icon.name);
}
