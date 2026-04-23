# AlphaAI Backend - Implementation Guide

## 1) דרישות מקדימות
- Node.js 18+ (מומלץ 20+).
- גישה לאינטרנט ל-API של ספקי AI.
- מפתחות API תקינים.

בדיקה מהירה:
```powershell
node -v
npm -v
```

## 2) התקנה
בתיקיית הפרויקט:
```powershell
npm install
```

## 3) קובץ `.env` מינימלי
דוגמה:
```env
PORT=3000
NODE_ENV=development

FRONTEND_DOMAIN=*
ALLOW_ALL_ORIGINS=true
DISABLE_AUTH_GUARD=true
TRUST_PROXY=true
API_SECRET_TOKEN=

OPENAI_API_KEYS=sk-...
ANTHROPIC_API_KEYS=
GEMINI_API_KEYS=
FALLBACK_MODELS=gpt-4o,claude-3-haiku-20240307
DEFAULT_TIMEOUT_MS=15000
STREAM_TIMEOUT_MS=45000
```

## 4) הרצה
```powershell
npm start
```

הרצה עם trace לאיתור אזהרות deprecated:
```powershell
npm run trace-deprecation
```

## 5) בדיקות Smoke מהירות
### Health
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -Method Get
```

### Init
```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/init" -Method Get
```

### Smart fallback
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/ai/smart" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"prompt":"hello"}' `
  -SkipHttpErrorCheck
```

### Stream fallback (`model=any`)
```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/ai/stream" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"prompt":"hello","model":"any"}' `
  -SkipHttpErrorCheck
```

## 6) חיבור לפרונט
- כל הקריאות יוצאות ל-`/api/*`.
- לסטרים, השתמש ב-EventSource או fetch-streaming בצד לקוח.
- אם אתה מפעיל auth:
  - הגדר `DISABLE_AUTH_GUARD=false`
  - שלח header בשם `x-api-token`.

## 7) מעבר מ-Open mode ל-Production secure mode
שנה ENV:
```env
ALLOW_ALL_ORIGINS=false
FRONTEND_DOMAIN=https://your-frontend-domain
DISABLE_AUTH_GUARD=false
API_SECRET_TOKEN=your-strong-secret
```

## 8) המלצות יישום מיידי
- לשים לפחות 2 מפתחות לספק עיקרי כדי לשפר זמינות.
- לוודא `FALLBACK_MODELS` כולל רק מודלים שבאמת פעילים אצלך.
- להוסיף health checks תשתיתיים (IIS/Load balancer).
