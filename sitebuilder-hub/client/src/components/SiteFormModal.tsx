import { useEffect, useMemo, useState } from "react";
import { Site, SiteStatus } from "../types/site";

type Errors = Partial<Record<keyof Site, string>>;

type StepKey = "owner" | "libraries" | "status";

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

const steps: { key: StepKey; label: string; hint: string }[] = [
  { key: "owner", label: "פרטי בעלות וזהות אתר", hint: "בעל אתר, מזהים וקישורים" },
  { key: "libraries", label: "ספריות וניתוב קבצים", hint: "siteDB, usersDB ו-bootstrap" },
  { key: "status", label: "סטטוס, גרסה והערות", hint: "ניהול מחזור חיים ותיעוד" }
];

export function SiteFormModal({ open, site, onClose, onSave }: { open: boolean; site?: Site | null; onClose: () => void; onSave: (payload: Partial<Site>) => Promise<void>; }) {
  const [form, setForm] = useState<Partial<Site>>(initialForm);
  const [errors, setErrors] = useState<Errors>({});
  const [activeStep, setActiveStep] = useState<StepKey>("owner");

  useEffect(() => {
    setForm(site ?? initialForm);
    setErrors({});
    setActiveStep("owner");
  }, [site, open]);

  const applySiteCodeDefaults = (codeRaw: string) => {
    const code = codeRaw.trim();
    setForm((prev) => ({
      ...prev,
      siteCode: codeRaw
    }));
    if (!code || site) return;
    setForm((prev) => ({
      ...prev,
      siteCode: codeRaw,
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

  const completion = useMemo(() => {
    const required = [form.displayName, form.siteCode, form.sharePointSiteUrl];
    const filled = required.filter((v) => Boolean(String(v || "").trim())).length;
    return Math.round((filled / required.length) * 100);
  }, [form.displayName, form.siteCode, form.sharePointSiteUrl]);

  if (!open) return null;

  const inputClass = "w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none";
  const panel = "rounded-2xl border border-slate-700 bg-slate-900/40 p-4";
  const heading = "mb-2 text-sm font-semibold text-slate-200";

  const Field = ({ label, value, onChange, error, placeholder, type = "text" }: any) => (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-400">{label}</span>
      <input type={type} className={`${inputClass} ${error ? "border-rose-400/70" : ""}`} value={value ?? ""} placeholder={placeholder} onChange={onChange} />
      {error ? <span className="mt-1 block text-xs text-rose-300">{error}</span> : null}
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="glass-card max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-2xl">
        <div className="border-b border-slate-700/80 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-100">{site ? "עריכת אתר" : "יצירת אתר חדש"}</h2>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">השלמה: {completion}%</span>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {steps.map((step) => (
              <button
                key={step.key}
                onClick={() => setActiveStep(step.key)}
                className={`rounded-xl border px-3 py-2 text-right transition ${activeStep === step.key ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100" : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-600"}`}
              >
                <p className="text-sm font-semibold">{step.label}</p>
                <p className="text-[11px] opacity-80">{step.hint}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5">
          {activeStep === "owner" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <section className={panel}>
                <h3 className={heading}>פרטי אתר</h3>
                <div className="grid gap-2">
                  <Field label="שם אתר" value={form.displayName} error={errors.displayName} onChange={(e: any) => setForm((p) => ({ ...p, displayName: e.target.value }))} />
                  <Field label="קוד אתר" placeholder="schedule" value={form.siteCode} error={errors.siteCode} onChange={(e: any) => applySiteCodeDefaults(e.target.value)} />
                  <Field label="תיאור" value={form.description} onChange={(e: any) => setForm((p) => ({ ...p, description: e.target.value }))} />
                  <Field label="יחידה" value={form.unitName} onChange={(e: any) => setForm((p) => ({ ...p, unitName: e.target.value }))} />
                </div>
              </section>

              <section className={panel}>
                <h3 className={heading}>בעלות וקישורים</h3>
                <div className="grid gap-2">
                  <Field label="שם בעל האתר" value={form.ownerName} onChange={(e: any) => setForm((p) => ({ ...p, ownerName: e.target.value }))} />
                  <Field label="מספר אישי" placeholder="s1234567" value={form.ownerPersonalNumber} onChange={(e: any) => setForm((p) => ({ ...p, ownerPersonalNumber: e.target.value }))} />
                  <Field label="מייל" value={form.ownerEmail} error={errors.ownerEmail} onChange={(e: any) => setForm((p) => ({ ...p, ownerEmail: e.target.value }))} />
                  <Field label="טלפון" placeholder="050-0000000" value={form.ownerPhone} onChange={(e: any) => setForm((p) => ({ ...p, ownerPhone: e.target.value }))} />
                  <Field label="כתובת אתר SharePoint" value={form.sharePointSiteUrl} error={errors.sharePointSiteUrl} onChange={(e: any) => setForm((p) => ({ ...p, sharePointSiteUrl: e.target.value }))} />
                  <Field label="קישור סופי לאתר" value={form.finalAppUrl} error={errors.finalAppUrl} onChange={(e: any) => setForm((p) => ({ ...p, finalAppUrl: e.target.value }))} />
                </div>
              </section>
            </div>
          ) : null}

          {activeStep === "libraries" ? (
            <section className={panel}>
              <h3 className={heading}>ספריות וקבצים</h3>
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="siteDB" placeholder="siteDB" value={form.siteDbLibrary} onChange={(e: any) => setForm((p) => ({ ...p, siteDbLibrary: e.target.value }))} />
                <Field label="siteUsersDb" placeholder="siteUsersDb" value={form.usersDbLibrary} onChange={(e: any) => setForm((p) => ({ ...p, usersDbLibrary: e.target.value }))} />
                <Field label="bootstrap library" value={form.bootstrapLibrary} onChange={(e: any) => setForm((p) => ({ ...p, bootstrapLibrary: e.target.value }))} />
                <Field label="bootstrap folder" value={form.bootstrapFolder} onChange={(e: any) => setForm((p) => ({ ...p, bootstrapFolder: e.target.value }))} />
              </div>
            </section>
          ) : null}

          {activeStep === "status" ? (
            <section className={panel}>
              <h3 className={heading}>מצב וגרסאות</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm">
                  <span className="mb-1 block text-slate-400">סטטוס</span>
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
                  <span className="mb-1 block text-slate-400">הערות שחרור</span>
                  <textarea className={inputClass} rows={4} value={form.notes ?? ""} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
                </label>
              </div>
            </section>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-700/80 bg-slate-950/85 px-5 py-3">
          <div className="flex gap-2">
            <button className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300" onClick={onClose}>ביטול</button>
            <button className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950" onClick={save}>שמור</button>
          </div>
          <div className="flex gap-2">
            {activeStep !== "owner" ? <button className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300" onClick={() => setActiveStep(activeStep === "libraries" ? "owner" : "libraries")}>שלב קודם</button> : null}
            {activeStep !== "status" ? <button className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300" onClick={() => setActiveStep(activeStep === "owner" ? "libraries" : "status")}>שלב הבא</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
