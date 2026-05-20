# הגדרת מנהלים ו-SharePoint לכל אתר (שלב אחר שלב)

## מה הותאם בקוד
- כפתור `ניהול` מוצג רק כש-`isAdmin === true`.
- נתיב `/admin` מוגן: משתמש לא-מנהל מנותב חזרה לדף הבית.
- אפשר להגדיר מנהלים לפי:
  - `name`
  - `email`
  - `loginName`
  - `personalNumber` (מספר אישי)

## 1) הגדרת קישורי SharePoint לכל אתר (בכל פעם שמקימים אתר חדש)
בנה קובץ `.env.production` (או עדכן אותו) עם הנתיבים של האתר הרלוונטי:

```env
VITE_SP_EVENTS_FILE_URL=/sites/<SITE_NAME>/SiteAssets/events_data.txt
VITE_SP_NAV_FILE_URL=/sites/<SITE_NAME>/SiteAssets/nav_data.txt
VITE_SP_USERS_FILE_URL=/sites/<SITE_NAME>/SiteAssets/users_data.txt
VITE_SP_SITE_CONTENT_FILE_URL=/sites/<SITE_NAME>/SiteAssets/site_content_data.txt
VITE_SP_THEME_FILE_URL=/sites/<SITE_NAME>/SiteAssets/theme_data.txt
VITE_SP_WIDGETS_FILE_URL=/sites/<SITE_NAME>/SiteAssets/widgets_data.txt
VITE_SP_EXTERNAL_LINKS_FILE_URL=/sites/<SITE_NAME>/SiteAssets/external_links_data.txt
VITE_SP_IMAGE_BASE_FOLDER=/sites/<SITE_NAME>/SiteAssets/Images
```

הערה: לכל אתר SharePoint יש `users_data.txt` משלו, ולכן לכל אתר יכולה להיות רשימת מנהלים שונה.

## 2) הגדרת מצב Preview/Build בלי הרשאות ניהול פתוחות
מומלץ להגדיר:

```env
VITE_USE_MOCK=false
VITE_ALLOW_MOCK_ADMIN_BYPASS=false
```

אם כן משתמשים ב-Mock לפיתוח מקומי, אפשר להדליק זמנית:

```env
VITE_ALLOW_MOCK_ADMIN_BYPASS=true
```

## 3) איפה לשים מספר אישי של מנהלים
ב-SharePoint, בתוך הקובץ שהוגדר ב-`VITE_SP_USERS_FILE_URL` (בד"כ `SiteAssets/users_data.txt`), שמים JSON כזה:

```json
[
  {
    "id": "1",
    "name": "ישראל ישראלי",
    "personalNumber": "1234567",
    "loginName": "idf\\1234567",
    "email": "israel@example.mil",
    "role": "admin"
  },
  {
    "id": "2",
    "name": "מנהל נוסף",
    "personalNumber": "7654321",
    "role": "admin"
  }
]
```

המערכת מזהה מנהל אם יש התאמה לפחות באחד מהשדות (`personalNumber` / `loginName` / `email` / `name`).

## 4) איך לדעת מה לשים בדיוק ב-loginName/מספר אישי
1. התחבר עם המשתמש לאתר SharePoint.
2. פתח בדפדפן:
`https://<TENANT>.sharepoint.com/sites/<SITE_NAME>/_api/web/currentuser`
3. קח את הערכים מתוך `d.Title`, `d.LoginName`, `d.Email`.
4. עדכן ב-`users_data.txt` לפחות ערך אחד שיתאים למשתמש (מומלץ `personalNumber` ו/או `loginName`).

## 5) צ'קליסט הפעלה לכל אתר חדש
1. ליצור/לעדכן `.env.production` עם נתיבי האתר החדש.
2. לוודא שקבצי `SiteAssets/*.txt` קיימים באתר.
3. לעדכן `users_data.txt` עם המנהלים של אותו אתר (כולל מספר אישי).
4. להריץ `npm run build`.
5. לפרוס את תיקיית `dist` לאתר היעד.
6. בדיקה עם שני משתמשים:
   - מנהל: רואה `ניהול` ונכנס ל-`/admin`.
   - לא מנהל: לא רואה `ניהול`, ו-`/admin` מחזיר לדף הבית.
