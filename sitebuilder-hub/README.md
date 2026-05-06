# Site Builder Hub (MVP1.1)

מערכת ניהול מרכזית נפרדת לאתרי Site Builder, ללא הפעלת אוטומציות SharePoint בשלב זה.

## דרישות מקדימות
- Node.js 20+
- npm 10+
- MongoDB מקומי פעיל

## התקנה
```bash
cd sitebuilder-hub
npm run install:all
```

## משתני סביבה
1. העתיקו `sitebuilder-hub/.env.example` ל-`sitebuilder-hub/.env`
2. העתיקו ערכים רלוונטיים גם ל-`sitebuilder-hub/server/.env` ול-`sitebuilder-hub/client/.env`

Root `.env.example`:
- `SERVER_PORT=4100`
- `MONGO_URI=mongodb://127.0.0.1:27017/sitebuilder_hub`
- `CLIENT_ORIGIN=http://localhost:5177`

Client `.env.example`:
- `VITE_API_BASE_URL=http://localhost:4100/api`

## MongoDB בדוקר
```bash
docker run -d --name sitebuilder-mongo -p 27017:27017 mongo:7
```

## פקודות הרצה
```bash
npm run dev
npm run dev:server
npm run dev:client
npm run build
npm run check
npm run seed
```

## כתובות עבודה
- Backend: `http://localhost:4100`
- Frontend: `http://localhost:5177`

## MVP1.1 כולל
- API אחיד (`ok/data/meta` + פורמט שגיאה עקבי)
- CRUD מלא לרשומות אתר
- ארכוב soft-delete
- Dashboard RTL עם חיפוש/סינון/מיון/מצבי טעינה-ריק-שגיאה
- סטטוס עסקי + סטטוס תקינות נגזר
- עמוד פרטי אתר עם עדכון ידני לבדיקת תקינות
- seed ריאליסטי ואידמפוטנטי

## מה עדיין לא ממומש
- יצירת אתרי SharePoint בפועל
- Provisioning/Deploy jobs
- Health checks אוטומטיים מול SharePoint
- queue לניהול jobs

## MVP2 מוצע
- Health checks אמיתיים מול SharePoint
- pipeline מבוקר ל-create/deploy
- jobs queue עם retries ו-audit log
- הרשאות משתמשים ורמות גישה
- מרכז לוגים ופעולות תיקון אוטומטיות (admins/permissions)
