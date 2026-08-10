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
  יוצר Build אוניברסלי לפרודקשן בתיקיית `dist/`.
  בסיום רץ `postbuild` שמייצר manifest אוניברסלי בלבד; deploy אוטומטי דורש opt-in מפורש.

- `npm run verify:universal-dist`
  מוכיח שקובצי JS/CSS של `dist` זהים לאחר החלת metadata לשני אתרי SharePoint שונים.

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
  מריץ את שרת ה-Mongo backend המקומי עם `server/.env.local`.

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

- `npm run migrate:sharepoint-to-mongo -- --from-export <batch-export-dir>/sites/<safe-site-folder> --site <real-site-id>`  
  מבצע import אמיתי ל-Mongo מקומי מתוך artifact של אתר אחד. הסקריפט טוען `server/.env.local`.

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

## Universal SharePoint release contract

One release is one universal `dist`. Build it once with `npm run build`, then deploy the exact same static files to every supported SharePoint target. Site identity is supplied only at deployment time in `sitebuilder-runtime-config.json`; no Vite rebuild is required for a different host, site code, library, REST root, or final URL.

The release manifest in raw `dist` is universal. The legacy Node deploy command creates a new temporary staging copy, writes `sitebuilder-runtime-config.json` and `sitebuilder-deployment.json` into that copy, regenerates `sharepoint-deploy-manifest.json` after the overlays exist, then copies the staging directory to SharePoint and verifies the three files in the target. The canonical `dist` is never made site-specific. A production release without a valid runtime config still fails visibly before storage-dependent modules load.

Required TXT runtime fields are `schemaVersion: 2`, `storageBackend: "txt"`, `host`, and `siteCode`. Folder names are canonical inputs; roots and TXT file URLs are derived and validated. The deployment payload also records `releaseVersion`, `releaseId`, and `deployedAt` when supplied by deployment tooling.

```json
{
  "schemaVersion": 2,
  "storageBackend": "txt",
  "host": "portal.army.idf",
  "siteCode": "example-a",
  "siteDbFolder": "siteDB",
  "usersDbFolder": "siteUsersDb",
  "siteAssetsFolder": "siteAssets",
  "imagesFolder": "images",
  "widgetsDbTarget": "users"
}
```

```json
{
  "schemaVersion": 2,
  "storageBackend": "txt",
  "host": "mazi.army.idf",
  "siteCode": "example-b",
  "siteDbFolder": "siteDB",
  "usersDbFolder": "siteUsersDb",
  "siteAssetsFolder": "siteAssets",
  "imagesFolder": "images",
  "widgetsDbTarget": "site"
}
```

For the first example, the runtime descriptor deterministically resolves `/sites/example-a/siteDB`, `/sites/example-a/siteUsersDb`, the TXT paths beneath them, and `https://portal.army.idf/sites/example-a/siteDB/dist/index.html`. Explicit redundant roots are accepted only when they match these canonical values.

Development precedence is: runtime JSON when present, then `.env.local`/Vite values, then safe local defaults. Production precedence is runtime JSON only. `VITE_SP_*` and `VITE_SITE_*` site identity values remain supported by local development and deployment CLI helpers, but are not an authority for the production frontend bundle.

### Traditional Node deployment (existing TXT sites)

Existing sites do not need the Release Manager and do not need manually authored JSON. Keep the target's existing `.env.production` (or pass it with `--env`) and use either supported flow:

```bash
npm run build
npm run deploy
```

```bash
# Explicit legacy postbuild deployment, when .env.production has VITE_AUTO_DEPLOY=true
SITE_BUILDER_POSTBUILD_DEPLOY=true npm run build
```

`npm run deploy` is equivalent to `node deploy.js --force`; use `node deploy.js --env path/to/.env.production --force` for a different existing site. The command requires an explicit `VITE_SP_HOST` and `VITE_SP_SITE_CODE` (or `--host` and `--site`) so it cannot accidentally deploy the old default site.

The deployment mapping is direct: `VITE_SP_HOST`, `VITE_SP_SITE_CODE`, `VITE_SP_SITE_DB_FOLDER`, `VITE_SP_USERS_DB_FOLDER`, `VITE_SP_SITE_ASSETS_FOLDER`, `VITE_SP_IMAGES_FOLDER`, `VITE_SP_WIDGETS_DB_TARGET`, `VITE_SP_SITE_API_ROOT`, and `VITE_SITE_BASE_URL` are resolved by `scripts/sp-env.js`, then validated by `src/config/sharepointRuntimeDescriptor.js` before staging starts. This preserves non-default document-library names; `siteDB` is only a fallback, never a deployment-path assumption. `widgetsDbTarget=users` resolves widgets under the users library, while `widgetsDbTarget=site` resolves them under the site-assets library.

For a previously broken TXT site showing `missing_runtime_config`, simply run the same `npm run build && npm run deploy` sequence with its existing `.env.production`. The deploy staging overlay supplies the missing runtime file; no Release Manager is required.

## MongoDB persistence backend

הפרויקט כולל שרת backend חדש תחת `server/` שמחליף כתיבה ישירה לקבצי TXT ב-SharePoint.

להקמת סביבת Mongo מקומית עם Docker Compose, קבצי env, בדיקות והרצה:

- `docs/LOCAL_MONGO_DEV.md`
- `docs/WINDOWS_NATIVE_MONGO_LOCAL_DEV_HE.md` למסלול Windows native ללא Docker.

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
- `VITE_BACKEND_API_URL=http://127.0.0.1:<SERVER_PORT>`
- `VITE_SITE_ID=<site-id>` או `VITE_SP_SITE_CODE`
- `VITE_SITE_BUILDER_DEV_API_KEY=<ADMIN_API_KEY>` מותר רק בהרצת development מקומית.

ב-production אין להטמיע API key ב-Frontend או בקובץ runtime ציבורי. Mongo production חייב להיות מאחורי session/SSO או gateway מאומת.

MongoDB משתמש במסד נתונים אחד לכלל האתרים:

- `sites` - רישום אתרים ושם collection בטוח לכל אתר.
- `site_data_revisions` - snapshots לפני/אחרי כתיבות חשובות.
- `site_data_audit_logs` - audit לכתיבות, מחיקות וקונפליקטים.
- collection פיזי אחד לכל אתר, בשם מחוטא עם hash יציב.

ניתוב אתר:

- `sites.siteId` הוא ה-id הלוגי שבו משתמשים ה-API וה-Frontend, למשל `alphateam`.
- `sites.safeCollectionName` הוא שם ה-collection הפיזי ב-Mongo.
- אתרים קיימים נפתרים לפי `sites.safeCollectionName`; לא משנים collection חי אוטומטית.
- `SITE_COLLECTION_PREFIX` משפיע רק על שמות חדשים שנוצרים אחרי שינוי הערך.

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

### Admin Backups ב-Mongo

כאשר `VITE_STORAGE_BACKEND=mongo`, מסך ניהול הגיבויים שומר גיבויים ב-Mongo ולא ב-`localStorage`.
הגיבויים נשמרים בתוך אותו collection פיזי של האתר, לפי `sites.safeCollectionName`, עם:

```js
{
  _id: "backup:<backupId>",
  siteId: "<siteId>",
  scope: "backups",
  entityId: "<backupId>",
  data: {
    backupId: "<backupId>",
    name: "...",
    description: "...",
    createdAt: "...",
    createdBy: "...",
    source: "admin-backup-management",
    summary: {},
    snapshot: {},
    sizeBytes: 0,
    storageBackend: "mongo",
    siteId: "<siteId>"
  },
  version: 1,
  schemaVersion: 1,
  createdAt: Date,
  updatedAt: Date,
  deletedAt: null
}
```

ב-MongoDB Compass:

1. פותחים את `site_builder_dev`.
2. פותחים את ה-collection שמופיע ב-`sites.safeCollectionName` עבור האתר.
3. מסננים:

```js
{ scope: "backups", deletedAt: null }
```

הבדלים חשובים:

- live site data: מסמכי האתר הפעילים באותו collection לפי `scope` ו-`entityId`.
- `site_data_revisions`: snapshots אוטומטיים לפני/אחרי כתיבות חשובות.
- `site_data_audit_logs`: audit לכתיבות, מחיקות, קונפליקטים, יצירת/מחיקת/שחזור גיבויים.
- admin backups: packages מלאים תחת `scope: "backups"` באותו collection של האתר.
- `localStorage` נשאר רק לגיבויי מצב mock/local legacy, ולא משמש כאחסון ראשי במצב Mongo.

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

לאחר dry-run תקין, import אמיתי מקומי לאתר אחד משתמש בתיקיית האתר הפנימית אבל ב-`--site` של האתר הלוגי:

```bash
npm run migrate:sharepoint-to-mongo -- --from-export exports/sharepoint-closed/<batchExportId>/sites/<safe-site-folder> --site <real-site-id>
```

אין סקריפט בשם `migrate:sharepoint-export-to-mongo`; ל-dry-run משתמשים רק ב-`migrate:sharepoint-export-to-mongo:dry-run`, ול-import אמיתי מקומי ב-`migrate:sharepoint-to-mongo`.

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
