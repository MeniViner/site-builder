# מדריך מקומי מהיר (רשת סגורה) – Mongo מקומי + export kit

המדריך הזה לא נוגע ב־SharePoint/production ומיועד לעבודה מקומית בסביבה סגורה.

## לפני כניסה לרשת הסגורה (מה לעבור מראש)

1. להעביר את תיקיית הפרויקט ליעד הסגור.
2. להעביר גם:
   - `package-lock.json`
   - `package.json`
   - `docker-compose.dev.yml` אם משתמשים ב-Docker
   - `server/.env.local.example`
   - `server/.env.test.example`
   - `.env.local.example`
   - `scripts/sharepoint-closed-export/`
3. להיכנס לרשת סגורה ולוודא שאין תלות בגישה חיצונית במהלך העבודה.

## התקנה מקומית (מה שצריך על המחשב)

- Node.js + npm
- Docker + docker compose, או MongoDB Community Server מקומי ב-Windows

בדיקות מהירות:

```bash
node -v
npm -v
docker --version
docker compose version
mongod --version
```

## הרצת Mongo בדוקר (בלי שינוי קבצי המערכת)

```bash
npm run dev:mongo:up
npm run dev:mongo:check
```

ה־Mongo רץ על `localhost:27017` בלבד.

לצפייה בגנוז:

```bash
npm run dev:mongo:logs
npm run dev:mongo:shell
```

למסלול Windows native ללא Docker, MongoDB Server צריך לרוץ על `127.0.0.1:27017`. אין חובה להגדיר replica set.

## הגדרת קבצי Env מקומיים

```bash
cp .env.local.example .env.local
cp server/.env.local.example server/.env.local
cp server/.env.test.example server/.env.test
```

ערוכים כך:

`server/.env.local`
- `MONGODB_URI=mongodb://127.0.0.1:27017/site_builder_dev?directConnection=true`
- `MONGODB_DB_NAME=site_builder_dev`
- `SERVER_PORT=3001`
- `CORS_ORIGINS=https://portal.army.idf,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174`
- `STORAGE_BACKEND=mongo`
- `ADMIN_API_KEY=dev-local-api-key`
- `SITE_COLLECTION_PREFIX=site_`
- `LEGACY_SHAREPOINT_READONLY_FALLBACK=false`

`server/.env.test`
- `MONGODB_URI=mongodb://127.0.0.1:27017/site_builder_test?directConnection=true`
- `MONGODB_DB_NAME=site_builder_test`
- `SERVER_PORT=3002`
- `CORS_ORIGINS=https://portal.army.idf,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174`
- `STORAGE_BACKEND=mongo`
- `ADMIN_API_KEY=test-local-api-key`
- `SITE_COLLECTION_PREFIX=test_site_`
- `LEGACY_SHAREPOINT_READONLY_FALLBACK=false`

`.env.local`
- `VITE_STORAGE_BACKEND=mongo`
- `VITE_BACKEND_API_URL=http://127.0.0.1:3001` (אם frontend מרוחק – כתובת השרת בפועל)
- `VITE_SITE_ID=local-dev-site`
- `VITE_SITE_BUILDER_DEV_API_KEY=dev-local-api-key` (development מקומי בלבד)
- `VITE_AUTO_DEPLOY=false`

> אם ה־frontend פועל מ־SharePoint dist במחשב אחר: אין אפשרות להשתמש `localhost`; צריך להכניס את כתובת ה־API של המחשב המארח ולהפעיל runtime config דרך:
> runtime config ציבורי אינו מקבל API key. עבור build מתארח יש להשתמש ב-session/SSO או gateway מאומת.

## בדיקת בטיחות מקדימה

```bash
npm run dev:closed-local:check
```

כדי לבדוק גם מקור SharePoint צפוי (origin בלבד, בלי `/sites/...`):

```bash
npm run dev:closed-local:check -- --sharepoint-origin https://portal.army.idf --backend-url http://127.0.0.1:3001 --api-key dev-local-api-key
```

## הרצת שרת + frontend

```bash
npm run server:dev
npm run dev:frontend:mongo
```

פתיחת UI:
- `http://localhost:5173`

## בדיקת export kit (ריבוי אתרים) בסביבה סגורה

1. ליצור מבנה קבצים מקומי כמו בקובץ:

```text
sharepoint-export-input/
  site-a/
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt

  site-b-safe-folder/
    site.export.json
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt
```

2. להריץ ולידציה בכל האתרים:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

3. לפתוח דוח מקומי:

```text
exports/sharepoint-closed/<batchExportId>/report.md
```

4. Dry-run למיגרציית Mongo מכל הבאטץ׳:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId> --all-sites
```

5. Import אמיתי ל-Mongo מקומי עבור אתר אחד בלבד, אחרי dry-run תקין:

```bash
npm run migrate:sharepoint-to-mongo -- --from-export exports/sharepoint-closed/<batchExportId>/sites/<safe-site-folder> --site <real-site-id>
```

`migrate:sharepoint-to-mongo` טוען `server/.env.local`. אין סקריפט בשם `migrate:sharepoint-export-to-mongo` ללא `:dry-run`.

## תקלות נפוצות בסביבה סגורה

- לא למחוק `node_modules` אם אין דרך התקנה תואמת מוכנה.
- לא להעתיק `node_modules` מ-Mac ל-Windows.
- אם אין npm registry פנימי, להכין מראש dependencies שתואמות Windows.
- MongoDB Compass אינו MongoDB Server.
- `ECONNREFUSED 127.0.0.1:27017` אומר ש-MongoDB Server עצור או לא מאזין לכתובת הזו.

## גיבויי Admin ב-Mongo

במצב Mongo, מסך ניהול הגיבויים לא שומר גיבויים ב-`localStorage`. הגיבויים נשמרים בתוך ה-collection של האתר עצמו:

- למצוא את האתר ב-`sites` לפי `siteId`.
- לפתוח את ה-collection שמופיע ב-`safeCollectionName`.
- לסנן:

```js
{ scope: "backups", deletedAt: null }
```

מסמכי הגיבוי משתמשים ב-`_id: "backup:<backupId>"`, ב-`scope: "backups"`, וב-`data.snapshot` שמכיל את חבילת הגיבוי הניתנת לייצוא. גיבויים ישנים מהדפדפן נשארים מקומיים בלבד ולא מיובאים אוטומטית.

## מה עושים קודם שלא לעשות בכלל

- לא לגעת ב־SharePoint דרך כתיבה (לא init, לא reset, לא deploy).
- לא להריץ real production migration.
- לא לנסות לכתוב ל‑production Mongo.
- לא לערבב קבצים של אתרים שונים באותה תיקייה.
- לא לעלות קבצי TXT ריקים.
