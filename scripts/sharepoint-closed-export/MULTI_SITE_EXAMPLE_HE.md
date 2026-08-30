# דוגמה מלאה ל־Closed SharePoint Export Kit (ריבוי אתרים)

המסמך הזה הוא ההסבר המעשי והקצר ביותר בעברית לעבודה בסביבה סגורה.

## 1) מבנה תיקיית קלט לדוגמה (2 אתרים)

כשיש לך קבצים ידנית מה־SharePoint, הניח אותם כך:

```text
sharepoint-export-input/
  site-a/
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt
    boom_data.txt

  site-b-safe-folder/
    site.export.json
    bihs_master_config_v1.txt
    users_data.txt
    events_data.txt
    nav_data.txt
    site_content_data.txt
    theme_data.txt
    widgets_data.txt
    external_links_data.txt
    gantt_data.txt
    boom_data.txt
```

`site-b-safe-folder/` הוא שם תיקייה בטוח מקומית, לא שם האתר האמיתי.

להעתקה מהירה של הדוגמה המלאה:

```bash
cp -R scripts/sharepoint-closed-export/examples/sharepoint-export-input sharepoint-export-input
```

## 2) דוגמת `site.export.json`

משמש כאשר שם האתר האמיתי (כולל subsite) לא בטוח כשם תיקייה מקומית (יש `/`, רווחים, תווים מיוחדים):

```json
{
  "siteCode": "Sites/demo-main-site/subsite-b",
  "displayName": "Demo Subsite B",
  "siteRelativePath": "/Sites/demo-main-site/subsite-b"
}
```

## 3) הרצת ולידציה בכל האתרים

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --all-sites
```

אפשר גם:

```bash
npm run sharepoint:closed-validate -- --input sharepoint-export-input --batch
```

> פקודה זו מריצה batch validation, לא נוגעת ב־SharePoint ואינה מנסה לכתוב Mongo.

## 4) קובץ הדוח לפתיחה

בדיקת ה־batch יוצרת:

```text
exports/sharepoint-closed/<batchExportId>/report.md
```

זה הקובץ שצריך לפתוח קודם (לפני כל dry-run).

## 5) הרצת Mongo dry-run מתוך artifact הבאטץ׳

```bash
npm run migrate:sharepoint-export-to-mongo:dry-run -- --from-export exports/sharepoint-closed/<batchExportId> --all-sites
```

## 6) אזהרות לפני העתקת קבצי TXT אמיתיים מתוך SharePoint

- כל אתר חייב להישאר בתיקייה נפרדת (לא לערבב קבצים בין אתרים).
- אל תיצור/מלא קבצים ריקים כ"השארת מקום" — קבצים ריקים יופיעו כ‑`invalid/empty`.
- אל תשנה שמות של הקבצים הלגיטימיים:
  `bihs_master_config_v1.txt`, `users_data.txt`, `events_data.txt`, `nav_data.txt`,
  `site_content_data.txt`, `theme_data.txt`, `widgets_data.txt`, `external_links_data.txt`, `gantt_data.txt`.
- אל תריץ `site:init` / deploy במהלך הייצוא.
- אל תעלה/לא תכתוב לקבצים ב‑SharePoint במהלך הייצוא (הכל read-only).
- לא להריץ `migrate:sharepoint-to-mongo` בלי dry-run שלב ראשון.

## 7) איפה למצוא דוגמה מוכנה

דוגמה מוכנה עם 2 אתרים קיימת כאן:

```text
scripts/sharepoint-closed-export/examples/sharepoint-export-input/
```

כוללת גם `site.export.json` עבור תיקיית הדוגמה של subsite.
