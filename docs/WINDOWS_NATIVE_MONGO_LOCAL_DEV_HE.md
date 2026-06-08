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

שורה אחת להפעלה מהירה למטרות פיתוח בלבד (גרסת single-node):

```powershell
$mongoBin = "C:\Program Files\MongoDB\Server\7.0\bin"
$env:Path = "$mongoBin;$env:Path"

mongod --replSet rs0 --bind_ip 127.0.0.1 --port 27017 --dbpath C:\data\db --logpath C:\data\log\mongod.log
```

> אם כבר יש לכם שירות MongoDB, עדיף להשתמש בשירות הקיים כדי לשמור על הגדרות ארגוניות קיימות.

## 4) אתחול replica set (idempotent, רק כשמבקשים במפורש)

בחרו אחת מהגישות:

### 4.1 דרך מיידית ב-PowerShell (מומלץ)

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
mongosh "mongodb://localhost:27017/admin" --eval "db.adminCommand({ ping: 1 })"
mongosh "mongodb://localhost:27017/admin" --eval "rs.status()"
```

## 6) קבצי env מקומיים (native)

```powershell
Copy-Item .env.local.example .env.local
Copy-Item server\.env.local.example server\.env.local
Copy-Item server\.env.test.example server\.env.test
Copy-Item server\.env.local.native.example server\.env.local.native
Copy-Item server\.env.test.native.example server\.env.test.native
```

ערכו `server\.env.local.native` ו-`server\.env.test.native` כך שיש להם:

```text
MONGODB_URI=mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_dev
...

MONGODB_URI=mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_test
...
```

`server/.env.local` (frontend):

```text
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://127.0.0.1:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

## 7) בדיקת פרה-פלייט ל-native

```powershell
npm run dev:mongo:native:check -- --sharepoint-origin http://site.example.local
```

צפוי לראות `Local Mongo preflight: PASS` או לפחות ללא `FAIL`.

## 8) הרצת backend + frontend עם native envs

```powershell
npm run server:dev:mongo:native
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

## 10) בדיקות Export Kit (סגור)

```powershell
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports\sharepoint-closed\<batchExportId> --all-sites
```

## 11) חשוב (לא לעשות)

- לא להריץ `deploy`.
- לא להריץ `site:init`.
- לא לשנות/למחוק/לייצא מתוך SharePoint דרך הנתיבים הפתוחים כאן.
- לא להריץ real migration.
- לא לגעת ב-production Mongo.
