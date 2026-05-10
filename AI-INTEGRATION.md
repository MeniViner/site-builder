# Alpha AI Integration (newAlphaAIBackend)

הפרויקט הראשי כולל עכשיו שכבת קליינט מוכנה ל-`newAlphaAIBackend`.

## מה נוסף

- קונפיגורציה מרכזית: `src/config/ai.config.js`
- שירות API לפרונט: `src/services/AIService.js`
- משתני env חדשים: `.env.production`
- סקריפטים להרצת ה-backend מה-root:
  - `npm run ai:backend:install`
  - `npm run ai:backend:dev`
  - `npm run ai:backend:start`

## env לבחירת מודל ופאלבק

```env
VITE_ALPHA_AI_ENABLED=true
VITE_UI_SHOW_AI_UI=true
VITE_UI_SHOW_QUICK_DESIGN_COMPOSER=true
VITE_ALPHA_AI_API_BASE=http://127.0.0.1:3000/api
VITE_ALPHA_AI_REQUEST_MODE=direct
VITE_ALPHA_AI_MODEL=gpt-4o
VITE_ALPHA_AI_FALLBACK_MODELS=claude-3-haiku-20240307,gemini-1.5-pro
VITE_ALPHA_AI_USE_SMART_FALLBACK=true
VITE_ALPHA_AI_STREAM_MODEL=any
VITE_ALPHA_AI_TIMEOUT_MS=30000
VITE_ALPHA_AI_STREAM_TIMEOUT_MS=120000
VITE_ALPHA_AI_API_TOKEN=
```

דגלי UI:

- `VITE_UI_SHOW_AI_UI` – מציג/מסתיר את כל אפשרויות ה-AI בממשק.
- `VITE_UI_SHOW_QUICK_DESIGN_COMPOSER` – מציג/מסתיר את "הרכבה מהירה במשפט אחד" (עיצוב מהיר) במסך העיצוב.

## איך עובד הפאלבק

1. `ask()` בודק את `VITE_ALPHA_AI_REQUEST_MODE`.
2. אם `direct`:
3. מנסה קודם את `VITE_ALPHA_AI_MODEL`.
4. אם יש כשל זמינות/timeout/5xx/429, עובר למודלים ב-`VITE_ALPHA_AI_FALLBACK_MODELS`.
5. אם הכל נכשל ו-`VITE_ALPHA_AI_USE_SMART_FALLBACK=true`, מתבצע fallback אחרון ל-`/api/ai/smart`.
6. אם `smart`, נשלחת בקשה אחת ל-`/api/ai/smart` והשרת מנהל את הפאלבק.

## שימוש בקוד

```js
import AIService from '../services/AIService';

const result = await AIService.ask('תן סיכום קצר למסמך המצורף');
console.log(result.content, result.modelUsed, result.strategy);
```

מודל ספציפי בריצה:

```js
const result = await AIService.ask('נסח הודעה למשתמש', {
  model: 'gpt-4o-mini',
  fallbackModels: ['claude-3-haiku-20240307'],
});
```

סטרימינג:

```js
const streamResult = await AIService.stream('כתוב טיוטת מייל', {
  model: 'any',
  onToken: (token) => {
    // update UI incrementally
    console.log(token);
  },
});

console.log(streamResult.content);
```

בדיקות בסיס:

```js
await AIService.health();
await AIService.init();
```

## איפה זה כבר משולב בניהול

- ניהול מידע (`AdminSiteContent`) – יצירת טקסטי Hero + דבר המפקד.
- ניהול ניווט (`AdminNavigation`) – יצירת עץ קטגוריות/תתי קטגוריות/קישורים.
- ניהול אירועים (`AdminEvents`) – יצירת רשימת אירועים + הגדרות תצוגה.
- ניהול עיצוב (`AdminTheme`) – יצירת סט הגדרות Theme מלא.
- עוזר AI תפעולי חדש (`/admin/ai-help`) – שאלות חופשיות על תפעול המסכים.
