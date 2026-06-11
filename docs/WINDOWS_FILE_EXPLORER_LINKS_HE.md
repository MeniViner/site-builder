# פתיחת File Explorer מקישורים בכרום על Windows

## הבעיה

קישורי `file://` מתוך אתר רגיל ב-Chrome/Chromium נחסמים מטעמי אבטחה. לכן קישור שנראה תקין כמו `file:///Z:/folder` או `file://server/share` יכול לא לעשות כלום, ולא תמיד תופיע חלונית אישור.

בפרויקט הזה הנתיבים עדיין נשמרים כ-`file://` לצורך תאימות לאחור, אבל בזמן לחיצה על נתיב Windows או UNC הם מומרים לפרוטוקול מקומי:

```text
sitebuilder-open://open?target=<base64url-path>
```

הפרוטוקול הזה מחייב helper קטן שמותקן במחשב Windows של המשתמש. לאחר התקנה, Chrome יציג בקשה לפתיחת יישום חיצוני, וה-helper יפתח את File Explorer.

## התקנה במחשב משתמש

מתוך תיקיית הפרויקט או חבילת ההפצה, הרץ ב-PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-file-opener\install-sitebuilder-file-opener.ps1 -RunTest
```

ברירת המחדל מתקינה למשתמש הנוכחי בלבד תחת:

```text
%LOCALAPPDATA%\SiteBuilder\FileOpener
```

ורושמת את הפרוטוקול תחת:

```text
HKCU\Software\Classes\sitebuilder-open
```

להתקנה לכל המשתמשים במחשב, הרץ PowerShell כמנהל:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-file-opener\install-sitebuilder-file-opener.ps1 -AllUsers
```

במצב הזה הקבצים מותקנים תחת:

```text
%ProgramData%\SiteBuilder\FileOpener
```

והרישום נעשה תחת:

```text
HKLM\Software\Classes\sitebuilder-open
```

## בדיקה

1. פתח את Chrome מחדש.
2. באתר, הוסף קישור חיצוני עם נתיב כמו:

```text
Z:\public
```

או:

```text
\\fileserver\public\library
```

3. לחץ על הקישור.
4. אשר את חלונית Chrome לפתיחת `Site Builder File Opener`.

לבדיקת רישום ידנית:

```powershell
reg query HKCU\Software\Classes\sitebuilder-open\shell\open\command
```

או בהתקנת AllUsers:

```powershell
reg query HKLM\Software\Classes\sitebuilder-open\shell\open\command
```

לוגים נכתבים כאן:

```text
%LOCALAPPDATA%\SiteBuilder\FileOpener\sitebuilder-file-opener.log
```

## הסרה

למשתמש הנוכחי:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-file-opener\uninstall-sitebuilder-file-opener.ps1 -RemoveFiles
```

לכל המשתמשים, מתוך PowerShell כמנהל:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-file-opener\uninstall-sitebuilder-file-opener.ps1 -AllUsers -RemoveFiles
```

## אבטחה

ה-helper לא מריץ פקודות shell חופשיות. הוא:

- מקבל רק את הפרוטוקול `sitebuilder-open://open`.
- מפענח את `target` מ-base64url לנתיב.
- מאפשר רק נתיבי כונן Windows כמו `C:\...` או נתיבי UNC כמו `\\server\share`.
- חוסם תווים מסוכנים כמו `"`, `<`, `>` ו-`|`.
- מפעיל רק את `explorer.exe`.

אם רוצים הקשחה ארגונית מלאה, מומלץ לחתום את קובץ ה-PowerShell או להמיר את ה-helper ל-EXE חתום ולהפיץ אותו דרך GPO/Intune/מערכת ניהול תחנות.

## אלטרנטיבות שנבדקו

### `file://` ישיר

לא מספיק אמין ב-Chrome. זו בדיוק החסימה שהמשתמשים רואים היום.

### Microsoft Edge policy: `IntranetFileLinksEnabled`

ב-Edge קיימת מדיניות שמאפשרת לכתובות `file://` מאתרי HTTPS באזור intranet לפתוח File Explorer. היא שימושית בסביבה מנוהלת, אבל היא Edge-specific, תלויה בהגדרת intranet zone, ולא פותרת Chrome רגיל.

### Chrome/Edge external protocol policies

מדיניות כמו `ExternalProtocolDialogShowAlwaysOpenCheckbox` או `AutoLaunchProtocolsFromOrigins` יכולה לצמצם או להסיר את חלונית האישור אחרי שיש פרוטוקול חיצוני רשום. היא לא מחליפה את ה-helper, אלא רק משפרת את חוויית ההפעלה.

דוגמה לערך `AutoLaunchProtocolsFromOrigins` בסביבה מנוהלת:

```json
[
  {
    "protocol": "sitebuilder-open",
    "allowed_origins": ["https://portal.army.idf"]
  }
]
```

### Chrome extension + Native Messaging

זה הפתרון הכי נשלט לטווח ארוך אם רוצים הרשאות, טלמטריה ותקשורת דו-כיוונית. הוא דורש התקנת extension וגם Native Messaging Host רשום. כרגע זה יותר כבד מהצורך, אבל מתאים אם הארגון רוצה ניהול מרכזי מלא.

### File System Access API

יכול לפתוח חלון בחירת תיקייה/קובץ אחרי פעולת משתמש, אבל הוא לא יכול לפתוח Explorer ישירות לנתיב ידוע כמו `Z:\public`. לכן הוא לא מתאים לדרישה הזו.

### PWA protocol handlers / `navigator.registerProtocolHandler`

הם מיועדים לכך שאתר או PWA יטפלו בפרוטוקולים מסוימים, לרוב `web+...`. הם לא דרך לפתוח File Explorer לנתיב מקומי ידוע.

## המלצת יישום

1. להשאיר את ניהול הקישורים כפי שהוא: מנהל יכול להזין `Z:\...`, `C:\...` או `\\server\share`.
2. להפיץ את `install-sitebuilder-file-opener.ps1` בתחנות Windows הרלוונטיות.
3. לבדוק בפיילוט על Chrome עם קישור כונן וקישור UNC.
4. אם חלונית האישור מפריעה, להוסיף מדיניות ארגונית שמאפשרת `sitebuilder-open` מה-origin של האתר.
