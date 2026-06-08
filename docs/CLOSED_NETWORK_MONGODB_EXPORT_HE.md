# מדריך מקומי מהיר (רשת סגורה) – Docker Mongo + export kit

המדריך הזה לא נוגע ב־SharePoint/production ומיועד לעבודה מקומית בסביבה סגורה.

## לפני כניסה לרשת הסגורה (מה לעבור מראש)

1. להעביר את תיקיית הפרויקט ליעד הסגור.
2. להעביר גם:
   - `package-lock.json`
   - `package.json`
   - `docker-compose.dev.yml`
   - `server/.env.local.example`
   - `server/.env.test.example`
   - `.env.local.example`
   - `scripts/sharepoint-closed-export/`
3. להיכנס לרשת סגורה ולוודא שאין תלות בגישה חיצונית במהלך העבודה.

## התקנה מקומית (מה שצריך על המחשב)

- Node.js + npm
- Docker + docker compose

בדיקות מהירות:

```bash
node -v
npm -v
docker --version
docker compose version
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

## הגדרת קבצי Env מקומיים

```bash
cp .env.local.example .env.local
cp server/.env.local.example server/.env.local
cp server/.env.test.example server/.env.test
```

ערוכים כך:

`server/.env.local`
- `MONGODB_URI=mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true`
- `MONGODB_DB_NAME=site_builder_dev`
- `SERVER_PORT=3001`
- `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`
- `STORAGE_BACKEND=mongo`
- `ADMIN_API_KEY=dev-local-api-key`
- `SITE_COLLECTION_PREFIX=site_`
- `LEGACY_SHAREPOINT_READONLY_FALLBACK=false`

`server/.env.test`
- `MONGODB_URI=mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true`
- `MONGODB_DB_NAME=site_builder_test`
- `SERVER_PORT=3002`
- `CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`
- `STORAGE_BACKEND=mongo`
- `ADMIN_API_KEY=test-local-api-key`
- `SITE_COLLECTION_PREFIX=test_site_`
- `LEGACY_SHAREPOINT_READONLY_FALLBACK=false`

`.env.local`
- `VITE_STORAGE_BACKEND=mongo`
- `VITE_BACKEND_API_URL=http://127.0.0.1:3001` (אם frontend מרוחק – כתובת השרת בפועל)
- `VITE_SITE_ID=local-dev-site`
- `VITE_SITE_BUILDER_API_KEY=dev-local-api-key`
- `VITE_AUTO_DEPLOY=false`

> אם ה־frontend פועל מ־SharePoint dist במחשב אחר: אין אפשרות להשתמש `localhost`; צריך להכניס את כתובת ה־API של המחשב המארח ולהפעיל runtime config דרך:
> `npm run sharepoint:install-runtime-config -- --site <siteCode> --backend-url http://<hostname>:3001 --api-key dev-local-api-key`

## בדיקת בטיחות מקדימה

```bash
npm run dev:closed-local:check
```

כדי לבדוק גם מקור SharePoint צפוי (אם רלוונטי):

```bash
npm run dev:closed-local:check -- --sharepoint-origin http://<sp-host> --backend-url http://127.0.0.1:3001 --api-key dev-local-api-key
```

## הרצת שרת + frontend

```bash
npm run server:dev:mongo
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

## מה עושים קודם שלא לעשות בכלל

- לא לגעת ב־SharePoint דרך כתיבה (לא init, לא reset, לא deploy).
- לא להריץ real migration.
- לא לנסות לכתוב ל‑production Mongo.
- לא לערבב קבצים של אתרים שונים באותה תיקייה.
- לא לעלות קבצי TXT ריקים.
