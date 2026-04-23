# AlphaAI Backend - Troubleshooting & Quick Fixes

## 1) שגיאת `Buffer()` / `DEP0005`
### סימפטום
- בלוגים מופיעה אזהרה:
  - `DeprecationWarning: Buffer() is deprecated...`

### סיבה
- בדרך כלל מגיע מתלות צד-שלישי, לא מהקוד הישיר שלך.

### פתרון מיידי
1. להריץ:
```powershell
npm run trace-deprecation
```
2. לאתר חבילה שמייצרת את האזהרה.
3. לעדכן dependency לגרסה חדשה.
4. אם לא דחוף: להשאיר את הסינון הקיים באפליקציה עד עדכון מסודר.

## 2) `All fallback models failed or timed out`
### סימפטום
- `smart` או `stream` מחזירים שגיאת fallback.

### בדיקה מהירה
1. ודא שהמפתחות אמיתיים.
2. ודא שהמודלים ב-`FALLBACK_MODELS` אכן זמינים אצל הספק.
3. בדוק response body של כל ניסיון מודל.

### פתרון מיידי
- להשאיר רק מודלים שבטוח עובדים:
```env
FALLBACK_MODELS=gpt-4o
```
- לבדוק מחדש ואז להרחיב בהדרגה.

## 3) `401 invalid_api_key`
### סיבה
- מפתח לא נכון, expired או לא שייך למודל המבוקש.

### פתרון
1. החלף מפתחות ב-`.env`.
2. בצע restart לשרת.
3. בדוק endpoint שוב.

## 4) `429 Too Many Requests`
### סיבה
- Rate limit של ספק AI או rate limiter ללקוח.

### פתרון מיידי
- להוסיף יותר מפתח API באותו ספק.
- להפחית עומס/קצב בקשות.
- להמתין לשחרור חסימה.

## 5) CORS errors בדפדפן
### סימפטום
- `blocked by CORS policy`.

### פתרון מיידי (פתוח לכולם)
```env
ALLOW_ALL_ORIGINS=true
FRONTEND_DOMAIN=*
```

### פתרון Production
```env
ALLOW_ALL_ORIGINS=false
FRONTEND_DOMAIN=https://your-frontend-domain
```

## 6) Auth 401 מה-`authGuard`
### סיבה
- `DISABLE_AUTH_GUARD=false` אבל לא נשלח `x-api-token`.

### פתרון מיידי
- זמנית:
```env
DISABLE_AUTH_GUARD=true
```
- או לעבוד מאובטח:
```env
DISABLE_AUTH_GUARD=false
API_SECRET_TOKEN=your-secret
```
ולשלוח header:
`x-api-token: your-secret`

## 7) Stream נתקע או נסגר מהר
### סיבות אפשריות
- timeout קצר מדי.
- proxy reverse (IIS/Nginx) סוגר חיבורים ארוכים.
- client מנתק מוקדם.

### פתרון מיידי
1. הגדל timeout:
```env
STREAM_TIMEOUT_MS=90000
```
2. ודא שה-proxy לא עושה buffering/timeout קצר.
3. בדוק לוגים אם יש `Client disconnected`.

## 8) בעיות מאחורי IIS / Reverse Proxy
### סימפטום
- IP לא נכון, rate limit מתנהג מוזר, SSE נשבר.

### פתרון מיידי
```env
TRUST_PROXY=true
```
וודא forwarding של headers (`X-Forwarded-*`).

## 9) DNS + SSL ב-iOS אבל עדיין שגיאה
### בדיקות חובה
1. שה-cert chain מלאה ותקינה.
2. שה-hostname בתעודה תואם בדיוק לדומיין.
3. שאין mixed content (HTTP בתוך HTTPS app).
4. שהשרת backend עצמו תקין דרך `curl`/Postman מחוץ ל-iOS.

### פקודת בדיקה מהירה לשרת עצמו
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -Method Get
```

## 10) צ'קליסט "תיקון עכשיו"
1. להריץ `npm start`.
2. לבדוק `/api/health` ו-`/api/init`.
3. לבדוק `smart` ו-`stream` עם prompt קצר.
4. אם יש 401: לתקן keys.
5. אם יש CORS: לפתוח `ALLOW_ALL_ORIGINS=true`.
6. אם יש timeout: להעלות `STREAM_TIMEOUT_MS`.
7. אם Buffer warning: להריץ `npm run trace-deprecation` ולעדכן dependency.
