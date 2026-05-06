import { CheckCircle2, CircleSlash2, AlertTriangle, Clock3 } from "lucide-react";
import { SiteHealth } from "../types/site";

const checks: Array<{ key: keyof SiteHealth; label: string; help?: string }> = [
  { key: "siteDbExists", label: "siteDB קיים", help: "ספריית הנתונים הראשית קיימת" },
  { key: "usersDbExists", label: "siteUsersDb קיים", help: "ספריית נתוני המשתמשים קיימת" },
  { key: "distExists", label: "dist קיים", help: "תיקיית build קיימת" },
  { key: "indexExists", label: "index.html קיים", help: "קובץ הכניסה לאתר קיים" },
  { key: "assetsExists", label: "assets קיימים", help: "קבצי JS/CSS קיימים" },
  { key: "txtFilesExist", label: "קבצי TXT קיימים", help: "קבצי מערכת בסיסיים קיימים" },
  { key: "adminsSyncOk", label: "סנכרון מנהלים תקין" },
  { key: "permissionsOk", label: "הרשאות תקינות" }
];

export function HealthChecklist({
  health,
  editable = false,
  onChange
}: {
  health?: SiteHealth;
  editable?: boolean;
  onChange?: (next: SiteHealth) => void;
}) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {checks.map((item) => {
        const value = health?.[item.key];
        const icon = value === true ? <CheckCircle2 size={14} className="text-emerald-600" /> : value === false ? <AlertTriangle size={14} className="text-rose-600" /> : <Clock3 size={14} className="text-slate-400" />;
        return (
          <label key={item.key} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2 text-sm">
            <div>
              <div className="flex items-center gap-2 text-slate-800">{icon}{item.label}</div>
              {item.help ? <p className="text-xs text-slate-500">{item.help}</p> : null}
            </div>
            {editable ? (
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(e) => onChange?.({ ...(health || {}), [item.key]: e.target.checked })}
              />
            ) : (
              <span className="text-xs text-slate-500">{value === undefined ? "לא ידוע" : value ? "כן" : "לא"}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
