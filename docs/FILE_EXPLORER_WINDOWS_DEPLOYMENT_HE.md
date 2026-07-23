# פריסת סייר הקבצים הארגוני ב-Windows/IIS

## טופולוגיה מאושרת

- ה-Frontend נפתח ב-`https://portal.army.idf/sites/<site>/siteDB/dist/index.html`.
- הדפדפן פונה רק לאותו origin, בנתיב הקבוע `/_site-builder/file-explorer`.
- IIS/ARR מבצע proxy של נתיב שמור זה בלבד אל `http://127.0.0.1:3001/_site-builder/file-explorer`.
- Node נשאר קשור ל-`127.0.0.1`; אין API חיצוני, CORS, API key או שם host חיצוני ב-Frontend.
- Chrome עשוי להציג index מקורי כאשר מדביקים ידנית `file://...` לשורת הכתובת. זו אבחנה ידנית בלבד: היישום אינו פותח, מנווט או מטמיע כתובת זו. הממשק המבצעי הוא סייר Site Builder הפנימי.

## מודל גישה לקבצים

מיושם **Model A - service identity**: לחשבון השירות של Node/App Pool יש `Read` ו-`List folder contents` על `\\hrmazivfs\Malnash`. זה מתאים לתוכן מאושר זהה לכל המשתמשים. הרשאות SMB של משתמש הדפדפן אינן עוברות אוטומטית ל-Node. Model B/Kerberos delegation אינו מיושם בחבילה זו.

## ערכי סביבה

ב-`server/.env`:

```env
SERVER_HOST=127.0.0.1
SITE_BUILDER_FILE_EXPLORER_ROOTS=\\hrmazivfs\Malnash
SITE_BUILDER_FILE_EXPLORER_AUTH_MODE=windows-proxy
SITE_BUILDER_FILE_EXPLORER_BRIDGE_PATH=/_site-builder/file-explorer
SITE_BUILDER_FILE_EXPLORER_ALLOWED_ORIGINS=https://portal.army.idf
SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL=https://portal.army.idf/sites/<site>/siteDB/dist/index.html
SITE_BUILDER_FILE_EXPLORER_TRUSTED_USER_HEADER=x-site-builder-user
SITE_BUILDER_FILE_EXPLORER_TRUSTED_PROXY_ADDRESSES=127.0.0.1,::1
SITE_BUILDER_FILE_EXPLORER_ACCESS_MODEL=service-identity
```

ב-`.env.production` של ה-Frontend אין צורך ב-`VITE_FILE_EXPLORER_API_URL`. הערך המותר הוא:

```env
VITE_FILE_EXPLORER_BRIDGE_PATH=/_site-builder/file-explorer
```

## IIS

השתמשו בדוגמה [IIS_FILE_EXPLORER_SAME_ORIGIN_REWRITE.xml](IIS_FILE_EXPLORER_SAME_ORIGIN_REWRITE.xml). הפעילו Windows Authentication וכבו Anonymous Authentication **רק** על הנתיב השמור. הכלל מוחק header שהגיע מהלקוח, מציב `X-Site-Builder-User` מ-`{LOGON_USER}`, ומבצע rewrite רק לנתיב השמור. אין כלל proxy לנתיבי API אחרים ואין גישה חיצונית ל-port `3001`.

## בדיקה

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\file-explorer-smoke.ps1 `
  -RepositoryPath C:\dev\site-builder `
  -EnvPath C:\dev\site-builder\server\.env `
  -ApiKey <ADMIN_API_KEY>
```

הבדיקה מאמתת את נתיב הפורטל, Windows Authentication, ניקוי header מזויף, proxy ל-Node, קריאת שורש UNC, listing אמיתי, ואבחון loopback למפעיל. ה-endpoint `diagnostic/native-url` מחזיר URL מסוג `file://` רק עם API key למפעיל; יש להעתיקו ידנית לשורת הכתובת של Chrome בלבד.

## ביטול

שחזרו את `dist` ואת קובצי הסביבה הקודמים, הסירו את כלל ה-rewrite של הנתיב השמור, ואתחלו IIS/Node. אל תשנו נתיבי API אחרים.
