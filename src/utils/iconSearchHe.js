// Hebrew search + labels for lucide icon names.
// Purpose: allow searching icons by Hebrew terms (and show nicer labels).

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
  Mail: ['מייל', 'דוא״ל', 'דואר'],
  Calendar: ['יומן', 'לוח שנה', 'תאריך'],
  Clock: ['שעה', 'שעון', 'זמן'],
  Bell: ['התראות', 'פעמון', 'הודעה'],
  Map: ['מפה'],
  MapPin: ['מיקום', 'נעץ', 'סיכה'],
  MapPinned: ['מפה', 'מיקום', 'נעוץ'],
  Link: ['קישור', 'לינק'],
  ExternalLink: ['קישור חיצוני', 'יציאה'],
  Folder: ['תיקייה', 'תיק'],
  FolderOpen: ['תיקייה פתוחה', 'תיק פתוח'],
  File: ['קובץ'],
  FileText: ['מסמך', 'טקסט', 'קובץ טקסט'],
  Image: ['תמונה', 'תמונות'],
  Video: ['וידאו', 'סרטון'],
  Music: ['מוזיקה', 'שיר', 'צליל'],
  Trash: ['אשפה', 'מחיקה'],
  Edit: ['עריכה', 'ערוך'],
  Save: ['שמירה', 'שמור'],
  Download: ['הורדה', 'הורד'],
  Upload: ['העלאה', 'העלה'],
  RefreshCw: ['רענון', 'רענן'],
  Shield: ['מגן', 'אבטחה'],
  ShieldCheck: ['אבטחה', 'מוגן', 'בדוק'],
  ShieldBan: ['חסום', 'איסור', 'מניעה', 'אבטחה'],
  Siren: ['אזעקה', 'התראה', 'חירום'],
  Building2: ['בניין', 'מבנה', 'משרד'],
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
  Home: ['בית'],
  Search: ['חיפוש'],
  Settings: ['הגדרות'],
  Info: ['מידע'],
  Check: ['אישור'],
  Circle: ['עיגול'],
  Square: ['ריבוע'],
  Triangle: ['משולש'],
  User: ['משתמש'],
  Users: ['משתמשים'],
  Mail: ['דוא״ל'],
  Phone: ['טלפון'],
  Calendar: ['יומן'],
  Clock: ['שעון'],
  Bell: ['התראות'],
  Map: ['מפה'],
  Pin: ['נעץ'],
  Folder: ['תיקייה'],
  File: ['קובץ'],
  Image: ['תמונה'],
  Video: ['וידאו'],
  Music: ['מוזיקה'],
  Trash: ['אשפה'],
  Edit: ['עריכה'],
  Save: ['שמירה'],
  Download: ['הורדה'],
  Upload: ['העלאה'],
  Refresh: ['רענון'],
  Shield: ['אבטחה'],
  Building: ['בניין'],
  Car: ['רכב'],
  Bus: ['אוטובוס'],
  Train: ['רכבת'],
  Plane: ['מטוס'],
  Ship: ['ספינה'],
  Bike: ['אופניים'],
  Coffee: ['קפה'],
  Pizza: ['פיצה'],
  Apple: ['תפוח'],
  Wheat: ['חיטה'],
  Dumbbell: ['כושר'],
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

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

export function getIconHebrewKeywords(iconName) {
  if (!iconName) return [];

  const explicit = EXPLICIT_HE[iconName] || [];
  const parts = splitCamelCase(iconName);
  const inferred = parts.flatMap((p) => WORD_HE[p] || []);

  return uniq([
    ...explicit,
    ...inferred,
    // also allow searching by the raw english name
    iconName,
    ...parts,
  ]);
}

export function getIconHebrewLabel(iconName) {
  const kws = getIconHebrewKeywords(iconName);
  // Prefer first explicit keyword if exists; else empty.
  const explicit = EXPLICIT_HE[iconName];
  return explicit?.[0] || '';
}

export function getIconSearchHaystack(iconName) {
  return getIconHebrewKeywords(iconName).join(' ').toLowerCase();
}

