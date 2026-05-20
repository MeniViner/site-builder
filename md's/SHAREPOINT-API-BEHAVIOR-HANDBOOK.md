# SharePoint API Behavior Handbook (Practical, Production-Oriented)

מדריך פרקטי ומלא לעבודה מול SharePoint: איך לחשוב, איך להתנהג, ואיך לכתוב קוד יציב.
המטרה כאן היא לא להסביר פרויקט ספציפי, אלא לתת תבנית עבודה כללית ונכונה מול SharePoint Online.

---

## 1) מודל מנטלי: איך SharePoint "חושב"

1. SharePoint הוא גם CMS/פורטל וגם Data Platform (רשימות, ספריות מסמכים, הרשאות, גרסאות).
2. ה-API המרכזי הקלאסי הוא SharePoint REST (`/_api/...`), בסגנון OData.
3. רוב הבעיות בפרודקשן הן לא "איך לעשות CRUD", אלא:
   - זהויות והרשאות.
   - תחרות עדכונים (Concurrency).
   - Throttling (429/503).
   - ביצועים (שאילתות רחבות מדי).
   - נתיבי קבצים ושמות בעייתיים (`#`, `%`, רווחים, גרשיים).
4. לכן: מתנהגים מול SharePoint כמו מול מערכת מבוזרת עם הרשאות קשוחות, ולא כמו local JSON store.

---

## 2) בחירת API נכונה (REST מול Graph מול PnPjs)

1. SharePoint REST (`/_api`)  
   מתאים כשאתה עובד עמוק על ישויות SharePoint (Lists, Libraries, Fields, Files, Roles) ובמיוחד כשצריך יכולות ספציפיות של SharePoint.
2. Microsoft Graph  
   מתאים כשאתה צריך אינטגרציה רחבה ב-M365 (Teams/Users/Groups/Drives) ולא רק SharePoint.
3. PnPjs  
   עטיפה נוחה מעל REST/Graph, מקצרת קוד. טובה מאוד ל-frontend/Node, אבל חשוב להבין גם את ה-REST הבסיסי כדי לדבג.

---

## 3) כללי זהב להתנהגות מול SharePoint

1. תמיד תבנה שכבת API אחידה (helpers) ולא `fetch` מפוזר בכל קומפוננטה.
2. תמיד תטפל ב-`429`, `503`, `Retry-After`.
3. תמיד תעבוד עם `ETag` ו-`If-Match` בעדכונים/מחיקות רגישות.
4. תצמצם payload:
   - `$select` לשדות שאתה צריך.
   - `$top` במקום לטעון הכל.
   - paging עם `@odata.nextLink`.
5. אל תשתמש ב-Display Name של עמודות; השתמש ב-Internal Name.
6. אל תסמוך על "שם קובץ נקי". תקודד נתיבים נכון.
7. פעולות כתיבה:
   - Cookie/context-based auth: לרוב דורש `X-RequestDigest`.
   - OAuth bearer: התנהגות שונה לפי תרחיש; בדוק את סוג האותנטיקציה שלך.
8. תעדיף הרשאות מינימליות (least privilege).
9. תנהל לוגים (request id, endpoint, status, duration).
10. תכנן retries עם backoff, אבל אל תעשה retry עיוור על כל 4xx.

---

## 4) Error Semantics שחייבים להכיר

1. `401` - אין auth תקף.
2. `403` - auth קיים אבל אין הרשאה.
3. `404` - ישות/נתיב לא קיים (או URL לא נכון).
4. `409` - קונפליקט (למשל יצירה של משהו שכבר קיים).
5. `412` - `If-Match` נכשל (ETag mismatch).
6. `429` - throttled.
7. `503` - שירות עמוס/זמני.

---

## 5) Mini SDK מומלץ (JavaScript) - פונקציה לכל צורך

הקוד הבא הוא Reference Implementation קטן. כל פונקציה קצרה, מופרדת, ובנויה לשימוש בפרודקשן.

```js
// sharepoint-client.js
const DEFAULT_HEADERS = {
  Accept: "application/json;odata=nometadata",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseRetryAfterSeconds(headers) {
  const h = headers.get("Retry-After");
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

function encodeODataString(value) {
  return String(value).replace(/'/g, "''");
}

async function readResponseBodySafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function spFetch(url, options = {}, retry = { max: 4, baseMs: 700 }) {
  const { max, baseMs } = retry;
  let attempt = 0;

  while (true) {
    const started = Date.now();
    const res = await fetch(url, {
      credentials: "include",
      ...options,
      headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
    });
    const duration = Date.now() - started;

    if (res.ok) return res;

    const isThrottle = res.status === 429 || res.status === 503;
    if (isThrottle && attempt < max) {
      const retryAfterSec = parseRetryAfterSeconds(res.headers);
      const waitMs = retryAfterSec
        ? retryAfterSec * 1000
        : baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
      await sleep(waitMs);
      attempt += 1;
      continue;
    }

    const body = await readResponseBodySafe(res);
    const err = new Error(
      `SharePoint request failed: ${res.status} ${res.statusText} | ${url}`
    );
    err.status = res.status;
    err.body = body;
    err.url = url;
    err.durationMs = duration;
    throw err;
  }
}

export async function getRequestDigest(siteUrl) {
  const res = await spFetch(`${siteUrl}/_api/contextinfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json;odata=verbose" },
  });
  const data = await res.json();
  return data?.d?.GetContextWebInformation?.FormDigestValue;
}

export async function getCurrentUser(siteUrl) {
  const res = await spFetch(`${siteUrl}/_api/web/currentuser`);
  return res.json();
}

export async function getWebInfo(siteUrl) {
  const res = await spFetch(`${siteUrl}/_api/web?$select=Id,Title,Url,Language`);
  return res.json();
}

export async function getListByTitle(siteUrl, listTitle) {
  const t = encodeODataString(listTitle);
  const res = await spFetch(
    `${siteUrl}/_api/web/lists/getbytitle('${t}')?$select=Id,Title,ItemCount,ListItemEntityTypeFullName`
  );
  return res.json();
}

export async function getListItemEntityTypeFullName(siteUrl, listTitle) {
  const data = await getListByTitle(siteUrl, listTitle);
  return data?.ListItemEntityTypeFullName || data?.d?.ListItemEntityTypeFullName;
}

export async function getListItems(siteUrl, listTitle, query = {}) {
  const t = encodeODataString(listTitle);
  const params = new URLSearchParams();
  if (query.select) params.set("$select", query.select);
  if (query.expand) params.set("$expand", query.expand);
  if (query.filter) params.set("$filter", query.filter);
  if (query.orderby) params.set("$orderby", query.orderby);
  if (query.top) params.set("$top", String(query.top));

  const url = `${siteUrl}/_api/web/lists/getbytitle('${t}')/items${
    params.toString() ? `?${params.toString()}` : ""
  }`;
  const res = await spFetch(url);
  return res.json();
}

export async function getListItemsPaged(nextLinkOrInitialUrl) {
  const res = await spFetch(nextLinkOrInitialUrl);
  const data = await res.json();
  return {
    items: data?.value || data?.d?.results || [],
    nextLink: data?.["@odata.nextLink"] || data?.d?.__next || null,
  };
}

export async function getListItemById(siteUrl, listTitle, itemId, select = "Id,Title") {
  const t = encodeODataString(listTitle);
  const res = await spFetch(
    `${siteUrl}/_api/web/lists/getbytitle('${t}')/items(${itemId})?$select=${encodeURIComponent(select)}`
  );
  return res.json();
}

export async function createListItem(siteUrl, listTitle, fields, options = {}) {
  const t = encodeODataString(listTitle);
  const entityType = options.entityType || (await getListItemEntityTypeFullName(siteUrl, listTitle));
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const body = { __metadata: { type: entityType }, ...fields };

  const res = await spFetch(`${siteUrl}/_api/web/lists/getbytitle('${t}')/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function updateListItem(siteUrl, listTitle, itemId, fields, options = {}) {
  const t = encodeODataString(listTitle);
  const entityType = options.entityType || (await getListItemEntityTypeFullName(siteUrl, listTitle));
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const ifMatch = options.ifMatch || "*"; // מומלץ ETag אמיתי ולא כוכבית כשצריך הגנה מתחרות

  const res = await spFetch(`${siteUrl}/_api/web/lists/getbytitle('${t}')/items(${itemId})`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
      "X-HTTP-Method": "MERGE",
      "If-Match": ifMatch,
    },
    body: JSON.stringify({ __metadata: { type: entityType }, ...fields }),
  });
  return res.status; // לרוב 204
}

export async function deleteListItem(siteUrl, listTitle, itemId, options = {}) {
  const t = encodeODataString(listTitle);
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const ifMatch = options.ifMatch || "*";

  const res = await spFetch(`${siteUrl}/_api/web/lists/getbytitle('${t}')/items(${itemId})`, {
    method: "POST",
    headers: {
      "X-RequestDigest": digest,
      "X-HTTP-Method": "DELETE",
      "If-Match": ifMatch,
    },
  });
  return res.status;
}

export async function recycleListItem(siteUrl, listTitle, itemId, options = {}) {
  const t = encodeODataString(listTitle);
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const res = await spFetch(
    `${siteUrl}/_api/web/lists/getbytitle('${t}')/items(${itemId})/recycle()`,
    {
      method: "POST",
      headers: { "X-RequestDigest": digest },
    }
  );
  return res.status;
}

export async function createFolder(siteUrl, serverRelativeUrl, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const res = await spFetch(`${siteUrl}/_api/web/folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify({
      __metadata: { type: "SP.Folder" },
      ServerRelativeUrl: serverRelativeUrl,
    }),
  });
  return res.json();
}

export async function ensureFolderPath(siteUrl, folderServerRelativeUrl, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const parts = folderServerRelativeUrl.split("/").filter(Boolean);
  let current = "";
  for (const p of parts) {
    current += `/${p}`;
    try {
      await createFolder(siteUrl, current, { digest });
    } catch (e) {
      if (e.status !== 409) {
        const msg = JSON.stringify(e.body || "");
        if (!/already exists/i.test(msg)) throw e;
      }
    }
  }
  return folderServerRelativeUrl;
}

export async function uploadFileSmall(siteUrl, folderServerRelativeUrl, fileName, content, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const folderEsc = encodeODataString(folderServerRelativeUrl);
  const nameEsc = encodeURIComponent(fileName).replace(/'/g, "%27");
  const url =
    `${siteUrl}/_api/web/GetFolderByServerRelativeUrl('${folderEsc}')` +
    `/Files/add(url='${nameEsc}',overwrite=true)`;

  const res = await spFetch(url, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
    body: content, // Blob/ArrayBuffer/String
  });
  return res.json();
}

export async function startUpload(siteUrl, fileServerRelativeUrl, uploadId, chunk, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const fileEsc = encodeODataString(fileServerRelativeUrl);
  const url =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${fileEsc}')` +
    `/StartUpload(uploadId=guid'${uploadId}')`;
  const res = await spFetch(url, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
    body: chunk,
  });
  return res.json(); // מחזיר offset
}

export async function continueUpload(siteUrl, fileServerRelativeUrl, uploadId, offset, chunk, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const fileEsc = encodeODataString(fileServerRelativeUrl);
  const url =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${fileEsc}')` +
    `/ContinueUpload(uploadId=guid'${uploadId}',fileOffset=${offset})`;
  const res = await spFetch(url, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
    body: chunk,
  });
  return res.json(); // מחזיר offset חדש
}

export async function finishUpload(siteUrl, fileServerRelativeUrl, uploadId, offset, chunk, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const fileEsc = encodeODataString(fileServerRelativeUrl);
  const url =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${fileEsc}')` +
    `/FinishUpload(uploadId=guid'${uploadId}',fileOffset=${offset})`;
  const res = await spFetch(url, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
    body: chunk,
  });
  return res.json();
}

export async function uploadFileLargeInChunks(siteUrl, folderServerRelativeUrl, file, options = {}) {
  const chunkSize = options.chunkSize || 10 * 1024 * 1024; // 10MB
  const digest = options.digest || (await getRequestDigest(siteUrl));

  // שלב 1: יצירת placeholder file
  const placeholder = await uploadFileSmall(
    siteUrl,
    folderServerRelativeUrl,
    file.name,
    new Uint8Array(0),
    { digest }
  );

  const fileUrl =
    placeholder?.d?.ServerRelativeUrl ||
    placeholder?.ServerRelativeUrl ||
    `${folderServerRelativeUrl}/${file.name}`;
  const uploadId = crypto.randomUUID();

  let offset = 0;
  let first = true;
  while (offset < file.size) {
    const end = Math.min(offset + chunkSize, file.size);
    const chunk = await file.slice(offset, end).arrayBuffer();

    if (first) {
      const r = await startUpload(siteUrl, fileUrl, uploadId, chunk, { digest });
      offset = Number(r?.d?.StartUpload || r?.StartUpload || end);
      first = false;
      continue;
    }

    if (end < file.size) {
      const r = await continueUpload(siteUrl, fileUrl, uploadId, offset, chunk, { digest });
      offset = Number(r?.d?.ContinueUpload || r?.ContinueUpload || end);
    } else {
      await finishUpload(siteUrl, fileUrl, uploadId, offset, chunk, { digest });
      offset = end;
    }
  }

  return { fileServerRelativeUrl: fileUrl };
}

export async function readTextFile(siteUrl, fileServerRelativeUrl) {
  const f = encodeODataString(fileServerRelativeUrl);
  const res = await spFetch(`${siteUrl}/_api/web/GetFileByServerRelativeUrl('${f}')/$value`, {
    headers: { Accept: "text/plain" },
  });
  return res.text();
}

export async function upsertTextFile(siteUrl, fileServerRelativeUrl, text, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const res = await spFetch(`${siteUrl}${fileServerRelativeUrl}`, {
    method: "PUT",
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-RequestDigest": digest, // בחלק מהתרחישים לא חובה, אבל בטוח לשים
    },
    body: text,
  });
  return res.status;
}

export async function deleteFile(siteUrl, fileServerRelativeUrl, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const f = encodeODataString(fileServerRelativeUrl);
  const res = await spFetch(`${siteUrl}/_api/web/GetFileByServerRelativeUrl('${f}')`, {
    method: "POST",
    headers: {
      "X-RequestDigest": digest,
      "X-HTTP-Method": "DELETE",
      "If-Match": "*",
    },
  });
  return res.status;
}

export async function recycleFile(siteUrl, fileServerRelativeUrl, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const f = encodeODataString(fileServerRelativeUrl);
  const res = await spFetch(`${siteUrl}/_api/web/GetFileByServerRelativeUrl('${f}')/recycle()`, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
  });
  return res.status;
}

export async function moveFile(siteUrl, srcServerRelativeUrl, dstServerRelativeUrl, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const src = encodeODataString(srcServerRelativeUrl);
  const dst = encodeURIComponent(dstServerRelativeUrl);
  const url =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${src}')` +
    `/moveto(newurl='${dst}',flags=1)`;
  const res = await spFetch(url, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
  });
  return res.status;
}

export async function copyFile(siteUrl, srcServerRelativeUrl, dstServerRelativeUrl, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const src = encodeODataString(srcServerRelativeUrl);
  const dst = encodeURIComponent(dstServerRelativeUrl);
  const url =
    `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${src}')` +
    `/copyto(strnewurl='${dst}',boverwrite=true)`;
  const res = await spFetch(url, {
    method: "POST",
    headers: { "X-RequestDigest": digest },
  });
  return res.status;
}

export async function batchRequest(siteUrl, rawBatchBody, boundary, options = {}) {
  const digest = options.digest || (await getRequestDigest(siteUrl));
  const res = await spFetch(`${siteUrl}/_api/$batch`, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/mixed; boundary=${boundary}`,
      "X-RequestDigest": digest,
    },
    body: rawBatchBody,
  });
  return res.text();
}
```

---

## 6) דוגמאות שימוש קטנות (Function-by-Function)

### 6.1 זיהוי משתמש מחובר

```js
const me = await getCurrentUser("https://contoso.sharepoint.com/sites/ops");
console.log(me.Title, me.Email, me.LoginName);
```

### 6.2 קבלת Digest לכתיבה

```js
const digest = await getRequestDigest("https://contoso.sharepoint.com/sites/ops");
console.log(digest.slice(0, 30));
```

### 6.3 קריאת פריטי רשימה

```js
const data = await getListItems(
  "https://contoso.sharepoint.com/sites/ops",
  "Tasks",
  { select: "Id,Title,Status,Modified", top: 100, orderby: "Modified desc" }
);
console.log(data.value?.length ?? data.d?.results?.length);
```

### 6.4 Paging לרשימה גדולה

```js
let url =
  "https://contoso.sharepoint.com/sites/ops/_api/web/lists/getbytitle('Tasks')/items?$select=Id,Title&$top=500";
const all = [];
while (url) {
  const page = await getListItemsPaged(url);
  all.push(...page.items);
  url = page.nextLink;
}
console.log("total:", all.length);
```

### 6.5 יצירת List Item

```js
await createListItem(
  "https://contoso.sharepoint.com/sites/ops",
  "Tasks",
  { Title: "בדיקת API", Status: "Open" }
);
```

### 6.6 עדכון List Item עם הגנת גרסאות

```js
// מומלץ להביא ETag קודם (ולא להשתמש ב-*)
await updateListItem(
  "https://contoso.sharepoint.com/sites/ops",
  "Tasks",
  42,
  { Status: "Closed" },
  { ifMatch: "*" }
);
```

### 6.7 מחיקת List Item

```js
await deleteListItem(
  "https://contoso.sharepoint.com/sites/ops",
  "Tasks",
  42
);
```

### 6.8 Recycle במקום Delete קשיח

```js
await recycleListItem(
  "https://contoso.sharepoint.com/sites/ops",
  "Tasks",
  42
);
```

### 6.9 יצירת תיקייה

```js
await createFolder(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/Reports/2026"
);
```

### 6.10 הבטחת היררכיית תיקיות מלאה

```js
await ensureFolderPath(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/Reports/2026/Q1"
);
```

### 6.11 העלאת קובץ קטן

```js
const blob = new Blob(["hello sharepoint"], { type: "text/plain" });
await uploadFileSmall(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/Reports/2026",
  "hello.txt",
  blob
);
```

### 6.12 העלאת קובץ גדול ב-chunks

```js
const input = document.querySelector("#fileInput");
const file = input.files[0];
await uploadFileLargeInChunks(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/Large",
  file,
  { chunkSize: 8 * 1024 * 1024 }
);
```

### 6.13 קריאת קובץ טקסט

```js
const txt = await readTextFile(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/config/app.json"
);
console.log(txt);
```

### 6.14 upsert לקובץ טקסט

```js
await upsertTextFile(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/config/app.json",
  JSON.stringify({ mode: "prod", version: 3 }, null, 2)
);
```

### 6.15 מחיקת קובץ

```js
await deleteFile(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/tmp/a.txt"
);
```

### 6.16 Recycle לקובץ

```js
await recycleFile(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/tmp/a.txt"
);
```

### 6.17 הזזה/העתקה של קובץ

```js
await moveFile(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/a.txt",
  "/sites/ops/Shared Documents/archive/a.txt"
);
```

```js
await copyFile(
  "https://contoso.sharepoint.com/sites/ops",
  "/sites/ops/Shared Documents/a.txt",
  "/sites/ops/Shared Documents/copies/a-copy.txt"
);
```

### 6.18 Batch Request

```js
const boundary = "batch_" + crypto.randomUUID();
const body =
  `--${boundary}\r\n` +
  `Content-Type: application/http\r\n` +
  `Content-Transfer-Encoding: binary\r\n\r\n` +
  `GET https://contoso.sharepoint.com/sites/ops/_api/web/lists/getbytitle('Tasks')/items?$top=10 HTTP/1.1\r\n` +
  `Accept: application/json;odata=nometadata\r\n\r\n` +
  `--${boundary}--`;

const raw = await batchRequest(
  "https://contoso.sharepoint.com/sites/ops",
  body,
  boundary
);
console.log(raw);
```

---

## 7) איך להתנהג נכון מול Lists (חשוב מאוד)

1. תכנן סכימה מראש:
   - Internal names יציבים.
   - Indexed columns לשדות פילטור.
2. תכתוב שאילתות ממוקדות:
   - `$select=Id,Title,...`
   - `$filter=Status eq 'Open'`
   - `$top=100`
3. תטפל ב-List View Threshold:
   - שאילתות על עמודות מאונדקסות.
   - paging תמידי.
4. תשתמש ב-`If-Match` כדי לא לדרוס עדכון של מישהו אחר.
5. שדות מיוחדים:
   - User/Lookup/Taxonomy דורשים payload מותאם.
   - תמיד לבדוק בפועל איך השדה מוחזר ומה ה-Internal Name שלו.

---

## 8) איך להתנהג נכון מול Files/Folders

1. לתוכן קטן/בינוני: `Files/add(overwrite=true)`.
2. לתוכן גדול: chunk upload (`StartUpload/ContinueUpload/FinishUpload`).
3. תיקיות:
   - אל תניח שהן קיימות.
   - `ensureFolderPath` לפני upload.
4. לנתיבים עם `%` ו-`#`:
   - השתמש ב-API שמבוסס על `ServerRelativePath/ResourcePath` (לפי גרסת API מתאימה).
5. מחיקה:
   - העדף recycle כשצריך יכולת שחזור.
6. תיעדוף overwrite:
   - קבצי מערכת: overwrite true לרוב מתאים.
   - מסמכים עסקיים: שקול versioning + locked behavior.

---

## 9) Concurrency וגרסאות

1. זרימה מומלצת לעדכון בטוח:
   - `GET item` + קח `ETag`.
   - `MERGE/UPDATE` עם `If-Match: "<etag>"`.
   - אם קיבלת `412`, תבצע רענון + החלטת merge עסקית.
2. `If-Match: "*"` טוב לעדכון כוחני, אבל מסוכן לנתונים רגישים.
3. ביישומים מרובי-עורכים, עדיף conflict resolution אמיתי ולא overwrite עיוור.

---

## 10) Throttling, Retry, ויציבות

1. תמיד לעשות retry רק ל-`429`/`503`.
2. לכבד `Retry-After` אם קיים.
3. להשתמש ב-exponential backoff + jitter.
4. להגדיר timeout בצד לקוח (אל תחכה לנצח).
5. להימנע מ-"storm":
   - לא לירות 200 בקשות בבת אחת.
   - לאחד קריאות עם batch כשאפשר.

---

## 11) אבטחה והרשאות

1. תבנה על least privilege.
2. אל תתן FullControl לאפליקציה אם לא חייבים.
3. תבדיל בין:
   - delegated (משתמש מחובר).
   - app-only (שירות רקע).
4. אל תשמור secrets בצד לקוח.
5. בשרת/אוטומציה:
   - השתמש ב-app registration + cert/secret לפי מדיניות ארגונית.

---

## 12) ביצועים

1. תשתמש ב-`$select` ו-`$top`.
2. תעדיף cache לנתונים סטטיים יחסית.
3. תשתמש ב-batch לקריאות רבות קטנות.
4. תימנע מהחזרת שדות כבדים כשלא צריך.
5. תמדוד latency לכל endpoint.

---

## 13) צ'ק-ליסט לפני עלייה לפרודקשן

1. Retry policy קיימת ומבוקרת.
2. ETag handling קיים בכל update/delete רגיש.
3. הרשאות מינימליות מאושרות.
4. logging + correlation IDs פעיל.
5. paging עובד על רשימות גדולות.
6. בדקת תרחישי 401/403/404/412/429/503.
7. יש fallback ברור כש-SharePoint איטי/לא זמין.
8. אין hardcoded URLs בלי קונפיג סביבתי.

---

## 14) מקורות רשמיים (Microsoft Learn)

1. Get to know the SharePoint REST service  
   https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/get-to-know-the-sharepoint-rest-service
2. Determine SharePoint REST service endpoint URIs  
   https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/determine-sharepoint-rest-service-endpoint-uris
3. Working with lists and list items with REST  
   https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/working-with-lists-and-list-items-with-rest
4. Working with folders and files with REST  
   https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/working-with-folders-and-files-with-rest
5. Make batch requests with the REST APIs  
   https://learn.microsoft.com/en-us/sharepoint/dev/sp-add-ins/make-batch-requests-with-the-rest-apis
6. Work with __REQUESTDIGEST (SPFx guidance)  
   https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/basics/working-with-requestdigest
7. Upload large files sample (chunk model explanation)  
   https://learn.microsoft.com/en-us/sharepoint/dev/solution-guidance/upload-large-files-sample-app-for-sharepoint

---

## 15) הערות פרקטיות אחרונות

1. SharePoint API נראה פשוט, אבל התפעול בפרודקשן תלוי במשמעת הנדסית:
   - retries נכונים,
   - הרשאות מדויקות,
   - תחרות עדכונים מטופלת,
   - ניטור טוב.
2. תתחיל קטן עם פונקציות יסוד (auth/digest/read/write), ורק אז תרחיב ל-chunks/batch/permissions.
3. אם אתה בונה SDK פנימי, תשמור את כל זה במקום אחד, עם בדיקות יחידה ואינטגרציה.

