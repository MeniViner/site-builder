import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Edit3, FolderInput, Globe, PackageCheck, ShieldCheck } from "lucide-react";
import { sitesApi } from "../api/sitesApi";
import { Site, SiteHealth } from "../types/site";
import { StatusBadge } from "../components/StatusBadge";
import { HealthBadge } from "../components/HealthBadge";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { LinkRow } from "../components/LinkRow";
import { HealthChecklist } from "../components/HealthChecklist";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";

export function SiteDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [site, setSite] = useState<Site | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [healthDraft, setHealthDraft] = useState<SiteHealth>({});

  const load = async () => {
    if (!id) return;
    setError("");
    try {
      const res = await sitesApi.getById(id);
      setSite(res.data);
      setHealthDraft(res.data.health || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת פרטי אתר");
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const activityRows = useMemo(() => {
    if (!site) return [];
    const rows: Array<{ label: string; at?: string }> = [
      { label: "יצירת רשומה", at: site.createdAt },
      { label: "עדכון אחרון", at: site.updatedAt },
      { label: "בדיקת תקינות ידנית", at: site.lastHealthCheckAt },
      { label: "פריסה אחרונה", at: site.lastDeployAt }
    ];
    return rows.filter((row) => row.at);
  }, [site]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!site) return <LoadingState label="טוען פרטי אתר..." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title={site.displayName}
        subtitle={`קוד אתר: ${site.siteCode}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => window.open(site.finalAppUrl || site.sharePointSiteUrl, "_blank")}>פתח אתר</button>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => window.open(site.sharePointSiteUrl, "_blank")}>פתח SharePoint</button>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => navigate("/")}>חזור לדשבורד</button>
            <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm" onClick={() => navigate(`/?edit=${site._id}`)}><Edit3 size={14} className="inline" /> ערוך</button>
            <button className="rounded-lg bg-rose-600 px-3 py-2 text-sm text-white" onClick={async () => { await sitesApi.archive(site._id); navigate("/"); }}>ארכב</button>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge status={site.status} />
        <HealthBadge status={site.derivedHealthStatus} />
      </div>

      {message ? <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div> : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="סקירה" subtitle="תמונת מצב כללית">
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <div>גרסה: <span className="font-mono tabular">{site.version || "-"}</span></div>
            <div>נפח: <span className="font-mono tabular">{(site.storageMb ?? 0).toLocaleString()} MB</span></div>
            <div>קבצים: <span className="font-mono tabular">{(site.filesCount ?? 0).toLocaleString()}</span></div>
            <div>מנהלים: <span className="font-mono tabular">{(site.adminsCount ?? 0).toLocaleString()}</span></div>
            <div>נוצר: <span className="font-mono tabular">{new Date(site.createdAt).toLocaleString("he-IL")}</span></div>
            <div>עודכן: <span className="font-mono tabular">{new Date(site.updatedAt).toLocaleString("he-IL")}</span></div>
            <div>פריסה אחרונה: <span className="font-mono tabular">{site.lastDeployAt ? new Date(site.lastDeployAt).toLocaleString("he-IL") : "-"}</span></div>
            <div>בדיקת תקינות: <span className="font-mono tabular">{site.lastHealthCheckAt ? new Date(site.lastHealthCheckAt).toLocaleString("he-IL") : "-"}</span></div>
          </div>
        </SectionCard>

        <SectionCard title="בעלים" subtitle="פרטי בעל האתר">
          <div className="space-y-2 text-sm">
            <p>שם בעל האתר: {site.ownerName || "-"}</p>
            <p>מספר אישי: <span className="font-mono tabular">{site.ownerPersonalNumber || "-"}</span></p>
            <p>מייל: {site.ownerEmail || "-"}</p>
            <p>טלפון: <span className="font-mono tabular">{site.ownerPhone || "-"}</span></p>
            <p>יחידה: {site.unitName || "-"}</p>
          </div>
        </SectionCard>
      </div>

      <SectionCard title="קישורים ונתיבים" subtitle="סקירה טכנית עבור עבודה תפעולית">
        <div className="space-y-2">
          <LinkRow label="Final app URL" value={site.finalAppUrl} isUrl />
          <LinkRow label="SharePoint site URL" value={site.sharePointSiteUrl} isUrl />
          <LinkRow label="siteDB path" value={site.siteDbLibrary} />
          <LinkRow label="siteUsersDb path" value={site.usersDbLibrary} />
          <LinkRow label="bootstrap library" value={site.bootstrapLibrary} />
          <LinkRow label="bootstrap folder" value={site.bootstrapFolder} />
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="תקינות" subtitle="תוצאות בדיקה אחרונה">
          <HealthChecklist health={site.health} />
        </SectionCard>

        <SectionCard title="בדיקת תקינות ידנית" subtitle="עדכון ידני בלבד (MVP1.2)">
          <HealthChecklist health={healthDraft} editable onChange={setHealthDraft} />
          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            onClick={async () => {
              try {
                await sitesApi.updateManualHealth(site._id, healthDraft);
                setMessage("בדיקת התקינות נשמרה בהצלחה");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : "שגיאה בעדכון התקינות");
              }
            }}
          >
            <ShieldCheck size={14} className="ml-1 inline" /> שמור בדיקת תקינות
          </button>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="פעילות" subtitle="אירועים מרכזיים אחרונים">
          <div className="space-y-2 text-sm">
            {activityRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <span>{row.label}</span>
                <span className="font-mono tabular text-xs text-slate-500">{row.at ? new Date(row.at).toLocaleString("he-IL") : "-"}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="הערות" subtitle="מידע תפעולי חופשי">
          <p className="text-sm text-slate-700">{site.notes || "אין הערות כרגע."}</p>
          {site.lastError ? <p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">שגיאה אחרונה: {site.lastError}</p> : null}
        </SectionCard>
      </div>

      <SectionCard title="SharePoint" subtitle="פרטי Host וקשר למערכת">
        <div className="grid gap-2 text-sm md:grid-cols-3">
          <div className="rounded-lg border border-slate-100 p-3"><Globe size={14} className="mb-1" />Host: <span className="font-mono">{site.sharePointHost || "portal.army.idf"}</span></div>
          <div className="rounded-lg border border-slate-100 p-3"><FolderInput size={14} className="mb-1" />siteDB: <span className="font-mono">{site.siteDbLibrary || "-"}</span></div>
          <div className="rounded-lg border border-slate-100 p-3"><PackageCheck size={14} className="mb-1" />siteUsersDb: <span className="font-mono">{site.usersDbLibrary || "-"}</span></div>
        </div>
      </SectionCard>
    </div>
  );
}
