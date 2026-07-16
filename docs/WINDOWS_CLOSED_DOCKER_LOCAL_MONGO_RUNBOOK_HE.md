# הפעלה מקומית במחשב Windows ברשת סגורה (MongoDB + Frontend Mongo)

מסמך זה מיועד להקמה מהירה ומאובטחת במחשב Windows בתוך רשת סגורה.

**אין גישה ל־SharePoint מהסקריפטים** כאן.
**אין deploy**.
**אין real migration**.

**לחלופה ללא Docker ל-Mongo מקומי ב-Windows**: ראה
`docs/WINDOWS_NATIVE_MONGO_LOCAL_DEV_HE.md`

## 1) דרישות בסיס

- Windows עם הרשאות להריץ PowerShell.
- Docker Desktop (או Docker Engine) מותקן.
- Node.js ו־npm.

בדיקה מהירה:

```powershell
node -v
npm -v
docker --version
docker compose version
```

## 2) העברת הפרויקט לסגירה

אם אין גישה לאינטרנט בתוך הרשת הסגורה, תעבירו קודם קוד, `package-lock.json` וקבצי ההגדרה:

- `.env.local.example`
- `server/.env.local.example`
- `server/.env.test.example`
- `docker-compose.dev.yml`
- תקיית `scripts/sharepoint-closed-export/`

## 3) Mongo Docker Image (ללא אינטרנט)

הפקודה לעבודה עם טאר קודם לכן:

```powershell
docker load -i C:\path\to\mongodb-community-server-7.0-ubuntu2204.tar
```

אישור קבלת האימג':

```powershell
docker image ls mongodb/mongodb-community-server:7.0-ubuntu2204
```

## 4) התקנת dependencies

```powershell
cd C:\dev\site-builder
npm ci
```

> לא מעבירים `node_modules` ממחשב אחר (Mac/Intel → Windows), כדי לא להיתקע על חבילות platform-specific.

## 5) יצירת קבצי env מקומיים

```powershell
Copy-Item .env.local.example .env.local
Copy-Item server\.env.local.example server\.env.local
Copy-Item server\.env.test.example server\.env.test
```

ערכו את הקבצים כך:

`server/.env.local`

```text
MONGODB_URI=mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_dev
SERVER_PORT=3001
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
STORAGE_BACKEND=mongo
ADMIN_API_KEY=dev-local-api-key
SITE_COLLECTION_PREFIX=site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

`server/.env.test`

```text
MONGODB_URI=mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_test
SERVER_PORT=3002
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
STORAGE_BACKEND=mongo
ADMIN_API_KEY=test-local-api-key
SITE_COLLECTION_PREFIX=test_site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

`.env.local`

```text
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://127.0.0.1:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_DEV_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

**אם הפורטל ניגש ממחשב אחר ברשת:**

- שנו `VITE_BACKEND_API_URL` ל־`http://<hostname>:3001`.
- עדכנו גם `CORS_ORIGINS` ב-`server/.env.local` לכלכתובת אותה רואים.

## 6) בדיקת פרה-פלייט
```powershell
npm run dev:mongo:check
```

מצופה לראות `Local Mongo preflight: PASS` או לפחות ללא `FAIL`.

## 7) הרצת Mongo + Backend + Frontend

```powershell
npm run dev:mongo:up
npm run server:dev:mongo
```
בטרמינל נוסף:

```powershell
npm run dev:frontend:mongo
```

Checks:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/healthz
Invoke-RestMethod http://127.0.0.1:3001/api/healthz
Invoke-RestMethod -Headers @{ "X-API-Key" = "dev-local-api-key" } "http://127.0.0.1:3001/api/sites"
```

`npm run dev:mongo:down` עומד לסגירה מלאה (כולל init). הנתונים המקומיים נשמרים, אין מחיקה אוטומטית של DBs.

## 8) בדיקה עם Frontend מקומי/SharePoint

- אם רץ מקומית: `http://localhost:5173`
- אם צריך רק לבדיקת dist מ־SharePoint, יש להבטיח שה־`VITE_BACKEND_API_URL` מפנה למחשב ה-API (לא ל־localhost אם זה לא אותו מכשיר).

הערה חשובה: אם ה-frontend מגיע מ-SharePoint dist, הוא נקרא כ-SharePoint HTML ובמכונה אחרת צריך קודם להוסיף runtime config ליד ה-dist כדי להצביע על כתובת ה־API המקומית:

```powershell
npm run sharepoint:install-runtime-config -- --site <siteCode> --backend-url http://<hostname>:3001
```

(למשל: `http://127.0.0.1:3001` אם ממשיך לעבוד מאותה מכונה).

## 9) בדיקת export kit סגור (כל האתרים המקומיים)

עיצוב תיקייה לדוגמה (מיקום מקומי של TXT:

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

`site.export.json` לדוגמה (כשיש path כזה כמו Subsite עם `/`):

```json
{
  "siteCode": "Sites/demo-main-site/subsite-b",
  "displayName": "Demo Subsite B",
  "siteRelativePath": "/Sites/demo-main-site/subsite-b"
}
```

ולידציה לכל האתרים:

```powershell
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

קובץ הדוח:

```text
exports\sharepoint-closed\<batchExportId>\report.md
```

רק אחרי בדיקה נקיה רץ dry-run:

```powershell
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports\sharepoint-closed\<batchExportId> --all-sites
```

## 10) דוגמת דוגמה מוכנה שכבר קיימת

כדי לראות דוגמת מבנה מוכנה (ללא מידע אמיתי), ראה:

`/scripts/sharepoint-closed-export/examples/sharepoint-export-input/`

תיקייה זו כוללת שני אתרים לדוגמה, כולל `site.export.json` לאתר עם שם לא בטוח.

## 11) דברים שלא עושים (חשוב)

- לא מריצים `site:init` על אתרים קיימים.
- לא עושים `deploy`.
- לא כותבים ל-SharePoint בעת export.
- לא מריצים real migration.
- לא משנים `MongoDB` production.
