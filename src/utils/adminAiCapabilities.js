import { isValidBoomColor, normalizeBoomData } from './boomData';

const WIDGET_IDS = ['events', 'alerts', 'outstanding', 'countdown', 'news', 'phonebook', 'shuttles', 'polls', 'celebrations', 'heritage', 'tips'];

const action = (id, label, hint, options = {}) => ({ id, label, hint, ...options });

export const ADMIN_AI_CAPABILITIES = Object.freeze({
  info: {
    title: 'ניהול המידע',
    description: 'יצירה ושיפור של ה-Hero ודבר המפקד בלי לגעת בתמונות או במידע שלא ביקשת לשנות.',
    actions: [
      action('brief', 'צור מבריף', 'הדבק כמה נקודות על האתר/היחידה וה-AI יבנה את הטקסטים.'),
      action('fill-missing', 'מלא שדות חסרים', 'מלא רק שדות ריקים ושמור כל טקסט שכבר קיים.'),
      action('three-versions', '3 גרסאות', 'צור שלוש חלופות שאפשר לדפדף ביניהן.', { alternatives: 3 }),
      action('improve', 'שפר ניסוח', 'שפר בהירות, קיצור ואחידות בלי לשנות עובדות.'),
      action('proofread', 'הגהה לכל העמוד', 'תקן ניסוח, חזרות ושגיאות ושמור על המשמעות.'),
      action('commander', 'נקודות → דבר המפקד', 'הדבק נקודות והמֵר אותן למסר קצר ומקצועי.'),
    ],
  },
  links: {
    title: 'ניהול לינקים וניווט',
    description: 'בנייה, ארגון ושיפור של עץ הניווט תוך שמירה על כתובות קיימות.',
    actions: [
      action('build', 'בנה ניווט מתיאור', 'תאר את תחומי התוכן והמבנה הרצוי.'),
      action('paste', 'הדבק רשימת קישורים', 'הדבק רשימה מבולגנת של שמות וכתובות וה-AI יארגן אותה.'),
      action('restructure', 'סדר את הניווט', 'ארגן מחדש קטגוריות ותתי-קטגוריות בלי להמציא קישורים.'),
      action('rename', 'שפר שמות', 'קצר ואחד שמות של קטגוריות וכרטיסיות.'),
      action('icons', 'הצע אייקונים', 'בחר אייקוני Lucide מתאימים לפי שמות הפריטים.'),
      action('audit', 'נתח בעיות', 'מצא כפילויות, ענפים ריקים, שמות לא ברורים ומבנה עמוס והצג המלצות בלי לשנות.', { readOnly: true }),
      action('fix-audit', 'תקן בעיות', 'תקן כפילויות, ענפים ריקים ושמות לא ברורים תוך שמירה על כתובות קיימות.'),
      action('audience', 'ארגן לפי קהל', 'כתוב מי הקהל וה-AI יארגן את הניווט כדי שיהיה לו קל למצוא תוכן.'),
    ],
  },
  events: {
    title: 'אירועי החודש',
    description: 'המרת לו״ז חופשי לאירועים, שיפור האירועים ובדיקת הלוח.',
    actions: [
      action('paste', 'הדבק לו״ז', 'הדבק WhatsApp/Word/רשימת תאריכים וה-AI יהפוך אותם לאירועים.'),
      action('add', 'הוסף בלבד', 'צור אירועים חדשים בלי למחוק את הקיימים.'),
      action('improve', 'שפר אירועים', 'קצר כותרות ושפר תיאורים בלי לשנות תאריכים.'),
      action('links', 'שפר שמות קישורים', 'הפוך URLs בטקסט לשמות קצרים וברורים.'),
      action('reuse', 'התאם מחודש קודם', 'תאר מה לשכפל/לעדכן וה-AI יבנה חודש חדש.'),
      action('audit', 'נתח את הלוח', 'מצא כפילויות, טקסטים ארוכים ותאריכים חשודים והצג ממצאים בלי לשנות.', { readOnly: true }),
    ],
  },
  widgets: {
    title: 'בחירת ווידג׳טים פעילים',
    description: 'בחר עד שלושה ווידג׳טים שמתאימים לתוכן שכבר קיים באתר ולמטרת דף הבית.',
    actions: [
      action('recommend', 'התאם לי את דף הבית', 'תאר מה חשוב לקהל וה-AI יבחר עד 3 ווידג׳טים.'),
      action('data-aware', 'בחר לפי התוכן הקיים', 'העדף ווידג׳טים שכבר מכילים מידע שימושי ועדכני.'),
      action('three-sets', '3 שילובים', 'צור שלושה שילובי ווידג׳טים שאפשר לדפדף ביניהם.', { alternatives: 3 }),
    ],
  },
  'current-widgets': {
    title: 'ניהול הווידג׳טים העכשוויים',
    description: 'הדבק עדכון אחד וה-AI יחלק אותו בין הווידג׳טים הפעילים.',
    actions: [
      action('weekly', 'עדכן את השבוע', 'הדבק הודעת שבוע אחת: אירועים, הודעות, היסעים, טיפים וכו׳.'),
      action('paste', 'פזר מידע אוטומטית', 'הדבק טקסט חופשי וה-AI יחלק אותו לווידג׳טים המתאימים.'),
      action('cleanup', 'סדר את התוכן הפעיל', 'קצר, נקה כפילויות ואחד ניסוחים בווידג׳טים הפעילים.'),
    ],
  },
  theme: {
    title: 'עיצוב האתר',
    description: 'שינוי הגדרות העיצוב הקיימות תוך שימוש רק בערכים שהמערכת תומכת בהם.',
    actions: [
      action('three-designs', '3 עיצובים', 'תאר סגנון רצוי וקבל שלוש חלופות שאפשר לדפדף ביניהן.', { alternatives: 3 }),
      action('direction', 'עצב לפי כיוון', 'לדוגמה: רשמי ונקי, טכנולוגי כהה, מודרני בהיר.'),
      action('area', 'שנה רק אזור', 'תאר איזה אזור מרגיש לא נכון ומה היית רוצה לשנות.'),
      action('fit-content', 'התאם לתוכן הקיים', 'התאם פריסה וצפיפות לכמות הקטגוריות, הלינקים והווידג׳טים.'),
    ],
  },
  'external-links': {
    title: 'קישורים חיצוניים',
    description: 'ייבוא קישורים, ניקוי שמות ובחירת אייקונים בלי לשנות URL קיים ללא בקשה מפורשת.',
    actions: [
      action('paste', 'הדבק קישורים', 'הדבק רשימת שמות ו-URLs וה-AI יהפוך אותה לכרטיסים.'),
      action('rename', 'שפר שמות', 'קצר והפוך שמות טכניים לברורים.'),
      action('icons', 'הצע אייקונים', 'בחר אייקוני Lucide מתאימים.'),
      action('dedupe', 'נקה כפילויות', 'זהה קישורים זהים או דומים וסדר את הרשימה.'),
      action('order', 'סדר לפי חשיבות', 'תאר את הקהל/העדיפות וה-AI יציע סדר.'),
    ],
  },
  galleries: {
    title: 'גלריות תמונות',
    description: 'שיפור כותרות, תיאורים, captions ו-alt לפי המידע הקיים ושמות הקבצים. המודל הנוכחי אינו רואה את התמונה עצמה.',
    actions: [
      action('metadata', 'שפר מטא-דאטה', 'שפר כותרות ותיאורים לכל הגלריות.'),
      action('alt', 'צור alt משמות קבצים', 'צור טקסט חלופי רק ממה שאפשר להסיק משם הקובץ/טקסט שסיפקת.'),
      action('captions', 'צור captions', 'כתוב captions קצרים מתוך תיאור שסיפקת.'),
      action('style', 'הצע סגנון', 'בחר סגנון גלריה מתאים מתוך הסגנונות הקיימים.'),
      action('audit', 'בדוק עקביות', 'מצא כותרות חלשות, alt חסר ותיאורים לא אחידים והצג המלצות בלי לשנות.', { readOnly: true }),
    ],
  },
  gantt: {
    title: 'ניהול גאנט',
    description: 'בניית תוכנית עבודה ממשפטים חופשיים, פירוק משימות, אבני דרך ובדיקת לו״ז.',
    actions: [
      action('brief', 'צור Gantt מבריף', 'תאר יעד, תאריכים ושלבים וה-AI יבנה תוכנית עבודה.'),
      action('paste', 'הדבק תוכנית עבודה', 'הדבק מייל/WhatsApp/נקודות וה-AI יהפוך אותן למשימות.'),
      action('breakdown', 'פרק משימה', 'ציין משימה גדולה וה-AI יפרק אותה לשלבים.'),
      action('milestones', 'צור אבני דרך', 'הוסף milestones הגיוניים למשימות הקיימות.'),
      action('deadline', 'התאם לדדליין חדש', 'כתוב תאריך יעד חדש וה-AI יתאים את התוכנית.'),
      action('audit', 'אתר בעיות תכנון', 'חפיפות, משימות בלי אחראי, תאריכים בעייתיים והתקדמות לא עקבית.', { readOnly: true }),
      action('status', 'סכם סטטוס', 'הכן סיכום מנהלים קצר מהגאנט בלי לשנות אותו.', { readOnly: true }),
      action('weekly', 'עדכן מדיווח שבועי', 'הדבק מה הושלם/נדחה/נחסם וה-AI יעדכן את המשימות.'),
    ],
  },
  boom: {
    title: 'ניהול BOOM',
    description: 'יצירה ועדכון של משימות, קטגוריות ולוח הבקרה דרך חוזה BOOM המאומת.',
    actions: [
      action('brief', 'צור משימות מבריף', 'תאר מצב, אחריות ותאריכים וה-AI יבנה משימות BOOM מסודרות.'),
      action('update', 'עדכן משימות', 'הדבק עדכון מצב וה-AI יעדכן כותרות, פרטים, אחראים, תאריכים וסטטוסים.'),
      action('categories', 'סדר קטגוריות', 'תאר את התחומים הרצויים וה-AI יציע שמות וצבעים תקינים.'),
      action('summary', 'עדכן שורת סטטוס', 'תאר מה חשוב לראות וה-AI יבחר מדדים תמציתיים מתוך האפשרויות הקיימות.'),
      action('audit', 'בדוק תמונת מצב', 'זהה משימות חסומות, ללא אחראי או חריגות תאריך והצג ממצאים והמלצות בלי לשנות.', { readOnly: true }),
    ],
  },
  'org-chart': {
    title: 'עץ מבנה',
    description: 'המרת טקסט/טבלה לעץ ארגוני ובדיקת ההיררכיה בלי להמציא אנשים, מספרים אישיים או דרגות.',
    actions: [
      action('text', 'טקסט → עץ', 'תאר מי כפוף למי וה-AI יבנה את העץ.'),
      action('table', 'טבלה → עץ', 'הדבק טבלה או רשימת אנשים ותפקידים.'),
      action('normalize', 'אחד דרגות ותפקידים', 'נקה ניסוחים ושמור על הערכים שסופקו.'),
      action('audit', 'בדוק מבנה', 'מצא כפילויות, צמתים יתומים והיררכיה לא עקבית והצג ממצאים בלי לשנות.', { readOnly: true }),
      action('layout', 'המלץ על פריסה', 'הסבר איזו פריסה קיימת מתאימה לגודל העץ בלי לשנות אותה.', { readOnly: true }),
    ],
  },
  alerts: {
    title: 'לוח הודעות',
    description: 'ניסוח הודעות שוטפות וקריטיות.',
    actions: [
      action('draft', 'נסח הודעה', 'כתוב את העובדות וה-AI ימלא כותרת ותוכן.'),
      action('multiple', 'צור כמה הודעות', 'הדבק מידע עם כמה נושאים וה-AI ייצור הודעה נפרדת לכל נושא.'),
      action('clear', 'יותר ברור', 'שפר בהירות בלי לשנות עובדות.'),
      action('short', 'קצר יותר', 'קצר הודעות ארוכות.'),
      action('formal', 'יותר רשמי', 'התאם לטון ארגוני.'),
      action('urgent', 'חדד דחיפות', 'הדגש פעולה נדרשת; אל תסמן קריטי אם אין לכך בסיס.'),
      action('audit', 'בדוק את כל ההודעות', 'מצא כפילויות, חוסר בהירות ותוכן מיושן והצג ממצאים בלי לשנות.', { readOnly: true }),
    ],
  },
  news: {
    title: 'מבזקים ועדכונים',
    description: 'המרת טקסטים ארוכים למבזקים קצרים וברורים.',
    actions: [
      action('flash', 'הפוך למבזק', 'הדבק טקסט ארוך וה-AI יהפוך אותו למשפט קצר.'),
      action('split', 'פצל למבזקים', 'הדבק הודעה עם כמה נושאים וה-AI ייצור כמה מבזקים.'),
      action('short', 'קצר', 'קצר את המבזקים הקיימים.'),
      action('improve', 'שפר ניסוח', 'שפר בהירות וניסוח בלי לשנות את משמעות המבזקים.'),
      action('versions', '3 גרסאות ניסוח', 'צור שלוש חלופות ניסוח לאותו תוכן בלי לשנות עובדות.', { alternatives: 3 }),
      action('plain', 'שפה פשוטה', 'הפוך ניסוח טכני לטקסט ברור למשתמש רגיל.'),
      action('translate', 'תרגם וסכם לעברית', 'הדבק מקור בשפה אחרת וקבל מבזקים בעברית.'),
      action('audit', 'בדוק את הרשימה', 'מצא כפילויות, ניסוחים לא ברורים ותוכן שנראה מיושן והצג מה כדאי לתקן בלי לשנות.', { readOnly: true }),
    ],
  },
  outstanding: {
    title: 'מצטייני היחידה',
    description: 'ניסוח טקסטי הוקרה על בסיס הישגים שהמשתמש סיפק בלבד.',
    actions: [
      action('points', 'נקודות → הוקרה', 'הדבק נקודות אמיתיות על ההישגים וה-AI ינסח תיאור.'),
      action('short', 'קצר יותר', 'קצר תיאורים קיימים.'),
      action('personal', 'יותר אישי', 'רכך את הטון בלי להוסיף עובדות.'),
      action('formal', 'יותר רשמי', 'התאם לטון ארגוני/פיקודי.'),
      action('ceremony', 'נוסח לטקס', 'התאם את ההוקרה להקראה בטקס.'),
      action('versions', '3 חלופות', 'צור שלוש חלופות ניסוח על בסיס העובדות הקיימות בלבד.', { alternatives: 3 }),
    ],
  },
  countdown: {
    title: 'ספירה לאחור',
    description: 'יצירת יעדי ספירה ממשפטים ורשימות תאריכים.',
    actions: [
      action('sentence', 'צור ממשפט', 'לדוגמה: הטקס ב-4 בספטמבר בשעה 10:00.'),
      action('multiple', 'צור כמה ספירות', 'הדבק רשימת מועדים.'),
      action('event', 'אירוע → ספירה', 'הדבק פרטי אירוע וה-AI ייצור יעד מתאים.'),
      action('improve', 'שפר כותרות ופרטים', 'שפר ניסוח בלי לשנות תאריכים.'),
    ],
  },
  phonebook: {
    title: 'ספר טלפונים',
    description: 'ייבוא רשימות אנשי קשר וניקוי מחלקות. אסור ל-AI להמציא שם או מספר.',
    actions: [
      action('paste', 'יבוא חכם מטקסט', 'הדבק שורות של שם, מספר ומחלקה.'),
      action('departments', 'אחד שמות מחלקות', 'נרמל שמות מחלקות דומים.'),
      action('organize', 'ארגן אנשי קשר', 'סדר את אנשי הקשר לפי מחלקה ושם בלי לשנות מספרים.'),
      action('duplicates', 'מצא כפילויות', 'זהה כפילויות על בסיס הנתונים הקיימים והצג אותן בלי לשנות.', { readOnly: true }),
    ],
  },
  shuttles: {
    title: 'היסעים',
    description: 'המרת לו״ז חופשי לשורות יעד, שעה וסוג היסע.',
    actions: [
      action('paste', 'הדבק לו״ז היסעים', 'הדבק הודעת WhatsApp או רשימת נסיעות.'),
      action('normalize', 'אחד יעדים', 'אחד כתיב של יעדים ושמור על השעות.'),
      action('update', 'עדכן לו״ז', 'הדבק מידע חדש ועדכן רק נסיעות שניתן לזהות ממנו; שמור נסיעות לא קשורות.'),
      action('audit', 'בדוק לו״ז', 'מצא כפילויות ושעות חשודות והצג אותן בלי לשנות.', { readOnly: true }),
      action('order', 'סדר לפי שעה', 'סדר את הרשימה כרונולוגית.'),
    ],
  },
  polls: {
    title: 'סקרים ודעת קהל',
    description: 'יצירת שאלות ואפשרויות תשובה, בדיקת הטיה וסיכום תוצאות בלי להעביר זהויות מצביעים.',
    actions: [
      action('create', 'צור סקר מנושא', 'תאר מה אתה רוצה ללמוד וה-AI ייצור שאלה ואפשרויות.'),
      action('rewrite', 'שכתב שאלה ותשובות', 'שכתב במפורש את ניסוח השאלה והאפשרויות ושמור את כל נתוני ההצבעה.'),
      action('bias', 'בדוק הטיה', 'זהה שאלות מובילות והסבר כיצד לשפר אותן בלי לשנות את הסקר.', { readOnly: true }),
      action('rewrite-bias', 'שכתב לניטרלי', 'שכתב שאלות מובילות לניסוח ניטרלי ושמור נתוני הצבעה.'),
      action('options', 'בדוק תשובות', 'בדוק אם האפשרויות מכסות את התשובות הסבירות והצג המלצות בלי לשנות.', { readOnly: true }),
      action('results', 'סכם תוצאות', 'סכם את המספרים הקיימים בלי לשנות את הסקר.', { readOnly: true }),
    ],
  },
  celebrations: {
    title: 'חוגגים השבוע',
    description: 'ייבוא רשימת אירועים חגיגיים וניסוח תיאור/ברכה קצרה.',
    actions: [
      action('paste', 'הדבק רשימת השבוע', 'הדבק שמות, סוגי אירוע ותאריכים.'),
      action('greeting', 'נסח ברכה קצרה', 'צור תיאור קצר על בסיס האירוע שסופק בלבד.'),
      action('normalize', 'אחד סוגי אירועים', 'נרמל יום הולדת/דרגה/שחרור וכו׳.'),
    ],
  },
  heritage: {
    title: 'מורשת וציטוטים',
    description: 'קיצור ועיבוד מקורות קיימים. אין להמציא ציטוט או לייחס משפט לאדם שלא סיפקת.',
    actions: [
      action('shorten', 'קצר מסר מורשת', 'הדבק מקור/מסר קיים וקצר אותו.'),
      action('story', 'סיפור → מסר', 'הדבק סיפור וה-AI יפיק takeaway כ״מסר ארגוני״, לא כציטוט היסטורי.'),
      action('learning', 'צור מסרי למידה', 'הפק כמה מסרים מתוך מקור שסיפקת.'),
      action('wording', 'שפר ניסוח', 'שפר רק מסר מקורי, לא ציטוט מיוחס.'),
      action('attribution', 'בדוק ייחוס', 'סמן ייחוסים חסרים/חשודים בלי להמציא מקור.', { readOnly: true }),
    ],
  },
  tips: {
    title: 'טיפ השבוע',
    description: 'המרת נהלים ותוכן ארוך לטיפים קצרים ופרקטיים.',
    actions: [
      action('procedure', 'נוהל → טיפ', 'הדבק נוהל או הסבר ארוך.'),
      action('split', 'פצל לכמה טיפים', 'הפוך מסמך אחד לסדרת טיפים.'),
      action('practical', 'יותר פרקטי', 'הפוך הסבר כללי לפעולות ברורות.'),
      action('short', 'קצר ל-2 שורות', 'קצר את הטיפים הקיימים.'),
      action('titles', '3 כותרות חלופיות', 'צור שלוש חלופות לכותרות ושמור את תוכן הטיפים.', { alternatives: 3 }),
      action('audit', 'בדוק עקביות', 'בדוק טון, אורך ומבנה והצג מה לא אחיד בלי לשנות.', { readOnly: true }),
    ],
  },
  admins: {
    title: 'סנכרון מנהלים',
    description: 'הסבר בלבד על הסטטוס והפערים שמופיעים במסך. ה-AI לא מוסיף או מסיר הרשאות.',
    readOnly: true,
    actions: [
      action('explain', 'הסבר מה לא תואם', 'נתח את המידע שמופיע במסך והסבר את הפערים.', { readOnly: true }),
      action('logs', 'סכם שגיאות', 'סכם את השגיאות/לוגים המוצגים והצע צעדי בדיקה.', { readOnly: true }),
    ],
  },
  'site-owners': {
    title: 'בעלי אתר והרשאות',
    description: 'הסבר בלבד. ה-AI לא מעניק, מסיר או משנה הרשאה.',
    readOnly: true,
    actions: [
      action('explain', 'הסבר את המצב', 'סכם מי מופיע באילו מקורות ומה נראה לא תואם.', { readOnly: true }),
      action('logs', 'סכם לוגים', 'הסבר את הלוגים הטכניים בשפה פשוטה.', { readOnly: true }),
    ],
  },
  backups: {
    title: 'ניהול גיבויים',
    description: 'הסבר והשוואה בלבד. ה-AI לעולם לא מפעיל שחזור או מחיקה.',
    readOnly: true,
    actions: [
      action('explain', 'הסבר מה מוצג', 'סכם את מצב הגיבויים שמופיע במסך.', { readOnly: true }),
      action('restore', 'הסבר מה ישוחזר', 'הסבר את פרטי השחזור/הבחירה המוצגים בלי לבצע פעולה.', { readOnly: true }),
      action('risk', 'סכם סיכון', 'סכם פערים או סימני אזהרה במידע המוצג.', { readOnly: true }),
    ],
  },
  'ai-help': {
    title: 'עוזר AI',
    description: 'עזרה תפעולית לפי המסך והמידע שמוצג כרגע.',
    readOnly: true,
    actions: [
      action('explain', 'הסבר לי את המסך', 'ענה לפי מה שמופיע כרגע.', { readOnly: true }),
      action('what-next', 'מה כדאי לעשות עכשיו?', 'הצע את הצעד הבא על בסיס המידע המוצג.', { readOnly: true }),
    ],
  },
});

export function getAdminAiCapability(tab) {
  return ADMIN_AI_CAPABILITIES[tab] || ADMIN_AI_CAPABILITIES['ai-help'];
}

export function getAdminAiAction(tab, actionId) {
  const capability = getAdminAiCapability(tab);
  return capability.actions.find((item) => item.id === actionId) || capability.actions[0];
}

export function isAdminAiReadOnly(tab, actionId) {
  const capability = getAdminAiCapability(tab);
  const selected = getAdminAiAction(tab, actionId);
  return capability.readOnly === true || selected?.readOnly === true;
}

export function getAdminAiInstructionIssue(tab, actionId, instruction) {
  if (
    tab === 'countdown'
    && ['sentence', 'multiple', 'event'].includes(actionId)
    && !hasDateSignal(instruction)
  ) {
    return 'חסר תאריך או מועד ברור. יש לציין תאריך, שעה, או מועד יחסי מדויק כמו "מחר", כדי שלא יומצא תאריך.';
  }
  return '';
}

function pageSchema(tab) {
  const schemas = {
    info: '{"hero":{"siteName":"","title":"","subtitle":"","description":""},"commander":{"sectionTitle":"","roleLabel":"","messages":[{"id":"existing-or-empty","text":"","signature":""}]}}',
    links: '{"navItems":[{"id":"preserve-when-existing","label":"","icon":"Folder","url":"","children":[{"id":"","title":"","icon":"FileText","url":"","subLinks":[{"id":"","label":"","icon":"Link","url":""}]}]}]}',
    events: '{"events":[{"id":"","date":"YYYY-MM-DD","title":"","subtitle":"","color":"gray|red"}],"displayCount":3,"displayMode":"default","intervalMs":6000}',
    widgets: `{"activeWidgets":[${WIDGET_IDS.map((id) => `"${id}"`).join(',')}]}`,
    'current-widgets': '{"updates":{"events":[],"alerts":[],"outstanding":[],"countdown":{},"news":[],"phonebook":[],"shuttles":[],"polls":[],"celebrations":[],"heritage":[],"tips":[]}}',
    theme: '{"theme":{"primaryColor":"#0891b2","displayMode":"user-toggle|dark|light","borderStyle":"standard|square|cyber|armor|shield|blade","useTintedBackground":true,"tintedBackgroundStrength":72,"heroGrayscale":false,"heroGlassEffect":false,"heroGlassStrength":58,"topNavGlassEffect":false,"topNavGlassStrength":62,"showNavCategories":true,"regularLinksLayout":"sidebar-right|grid|compact|hq","externalLinksLayout":"cards|minimal|floating","externalLinksFixed":false,"externalLinksBordered":true,"externalLinksShowBackground":true,"widgetHeight":"full|high|medium|low"}}',
    'external-links': '{"items":[{"id":"","title":"","url":"","icon":"","iconUrl":""}]}',
    galleries: '{"items":[{"id":"","title":"","description":"","active":true,"style":"magal-strips|classic-carousel|center-carousel|coverflow|masonry","order":0,"images":[{"id":"","mediaRef":"PRESERVE","alt":"","caption":"","media":{"fileName":""}}]}]}',
    gantt: '{"gantt":{"enabled":true,"buttonLabel":"","pageTitle":"","description":"","groupBy":"category|owner|status|none","defaultView":"day|week|month|quarter","showLegend":true,"showToday":true,"categories":[{"id":"","name":"","color":"#2563eb","order":1}],"items":[{"id":"","title":"","owner":"","category":"","status":"planned|blocked|completed|cancelled|onHold","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","color":"#2563eb","details":"","dependsOn":[],"milestones":[{"id":"","title":"","date":"YYYY-MM-DD"}]}]}}',
    boom: '{"boom":{"enabled":true,"buttonLabel":"","pageTitle":"","description":"","design":{"preset":"operational|command-center|compact","showSummaryStrip":true,"summaryMetrics":["total|active|blocked|completed|overdue|upcoming|owners|categories"],"tableDensity":"compact|comfortable","showCategoryColors":true,"showSummaryChips":true,"accent":"primary|sky|emerald"},"categories":[{"id":"","name":"","color":"#2563eb","order":1}],"items":[{"id":"","title":"","owner":"","category":"","status":"planned|active|blocked|onHold|completed","startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD","details":""}]}}',
    'org-chart': '{"orgChart":{"enabled":true,"pageTitle":"","layoutDirection":"tree-center|step-rtl|step-ltr|3d-graph|flow-canvas","cardStyle":"classic|horizontal|large-avatar|compact","nodes":[{"id":"","name":"","rank":"","role":"","personalNumber":"","imageUrl":"PRESERVE","children":[]}]}}',
    alerts: '{"items":[{"id":"","title":"","text":"","isUrgent":false}]}',
    news: '{"items":[{"id":"","text":"","isUrgent":false}]}',
    outstanding: '{"items":[{"id":"","name":"","role":"","image":"PRESERVE","description":""}]}',
    countdown: '{"countdown":{"items":[{"id":"","title":"","targetDate":"ISO-8601","showDetails":false,"details":""}],"activeItemId":""}}',
    phonebook: '{"items":[{"id":"","name":"","number":"","department":""}]}',
    shuttles: '{"items":[{"id":"","destination":"","departureTime":"HH:MM","type":"bus|minibus"}]}',
    polls: '{"items":[{"id":"","question":"","active":true,"options":[{"id":"","text":"","votes":0}]}]}',
    celebrations: '{"items":[{"id":"","name":"","type":"","date":"YYYY-MM-DD","description":""}]}',
    heritage: '{"items":[{"id":"","quote":"","author":"","role":""}]}',
    tips: '{"items":[{"id":"","title":"","text":""}]}',
  };
  return schemas[tab] || '{"result":{}}';
}

function specialRules(tab) {
  const common = [
    'אל תמציא עובדות, שמות, תאריכים, מספרים, כתובות URL, דרגות או פרטים אישיים שלא הופיעו בקלט או במצב הקיים.',
    'שמור IDs קיימים כאשר אתה עורך פריט קיים.',
    'שמור ערכים שלא התבקשת לשנות.',
    'החזר מצב מלא ורצוי של החלק שאתה עורך, לא diff ולא הוראות טקסטואליות.',
    'כל הטקסט המוצג למשתמש צריך להיות בעברית טבעית וקצרה.',
  ];

  const rules = {
    links: ['אסור לשנות URL קיים אלא אם המשתמש סיפק URL חדש במפורש.', 'לפריטים חדשים ללא URL שסופק השאר url ריק.'],
    'external-links': ['אסור לשנות URL קיים ללא URL חדש מפורש בקלט.', 'אל תמציא URL.'],
    galleries: ['אינך רואה תמונות. אל תתאר תוכן חזותי שלא הופיע בשם הקובץ/alt/caption/הוראת המשתמש.', 'mediaRef, מידות וקובץ הם נתונים שמורים ואסור לשנות אותם.'],
    polls: ['אל תחזיר שמות/זהויות מצביעים.', 'votes הם נתונים קיימים שאסור להמציא או לשנות; אפשר לנסח את השאלה והאפשרויות.'],
    phonebook: ['אל תמציא שם או מספר טלפון. כל שם ומספר חדש חייב להופיע בהוראת המשתמש.', 'אפשר לנרמל רק מחלקה וניסוח.'],
    outstanding: ['אל תמציא הישגים או תכונות על אדם.', 'שמור תמונה קיימת.'],
    heritage: ['לעולם אל תמציא ציטוט או ייחוס.', 'אם אתה יוצר takeaway מסיפור, סמן אותו כמסר ארגוני ולא כציטוט היסטורי.'],
    'org-chart': ['אל תמציא אנשים, מספרים אישיים או דרגות.', 'שמור imageUrl קיים.'],
    gantt: ['אל תמציא זהות של אחראי. אם לא סופק אחראי, השאר owner ריק.', 'תאריכים חדשים חייבים להיות נגזרים מהקלט או מטווח/תאריך יעד שסופק; אם אין בסיס, שמור תאריכים קיימים.'],
    boom: ['אפשר ליצור או לעדכן משימות BOOM רק עם נתונים מהבקשה או מהמצב הקיים.', 'השתמש רק בסטטוסים, הגדרות עיצוב וערכי לוח בקרה שמופיעים בסכימה.', 'ההתקדמות מחושבת אוטומטית מתאריכי ההתחלה והסיום; אל תחזיר שדה progress.', 'כל משימה חייבת להפנות לקטגוריה קיימת. אפשר ליצור קטגוריה חדשה עם צבע hex תקין כשנדרש.'],
    'current-widgets': ['עדכן בעיקר את הווידג׳טים הפעילים שמופיעים ב-currentSnapshot.activeWidgets.', 'אל תמחוק מידע קיים שלא נדרש למחוק.'],
  };

  return [...common, ...(rules[tab] || [])];
}

function actionRules(tab, actionId) {
  const rules = {
    'events:add': ['שמור את כל האירועים הקיימים והוסף אירועים חדשים בלבד.'],
    'links:paste': ['שמור את כל ענפי הניווט הקיימים והוסף את הקישורים שסופקו.'],
    'external-links:paste': ['שמור קישורים קיימים והוסף רק קישורים שסופקו.'],
    'alerts:draft': ['שמור את כל ההודעות הקיימות והוסף הודעה חדשה מהמידע שסופק.'],
    'alerts:multiple': ['שמור את כל ההודעות הקיימות והוסף הודעות חדשות רק מהמידע שסופק.'],
    'news:flash': ['שמור את המבזקים הקיימים והוסף מבזק חדש מהטקסט שסופק.'],
    'news:split': ['שמור את המבזקים הקיימים והוסף מבזקים חדשים מהטקסט שסופק.'],
    'news:translate': ['שמור את המבזקים הקיימים והוסף מבזקים חדשים בעברית.'],
    'outstanding:points': ['עדכן תיאור של אדם קיים; הוסף אדם רק אם שמו הופיע בקלט.'],
    'countdown:sentence': ['שמור את הספירות הקיימות והוסף יעד חדש רק אם סופק תאריך.'],
    'countdown:multiple': ['שמור את הספירות הקיימות והוסף יעדים רק עבור תאריכים שסופקו.'],
    'countdown:event': ['שמור את הספירות הקיימות והוסף יעד חדש רק אם סופק תאריך.'],
    'phonebook:paste': ['שמור אנשי קשר קיימים והוסף רק שם ומספר שהופיעו בקלט.'],
    'shuttles:paste': ['שמור היסעים קיימים והוסף נסיעות חדשות מהקלט.'],
    'shuttles:update': ['שמור היסעים שלא הוזכרו ועדכן רק יעד או שעה שסופקו במפורש.'],
    'polls:create': ['שמור סקרים קיימים והוסף סקר חדש. רק סקר אחד יכול להיות פעיל.'],
    'celebrations:paste': ['שמור אירועים קיימים והוסף רק אנשים ואירועים שהופיעו בקלט.'],
    'heritage:story': ['שמור פריטים קיימים והוסף מסר ארגוני, לא ציטוט היסטורי.'],
    'heritage:learning': ['שמור פריטים קיימים והוסף מסרי למידה מהמקור בלבד.'],
    'tips:procedure': ['שמור טיפים קיימים והוסף טיפ חדש מהנוהל.'],
    'tips:split': ['שמור טיפים קיימים והוסף טיפים חדשים מהמסמך.'],
    'gantt:weekly': ['שמור משימות שלא הוזכרו ועדכן רק משימות שניתן לזהות מהקלט.'],
    'gantt:paste': ['שמור משימות קיימות והוסף משימות חדשות מהטקסט שסופק.'],
    'gantt:brief': ['שמור משימות קיימות אלא אם המשתמש ביקש במפורש לבנות תוכנית חלופית.'],
  };
  return rules[`${tab}:${actionId}`] || [];
}

export function buildAdminAiPrompt({ tab, actionId, instruction, currentSnapshot, visibleContext = '' }) {
  const capability = getAdminAiCapability(tab);
  const selected = getAdminAiAction(tab, actionId);
  const readOnly = capability.readOnly === true || selected?.readOnly === true;

  if (readOnly) {
    return [
      'אתה עוזר תפעולי בתוך Site Builder.',
      `מסך נוכחי: ${capability.title}.`,
      `פעולה: ${selected?.label || 'הסבר'}.`,
      'ענה בעברית ברורה וקצרה. הפרד בין עובדות שרואים במסך לבין מסקנות/המלצות.',
      'אל תטען שביצעת שינוי. אין לך הרשאה לבצע פעולות מערכת מתוך הבקשה הזו.',
      '',
      `בקשת המשתמש: ${instruction || selected?.hint || ''}`,
      ...(tab === 'countdown' ? [`תאריך נוכחי לחישוב מועדים יחסיים: ${new Date().toISOString()}`] : []),
      '',
      'מידע מוצג במסך (ייתכן חלקי):',
      String(visibleContext || '').slice(0, 10000),
      '',
      'נתונים מספריים/מבניים בטוחים:',
      JSON.stringify(currentSnapshot ?? null, null, 2).slice(0, 10000),
    ].join('\n');
  }

  const alternativeCount = selected?.alternatives || 1;
  const responseShape = alternativeCount > 1
    ? `החזר אובייקט JSON עם מפתח alternatives ובו בדיוק ${alternativeCount} חלופות. כל חלופה חייבת להתאים לסכימה הבאה: ${pageSchema(tab)}`
    : `החזר JSON בלבד וללא Markdown, בדיוק לפי הסכימה הבאה: ${pageSchema(tab)}`;

  return [
    'אתה עורך תוכן חכם בתוך Site Builder. הפלט שלך יחול אוטומטית על האתר ולכן חייב להיות שמרני, מדויק והפיך.',
    `מסך נוכחי: ${capability.title}.`,
    `פעולה שנבחרה: ${selected?.label || ''}.`,
    responseShape,
    '',
    'כללים מחייבים:',
    ...specialRules(tab).map((rule, index) => `${index + 1}. ${rule}`),
    ...actionRules(tab, actionId).map((rule, index) => `A${index + 1}. ${rule}`),
    '',
    `הוראת המשתמש: ${instruction || selected?.hint || ''}`,
    ...(tab === 'countdown' ? [`תאריך נוכחי לחישוב מועדים יחסיים: ${new Date().toISOString()}`] : []),
    '',
    'currentSnapshot:',
    JSON.stringify(currentSnapshot ?? null, null, 2),
  ].join('\n');
}

export function extractAdminAiCandidates(parsed) {
  if (parsed && Array.isArray(parsed.alternatives) && parsed.alternatives.length > 0) {
    return parsed.alternatives.filter((item) => item && typeof item === 'object');
  }
  return [parsed];
}

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function text(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function bounded(value, max, fallback = '') {
  return text(value, fallback).slice(0, max);
}

function makeId(prefix = 'ai') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}


function number(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeDate(value, fallback = '') {
  const raw = text(value, fallback);
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? raw : fallback;
}

function normalizeTime(value, fallback = '') {
  const raw = text(value, fallback);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function collectItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function existingById(items) {
  return new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id || ''), item]));
}

function normalizedDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function instructionContainsValue(instruction, value) {
  const needle = String(value || '').trim();
  if (!needle) return false;
  return String(instruction || '').toLocaleLowerCase('he').includes(needle.toLocaleLowerCase('he'));
}

function hasUrlLike(textValue) {
  return /(?:https?:\/\/|www\.|sharepoint|\/sites\/|\.com\b|\.il\b)/i.test(String(textValue || ''));
}

function hasDateSignal(value) {
  return /(?:\d{1,4}[./-]\d{1,2}(?:[./-]\d{1,4})?|\d{1,2}:\d{2}|היום|מחר|מחרתיים|בעוד\s+\d+\s*(?:יום|ימים|שבוע|שבועות|חודש|חודשים)|השבוע הבא|בסוף החודש|ינואר|פברואר|מרץ|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר)/i.test(String(value || ''));
}

function collectInstructionTimes(instruction) {
  const source = String(instruction || '');
  const explicitTimes = [...source.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)]
    .map((match) => `${match[1].padStart(2, '0')}:${match[2]}`);
  const bareHours = [...source.matchAll(/(?:בשעה|ב-)\s*([01]?\d|2[0-3])\b(?![:.]\d)/g)]
    .map((match) => `${match[1].padStart(2, '0')}:00`);
  return new Set([...explicitTimes, ...bareHours]);
}

function normalizeSiteContent(payload, current) {
  const source = payload?.hero || payload?.commander ? payload : (payload?.content || {});
  const currentHero = current?.hero || {};
  const currentCommander = current?.commander || {};
  const nextMessages = Array.isArray(source?.commander?.messages)
    ? source.commander.messages.slice(0, 5).map((item, index) => ({
        id: text(item?.id, currentCommander.messages?.[index]?.id || makeId('msg')),
        text: bounded(item?.text, 2500, currentCommander.messages?.[index]?.text || ''),
        signature: bounded(item?.signature, 250, currentCommander.messages?.[index]?.signature || ''),
      }))
    : clone(currentCommander.messages || []);

  return {
    ...clone(current),
    hero: {
      ...clone(currentHero),
      siteName: bounded(source?.hero?.siteName, 180, currentHero.siteName || ''),
      title: bounded(source?.hero?.title, 400, currentHero.title || ''),
      subtitle: bounded(source?.hero?.subtitle, 500, currentHero.subtitle || ''),
      description: bounded(source?.hero?.description, 1600, currentHero.description || ''),
      logo: currentHero.logo || currentHero.logoUrl || '',
      logoUrl: currentHero.logoUrl || currentHero.logo || '',
      backgroundImages: clone(currentHero.backgroundImages || currentHero.backgroundImageUrls || []),
      backgroundImageUrls: clone(currentHero.backgroundImageUrls || currentHero.backgroundImages || []),
    },
    commander: {
      ...clone(currentCommander),
      image: currentCommander.image || currentCommander.imageUrl || '',
      imageUrl: currentCommander.imageUrl || currentCommander.image || '',
      sectionTitle: bounded(source?.commander?.sectionTitle, 240, currentCommander.sectionTitle || ''),
      roleLabel: bounded(source?.commander?.roleLabel, 240, currentCommander.roleLabel || ''),
      messages: nextMessages,
    },
  };
}

function normalizeNavigation(payload, current, instruction, actionId) {
  const source = Array.isArray(payload?.navItems) ? payload.navItems : (Array.isArray(payload?.items) ? payload.items : []);
  if (!source.length) return clone(current || []);
  const topExisting = existingById(current);
  const allowNewUrls = hasUrlLike(instruction);

  const mapLink = (item, index, existing) => {
    const requestedUrl = text(item?.url);
    const explicitlySuppliedUrl = allowNewUrls && requestedUrl && instructionContainsValue(instruction, requestedUrl);
    const safeUrl = explicitlySuppliedUrl ? requestedUrl : existing?.url || '';
    return {
      id: text(item?.id, existing?.id || makeId(`nav-link-${index}`)),
      label: bounded(item?.label || item?.title, 180, existing?.label || existing?.title || `לינק ${index + 1}`),
      kind: existing?.kind || 'link',
      icon: bounded(item?.icon, 80, existing?.icon || 'Link'),
      iconUrl: existing?.iconUrl || '',
      url: safeUrl,
    };
  };

  return source.slice(0, 12).map((cat, catIndex) => {
    const existingCat = topExisting.get(String(cat?.id || ''))
      || (!['build', 'paste'].includes(actionId) ? current?.[catIndex] : undefined);
    const existingChildren = existingById(existingCat?.children);
    const childSource = Array.isArray(cat?.children) ? cat.children : (existingCat?.children || []);
    return {
      id: text(cat?.id, existingCat?.id || makeId(`nav-cat-${catIndex}`)),
      label: bounded(cat?.label || cat?.title, 180, existingCat?.label || `קטגוריה ${catIndex + 1}`),
      kind: existingCat?.kind || 'folder',
      icon: bounded(cat?.icon, 80, existingCat?.icon || 'Folder'),
      iconUrl: existingCat?.iconUrl || '',
      url: allowNewUrls && instructionContainsValue(instruction, cat?.url) ? text(cat?.url) : existingCat?.url || '',
      children: childSource.map((sub, subIndex) => {
        const existingSub = existingChildren.get(String(sub?.id || ''))
          || (!['build', 'paste'].includes(actionId) ? existingCat?.children?.[subIndex] : undefined);
        const existingLinks = existingById(existingSub?.subLinks || existingSub?.children);
        const linkSource = Array.isArray(sub?.subLinks)
          ? sub.subLinks
          : (Array.isArray(sub?.children) ? sub.children : (existingSub?.subLinks || existingSub?.children || []));
        return {
          id: text(sub?.id, existingSub?.id || makeId(`nav-sub-${catIndex}-${subIndex}`)),
          title: bounded(sub?.title || sub?.label, 180, existingSub?.title || existingSub?.label || `כרטיסייה ${subIndex + 1}`),
          label: bounded(sub?.title || sub?.label, 180, existingSub?.title || existingSub?.label || `כרטיסייה ${subIndex + 1}`),
          kind: existingSub?.kind || 'folder',
          icon: bounded(sub?.icon, 80, existingSub?.icon || 'FileText'),
          iconUrl: existingSub?.iconUrl || '',
          url: allowNewUrls && instructionContainsValue(instruction, sub?.url) ? text(sub?.url) : existingSub?.url || '',
          subLinks: linkSource.map((link, linkIndex) => mapLink(
            link,
            linkIndex,
            existingLinks.get(String(link?.id || ''))
              || (!['build', 'paste'].includes(actionId) ? existingSub?.subLinks?.[linkIndex] : undefined)
          )),
        };
      }),
    };
  });
}

function normalizeEvents(payload, current) {
  const currentEvents = Array.isArray(current?.events) ? current.events : [];
  const byId = existingById(currentEvents);
  const source = Array.isArray(payload?.events) ? payload.events : collectItems(payload);
  const nextEvents = (source.length ? source : currentEvents).slice(0, 40).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    return {
      ...(clone(existing) || {}),
      id: text(item?.id, existing?.id || makeId(`event-${index}`)),
      date: safeDate(item?.date, existing?.date || ''),
      title: bounded(item?.title, 240, existing?.title || ''),
      subtitle: bounded(item?.subtitle, 1400, existing?.subtitle || ''),
      subtitleRichText: clone(existing?.subtitleRichText || []),
      linkLabels: clone(existing?.linkLabels || {}),
      color: item?.color === 'red' ? 'red' : (item?.color === 'gray' ? 'gray' : (existing?.color || 'gray')),
    };
  }).filter((item) => item.title || item.date);

  return {
    events: nextEvents,
    displayCount: Math.round(number(payload?.displayCount, current?.displayCount || 3, 1, Math.max(1, nextEvents.length || 1))),
    displayMode: text(payload?.displayMode, current?.displayMode || 'default'),
    intervalMs: Math.round(number(payload?.intervalMs, current?.intervalMs || 6000, 2000, 60000)),
  };
}

function normalizeWidgetSelection(payload, current) {
  const source = Array.isArray(payload?.activeWidgets) ? payload.activeWidgets : [];
  const activeWidgets = [...new Set(source.filter((id) => WIDGET_IDS.includes(id)))].slice(0, 3);
  return {
    activeWidgets: activeWidgets.length ? activeWidgets : clone(current?.activeWidgets || ['events']),
  };
}

const THEME_ENUMS = {
  displayMode: ['user-toggle', 'dark', 'light'],
  borderStyle: ['standard', 'square', 'cyber', 'armor', 'shield', 'blade'],
  regularLinksLayout: ['sidebar-right', 'grid', 'compact', 'hq'],
  externalLinksLayout: ['cards', 'minimal', 'floating'],
  widgetHeight: ['full', 'high', 'medium', 'low'],
};

function normalizeTheme(payload, current) {
  const source = payload?.theme || payload || {};
  const next = { ...clone(current) };
  const stringFields = ['primaryColor', 'displayMode', 'borderStyle', 'regularLinksLayout', 'externalLinksLayout', 'widgetHeight'];
  const booleanFields = ['useTintedBackground', 'heroGrayscale', 'heroGlassEffect', 'topNavGlassEffect', 'heroPanelsBordered', 'commanderPanelBordered', 'widgetPanelBordered', 'showNavCategories', 'externalLinksFixed', 'externalLinksBordered', 'externalLinksShowBackground'];
  const numericFields = ['tintedBackgroundStrength', 'heroGlassStrength', 'topNavGlassStrength'];

  stringFields.forEach((field) => {
    const value = text(source?.[field]);
    if (!value) return;
    if (field === 'primaryColor') {
      if (/^#[0-9a-f]{6}$/i.test(value)) next[field] = value;
      return;
    }
    if (THEME_ENUMS[field]?.includes(value)) next[field] = value;
  });
  booleanFields.forEach((field) => {
    if (typeof source?.[field] === 'boolean') next[field] = source[field];
  });
  numericFields.forEach((field) => {
    if (Number.isFinite(Number(source?.[field]))) next[field] = Math.round(number(source[field], current?.[field] || 0, 0, 100));
  });
  return next;
}

function normalizeExternalLinks(payload, current, instruction, actionId) {
  const currentItems = Array.isArray(current) ? current : [];
  const byId = existingById(currentItems);
  const allowNewUrls = hasUrlLike(instruction);
  const source = collectItems(payload);
  if (!source.length) return clone(currentItems);
  return source.slice(0, 80).map((item, index) => {
    const existing = byId.get(String(item?.id || '')) || (actionId === 'paste' ? undefined : currentItems[index]);
    const requestedUrl = text(item?.url);
    const explicitlySuppliedUrl = allowNewUrls && requestedUrl && instructionContainsValue(instruction, requestedUrl);
    const url = explicitlySuppliedUrl ? requestedUrl : existing?.url || '';
    return {
      ...(clone(existing) || {}),
      id: text(item?.id, existing?.id || makeId(`external-${index}`)),
      title: bounded(item?.title, 180, existing?.title || ''),
      url,
      icon: bounded(item?.icon, 80, existing?.icon || ''),
      iconUrl: existing?.iconUrl || existing?.image || '',
      image: existing?.image || existing?.iconUrl || '',
      order: index,
    };
  }).filter((item) => item.title || item.url);
}

function normalizeGalleries(payload, current) {
  const source = collectItems(payload);
  if (!source.length) return clone(current || []);
  const byId = existingById(current);
  const styles = ['magal-strips', 'classic-carousel', 'center-carousel', 'coverflow', 'masonry'];
  return source.slice(0, 50).map((item, index) => {
    const existing = byId.get(String(item?.id || '')) || current?.[index] || {};
    const existingImages = existingById(existing?.images);
    const requestedImages = Array.isArray(item?.images) ? item.images : existing?.images || [];
    return {
      ...clone(existing),
      id: text(item?.id, existing?.id || makeId(`gallery-${index}`)),
      title: bounded(item?.title, 180, existing?.title || ''),
      description: bounded(item?.description, 2000, existing?.description || ''),
      active: typeof item?.active === 'boolean' ? item.active : existing?.active !== false,
      style: styles.includes(item?.style) ? item.style : (existing?.style || 'classic-carousel'),
      order: index,
      display: clone(existing?.display || {}),
      images: requestedImages.map((image, imageIndex) => {
        const existingImage = existingImages.get(String(image?.id || '')) || existing?.images?.[imageIndex] || {};
        return {
          ...clone(existingImage),
          id: text(image?.id, existingImage?.id || makeId(`gallery-image-${imageIndex}`)),
          mediaRef: existingImage?.mediaRef || '',
          alt: bounded(image?.alt, 500, existingImage?.alt || ''),
          caption: bounded(image?.caption, 1000, existingImage?.caption || ''),
          width: existingImage?.width,
          height: existingImage?.height,
          media: clone(existingImage?.media || {}),
        };
      }),
    };
  });
}

function flattenOrgNodes(nodes, acc = []) {
  (Array.isArray(nodes) ? nodes : []).forEach((node) => {
    acc.push(node);
    flattenOrgNodes(node?.children, acc);
  });
  return acc;
}

function normalizeOrgChart(payload, current, instruction, actionId) {
  const source = payload?.orgChart || payload || {};
  const currentFlat = flattenOrgNodes(current?.nodes || []);
  const currentById = existingById(currentFlat);
  const layoutValues = ['tree-center', 'step-rtl', 'step-ltr', '3d-graph', 'flow-canvas'];
  const cardValues = ['classic', 'horizontal', 'large-avatar', 'compact'];

  const mapNodes = (nodes, path = 'root') => (Array.isArray(nodes) ? nodes : []).slice(0, 250).map((node, index) => {
    const existing = currentById.get(String(node?.id || ''));
    const requestedName = bounded(node?.name, 180, existing?.name || '');
    const requestedRank = bounded(node?.rank, 120, existing?.rank || '');
    const requestedRole = bounded(node?.role, 240, existing?.role || '');
    const requestedPersonalNumber = bounded(node?.personalNumber, 80, existing?.personalNumber || '');
    const safeName = existing?.name || (requestedName && instructionContainsValue(instruction, requestedName) ? requestedName : '');
    const mayNormalizeExisting = actionId === 'normalize' && Boolean(existing);
    const safeRank = mayNormalizeExisting
      ? requestedRank
      : existing?.rank || (requestedRank && instructionContainsValue(instruction, requestedRank) ? requestedRank : '');
    const safeRole = mayNormalizeExisting
      ? requestedRole
      : existing?.role || (requestedRole && instructionContainsValue(instruction, requestedRole) ? requestedRole : '');
    const safePersonalNumber = existing?.personalNumber || (requestedPersonalNumber && instructionContainsValue(instruction, requestedPersonalNumber) ? requestedPersonalNumber : '');
    return {
      ...clone(existing),
      id: text(node?.id, existing?.id || makeId(`org-${path}-${index}`)),
      name: safeName,
      rank: safeRank,
      role: safeRole,
      personalNumber: safePersonalNumber,
      imageUrl: existing?.imageUrl || existing?.image || '',
      children: mapNodes(Array.isArray(node?.children) ? node.children : existing?.children, `${path}-${index}`),
    };
  }).filter((node) => node.name || node.role || node.children.length);

  return {
    ...clone(current),
    enabled: typeof source?.enabled === 'boolean' ? source.enabled : current?.enabled,
    pageTitle: bounded(source?.pageTitle, 180, current?.pageTitle || ''),
    layoutDirection: layoutValues.includes(source?.layoutDirection) ? source.layoutDirection : current?.layoutDirection,
    cardStyle: cardValues.includes(source?.cardStyle) ? source.cardStyle : current?.cardStyle,
    nodes: Array.isArray(source?.nodes) ? mapNodes(source.nodes) : clone(current?.nodes || []),
  };
}

function normalizeGantt(payload, current, instruction, actionId) {
  const source = payload?.gantt || payload || {};
  const currentItems = Array.isArray(current?.items) ? current.items : [];
  const currentById = existingById(currentItems);
  const currentCategories = Array.isArray(current?.categories) ? current.categories : [];
  const categoryById = existingById(currentCategories);
  const statuses = ['planned', 'blocked', 'completed', 'cancelled', 'onHold'];
  const groupValues = ['category', 'owner', 'status', 'none'];
  const viewValues = ['day', 'week', 'month', 'quarter'];
  const colors = ['#2563eb', '#0891b2', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0f766e', '#475569'];
  const currentDates = currentItems
    .flatMap((item) => [safeDate(item?.startDate), safeDate(item?.endDate)])
    .filter(Boolean)
    .sort();
  const currentRangeStart = currentDates[0] || '';
  const currentRangeEnd = currentDates[currentDates.length - 1] || '';
  const instructionHasDate = hasDateSignal(instruction);
  const dateWithinCurrentRange = (value) => {
    const normalized = safeDate(value);
    return Boolean(normalized && currentRangeStart && currentRangeEnd && normalized >= currentRangeStart && normalized <= currentRangeEnd);
  };

  const categories = Array.isArray(source?.categories) ? source.categories.map((cat, index) => {
    const existing = categoryById.get(String(cat?.id || '')) || currentCategories.find((item) => item?.name === cat?.name);
    return {
      ...(clone(existing) || {}),
      id: text(cat?.id, existing?.id || makeId(`gantt-category-${index}`)),
      name: bounded(cat?.name, 160, existing?.name || `תחום ${index + 1}`),
      color: colors.includes(cat?.color) ? cat.color : (existing?.color || colors[index % colors.length]),
      order: index + 1,
    };
  }) : clone(currentCategories);

  const sourceItems = Array.isArray(source?.items) ? source.items : currentItems;
  const items = sourceItems.slice(0, 250).map((item, index) => {
    const existing = currentById.get(String(item?.id || ''))
      || currentItems.find((currentItem) => currentItem?.title && currentItem.title === item?.title);
    const requestedOwner = bounded(item?.owner, 180, existing?.owner || '');
    const ownerWasSupplied = requestedOwner && instructionContainsValue(instruction, requestedOwner);
    const owner = ownerWasSupplied ? requestedOwner : existing?.owner || '';
    const mayUseRequestedDates = Boolean(existing) || instructionHasDate || (
      dateWithinCurrentRange(item?.startDate) && dateWithinCurrentRange(item?.endDate || item?.startDate)
    );
    const startDate = mayUseRequestedDates ? safeDate(item?.startDate, existing?.startDate || '') : '';
    const endDate = mayUseRequestedDates ? safeDate(item?.endDate, existing?.endDate || startDate || '') : '';
    const milestones = Array.isArray(item?.milestones) ? item.milestones.slice(0, 30).map((milestone, milestoneIndex) => {
      const existingMilestone = existingById(existing?.milestones).get(String(milestone?.id || ''))
        || existing?.milestones?.find((entry) => entry?.title && entry.title === milestone?.title)
        || (actionId === 'milestones' ? undefined : existing?.milestones?.[milestoneIndex]);
      const requestedDate = safeDate(milestone?.date);
      const dateIsWithinTask = Boolean(requestedDate && startDate && endDate && requestedDate >= startDate && requestedDate <= endDate);
      return {
        id: text(milestone?.id, existingMilestone?.id || makeId(`milestone-${index}-${milestoneIndex}`)),
        title: bounded(milestone?.title, 180, existingMilestone?.title || ''),
        date: existingMilestone?.date || instructionHasDate || dateIsWithinTask
          ? safeDate(milestone?.date, existingMilestone?.date || startDate)
          : '',
      };
    }).filter((milestone) => milestone.title && milestone.date) : clone(existing?.milestones || []);
    return {
      ...(clone(existing) || {}),
      id: text(item?.id, existing?.id || makeId(`gantt-task-${index}`)),
      title: bounded(item?.title, 240, existing?.title || ''),
      owner,
      category: bounded(item?.category, 160, existing?.category || categories?.[0]?.name || 'כללי'),
      status: statuses.includes(item?.status) ? item.status : (existing?.status || 'planned'),
      startDate,
      endDate,
      color: colors.includes(item?.color) ? item.color : (existing?.color || categories?.find((cat) => cat.name === item?.category)?.color || colors[0]),
      details: bounded(item?.details, 3000, existing?.details || ''),
      dependsOn: Array.isArray(item?.dependsOn) ? item.dependsOn.map(String).slice(0, 30) : clone(existing?.dependsOn || []),
      milestones,
      recurrence: clone(existing?.recurrence),
    };
  }).filter((item) => item.title && item.startDate && item.endDate);

  return {
    ...clone(current),
    enabled: typeof source?.enabled === 'boolean' ? source.enabled : current?.enabled,
    buttonLabel: bounded(source?.buttonLabel, 120, current?.buttonLabel || 'גאנט עבודה'),
    pageTitle: bounded(source?.pageTitle, 180, current?.pageTitle || 'גאנט עבודה'),
    description: bounded(source?.description, 1200, current?.description || ''),
    groupBy: groupValues.includes(source?.groupBy) ? source.groupBy : current?.groupBy,
    defaultView: viewValues.includes(source?.defaultView) ? source.defaultView : current?.defaultView,
    showLegend: typeof source?.showLegend === 'boolean' ? source.showLegend : current?.showLegend,
    showToday: typeof source?.showToday === 'boolean' ? source.showToday : current?.showToday,
    categories,
    items,
  };
}

function normalizeBoom(payload, current) {
  const source = payload?.boom || payload || {};
  const baseline = normalizeBoomData(current);
  const currentTasks = existingById(baseline.items);
  const currentCategories = baseline.categories;
  const categoryById = existingById(currentCategories);

  const categories = Array.isArray(source.categories)
    ? source.categories.slice(0, 80).map((category, index) => {
      const existing = categoryById.get(String(category?.id || ''))
        || currentCategories.find((item) => item.name.toLocaleLowerCase('he') === text(category?.name).toLocaleLowerCase('he'));
      return {
        ...(clone(existing) || {}),
        id: text(category?.id, existing?.id || makeId(`boom-category-${index}`)),
        name: bounded(category?.name, 160, existing?.name || `תחום ${index + 1}`),
        color: isValidBoomColor(category?.color) ? category.color : (existing?.color || '#2563eb'),
        order: index + 1,
      };
    }).filter((category) => category.name)
    : clone(currentCategories);

  const categoryByName = new Map(categories.map((category) => [category.name.toLocaleLowerCase('he'), category]));
  const items = Array.isArray(source.items)
    ? source.items.slice(0, 250).map((item, index) => {
      const existing = currentTasks.get(String(item?.id || ''));
      const requestedCategory = bounded(item?.category, 160, existing?.category || categories[0]?.name || 'כללי');
      const matchedCategory = categoryByName.get(requestedCategory.toLocaleLowerCase('he'));
      const startDate = safeDate(item?.startDate, existing?.startDate || '');
      const requestedEndDate = safeDate(item?.endDate, existing?.endDate || startDate);
      const endDate = startDate && requestedEndDate && requestedEndDate < startDate ? startDate : requestedEndDate;
      return {
        ...(clone(existing) || {}),
        id: text(item?.id, existing?.id || makeId(`boom-task-${index}`)),
        title: bounded(item?.title, 240, existing?.title || ''),
        owner: bounded(item?.owner, 180, existing?.owner || ''),
        category: matchedCategory?.name || requestedCategory,
        status: ['planned', 'active', 'blocked', 'onHold', 'completed'].includes(item?.status)
          ? item.status
          : (existing?.status || 'planned'),
        startDate,
        endDate,
        details: bounded(item?.details, 3000, existing?.details || ''),
        color: matchedCategory?.color || (isValidBoomColor(item?.color) ? item.color : existing?.color || '#2563eb'),
      };
    }).filter((item) => item.title)
    : clone(baseline.items);

  return normalizeBoomData({
    ...baseline,
    enabled: typeof source.enabled === 'boolean' ? source.enabled : baseline.enabled,
    buttonLabel: bounded(source.buttonLabel, 120, baseline.buttonLabel),
    pageTitle: bounded(source.pageTitle, 180, baseline.pageTitle),
    description: bounded(source.description, 1200, baseline.description),
    design: { ...baseline.design, ...(source.design && typeof source.design === 'object' ? source.design : {}) },
    categories,
    items,
  });
}

function normalizeAlerts(payload, current, instruction) {
  const byId = existingById(current);
  return collectItems(payload).slice(0, 80).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    return {
      id: text(item?.id, existing?.id || makeId(`alert-${index}`)),
      title: bounded(item?.title, 180, existing?.title || ''),
      text: bounded(item?.text, 1600, existing?.text || ''),
      isUrgent: existing?.isUrgent === true || (
        item?.isUrgent === true
        && /דחוף|קריטי|סכנה|מייד/i.test(String(instruction || ''))
        && !/אל תסמן[^.]{0,40}קריטי/i.test(String(instruction || ''))
      ),
    };
  }).filter((item) => item.text);
}

function normalizeNews(payload, current) {
  const byId = existingById(current);
  return collectItems(payload).slice(0, 100).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    return {
      id: text(item?.id, existing?.id || makeId(`news-${index}`)),
      text: bounded(item?.text, 800, existing?.text || ''),
      isUrgent: typeof item?.isUrgent === 'boolean' ? item.isUrgent : existing?.isUrgent === true,
    };
  }).filter((item) => item.text);
}

function normalizeOutstanding(payload, current, instruction) {
  const byId = existingById(current);
  return collectItems(payload).slice(0, 60).map((item, index) => {
    const existing = byId.get(String(item?.id || '')) || current?.find((person) => person?.name && person.name === item?.name);
    const requestedName = bounded(item?.name, 180, existing?.name || '');
    const requestedRole = bounded(item?.role, 240, existing?.role || '');
    return {
      ...(clone(existing) || {}),
      id: text(item?.id, existing?.id || makeId(`outstanding-${index}`)),
      name: existing?.name || (instructionContainsValue(instruction, requestedName) ? requestedName : ''),
      role: existing?.role || (instructionContainsValue(instruction, requestedRole) ? requestedRole : ''),
      image: existing?.image || existing?.imageUrl || '',
      imageUrl: existing?.imageUrl || existing?.image || '',
      description: bounded(item?.description, 1800, existing?.description || ''),
    };
  }).filter((item) => item.name);
}

function normalizeCountdown(payload, current, instruction) {
  const source = payload?.countdown || payload || {};
  const currentItems = Array.isArray(current?.items) ? current.items : [];
  const byId = existingById(currentItems);
  const requested = Array.isArray(source?.items) ? source.items : currentItems;
  const items = requested.slice(0, 50).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    return {
      id: text(item?.id, existing?.id || makeId(`countdown-${index}`)),
      title: bounded(item?.title, 240, existing?.title || ''),
      targetDate: hasDateSignal(instruction) ? safeDate(item?.targetDate, existing?.targetDate || '') : existing?.targetDate || '',
      showDetails: typeof item?.showDetails === 'boolean' ? item.showDetails : existing?.showDetails === true,
      details: bounded(item?.details, 1600, existing?.details || ''),
    };
  }).filter((item) => item.title && item.targetDate);
  const validIds = new Set(items.map((item) => item.id));
  const activeItemId = validIds.has(String(source?.activeItemId || ''))
    ? String(source.activeItemId)
    : (validIds.has(String(current?.activeItemId || '')) ? String(current.activeItemId) : items[0]?.id || null);
  const active = items.find((item) => item.id === activeItemId) || items[0] || {};
  return {
    ...clone(current),
    items,
    activeItemId,
    title: active.title || '',
    targetDate: active.targetDate || '',
    details: active.details || '',
    showDetails: active.showDetails || false,
  };
}

function normalizePhonebook(payload, current, instruction) {
  const byId = existingById(current);
  const suppliedNumbers = new Set(
    (String(instruction || '').match(/[+]?\d[\d\s\-()]{5,}\d/g) || []).map(normalizedDigits)
  );
  return collectItems(payload).slice(0, 200).map((item, index) => {
    const existing = byId.get(String(item?.id || '')) || current?.find((contact) => contact?.name && contact.name === item?.name);
    const requestedNumber = bounded(item?.number, 80, existing?.number || '');
    const requestedDigits = normalizedDigits(requestedNumber);
    const safeNumber = suppliedNumbers.has(requestedDigits) ? requestedNumber : existing?.number || '';
    const requestedName = bounded(item?.name, 180, existing?.name || '');
    const safeName = existing?.name || (requestedName && instructionContainsValue(instruction, requestedName) ? requestedName : '');
    return {
      id: text(item?.id, existing?.id || makeId(`contact-${index}`)),
      name: safeName,
      number: safeNumber,
      department: bounded(item?.department, 180, existing?.department || ''),
    };
  }).filter((item) => item.name && item.number);
}

function normalizeShuttles(payload, current, instruction) {
  const byId = existingById(current);
  const suppliedTimes = collectInstructionTimes(instruction);
  return collectItems(payload).slice(0, 100).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    const requestedTime = normalizeTime(item?.departureTime, '');
    return {
      id: text(item?.id, existing?.id || makeId(`shuttle-${index}`)),
      destination: bounded(item?.destination, 240, existing?.destination || ''),
      departureTime: suppliedTimes.has(requestedTime) ? requestedTime : existing?.departureTime || '',
      type: item?.type === 'minibus' ? 'minibus' : (item?.type === 'bus' ? 'bus' : existing?.type || 'bus'),
    };
  }).filter((item) => item.destination && item.departureTime)
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime));
}

function ensureOneActivePoll(items) {
  if (!items.length) return items;
  const activeIndex = Math.max(0, items.findIndex((item) => item.active));
  return items.map((item, index) => ({ ...item, active: index === activeIndex }));
}

function normalizePolls(payload, current, actionId) {
  const byId = existingById(current);
  const items = collectItems(payload).slice(0, 50).map((item, index) => {
    const existing = byId.get(String(item?.id || ''))
      || current?.find((poll) => poll?.question === item?.question)
      || (actionId === 'create' ? undefined : current?.[index]);
    const existingOptions = existingById(existing?.options);
    const options = (Array.isArray(item?.options) ? item.options : existing?.options || []).slice(0, 20).map((option, optionIndex) => {
      const existingOption = existingOptions.get(String(option?.id || ''))
        || existing?.options?.find((entry) => entry?.text === option?.text)
        || existing?.options?.[optionIndex];
      return {
        ...(clone(existingOption) || {}),
        id: text(option?.id, existingOption?.id || makeId(`poll-option-${index}-${optionIndex}`)),
        text: bounded(option?.text, 280, existingOption?.text || ''),
        votes: Number.isFinite(Number(existingOption?.votes)) ? Number(existingOption.votes) : 0,
        voters: clone(existingOption?.voters || []),
      };
    }).filter((option) => option.text);
    return {
      ...(clone(existing) || {}),
      id: text(item?.id, existing?.id || makeId(`poll-${index}`)),
      question: bounded(item?.question, 500, existing?.question || ''),
      active: typeof item?.active === 'boolean' ? item.active : existing?.active !== false,
      options,
    };
  }).filter((item) => item.question && item.options.length);
  return ensureOneActivePoll(items);
}

function normalizeCelebrations(payload, current, instruction) {
  const byId = existingById(current);
  return collectItems(payload).slice(0, 100).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    const requestedName = bounded(item?.name, 180, existing?.name || '');
    const requestedType = bounded(item?.type, 180, existing?.type || '');
    return {
      id: text(item?.id, existing?.id || makeId(`celebration-${index}`)),
      name: existing?.name || (instructionContainsValue(instruction, requestedName) ? requestedName : ''),
      type: existing?.type || (instructionContainsValue(instruction, requestedType) ? requestedType : ''),
      date: hasDateSignal(instruction) ? safeDate(item?.date, existing?.date || '') : existing?.date || '',
      description: bounded(item?.description, 1000, existing?.description || ''),
    };
  }).filter((item) => item.name && item.type && item.date);
}

function normalizeHeritage(payload, current, instruction) {
  const byId = existingById(current);
  return collectItems(payload).slice(0, 80).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    const requestedQuote = bounded(item?.quote, 2000, existing?.quote || '');
    const requestedAuthor = bounded(item?.author, 180, existing?.author || '');
    const isOrganizational = requestedAuthor === 'מסר ארגוני' || requestedAuthor === 'מסר למידה';
    const existingIsOrganizational = existing?.author === 'מסר ארגוני' || existing?.author === 'מסר למידה';
    const quoteAllowed = !existing?.quote || existingIsOrganizational || isOrganizational;
    const authorAllowed = !existing?.author || existingIsOrganizational || isOrganizational;
    return {
      id: text(item?.id, existing?.id || makeId(`heritage-${index}`)),
      quote: quoteAllowed && (isOrganizational || instructionContainsValue(instruction, requestedQuote) || existingIsOrganizational)
        ? requestedQuote
        : existing?.quote || '',
      author: authorAllowed && (isOrganizational || instructionContainsValue(instruction, requestedAuthor) || existingIsOrganizational)
        ? requestedAuthor
        : existing?.author || '',
      role: bounded(item?.role, 240, existing?.role || ''),
    };
  }).filter((item) => item.quote && item.author);
}

function normalizeTips(payload, current) {
  const byId = existingById(current);
  return collectItems(payload).slice(0, 100).map((item, index) => {
    const existing = byId.get(String(item?.id || ''));
    return {
      id: text(item?.id, existing?.id || makeId(`tip-${index}`)),
      title: bounded(item?.title, 240, existing?.title || ''),
      text: bounded(item?.text, 1600, existing?.text || ''),
    };
  }).filter((item) => item.title && item.text);
}

function normalizeCurrentWidgets(payload, current, instruction) {
  const updates = payload?.updates || payload || {};
  const activeWidgets = Array.isArray(current?.activeWidgets) ? current.activeWidgets : [];
  const next = clone(current);
  activeWidgets.forEach((widgetId) => {
    if (!Object.prototype.hasOwnProperty.call(updates, widgetId)) return;
    const candidate = updates[widgetId];
    if (widgetId === 'events') {
      next.events = normalizeEvents({ events: candidate }, { events: current?.events || [], displayCount: current?.displayCount || 3, displayMode: current?.displayMode || 'default', intervalMs: current?.intervalMs || 6000 }).events;
    } else if (widgetId === 'alerts') next.alerts = normalizeAlerts({ items: candidate }, current?.alerts || []);
    else if (widgetId === 'outstanding') next.outstanding = normalizeOutstanding({ items: candidate }, current?.outstanding || []);
    else if (widgetId === 'countdown') next.countdown = normalizeCountdown({ countdown: candidate }, current?.countdown || {});
    else if (widgetId === 'news') next.news = normalizeNews({ items: candidate }, current?.news || []);
    else if (widgetId === 'phonebook') next.phonebook = normalizePhonebook({ items: candidate }, current?.phonebook || [], instruction);
    else if (widgetId === 'shuttles') next.shuttles = normalizeShuttles({ items: candidate }, current?.shuttles || [], instruction);
    else if (widgetId === 'polls') next.polls = normalizePolls({ items: candidate }, current?.polls || []);
    else if (widgetId === 'celebrations') next.celebrations = normalizeCelebrations({ items: candidate }, current?.celebrations || []);
    else if (widgetId === 'heritage') next.heritage = normalizeHeritage({ items: candidate }, current?.heritage || [], instruction);
    else if (widgetId === 'tips') next.tips = normalizeTips({ items: candidate }, current?.tips || []);
  });
  return next;
}

function mergeListPreservingBaseline(baseline, candidate, keyFields = ['id']) {
  const result = Array.isArray(baseline) ? clone(baseline) : [];
  const keyOf = (item) => {
    for (const field of keyFields) {
      const value = String(item?.[field] || '').trim().toLocaleLowerCase('he');
      if (value) return `${field}:${value}`;
    }
    return '';
  };
  const indexByKey = new Map();
  result.forEach((item, index) => {
    const key = keyOf(item);
    if (key) indexByKey.set(key, index);
  });
  (Array.isArray(candidate) ? candidate : []).forEach((item) => {
    const key = keyOf(item);
    const existingIndex = key ? indexByKey.get(key) : undefined;
    if (existingIndex !== undefined) {
      result[existingIndex] = { ...result[existingIndex], ...clone(item) };
      return;
    }
    result.push(clone(item));
    if (key) indexByKey.set(key, result.length - 1);
  });
  return result;
}

function findListMatch(items, candidate, keyFields) {
  const list = Array.isArray(items) ? items : [];
  return list.find((item) => keyFields.some((field) => {
    const candidateValue = String(candidate?.[field] || '').trim().toLocaleLowerCase('he');
    return candidateValue && String(item?.[field] || '').trim().toLocaleLowerCase('he') === candidateValue;
  }));
}

function mergeNavigationPreservingBranches(baseline, candidate) {
  const enriched = (Array.isArray(candidate) ? candidate : []).map((category) => {
    const existingCategory = findListMatch(baseline, category, ['id', 'label']);
    const children = (Array.isArray(category?.children) ? category.children : []).map((subcategory) => {
      const existingSubcategory = findListMatch(existingCategory?.children, subcategory, ['id', 'title', 'label']);
      return {
        ...subcategory,
        subLinks: mergeListPreservingBaseline(
          existingSubcategory?.subLinks,
          subcategory?.subLinks,
          ['id', 'url', 'label']
        ),
      };
    });
    return {
      ...category,
      children: mergeListPreservingBaseline(existingCategory?.children, children, ['id', 'title', 'label']),
    };
  });
  return mergeListPreservingBaseline(baseline, enriched, ['id', 'label']);
}

function mergeGanttPreservingMilestones(baseline, candidate) {
  const enrichedItems = (Array.isArray(candidate?.items) ? candidate.items : []).map((item) => {
    const existingItem = findListMatch(baseline?.items, item, ['id', 'title']);
    return {
      ...item,
      milestones: mergeListPreservingBaseline(existingItem?.milestones, item?.milestones, ['id', 'title']),
    };
  });
  return {
    ...clone(baseline),
    ...clone(candidate),
    categories: mergeListPreservingBaseline(baseline?.categories, candidate?.categories, ['id', 'name']),
    items: mergeListPreservingBaseline(baseline?.items, enrichedItems, ['id', 'title']),
  };
}

export function applyAdminAiActionSemantics(tab, actionId, baseline, candidate) {
  if (candidate === undefined || candidate === null) return candidate;
  const key = `${tab}:${actionId}`;
  const appendModes = new Set([
    'alerts:draft', 'alerts:multiple',
    'news:flash', 'news:split', 'news:translate',
    'countdown:sentence', 'countdown:multiple', 'countdown:event',
    'phonebook:paste', 'shuttles:paste', 'shuttles:update', 'polls:create',
    'celebrations:paste', 'heritage:story', 'heritage:learning',
    'tips:procedure', 'tips:split', 'external-links:paste',
    'links:paste',
  ]);

  if (appendModes.has(key)) {
    if (tab === 'links') {
      return mergeNavigationPreservingBranches(baseline, candidate);
    }
    if (tab === 'countdown') {
      const items = mergeListPreservingBaseline(baseline?.items, candidate?.items, ['id', 'title']);
      const validIds = new Set(items.map((item) => String(item?.id || '')));
      const requestedActive = String(candidate?.activeItemId || '');
      const activeItemId = validIds.has(requestedActive) ? requestedActive : baseline?.activeItemId || items[0]?.id || null;
      const active = items.find((item) => String(item?.id) === String(activeItemId)) || items[0] || {};
      return { ...clone(baseline), ...clone(candidate), items, activeItemId, title: active.title || '', targetDate: active.targetDate || '', details: active.details || '', showDetails: active.showDetails || false };
    }
    if (tab === 'polls') {
      const merged = mergeListPreservingBaseline(baseline, candidate, ['id', 'question']);
      const newActiveIndex = merged.findIndex((item) => item?.active && !baseline?.some((base) => base?.id === item?.id && base?.active));
      const activeIndex = newActiveIndex >= 0 ? newActiveIndex : Math.max(0, merged.findIndex((item) => item?.active));
      return merged.map((item, index) => ({ ...item, active: index === activeIndex }));
    }
    const keyFields = tab === 'phonebook' ? ['id', 'number', 'name']
      : tab === 'shuttles' ? ['id', 'destination']
      : tab === 'celebrations' ? ['id', 'name']
      : tab === 'external-links' ? ['id', 'url', 'title']
      : tab === 'heritage' ? ['id', 'quote']
      : tab === 'tips' ? ['id', 'title']
      : ['id'];
    return mergeListPreservingBaseline(baseline, candidate, keyFields);
  }

  if (key === 'outstanding:points') {
    return mergeListPreservingBaseline(baseline, candidate, ['id', 'name']);
  }
  if (key === 'events:add') {
    return { ...clone(baseline), ...clone(candidate), events: mergeListPreservingBaseline(baseline?.events, candidate?.events, ['id', 'title']) };
  }
  if (tab === 'gantt' && ['brief', 'paste', 'breakdown', 'milestones', 'weekly'].includes(actionId)) {
    return mergeGanttPreservingMilestones(baseline, candidate);
  }
  return candidate;
}

export function normalizeAdminAiCandidate(tab, payload, currentSnapshot, options = {}) {
  const instruction = options.instruction || '';
  const actionId = options.actionId || '';
  switch (tab) {
    case 'info': return normalizeSiteContent(payload, currentSnapshot);
    case 'links': return normalizeNavigation(payload, currentSnapshot, instruction, actionId);
    case 'events': return normalizeEvents(payload, currentSnapshot);
    case 'widgets': return normalizeWidgetSelection(payload, currentSnapshot);
    case 'current-widgets': return normalizeCurrentWidgets(payload, currentSnapshot, instruction);
    case 'theme': return normalizeTheme(payload, currentSnapshot);
    case 'external-links': return normalizeExternalLinks(payload, currentSnapshot, instruction, actionId);
    case 'galleries': return normalizeGalleries(payload, currentSnapshot);
    case 'gantt': return normalizeGantt(payload, currentSnapshot, instruction, actionId);
    case 'org-chart': return normalizeOrgChart(payload, currentSnapshot, instruction, actionId);
    case 'boom': return normalizeBoom(payload, currentSnapshot);
    case 'alerts': return normalizeAlerts(payload, currentSnapshot, instruction);
    case 'news': return normalizeNews(payload, currentSnapshot);
    case 'outstanding': return normalizeOutstanding(payload, currentSnapshot, instruction);
    case 'countdown': return normalizeCountdown(payload, currentSnapshot, instruction);
    case 'phonebook': return normalizePhonebook(payload, currentSnapshot, instruction);
    case 'shuttles': return normalizeShuttles(payload, currentSnapshot, instruction);
    case 'polls': return normalizePolls(payload, currentSnapshot, actionId);
    case 'celebrations': return normalizeCelebrations(payload, currentSnapshot, instruction);
    case 'heritage': return normalizeHeritage(payload, currentSnapshot, instruction);
    case 'tips': return normalizeTips(payload, currentSnapshot);
    default: return clone(currentSnapshot);
  }
}

function stripVoters(polls) {
  return (Array.isArray(polls) ? polls : []).map((poll) => ({
    id: poll?.id,
    question: poll?.question,
    active: poll?.active === true,
    options: (Array.isArray(poll?.options) ? poll.options : []).map((option) => ({
      id: option?.id,
      text: option?.text,
      votes: Number.isFinite(Number(option?.votes)) ? Number(option.votes) : 0,
    })),
  }));
}

export function sanitizeAdminAiSnapshot(tab, snapshot) {
  const safe = clone(snapshot);
  if (tab === 'info') {
    return {
      hero: {
        siteName: safe?.hero?.siteName || '',
        title: safe?.hero?.title || '',
        subtitle: safe?.hero?.subtitle || '',
        description: safe?.hero?.description || '',
      },
      commander: {
        sectionTitle: safe?.commander?.sectionTitle || '',
        roleLabel: safe?.commander?.roleLabel || '',
        messages: clone(safe?.commander?.messages || []),
      },
    };
  }
  if (tab === 'polls') return stripVoters(safe);
  if (tab === 'current-widgets') {
    if (Array.isArray(safe?.polls)) safe.polls = stripVoters(safe.polls);
    if (Array.isArray(safe?.phonebook)) {
      safe.phonebook = safe.phonebook.map((contact) => ({
        id: contact?.id,
        name: contact?.name || '',
        department: contact?.department || '',
        hasNumber: Boolean(contact?.number),
      }));
    }
  }
  if (tab === 'galleries') {
    return (Array.isArray(safe) ? safe : []).map((gallery) => ({
      ...gallery,
      images: (Array.isArray(gallery?.images) ? gallery.images : []).map((image) => ({
        id: image?.id,
        alt: image?.alt || '',
        caption: image?.caption || '',
        media: { fileName: image?.media?.fileName || '' },
      })),
    }));
  }
  if (tab === 'phonebook') {
    return (Array.isArray(safe) ? safe : []).map((contact) => ({
      id: contact?.id,
      name: contact?.name || '',
      department: contact?.department || '',
      hasNumber: Boolean(contact?.number),
    }));
  }
  if (tab === 'org-chart') {
    const redact = (nodes) => (Array.isArray(nodes) ? nodes : []).map((node) => ({
      id: node?.id,
      name: node?.name || '',
      rank: node?.rank || '',
      role: node?.role || '',
      personalNumber: node?.personalNumber ? '[קיים]' : '',
      children: redact(node?.children),
    }));
    return { ...safe, nodes: redact(safe?.nodes) };
  }
  return safe;
}
