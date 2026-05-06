import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Archive, CheckCircle2, Database, FolderKanban, HardDrive, Loader2, RefreshCcw, XCircle } from "lucide-react";
import { sitesApi } from "../api/sitesApi";
import { DerivedHealthStatus, Site, SiteStatus, SitesStats } from "../types/site";
import { SiteFormModal } from "../components/SiteFormModal";
import { SitesTable } from "../components/SitesTable";
import { StatCard } from "../components/StatCard";
import { PageHeader } from "../components/PageHeader";
import { SectionCard } from "../components/SectionCard";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { LoadingState } from "../components/LoadingState";
import { StatusBadge } from "../components/StatusBadge";
import { HealthBadge } from "../components/HealthBadge";

const defaultStats: SitesStats = {
  total: 0,
  active: 0,
  warning: 0,
  failed: 0,
  archived: 0,
  totalStorageMb: 0,
  health: { healthy: 0, warning: 0, failed: 0, unknown: 0 }
};

export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [allSites, setAllSites] = useState<Site[]>([]);
  const [stats, setStats] = useState<SitesStats>(defaultStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SiteStatus>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | DerivedHealthStatus>("all");
  const [sortBy, setSortBy] = useState<"createdAt" | "updatedAt" | "lastHealthCheckAt">("updatedAt");
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  const loadSites = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await sitesApi.list();
      setAllSites(response.data);
      setStats(response.meta?.stats ?? defaultStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בטעינת נתונים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
  }, []);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || allSites.length === 0) return;
    const found = allSites.find((site) => site._id === editId);
    if (found) {
      setSelectedSite(found);
      setModalOpen(true);
      setSearchParams({});
    }
  }, [searchParams, allSites, setSearchParams]);

  const sites = useMemo(
    () =>
      allSites
        .filter((site) => {
          const needle = search.trim().toLowerCase();
          if (!needle) return true;
          return [site.displayName, site.siteCode, site.ownerName, site.unitName].some((v) => (v || "").toLowerCase().includes(needle));
        })
        .filter((site) => (statusFilter === "all" ? true : site.status === statusFilter))
        .filter((site) => (healthFilter === "all" ? true : site.derivedHealthStatus === healthFilter))
        .sort((a, b) => new Date(b[sortBy] || 0).getTime() - new Date(a[sortBy] || 0).getTime()),
    [allSites, search, statusFilter, healthFilter, sortBy]
  );

  const kpis = useMemo(
    () => [
      { title: "סה\"כ אתרים", value: stats.total, icon: <FolderKanban size={16} />, description: "נרשמו במערכת", secondary: "עודכן לפי נתוני Mongo" },
      { title: "פעילים", value: stats.active, icon: <CheckCircle2 size={16} />, description: `${stats.active} פעילים כעת`, secondary: "סטטוס עסקי" },
      { title: "דורשים טיפול", value: stats.warning, icon: <AlertTriangle size={16} />, description: `${stats.warning} אתרים דורשים טיפול`, secondary: "סטטוס עסקי" },
      { title: "נכשלו", value: stats.failed, icon: <XCircle size={16} />, description: `${stats.failed} אתרים נכשלו`, secondary: "סטטוס עסקי" },
      { title: "טיוטות", value: allSites.filter((s) => s.status === "draft").length, icon: <Loader2 size={16} />, description: "ממתינים לקידום", secondary: "סטטוס עסקי" },
      { title: "ארכיון", value: stats.archived, icon: <Archive size={16} />, description: "רשומות בארכיון", secondary: "סטטוס עסקי" },
      { title: "נפח כולל", value: `${stats.totalStorageMb.toLocaleString()} MB`, icon: <HardDrive size={16} />, description: "משוקלל מכל האתרים", secondary: "אחסון מדווח" },
      { title: "בדיקות שבוצעו", value: allSites.filter((s) => Boolean(s.lastHealthCheckAt)).length, icon: <Database size={16} />, description: "בדיקות תקינות ידניות", secondary: "עודכן מהמערכת" }
    ],
    [stats, allSites]
  );

  const needsAttention = useMemo(() => allSites.filter((s) => s.derivedHealthStatus === "warning" || s.derivedHealthStatus === "failed").slice(0, 5), [allSites]);
  const recentCreated = useMemo(() => [...allSites].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5), [allSites]);

  const activities = useMemo(() => {
    return [...allSites]
      .flatMap((site) => {
        const rows = [{ label: `עודכן אתר ${site.displayName}`, at: site.updatedAt }];
        if (site.lastHealthCheckAt) rows.push({ label: `בדיקת תקינות ידנית: ${site.displayName}`, at: site.lastHealthCheckAt });
        if (site.lastDeployAt) rows.push({ label: `דיווח פריסה אחרונה: ${site.displayName}`, at: site.lastDeployAt });
        return rows;
      })
      .sort((a, b) => +new Date(b.at) - +new Date(a.at))
      .slice(0, 7);
  }, [allSites]);

  const onSave = async (payload: Partial<Site>) => {
    try {
      if (selectedSite) await sitesApi.update(selectedSite._id, payload);
      else await sitesApi.create(payload);
      setModalOpen(false);
      setSelectedSite(null);
      await loadSites();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    }
  };

  const onArchive = async (id: string) => {
    await sitesApi.archive(id);
    await loadSites();
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setHealthFilter("all");
    setSortBy("updatedAt");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="דשבורד ניהול אתרים"
        subtitle="תמונת מצב מרכזית לאתרי Site Builder"
        actions={<button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => { setSelectedSite(null); setModalOpen(true); }}>הוסף אתר</button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <StatCard key={item.title} title={item.title} value={item.value} icon={item.icon} description={item.description} secondary={item.secondary} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="אתרים שדורשים טיפול" subtitle="תקינות warning/failed בלבד">
          {needsAttention.length === 0 ? <p className="text-sm text-slate-500">אין אתרים שדורשים טיפול כרגע.</p> : (
            <div className="space-y-2">
              {needsAttention.map((site) => (
                <button key={site._id} className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-right hover:bg-slate-50" onClick={() => navigate(`/sites/${site._id}`)}>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{site.displayName}</p>
                    <p className="text-xs text-slate-500 font-mono tabular">{site.siteCode}</p>
                  </div>
                  <HealthBadge status={site.derivedHealthStatus} />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="אתרים אחרונים שנוצרו" subtitle="5 האתרים האחרונים">
          <div className="space-y-2">
            {recentCreated.map((site) => (
              <div key={site._id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{site.displayName}</p>
                  <p className="text-xs text-slate-500">{new Date(site.createdAt).toLocaleString("he-IL")}</p>
                </div>
                <StatusBadge status={site.status} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="פעילות אחרונה" subtitle="נגזר מנתוני עדכון, תקינות ופריסה">
          <div className="space-y-2">
            {activities.map((row, idx) => (
              <div key={`${row.label}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                <span>{row.label}</span>
                <span className="font-mono text-xs text-slate-500 tabular">{new Date(row.at).toLocaleString("he-IL")}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="התפלגות סטטוסים" subtitle="סטטוס עסקי">
          <div className="space-y-3">
            {[
              ["active", "פעיל", stats.active, "bg-emerald-500"],
              ["warning", "דורש טיפול", stats.warning, "bg-amber-500"],
              ["failed", "נכשל", stats.failed, "bg-rose-500"],
              ["draft", "טיוטה", allSites.filter((s) => s.status === "draft").length, "bg-slate-500"],
              ["archived", "ארכיון", stats.archived, "bg-slate-400"]
            ].map(([key, label, value, bar]) => {
              const pct = stats.total ? Math.round((Number(value) / stats.total) * 100) : 0;
              return (
                <div key={String(key)}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span>{label}</span>
                    <span className="font-mono tabular">{String(value)} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className={`h-2 rounded-full ${bar as string}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="רשימת אתרים"
        subtitle="חיפוש, סינון ומעקב תפעולי"
        actions={<div className="flex gap-2"><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs" onClick={loadSites}><RefreshCcw size={12} className="inline" /> רענן</button><button className="rounded-lg border border-slate-200 px-3 py-2 text-xs" onClick={clearFilters}>נקה פילטרים</button></div>}
      >
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="חיפוש שם/קוד/בעלים/יחידה" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">כל הסטטוסים</option><option value="active">פעיל</option><option value="warning">דורש טיפול</option><option value="failed">נכשל</option><option value="draft">טיוטה</option><option value="archived">ארכיון</option>
          </select>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={healthFilter} onChange={(e) => setHealthFilter(e.target.value as any)}>
            <option value="all">כל מצבי תקינות</option><option value="healthy">תקין</option><option value="warning">אזהרה</option><option value="failed">תקלה</option><option value="unknown">לא נבדק</option>
          </select>
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="updatedAt">מיון לפי עדכון אחרון</option><option value="createdAt">מיון לפי יצירה</option><option value="lastHealthCheckAt">מיון לפי בדיקת תקינות</option>
          </select>
        </div>

        {loading ? <LoadingState /> : null}
        {!loading && error ? <ErrorState message={error} onRetry={loadSites} /> : null}
        {!loading && !error && allSites.length === 0 ? (
          <EmptyState
            title="עדיין לא נרשמו אתרים"
            description="עדיין לא נרשמו אתרים. לחץ על הוסף אתר כדי להתחיל."
            action={<button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white" onClick={() => { setSelectedSite(null); setModalOpen(true); }}>הוסף אתר</button>}
          />
        ) : null}
        {!loading && !error && allSites.length > 0 && sites.length === 0 ? <EmptyState title="אין תוצאות" description="לא נמצאו אתרים לפי פילטרים אלו." /> : null}
        {!loading && !error && sites.length > 0 ? <SitesTable sites={sites} onEdit={(site) => { setSelectedSite(site); setModalOpen(true); }} onArchive={onArchive} onDetails={(id) => navigate(`/sites/${id}`)} /> : null}
      </SectionCard>

      <SiteFormModal open={modalOpen} site={selectedSite} onClose={() => setModalOpen(false)} onSave={onSave} />
    </div>
  );
}
