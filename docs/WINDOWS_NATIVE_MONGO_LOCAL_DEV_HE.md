# הגדרת MongoDB מקומי מקורי (Windows) לעבוד עם Site Builder

מסמך זה מוסיף מסלול מקורי (לא Docker) לפיתוח מקומי ב-Windows.

**לא גישה ל-SharePoint** במהלך שלב זה.
**אין deploy**.
**אין real migration**.
**לא נוגעים ל-production MongoDB**.

## 1) מה צריך להתקין

- Windows עם PowerShell.
- Node.js (אותו גרסה של הפרויקט).
- MongoDB Community Server.
- `mongosh` זמין ב-`PATH`.

חשוב: MongoDB Compass הוא כלי GUI, לא MongoDB Server. צריך לוודא שהשירות/התהליך `mongod` רץ בפועל.

## 2) התקנת MongoDB (Windows)

```powershell
# אם יש MSI מקומי:
Start-Process -FilePath ".\MongoDB-Windows-x.x.x-signed.msi"

# בדיקה מהירה של כלים:
node -v
npm -v
mongosh --version
mongod --version
Get-Service MongoDB
```

לא חייבים להתקין מחדש אם MongoDB כבר מותקן.

## 3) הרצה כ-משאב מקומי (במקרה שאין שירות)

שורה אחת להפעלה מהירה למטרות פיתוח בלבד (standalone מקומי):

```powershell
$mongoBin = "C:\Program Files\MongoDB\Server\7.0\bin"
$env:Path = "$mongoBin;$env:Path"

mongod --bind_ip 127.0.0.1 --port 27017 --dbpath C:\data\db --logpath C:\data\log\mongod.log
```

> אם כבר יש לכם שירות MongoDB, עדיף להשתמש בשירות הקיים כדי לשמור על הגדרות ארגוניות קיימות.

## 4) replica set הוא אופציונלי בלבד

למסלול native מקומי לא חייבים `replicaSet=rs0`. אם הארגון כבר מריץ MongoDB standalone על `127.0.0.1:27017`, השתמשו בו כמו שהוא.

רק אם רוצים לבדוק במפורש replica set מקומי, אפשר להריץ:

### 4.1 דרך מיידית ב-PowerShell

```powershell
$verify = @"
const status = (() => {
  try { return rs.status(); } catch (e) { return null; }
})();
if (status && status.ok === 1) {
  print('Replica set already initialized: ' + status.set);
} else {
  rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'localhost:27017' }] });
  print('Replica set initialized.');
}
"@

mongosh "mongodb://localhost:27017/admin" --quiet --eval $verify
```

### 4.2 דרך npm (אופציונלי)

```powershell
npm run dev:mongo:native:ensure-rs0
```

פקודה זו מוגבלת ל־localhost בלבד, לא מריצה שינוי ב-SharePoint ולא מגעת לדאטה-שארים אחרים.

## 5) בדיקות אחרי האתחול

```powershell
mongosh "mongodb://127.0.0.1:27017/admin" --eval "db.adminCommand({ ping: 1 })"
```

## 6) קבצי env מקומיים (native)

```powershell
Copy-Item .env.local.example .env.local
Copy-Item server\.env.local.example server\.env.local
Copy-Item server\.env.test.example server\.env.test
Copy-Item server\.env.local.native.example server\.env.local.native
Copy-Item server\.env.test.native.example server\.env.test.native
```

ערכו `server\.env.local` כך שיהיה בו:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/site_builder_dev?directConnection=true
MONGODB_DB_NAME=site_builder_dev
SERVER_PORT=3001
CORS_ORIGINS=https://portal.army.idf,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
STORAGE_BACKEND=mongo
ADMIN_API_KEY=dev-local-api-key
SITE_COLLECTION_PREFIX=site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

לבדיקות אפשר לערוך גם `server\.env.test.native`:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/site_builder_test?directConnection=true
MONGODB_DB_NAME=site_builder_test
SERVER_PORT=3002
CORS_ORIGINS=https://portal.army.idf,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
STORAGE_BACKEND=mongo
ADMIN_API_KEY=test-local-api-key
SITE_COLLECTION_PREFIX=test_site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

`.env.local` של ה-frontend:

```text
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://127.0.0.1:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

## 7) בדיקת פרה-פלייט ל-native

```powershell
npm run dev:mongo:native:check -- --sharepoint-origin https://portal.army.idf
```

צפוי לראות `Local Mongo preflight: PASS` או לפחות ללא `FAIL`.

## 8) הרצת backend + frontend עם native envs

```powershell
npm run server:dev
# חלון נוסף:
npm run dev:frontend:mongo:native
```

בדיקות מהירות:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/healthz
Invoke-RestMethod http://127.0.0.1:3001/api/healthz
Invoke-RestMethod -Headers @{ "X-API-Key" = "dev-local-api-key" } "http://127.0.0.1:3001/api/sites"
```

## 9) בדיקות sharepoint dist דרך runtime config (אם נדרש)

אם frontend רץ מתוך SharePoint dist במקום localhost:

```powershell
npm run sharepoint:install-runtime-config -- --site <siteCode> --backend-url http://127.0.0.1:3001 --api-key dev-local-api-key
```

> זה רק מעדכן runtime config של ה-dsit ואין שינוי בנתוני SharePoint.

תוכן runtime config מקומי צפוי:

```json
{
  "storageBackend": "mongo",
  "backendApiUrl": "http://127.0.0.1:3001",
  "siteId": "alphateam",
  "apiKey": "dev-local-api-key"
}
```

בעתיד, מול שרת אמיתי:

```json
{
  "storageBackend": "mongo",
  "backendApiUrl": "https://<server-domain>",
  "siteId": "<siteId>",
  "apiKey": "<api-key>"
}
```

## 10) בדיקות Export Kit (סגור)

```powershell
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports\sharepoint-closed\<batchExportId> --all-sites
npm run migrate:sharepoint-to-mongo -- --from-export exports\sharepoint-closed\<batchExportId>\sites\<safe-site-folder> --site <real-site-id>
```

הפקודה האחרונה היא import אמיתי ל-Mongo מקומי לאתר אחד, אחרי dry-run תקין. היא טוענת `server/.env.local`.

אין סקריפט בשם `migrate:sharepoint-export-to-mongo` ללא `:dry-run`.

## 11) חשוב (לא לעשות)

- לא להריץ `deploy`.
- לא להריץ `site:init`.
- לא לשנות/למחוק/לייצא מתוך SharePoint דרך הנתיבים הפתוחים כאן.
- לא להריץ real production migration. import מקומי ל-Mongo מותר רק אחרי dry-run ובפקודה של אתר אחד.
- לא לגעת ב-production Mongo.

## 12) תלויות בסביבה סגורה

- לא למחוק `node_modules` קיימים אם אין דרך התקנה תואמת מוכנה.
- לא להעתיק `node_modules` מ-Mac ל-Windows.
- אם אין npm registry פנימי, להכין מראש dependencies שתואמות Windows.
- `ECONNREFUSED 127.0.0.1:27017` אומר בדרך כלל ש-MongoDB Server לא רץ או לא מאזין לכתובת הזו.

## 13) שמות collections וניתוב אתרים

- `sites.siteId` הוא מזהה האתר הלוגי שבו משתמשים ה-API וה-frontend.
- `sites.safeCollectionName` הוא שם ה-collection הפיזי ב-Mongo.
- אתרים קיימים נפתרים לפי `sites.safeCollectionName`.
- `SITE_COLLECTION_PREFIX` משפיע רק על שמות חדשים.
- לא משנים collection חי אוטומטית. תיקון מקומי, אם צריך, עושים ידנית וב-dry-run לפני כן: rename ל-collection ואז עדכון `sites.safeCollectionName`.

## 14) גיבויי Admin ב-Mongo

במצב `VITE_STORAGE_BACKEND=mongo`, מסך ניהול הגיבויים שומר גיבויים בתוך ה-collection של האתר עצמו, לא ב-`localStorage`.

כדי לראות אותם ב-MongoDB Compass:

1. לפתוח את `site_builder_dev`.
2. לפתוח את collection `sites`.
3. למצוא את האתר לפי `siteId`.
4. לפתוח את ה-collection שמופיע בשדה `safeCollectionName`.
5. לסנן:

```js
{ scope: "backups", deletedAt: null }
```

כל גיבוי נשמר כמסמך:

```js
{
  _id: "backup:<backupId>",
  siteId: "<siteId>",
  scope: "backups",
  entityId: "<backupId>",
  data: {
    source: "admin-backup-management",
    snapshot: {},
    summary: {},
    sizeBytes: 0,
    storageBackend: "mongo"
  },
  deletedAt: null
}
```

גיבויי `localStorage` ישנים נשארים מקומיים לדפדפן ולא מיובאים אוטומטית. אם גיבוי גדול מדי למסמך Mongo יחיד, השרת יחזיר שגיאה ברורה; chunked backups הם המשך עתידי.
