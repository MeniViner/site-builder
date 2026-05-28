# Site Builder - מדריך עבודה ברשת סגורה עם Docker, Mongo ושרת מקומי

המדריך הזה מיועד להרצה ברשת הסגורה בלבד, בלי גישה חיצונית ל-SharePoint מתוך הסוכן ובלי כתיבה לנתוני Production.

מטרת התהליך:

- להריץ MongoDB מקומי דרך Docker.
- להריץ את שרת ה-API של Site Builder מול MongoDB.
- להריץ את ה-Frontend במצב Mongo.
- לאפשר בדיקות, export validation ו-dry-run migration מקבצי SharePoint שיורדו ידנית או דרך helper.

אסור בתהליך הזה:

- לא להריץ `deploy`.
- לא להריץ `site:init` על אתרים קיימים.
- לא למחוק, לא לאתחל ולא לדרוס קבצי TXT קיימים ב-SharePoint.
- לא להריץ מיגרציה אמיתית ל-Mongo.
- לא להשתמש ב-Mongo production.
- לא להשתמש ב-env production.

---

## 1. מה צריך להכין כאן לפני שעוברים לרשת הסגורה

במחשב שבו יש אינטרנט, לפני המעבר לרשת הסגורה, ודא שיש לך:

### 1.1 קוד הפרויקט

צריך להעביר את כל תיקיית הפרויקט:

```bash
/Users/meni/dev/site-builder
```

אפשר להעביר כ-ZIP או דרך Git פנימי, אבל חשוב לכלול את הקבצים החדשים:

```text
docker-compose.dev.yml
scripts/dev/
docs/LOCAL_MONGO_DEV.md
docs/CLOSED_NETWORK_DOCKER_MONGO_RUNBOOK_HE.md
scripts/sharepoint-closed-export/
server/
src/
package.json
package-lock.json
```

### 1.2 Docker image של MongoDB

האימג' הדרוש:

```text
mongodb/mongodb-community-server:7.0-ubuntu2204
```

אם ברשת הסגורה אין גישה לאינטרנט או ל-Docker registry, שמור אותו לקובץ TAR במחשב עם אינטרנט:

```bash
mkdir -p offline-artifacts/docker
docker pull mongodb/mongodb-community-server:7.0-ubuntu2204
docker save mongodb/mongodb-community-server:7.0-ubuntu2204 \
  -o offline-artifacts/docker/mongodb-community-server-7.0-ubuntu2204.tar
```

את הקובץ הבא צריך להעביר לרשת הסגורה:

```text
offline-artifacts/docker/mongodb-community-server-7.0-ubuntu2204.tar
```

### 1.3 Node dependencies

הדרך המומלצת:

- אם ברשת הסגורה יש npm registry פנימי: להעביר את הקוד ולהריץ שם `npm ci`.
- אם אין npm registry פנימי: צריך להכין מראש דרך ארגונית להתקנת npm packages.

אפשרות זמנית רק אם המחשב כאן והמחשב ברשת הסגורה הם אותו סוג מערכת/מעבד:

```bash
npm install
tar -czf offline-artifacts/site-builder-node_modules.tgz node_modules
```

ברשת הסגורה:

```bash
tar -xzf site-builder-node_modules.tgz
```

הערה חשובה: העברת `node_modules` בין Mac/Linux/Windows או בין Intel/Apple Silicon עלולה להישבר בגלל חבילות platform-specific. עדיף `npm ci` בתוך הרשת הסגורה אם אפשר.

### 1.4 קבצי env לדוגמה

אל תעביר secrets אמיתיים בתוך Git. כן כדאי להעביר את קבצי הדוגמה שכבר קיימים:

```text
.env.local.example
server/.env.local.example
server/.env.test.example
```

ברשת הסגורה יוצרים מהם קבצי env אמיתיים.

---

## 2. איפה לשים את השרת ברשת הסגורה

מומלץ לבחור מכונה אחת פנימית ברשת הסגורה, למשל:

```text
site-builder-dev01
```

על המכונה הזאת ירוצו:

```text
MongoDB Docker container
Node.js backend API
Vite frontend dev server
```

מבנה מומלץ:

```text
/opt/site-builder/
  site-builder/
    package.json
    docker-compose.dev.yml
    server/
    src/
    scripts/
    docs/
    .env.local
    server/.env.local
    server/.env.test
```

אם זה Mac בתוך הרשת הסגורה, אפשר גם:

```text
/Users/<user>/dev/site-builder
```

העיקר: ה-backend וה-frontend צריכים לדעת לדבר עם Mongo ועם הכתובות הפנימיות הנכונות.

---

## 3. התקנות שצריך ברשת הסגורה

על המכונה הפנימית צריך:

```text
Docker Desktop / Docker Engine
Docker Compose
Node.js
npm
```

בדיקה:

```bash
docker --version
docker compose version
node --version
npm --version
```

אם Docker לא רץ:

```bash
docker info
```

צריך להחזיר מידע על Docker daemon. אם יש שגיאה, להפעיל Docker Desktop או שירות Docker לפי סוג המכונה.

---

## 4. טעינת Docker image ברשת סגורה

אם אין אינטרנט ברשת הסגורה, טען את האימג' מהקובץ שהכנת מראש:

```bash
docker load -i offline-artifacts/docker/mongodb-community-server-7.0-ubuntu2204.tar
```

בדיקה:

```bash
docker image ls mongodb/mongodb-community-server:7.0-ubuntu2204
```

צריך לראות:

```text
mongodb/mongodb-community-server   7.0-ubuntu2204
```

---

## 5. הגדרת קבצי env

בתוך תיקיית הפרויקט:

```bash
cp .env.local.example .env.local
cp server/.env.local.example server/.env.local
cp server/.env.test.example server/.env.test
```

### 5.1 Backend env

קובץ:

```text
server/.env.local
```

דוגמה למכונה שבה הכל רץ על אותה מכונה:

```env
MONGODB_URI=mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_dev
SERVER_PORT=3001
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
STORAGE_BACKEND=mongo
ADMIN_API_KEY=dev-local-api-key
SITE_COLLECTION_PREFIX=site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

אם פותחים את ה-Frontend מדפדפן במחשב אחר, צריך לשים ב-CORS גם את כתובת ה-Frontend הפנימית:

```env
CORS_ORIGINS=http://site-builder-dev01:5173,http://localhost:5173,http://127.0.0.1:5173
```

### 5.2 Frontend env

קובץ:

```text
.env.local
```

אם הכל רץ על אותה מכונה:

```env
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://localhost:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

אם פותחים את ה-Frontend ממחשב אחר ברשת:

```env
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://site-builder-dev01:3001
VITE_SITE_ID=local-dev-site
VITE_SITE_BUILDER_API_KEY=dev-local-api-key
VITE_AUTO_DEPLOY=false
```

חשוב:

- `VITE_SITE_BUILDER_API_KEY` חייב להיות זהה ל-`ADMIN_API_KEY`.
- `VITE_AUTO_DEPLOY` חייב להיות `false`.
- אין לשים כאן כתובת SharePoint.
- אין לשים כאן כתובת Mongo production.

### 5.3 Test env

קובץ:

```text
server/.env.test
```

דוגמה:

```env
MONGODB_URI=mongodb://localhost:27017/site_builder_test?replicaSet=rs0&directConnection=true
MONGODB_DB_NAME=site_builder_test
SERVER_PORT=3002
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
STORAGE_BACKEND=mongo
ADMIN_API_KEY=test-local-api-key
SITE_COLLECTION_PREFIX=test_site_
LEGACY_SHAREPOINT_READONLY_FALLBACK=false
```

---

## 6. הרצת MongoDB ב-Docker

מתוך תיקיית הפרויקט:

```bash
npm run dev:mongo:up
```

מה זה עושה:

- מפעיל MongoDB Community Server בקונטיינר.
- חושף Mongo רק ל-`127.0.0.1:27017`.
- מפעיל single-node replica set בשם `rs0`.
- שומר נתונים ב-Docker volume מקומי.

בדיקה:

```bash
npm run dev:mongo:check
```

צריך לקבל:

```text
Local Mongo preflight: PASS
```

אם רוצים לראות לוגים:

```bash
npm run dev:mongo:logs
```

כניסה ל-Mongo shell:

```bash
npm run dev:mongo:shell
```

עצירה:

```bash
npm run dev:mongo:down
```

---

## 7. הרצת שרת ה-Backend

בטרמינל נפרד:

```bash
npm run server:dev:mongo
```

השרת אמור לעלות על:

```text
http://localhost:3001
```

בדיקה:

```bash
curl http://localhost:3001/healthz
curl http://localhost:3001/api/healthz
```

תשובה תקינה:

```json
{
  "ok": true,
  "service": "site-builder-api",
  "storageBackend": "mongo"
}
```

אם עובדים ממחשב אחר ברשת, בדוק:

```bash
curl http://site-builder-dev01:3001/healthz
```

אם זה לא עובד, לבדוק firewall ושהשרת מאזין על כתובת שנגישה ברשת.

---

## 8. הרצת Frontend במצב Mongo

בטרמינל נוסף:

```bash
npm run dev:frontend:mongo
```

ברירת מחדל:

```text
http://localhost:5173
```

אם צריך לפתוח ממחשב אחר ברשת, מריצים Vite עם host:

```bash
node scripts/dev/run-with-env.mjs .env.local vite --host 0.0.0.0
```

ואז פותחים:

```text
http://site-builder-dev01:5173
```

במצב הזה חובה לוודא:

```env
VITE_BACKEND_API_URL=http://site-builder-dev01:3001
CORS_ORIGINS=http://site-builder-dev01:5173,http://localhost:5173,http://127.0.0.1:5173
```

---

## 9. כתובות שצריך לדעת איפה לשים

### כתובת Mongo

נמצאת ב:

```text
server/.env.local
```

שדה:

```env
MONGODB_URI=mongodb://localhost:27017/site_builder_dev?replicaSet=rs0&directConnection=true
```

### שם DB

נמצא ב:

```text
server/.env.local
```

שדה:

```env
MONGODB_DB_NAME=site_builder_dev
```

### כתובת שרת Backend

נמצאת ב:

```text
.env.local
```

שדה:

```env
VITE_BACKEND_API_URL=http://localhost:3001
```

או אם ניגשים ממחשב אחר:

```env
VITE_BACKEND_API_URL=http://site-builder-dev01:3001
```

### CORS של השרת

נמצא ב:

```text
server/.env.local
```

שדה:

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

או:

```env
CORS_ORIGINS=http://site-builder-dev01:5173,http://localhost:5173,http://127.0.0.1:5173
```

### API key

בשרת:

```text
server/.env.local
```

```env
ADMIN_API_KEY=dev-local-api-key
```

ב-Frontend:

```text
.env.local
```

```env
VITE_SITE_BUILDER_API_KEY=dev-local-api-key
```

הערכים חייבים להיות זהים.

---

## 10. בדיקה שה-Frontend מדבר עם Backend

בדיקת health ללא API key:

```bash
curl http://localhost:3001/api/healthz
```

בדיקת API מוגן עם API key:

```bash
curl -H "X-API-Key: dev-local-api-key" http://localhost:3001/api/sites
```

אם מקבלים `401`, הבעיה היא API key.

אם מקבלים שגיאת CORS בדפדפן, הבעיה היא `CORS_ORIGINS`.

אם ה-Frontend מנסה לקרוא `/api/...` יחסי במקום `http://...:3001`, חסר או שגוי:

```env
VITE_BACKEND_API_URL
```

---

## 11. עבודה עם SharePoint ברשת הסגורה

הסוכן לא ניגש ל-SharePoint. כל פעולה מול SharePoint נעשית ידנית או מתוך הסביבה הסגורה בלבד.

### 11.1 התקנת helper ל-export מתוך SharePoint

אם רוצים להתקין את helper ה-read-only לתוך SharePoint מתוך הרשת הסגורה:

```bash
npm run sharepoint:install-export-helper -- --site <siteCode> --dry-run
```

אם ה-dry-run נראה תקין ורק אז רוצים להעלות את helper files למסלול הכלים:

```bash
npm run sharepoint:install-export-helper -- --site <siteCode>
```

ה-helper אמור להעלות רק קבצי כלי לתיקיית helper ייעודית, ולא לגעת בקבצי TXT legacy.

לא להריץ:

```bash
npm run site:init
npm run deploy
```

### 11.2 Export ידני של TXT

אם לא מתקינים helper, אפשר להוריד ידנית את קבצי ה-TXT לכל אתר לתיקייה מקומית.

מבנה מומלץ למספר אתרים:

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

אם קוד האתר האמיתי כולל slash/subsite, שמים בתוך תיקיית האתר:

```json
{
  "siteCode": "Sites/main-site/subsite",
  "displayName": "Subsite Display Name",
  "siteRelativePath": "Sites/main-site/subsite"
}
```

---

## 12. Validate ל-export לפני Mongo dry-run

ולידציה לכל האתרים:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

או:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --batch
```

התוצר נוצר תחת:

```text
exports/sharepoint-closed/<batchExportId>/
```

פותחים את הדוח:

```text
exports/sharepoint-closed/<batchExportId>/report.md
```

אם הדוח הוא `FAIL`, לא ממשיכים ל-dry-run.

אם הדוח הוא `WARNING`, קוראים את האזהרות ומחליטים אם הן צפויות.

---

## 13. Mongo dry-run מתוך export artifact

רק אחרי שה-validation תקין:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- \
  --from-export exports/sharepoint-closed/<batchExportId> \
  --all-sites
```

זה dry-run בלבד:

- לא כותב ל-Mongo.
- לא דורס נתונים.
- לא נוגע ב-SharePoint.
- מציג תכנון import לפי אתר.
- מציג target Mongo collection לכל אתר.

Dry-run לאתר אחד:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- \
  --from-export exports/sharepoint-closed/<batchExportId>/sites/<safeSiteFolder> \
  --site <siteCode>
```

---

## 14. מה מבנה Mongo המתוכנן

DB אחד:

```text
site_builder_dev
```

Global collections:

```text
sites
site_data_revisions
site_data_audit_logs
```

לכל אתר collection משלו:

```text
site_<safe_name>_<hash>
```

חשוב:

- לא יוצרים collection לכל TXT.
- כל אתר מקבל collection נפרד.
- כל TXT legacy ממופה למסמכים בתוך collection של אותו אתר.
- שמות collection נוצרים דרך sanitizer, לא ישירות משם אתר.
- batch validation בודק collision בין collections לפני dry-run.

---

## 15. פקודות יומיות ברשת הסגורה

הפעלת Mongo:

```bash
npm run dev:mongo:up
```

בדיקת סביבה:

```bash
npm run dev:mongo:check
```

שרת:

```bash
npm run server:dev:mongo
```

Frontend:

```bash
npm run dev:frontend:mongo
```

ולידציה ל-export:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

Dry-run:

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- \
  --from-export exports/sharepoint-closed/<batchExportId> \
  --all-sites
```

עצירת Mongo:

```bash
npm run dev:mongo:down
```

---

## 16. Reset מקומי בלבד

אם צריך למחוק רק DB מקומי של dev/test:

```bash
npm run dev:mongo:reset -- --confirm-local-reset
```

הסקריפט אמור למחוק רק:

```text
site_builder_dev
site_builder_test
```

לא להריץ reset אם `MONGODB_URI` מצביע על שרת אמיתי או production.

---

## 17. Checklist לפני מעבר לרשת הסגורה

במחשב כאן:

- [ ] `docker image ls mongodb/mongodb-community-server:7.0-ubuntu2204` מציג image.
- [ ] אם אין אינטרנט ברשת הסגורה: נוצר `mongodb-community-server-7.0-ubuntu2204.tar`.
- [ ] קוד הפרויקט מוכן להעברה.
- [ ] `package-lock.json` קיים ומועבר.
- [ ] יש דרך להתקין dependencies ברשת הסגורה: `npm ci`, registry פנימי, או `node_modules` תואם.
- [ ] לא מעבירים secrets של production.
- [ ] לא מעבירים `.env.production`.
- [ ] יודעים מה תהיה כתובת המכונה הפנימית, למשל `site-builder-dev01`.
- [ ] יודעים מאיזה דפדפן יפתחו את ה-Frontend: אותה מכונה או מחשב אחר ברשת.
- [ ] יודעים אילו siteCode-ים צריך לייצא מ-SharePoint.

ברשת הסגורה:

- [ ] Docker רץ.
- [ ] Node/npm זמינים.
- [ ] Mongo image נטען.
- [ ] `.env.local`, `server/.env.local`, `server/.env.test` נוצרו.
- [ ] `VITE_BACKEND_API_URL` מצביע ל-backend הנכון.
- [ ] `CORS_ORIGINS` כולל את כתובת ה-Frontend.
- [ ] `ADMIN_API_KEY` ו-`VITE_SITE_BUILDER_API_KEY` זהים.
- [ ] `VITE_AUTO_DEPLOY=false`.
- [ ] `npm run dev:mongo:check` מחזיר PASS.
- [ ] `curl http://localhost:3001/api/healthz` מחזיר `ok: true`.

---

## 18. תקלות נפוצות

### Docker image לא נמצא

```bash
docker image ls mongodb/mongodb-community-server:7.0-ubuntu2204
```

אם אין image:

```bash
docker load -i offline-artifacts/docker/mongodb-community-server-7.0-ubuntu2204.tar
```

### Mongo לא עולה

```bash
docker compose -f docker-compose.dev.yml ps
docker compose -f docker-compose.dev.yml logs mongo
```

### Backend לא עולה

בדוק:

```bash
cat server/.env.local
npm run dev:mongo:check
npm run server:dev:mongo
```

חובה שיהיה:

```env
STORAGE_BACKEND=mongo
MONGODB_URI=...
ADMIN_API_KEY=...
```

### Frontend לא מצליח לשמור או לקרוא

בדוק:

```env
VITE_STORAGE_BACKEND=mongo
VITE_BACKEND_API_URL=http://...
VITE_SITE_BUILDER_API_KEY=...
```

בדפדפן, אם יש CORS:

```env
CORS_ORIGINS=http://...
```

### 401 מה-API

ה-API key לא תואם.

בדוק:

```text
server/.env.local -> ADMIN_API_KEY
.env.local -> VITE_SITE_BUILDER_API_KEY
```

### אסור להמשיך אם

- validation report הוא `FAIL`.
- batch validation מדווח collection collision.
- dry-run מדווח ערבוב אתרים.
- אחד מקבצי TXT ריק בלי הסבר.
- `VITE_AUTO_DEPLOY` לא `false`.
- env מצביע על production.

