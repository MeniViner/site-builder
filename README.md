// readme.md

# פרויקט ליצירת דפי תדמית דינמיים

פורטל אינטראנט ארגוני בשפה עברית ובכיוון RTL, המאפשר בנייה וניהול של דפי תדמית דינמיים עם ממשק ניהול ו-Widgets.

## טכנולוגיות

- React 19
- Vite 7
- Tailwind CSS

## סקריפטים זמינים

- `npm run dev`  
  מפעיל סביבת פיתוח מקומית עם HMR.

- `npm run build`  
  יוצר Build לפרודקשן בתיקיית `dist/`.
  בסיום רץ `postbuild` אוטומטי (אם `VITE_AUTO_DEPLOY=true`).

- `npm run site:init`  
  יוצר/מאתחל מבנה SharePoint לאתר חדש לפי `.env.production`.

- `npm run ai:backend:install`  
  מתקין dependencies ל-`newAlphaAIBackend`.

- `npm run ai:backend:dev`  
  מריץ את שרת ה-AI Proxy המקומי (`newAlphaAIBackend`).

- `npm run deploy`  
  מבצע רק שלב deploy של `dist` ל-SharePoint (ללא build).

- `npm run lint`  
  מריץ בדיקות קוד סטטיות באמצעות ESLint.

- `npm run preview`  
  מעלה תצוגה מקומית של ה-Build שנוצר.

- `npm run test`  
  מריץ בדיקות יחידה עם Vitest.

## ארכיטקטורה בסיסית

- **Routing**  
  ניהול הניווט מתבצע ב-`App.jsx`, כולל נתיבים לעמוד הבית ולממשק הניהול.

- **Contexts**  
  שכבת Context מרכזת מצב גלובלי כמו משתמש מחובר, ניווט, תוכן אתר, תצוגה/Theme, Widgets וקישורים חיצוניים.

- **Services**  
  שכבת Services אחראית על גישה לנתונים והתממשקות למקורות מידע, ומבודדת לוגיקת גישה מהקומפוננטות.

## הגדרת מנהלים ו-SharePoint

למדריך מלא להגדרת קישורי SharePoint לפי אתר ולהגדרת מנהלים לפי מספר אישי:

- `SHAREPOINT-ADMIN-SETUP.md`

## הקמת אתר חדש (אוטומציה)

למדריך המלא של הקמה אוטומטית לאתר חדש, כולל:

- `siteDB` + `siteUsersDb`
- סקריפט יצירת תיקיות/קבצים
- `postbuild` אוטומטי (init + deploy)
- מודל הרשאות מומלץ

ראה:

- `NEW-SITE-AUTOMATION.md`

## אינטגרציית AI

להגדרת חיבור הפרויקט ל-`newAlphaAIBackend`, כולל env לבחירת מודל, fallback ושימוש בקוד:

- `AI-INTEGRATION.md`
