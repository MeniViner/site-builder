# AlphaAI Backend - Project Overview

## 1) מטרת הפרויקט
`newAlphaAIBackend` הוא שרת Proxy ל-LLM שמספק API נקי (JSON + SSE) בלי להחזיר Frontend.

המטרות:
- תווך מאובטח בין הלקוח שלך לבין ספקי AI (OpenAI/Anthropic/וכו').
- תמיכה ב-Fallback בין מודלים במקרה כשל.
- תמיכה ב-Streaming (SSE) לשיפור חוויית משתמש.
- שליטה מרכזית ב-CORS, Rate Limit, Auth אופציונלי, לוגים וקאש.

## 2) מבנה התיקיות
- `server.js`: נקודת כניסה לשרת, CORS, Proxy trust, warning handling, router.
- `config/index.js`: קריאת ENV והגדרות ריצה.
- `routes/index.js`: כל ה-endpoints תחת `/api`.
- `controllers/aiController.js`: שכבת בקרה למסלולי direct/smart/stream.
- `services/AIService.js`: קריאות non-stream לספקים + fallback חכם.
- `services/StreamingService.js`: סטרימינג SSE + fallback מודלים.
- `services/KeyManager.js`: ניהול מפתחות API עם round-robin וחסימת 429.
- `middlewares/*`: auth, rate limit, ולידציה, error handling.
- `utils/*`: logger + cache.
- `docs/*`: תיעוד תפעולי.

## 3) Endpointים עיקריים
- `GET /api/health`
  - בדיקת זמינות בסיסית.
- `GET /api/init`
  - מחזיר מצב שרת, רשימת מודלים, ונתיבי API.
- `POST /api/ai/direct/:model`
  - שליחה ישירה למודל ספציפי (כולל cache).
- `POST /api/ai/smart`
  - fallback לפי סדר `FALLBACK_MODELS`.
- `POST /api/ai/stream`
  - SSE stream עם fallback (מודל יחיד או `any`).

## 4) לוגיקת Fallback
- `smart`:
  - עובר בין מודלים לפי הסדר עד הצלחה.
- `stream`:
  - מנסה מודל-אחר-מודל לפני שליחת headers.
  - ברגע שה-stream התחיל ללקוח, אי אפשר "להחליף מודל" באותה תשובה.
  - אם כל המודלים נכשלו: מתקבלת שגיאה עם פירוט סיבות.

## 5) אבטחה וגישה
- CORS פתוח לכולם כברירת מחדל (`ALLOW_ALL_ORIGINS=true`).
- `authGuard` כבוי כברירת מחדל (`DISABLE_AUTH_GUARD=true`), אפשר להדליק ב-ENV.
- Rate limiter פעיל למסלולי `/api/ai/*`.

## 6) Observability ולוגים
- logger מבוסס Winston.
- headers שימושיים בסטרים:
  - `X-Proxy-Model`
  - `X-Proxy-Key-Index`

## 7) הערות Production חשובות
- חובה מפתחות API אמיתיים.
- מומלץ לקבע `FRONTEND_DOMAIN` במקום `*`.
- מומלץ להדליק `DISABLE_AUTH_GUARD=false` ולהגדיר `API_SECRET_TOKEN`.
- להשתמש ב-HTTPS אמיתי בקצה (IIS/Nginx/Cloud).
