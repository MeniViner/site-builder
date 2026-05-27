// NEW-SITE-AUTOMATION.md

# פתיחת אתר SharePoint חדש - מדריך אוטומציה מלא

מדריך זה מגדיר תהליך קבוע לכל אתר חדש במבנה:

- `/sites/<siteCode>/siteDB`
- `/sites/<siteCode>/siteUsersDb`

כאשר:

- `siteDB` = קבצי מערכת/ניהול (מוגבל למנהלים).
- `siteUsersDb` = קבצי TXT שנדרשת להם עריכה מצד משתמשי קצה.

## 1) משתני סביבה (פעם אחת לכל אתר)

ערוך את `.env.production`:

```env
VITE_SP_HOST=portal.army.idf
VITE_SP_SITE_CODE=<siteCode>
VITE_SP_SITE_DB_FOLDER=siteDB
VITE_SP_USERS_DB_FOLDER=siteUsersDb
VITE_SP_SITE_ASSETS_FOLDER=siteAssets
VITE_SP_IMAGES_FOLDER=images
VITE_SP_WIDGETS_DB_TARGET=users

VITE_SP_SITE_API_ROOT=/sites/<siteCode>
VITE_SITE_BASE_URL=https://portal.army.idf/sites/<siteCode>/siteDB/dist

# Logging (מרוכז)
VITE_SP_VERBOSE_LOG=false
VITE_SP_APP_LOGS=false
VITE_SP_APP_WARN_ERROR_LOGS=false
VITE_SP_PERMISSIONS_SETUP_LOGS=false
VITE_SP_LIBRARY_PROVISIONING_LOGS=false
VITE_SP_ADMIN_MANAGEMENT_LOGS=false
VITE_SP_ENABLE_OWNERS_MANAGEMENT_LOGS=false
VITE_SP_LOG_FETCH_ADMINS=false
VITE_SP_LOG_FETCH_ADMINS_VERBOSE=false
VITE_SP_BOOTSTRAP_SETUP_LOGS=false
VITE_ALPHA_AI_DEBUG=false

VITE_AUTO_DEPLOY=true
VITE_AUTO_DEPLOY_STRICT=false
```

הערה:

- `VITE_SP_WIDGETS_DB_TARGET=users` אומר ש-`widgets_data.txt` יישמר ב-`siteUsersDb`.
- אם רוצים שהווידג'טים יהיו רק במרחב מנהלים, שנה ל-`site`.

## 2) יצירת מבנה אתר וקבצים אוטומטית

הרץ:

```bash
npm run site:init
```

לתצוגה בלי כתיבה בפועל:

```bash
node scripts/init-sharepoint-site.js --dry-run
```

הסקריפט:

- מעדכן/כותב `.env.production` לפי הערכים.
- יוצר תיקיות:
  - `/sites/<siteCode>/siteDB`
  - `/sites/<siteCode>/siteDB/dist`
  - `/sites/<siteCode>/siteDB/siteAssets`
  - `/sites/<siteCode>/siteDB/images`
  - `/sites/<siteCode>/siteUsersDb`
- יוצר קבצי TXT דיפולט אם חסרים (לא דורס תוכן קיים).

## 3) Build + Deploy אוטומטי

הרץ:

```bash
npm run build
```

כיוון שמוגדר `postbuild`, יקרה אוטומטית:

1. `scripts/init-sharepoint-site.js`
2. `deploy.js` (robocopy אל `/sites/<siteCode>/siteDB/dist`)

אם `VITE_AUTO_DEPLOY=false`, ה-postbuild ידלג.
אם `VITE_AUTO_DEPLOY_STRICT=true`, כל כשל deploy יכשיל את תהליך ה-build.

להרצת deploy ידנית בלבד:

```bash
npm run deploy
```

לבדיקת deploy ללא כתיבה:

```bash
node deploy.js --dry-run --force
```

## 8) טיפול בשגיאת Quota (`0x0000050F`)

אם אתה רואה:

- `ERROR 1295 (0x0000050F)`
- `The storage quota was exceeded`

המשמעות: אין מספיק מקום פנוי ביעד.

ה-`deploy.js` עובד עכשיו בברירת מחדל עם `clean-first`:

1. מנקה קודם את תיקיית היעד `dist`.
2. רק אחר כך מעתיק את ה-build החדש.

כך אין צורך במקום כפול בזמן ההחלפה.

אם תרצה לבטל ניקוי מקדים (לא מומלץ כשיש מגבלת נפח):

```bash
node deploy.js --force --no-clean-first
```

אם עדיין נכשל גם אחרי clean-first, אז באמת אין מקום כולל באתר, וצריך למחוק תוכן כבד קיים (למשל קבצי תמונה/גיבויים ישנים) באותו site.

## 4) מודל הרשאות מומלץ ב-SharePoint

הגדר הרשאות נפרדות:

1. `siteDB`
   - Visitors: `Read`
   - Managers/Admins: `Edit` או `Full Control`
2. `siteUsersDb`
   - Visitors/Authenticated users: `Contribute` (עריכה לקבצים הדרושים)
   - Managers/Admins: `Edit` או `Full Control`

מומלץ לעצור inheritance ולהגדיר הרשאות ייעודיות לכל תיקייה.

## 5) מיקום הקבצים במבנה החדש

- `siteDB/siteAssets`:
  - `bihs_master_config_v1.txt`
  - `users_data.txt`
  - `events_data.txt`
  - `nav_data.txt`
  - `site_content_data.txt`
  - `theme_data.txt`
  - `external_links_data.txt`
- `siteUsersDb`:
  - `widgets_data.txt` (כאשר `VITE_SP_WIDGETS_DB_TARGET=users`)

## 6) בדיקות אחרי הקמה

1. פתח אתר וודא שאין `404/401` בקונסול עבור קבצי TXT.
2. בדוק שמירה ממסך ניהול.
3. בדוק העלאת תמונה.
4. בדוק שבפועל קבצים נכתבו לנתיבים החדשים (`siteDB/siteAssets` ו-`siteUsersDb`).

## 7) פתיחת אתר חדש נוסף

לכל אתר חדש:

1. הרץ:

```bash
npm run site:init -- --site <siteCode> --host portal.army.idf --write-env
```

2. בדוק dry-run (אופציונלי):

```bash
node scripts/init-sharepoint-site.js --dry-run
node deploy.js --dry-run --force
```

3. הרץ build+deploy:

```bash
npm run build
```

זה הכול.
