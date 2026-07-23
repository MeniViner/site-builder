# פריסת סייר הקבצים הארגוני ב-Windows/IIS

## טופולוגיה

- ה-Frontend: `https://portal.army.idf/sites/schedule/siteDB/dist/index.html` ב-SharePoint.
- ה-API: `https://site-builder-api.example.internal` דרך IIS/ARR אל Node על `127.0.0.1:3001` בלבד.
- הזדהות: Windows Integrated Authentication ב-IIS. IIS מוחק כל `X-Site-Builder-User` שהגיע מהלקוח, מציב אותו מחדש מתוך `LOGON_USER`, ומעביר אותו ל-Node.
- ה-iframe נפתח מול ה-API. אין API key, cookie מותאם או סוד ב-Frontend. Chrome משתמש ב-Kerberos/NTLM מול IIS כאשר כתובת ה-API באזור Intranet המהימן.

## ערכי סביבה

ב-`server/.env` של השרת, ללא מרכאות:

```env
SERVER_HOST=127.0.0.1
SITE_BUILDER_FILE_EXPLORER_ROOTS=\\hrmazivfs\Malnash
SITE_BUILDER_FILE_EXPLORER_AUTH_MODE=windows-proxy
SITE_BUILDER_FILE_EXPLORER_API_ORIGIN=https://site-builder-api.example.internal
SITE_BUILDER_FILE_EXPLORER_ALLOWED_ORIGINS=https://portal.army.idf
SITE_BUILDER_FILE_EXPLORER_FRONTEND_URL=https://portal.army.idf/sites/schedule/siteDB/dist/index.html
SITE_BUILDER_FILE_EXPLORER_TRUSTED_USER_HEADER=x-site-builder-user
SITE_BUILDER_FILE_EXPLORER_TRUSTED_PROXY_ADDRESSES=127.0.0.1,::1
```

ב-`.env.production` של ה-Frontend:

```env
VITE_FILE_EXPLORER_API_URL=https://site-builder-api.example.internal
```

## IIS

1. הפעילו `Windows Authentication` וכבו `Anonymous Authentication` באתר ה-API.
2. אפשרו את משתנה השרת `HTTP_X_SITE_BUILDER_USER` ב-URL Rewrite.
3. לפני rewrite ל-Node, מחקו את הערך מהלקוח והציבו ערך חדש מ-`{LOGON_USER}`:

```xml
<rule name="Site Builder API to Node" stopProcessing="true">
  <match url="(.*)" />
  <serverVariables>
    <set name="HTTP_X_SITE_BUILDER_USER" value="" replace="true" />
    <set name="HTTP_X_SITE_BUILDER_USER" value="{LOGON_USER}" replace="true" />
  </serverVariables>
  <action type="Rewrite" url="http://127.0.0.1:3001/{R:1}" />
</rule>
```

4. חסמו firewall/ACL כל גישה חיצונית ל-port של Node. רק IIS המקומי רשאי להתחבר ל-`127.0.0.1:3001`.
5. העניקו לחשבון שמריץ את Node או את ה-App Pool של IIS הרשאות `Read` ו-`List folder contents` על `\\hrmazivfs\Malnash` ועל תיקיות המשנה. אין להשתמש בכונן ממופה.

## בדיקה וביטול

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows\file-explorer-smoke.ps1 -RepositoryPath C:\dev\site-builder -EnvPath C:\dev\site-builder\server\.env -ApiKey <ADMIN_API_KEY>
```

לביטול: הסירו את `VITE_FILE_EXPLORER_API_URL` מה-Frontend, פרסו מחדש את `dist`, והסירו את משתני `SITE_BUILDER_FILE_EXPLORER_*` מהשרת. שאר ה-API נשאר תחת `ADMIN_API_KEY` ללא שינוי.
