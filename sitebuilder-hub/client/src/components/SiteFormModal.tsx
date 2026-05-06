import { useEffect, useMemo, useState } from "react";
import { Site, SiteStatus } from "../types/site";

type Errors = Partial<Record<keyof Site, string>>;

const initialForm: Partial<Site> = {
  displayName: "",
  siteCode: "",
  description: "",
  unitName: "",
  sharePointSiteUrl: "",
  finalAppUrl: "",
  siteDbLibrary: "",
  usersDbLibrary: "",
  bootstrapLibrary: "",
  bootstrapFolder: "",
  ownerName: "",
  ownerPersonalNumber: "",
  ownerEmail: "",
  ownerPhone: "",
  version: "1.0.0",
  status: "draft",
  notes: ""
};

export function SiteFormModal({ open, site, onClose, onSave }: { open: boolean; site?: Site | null; onClose: () => void; onSave: (payload: Partial<Site>) => Promise<void>; }) {
  const [form, setForm] = useState<Partial<Site>>(initialForm);
  const [errors, setErrors] = useState<Errors>({});

  useEffect(() => {
    setForm(site ?? initialForm);
    setErrors({});
  }, [site, open]);

  const applySiteCodeDefaults = (codeRaw: string) => {
    const code = codeRaw.trim();
    if (!code || site) return;
    setForm((prev) => ({
      ...prev,
      siteCode: code,
      sharePointSiteUrl: prev.sharePointSiteUrl || `https://portal.army.idf/sites/${code}`,
      finalAppUrl: prev.finalAppUrl || `https://portal.army.idf/sites/${code}/app`,
      siteDbLibrary: prev.siteDbLibrary || "siteDB",
      usersDbLibrary: prev.usersDbLibrary || "siteUsersDb"
    }));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!form.displayName?.trim()) next.displayName = "שם אתר הוא שדה חובה";
    if (!form.siteCode?.trim()) next.siteCode = "קוד אתר הוא שדה חובה";
    if (!form.sharePointSiteUrl?.trim()) next.sharePointSiteUrl = "כתובת אתר SharePoint היא שדה חובה";

    if (form.sharePointSiteUrl?.trim()) {
      try { new URL(form.sharePointSiteUrl); } catch { next.sharePointSiteUrl = "כתובת SharePoint אינה תקינה"; }
    }
    if (form.finalAppUrl?.trim()) {
      try { new URL(form.finalAppUrl); } catch { next.finalAppUrl = "קישור סופי לאתר אינו תקין"; }
    }
    if (form.ownerEmail?.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.ownerEmail)) next.ownerEmail = "כתובת אימייל אינה תקינה";
    }
    return next;
  };

  const save = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    await onSave(form);
  };

  if (!open) return null;

  const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const block = "rounded-xl border border-slate-200 p-3";
  const title = "mb-2 text-sm font-semibold text-slate-700";

  const Field = ({ label, value, onChange, error, placeholder, type = "text" }: any) => (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input type={type} className={`${inputClass} ${error ? "border-rose-300" : ""}`} value={value ?? ""} placeholder={placeholder} onChange={onChange} />
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : null}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold">{site ? "עריכת אתר" : "הוספת אתר"}</h2>

        <div className="grid gap-4 md:grid-cols-2">
          <section className={block}>
            <h3 className={title}>א. פרטי אתר</h3>
            <div className="grid gap-2">
              <Field label="שם אתר" value={form.displayName} error={errors.displayName} onChange={(e: any) => setForm((p) => ({ ...p, displayName: e.target.value }))} />
              <Field label="קוד אתר" placeholder="schedule" value={form.siteCode} error={errors.siteCode} onChange={(e: any) => applySiteCodeDefaults(e.target.value)} />
              <Field label="תיאור" value={form.description} onChange={(e: any) => setForm((p) => ({ ...p, description: e.target.value }))} />
              <Field label="יחידה" value={form.unitName} onChange={(e: any) => setForm((p) => ({ ...p, unitName: e.target.value }))} />
            </div>
          </section>

          <section className={block}>
            <h3 className={title}>ב. קישורי SharePoint</h3>
            <div className="grid gap-2">
              <Field label="כתובת אתר SharePoint" value={form.sharePointSiteUrl} error={errors.sharePointSiteUrl} onChange={(e: any) => setForm((p) => ({ ...p, sharePointSiteUrl: e.target.value }))} />
              <Field label="קישור סופי לאתר" value={form.finalAppUrl} error={errors.finalAppUrl} onChange={(e: any) => setForm((p) => ({ ...p, finalAppUrl: e.target.value }))} />
            </div>
          </section>

          <section className={block}>
            <h3 className={title}>ג. ספריות וקבצים</h3>
            <div className="grid gap-2">
              <Field label="siteDB" placeholder="siteDB" value={form.siteDbLibrary} onChange={(e: any) => setForm((p) => ({ ...p, siteDbLibrary: e.target.value }))} />
              <Field label="siteUsersDb" placeholder="siteUsersDb" value={form.usersDbLibrary} onChange={(e: any) => setForm((p) => ({ ...p, usersDbLibrary: e.target.value }))} />
              <Field label="bootstrap library" value={form.bootstrapLibrary} onChange={(e: any) => setForm((p) => ({ ...p, bootstrapLibrary: e.target.value }))} />
              <Field label="bootstrap folder" value={form.bootstrapFolder} onChange={(e: any) => setForm((p) => ({ ...p, bootstrapFolder: e.target.value }))} />
            </div>
          </section>

          <section className={block}>
            <h3 className={title}>ד. בעל האתר</h3>
            <div className="grid gap-2">
              <Field label="שם בעל האתר" value={form.ownerName} onChange={(e: any) => setForm((p) => ({ ...p, ownerName: e.target.value }))} />
              <Field label="מספר אישי" placeholder="s1234567" value={form.ownerPersonalNumber} onChange={(e: any) => setForm((p) => ({ ...p, ownerPersonalNumber: e.target.value }))} />
              <Field label="מייל" value={form.ownerEmail} error={errors.ownerEmail} onChange={(e: any) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))} />
              <Field label="טלפון" placeholder="050-0000000" value={form.ownerPhone} onChange={(e: any) => setForm((p) => ({ ...p, ownerPhone: e.target.value }))} />
            </div>
          </section>
        </div>

        <section className={`${block} mt-4`}>
          <h3 className={title}>ה. מצב והערות</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block text-slate-600">סטטוס</span>
              <select className={inputClass} value={form.status || "draft"} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as SiteStatus }))}>
                <option value="draft">טיוטה</option>
                <option value="active">פעיל</option>
                <option value="warning">דורש טיפול</option>
                <option value="failed">נכשל</option>
                <option value="archived">ארכיון</option>
              </select>
            </label>
            <Field label="גרסה" value={form.version} onChange={(e: any) => setForm((p) => ({ ...p, version: e.target.value }))} />
            <label className="text-sm md:col-span-1">
              <span className="mb-1 block text-slate-600">הערות</span>
              <textarea className={inputClass} rows={3} value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </label>
          </div>
        </section>

        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-lg border border-slate-200 px-4 py-2" onClick={onClose}>ביטול</button>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-white" onClick={save}>שמור</button>
        </div>
      </div>
    </div>
  );
}
