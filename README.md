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

- `npm run server:dev`  
  מריץ את שרת ה-Mongo backend המקומי.

- `npm run server:test`  
  מריץ את בדיקות שכבת השרת.

- `npm run dev:mongo:up`  
  מעלה MongoDB מקומי דרך Docker Compose בלבד.

- `npm run dev:mongo:check`  
  מריץ בדיקת preflight ל-Docker, Mongo, קבצי env, CORS ו-API key.

- `npm run server:dev:mongo`  
  מריץ את השרת עם `server/.env.local`.

- `npm run dev:frontend:mongo`  
  מריץ את ה-Frontend עם `.env.local` במצב Mongo.

- `npm run dev:mongo:reset -- --confirm-local-reset`  
  מאפס רק את מסדי הנתונים המקומיים `site_builder_dev` ו-`site_builder_test`.

- `npm run migrate:sharepoint-to-mongo -- --dry-run`  
  מבצע סימולציית מיגרציה מ-TXT/SharePoint ל-MongoDB ומייצר דוח.

- `npm run sharepoint:closed-validate -- --input sharepoint-export-input --site <siteCode>`  
  מאמת תיקיית TXT שהורדה ידנית מ-SharePoint סגור ויוצר artifact מקומי למיגרציית Mongo dry-run.

- `npm run sharepoint:install-export-helper -- --site <siteCode> --dry-run`  
  מציג נתיב ו-URL להתקנת דף עזר לקריאת TXT מתוך SharePoint, בלי לגעת בקבצי הנתונים.

- `npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites`  
  מאמת תיקיית export שמכילה תתי-תיקיות נפרדות לכמה אתרים, ויוצר artifact batch עם בידוד לפי אתר ובדיקת collision לשמות collections.

- `npm run sharepoint:closed-export -- --config scripts/sharepoint-closed-export/export.config.json`  
  קורא TXT מ-SharePoint רק אם הוא mounted כקבצי WebDAV מקומיים. לא מבצע auth, כתיבה או מחיקה.

- `npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<timestamp> --site <siteCode>`  
  מריץ dry-run למיגרציה מתוך artifact מקומי, ללא גישה ל-SharePoint.

- `npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId> --all-sites`  
  מריץ dry-run לכל האתרים מתוך artifact batch מקומי, ללא גישה ל-SharePoint וללא כתיבה ל-Mongo.

## ארכיטקטורה בסיסית

- **Routing**  
  ניהול הניווט מתבצע ב-`App.jsx`, כולל נתיבים לעמוד הבית ולממשק הניהול.

- **Contexts**  
  שכבת Context מרכזת מצב גלובלי כמו משתמש מחובר, ניווט, תוכן אתר, תצוגה/Theme, Widgets וקישורים חיצוניים.

- **Services**  
  שכבת Services אחראית על גישה לנתונים והתממשקות למקורות מידע, ומבודדת לוגיקת גישה מהקומפוננטות.

## MongoDB persistence backend

הפרויקט כולל שרת backend חדש תחת `server/` שמחליף כתיבה ישירה לקבצי TXT ב-SharePoint.

להקמת סביבת Mongo מקומית עם Docker Compose, קבצי env, בדיקות והרצה:

- `docs/LOCAL_MONGO_DEV.md`

משתני סביבה נדרשים לשרת:

- `MONGODB_URI`
- `MONGODB_DB_NAME`
- `SERVER_PORT`
- `CORS_ORIGINS`
- `STORAGE_BACKEND=mongo`
- `ADMIN_API_KEY`
- `SITE_COLLECTION_PREFIX=site_` (אופציונלי)
- `LEGACY_SHAREPOINT_READONLY_FALLBACK=false` (אופציונלי)

משתני סביבה ל-Frontend:

- `VITE_STORAGE_BACKEND=mongo`
- `VITE_BACKEND_API_URL=http://localhost:<SERVER_PORT>`
- `VITE_SITE_ID=<site-id>` או `VITE_SP_SITE_CODE`
- `VITE_SITE_BUILDER_API_KEY=<ADMIN_API_KEY>` עד להחלפתו ב-JWT/SSO אמיתי.

MongoDB משתמש במסד נתונים אחד לכלל האתרים:

- `sites` - רישום אתרים ושם collection בטוח לכל אתר.
- `site_data_revisions` - snapshots לפני/אחרי כתיבות חשובות.
- `site_data_audit_logs` - audit לכתיבות, מחיקות וקונפליקטים.
- collection פיזי אחד לכל אתר, בשם מחוטא עם hash יציב.

כתיבות משתמשות ב-version optimistic concurrency. `PUT`, `PATCH` ו-`DELETE` דורשים `expectedVersion` או `If-Match`; מחיקה היא soft delete; דריסות ריקות (`{}`, `[]`, `null`) נחסמות אלא אם נשלח `allowEmptyOverwrite=true`.

מיפוי תאימות TXT:

- `bihs_master_config_v1.txt` -> `config:master`
- `users_data.txt` -> מסמכי `admins`
- `events_data.txt` -> מסמכי `events` + meta settings
- `nav_data.txt` -> מסמכי `navigation`
- `site_content_data.txt` -> `content:site`
- `theme_data.txt` -> `design:theme`
- `widgets_data.txt` -> `widgets:config` כסינגלטון עד נרמול בטוח יותר
- `external_links_data.txt` -> מסמכי `externalLinks`
- `gantt_data.txt` -> `gantt:settings`

הערת durability: השרת מבקש write concern של `majority` ו-journaling. בפריסת MongoDB יחידה ללא replica set יש לוודא journaling פעיל ולהכיר בכך שאין majority אמיתי כמו ב-replica set.

## Closed SharePoint Export Kit

כאשר SharePoint נמצא בסביבה סגורה, משתמשים בערכת הייצוא המקומית:

- `scripts/sharepoint-closed-export/README.md`
- `scripts/sharepoint-closed-export/export.config.example.json`
- `scripts/sharepoint-closed-export/validate-manual-export.mjs`
- `scripts/sharepoint-closed-export/export-from-sharepoint.mjs`
- `scripts/sharepoint-closed-export/browser-helper.js`

המסלול המומלץ לאתר אחד הוא הורדה ידנית של קבצי TXT לתיקיית `sharepoint-export-input/`, ואז:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --site <siteCode>
```

לכמה אתרים, יוצרים תת-תיקייה לכל אתר תחת `sharepoint-export-input/`. אם שם האתר האמיתי כולל `/` או תווים שאינם נוחים לשם תיקייה, מוסיפים בתוך אותה תיקייה קובץ `site.export.json` עם `siteCode`, `displayName`, ו-`siteRelativePath`.

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

הפלט ייווצר תחת `exports/sharepoint-closed/<timestamp>/` או `exports/sharepoint-closed/<batchExportId>/` וניתן להעביר אותו ל-dry-run:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId> --all-sites
```

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
