import { ExternalLink, Pencil, Archive, Eye, TriangleAlert, CheckCircle2 } from "lucide-react";
import { Site } from "../types/site";
import { StatusBadge } from "./StatusBadge";
import { HealthBadge } from "./HealthBadge";

interface SitesTableProps {
  sites: Site[];
  onEdit: (site: Site) => void;
  onArchive: (id: string) => void;
  onDetails: (id: string) => void;
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleString("he-IL") : "-";
}

export function SitesTable({ sites, onEdit, onArchive, onDetails }: SitesTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/40 shadow-2xl shadow-slate-950/20">
      <div className="overflow-x-auto">
        <table className="min-w-[1160px] w-full text-sm">
          <thead className="bg-slate-900/90 text-slate-300">
            <tr>
              {["שם אתר", "קוד אתר", "בעל אתר", "יחידה", "סטטוס", "תקינות", "גרסה", "נפח", "קבצים", "בדיקה אחרונה", "פעולות"].map((h) => (
                <th key={h} className="px-3 py-3 text-right font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sites.map((site) => {
              const needsAttention = site.derivedHealthStatus === "warning" || site.derivedHealthStatus === "failed" || site.status === "warning" || site.status === "failed";
              return (
                <tr key={site._id} className="border-t border-slate-800/80 bg-slate-900/20 transition hover:bg-slate-800/40">
                  <td className="px-3 py-3 font-medium text-slate-100">
                    <div className="flex items-center gap-2">
                      {needsAttention ? <TriangleAlert size={14} className="text-amber-300" /> : <CheckCircle2 size={14} className="text-emerald-300" />}
                      {site.displayName}
                    </div>
                  </td>
                  <td className="tabular px-3 py-3 font-mono text-xs text-slate-300">{site.siteCode}</td>
                  <td className="px-3 py-3 text-slate-200">{site.ownerName || "-"}</td>
                  <td className="px-3 py-3 text-slate-300">{site.unitName || "-"}</td>
                  <td className="px-3 py-3"><StatusBadge status={site.status} /></td>
                  <td className="px-3 py-3"><HealthBadge status={site.derivedHealthStatus || "unknown"} /></td>
                  <td className="tabular px-3 py-3 font-mono text-slate-200">{site.version || "-"}</td>
                  <td className="tabular px-3 py-3 font-mono text-slate-200">{(site.storageMb ?? 0).toLocaleString()} MB</td>
                  <td className="tabular px-3 py-3 font-mono text-slate-200">{(site.filesCount ?? 0).toLocaleString()}</td>
                  <td className="tabular px-3 py-3 font-mono text-xs text-slate-400">{formatDate(site.lastHealthCheckAt)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      <a className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200" href={site.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח אתר"><ExternalLink size={14} /></a>
                      <a className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200" href={site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח SharePoint"><ExternalLink size={14} /></a>
                      <button className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200" onClick={() => onDetails(site._id)} title="פרטים"><Eye size={14} /></button>
                      <button className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 transition hover:border-cyan-400/40 hover:text-cyan-200" onClick={() => onEdit(site)} title="ערוך"><Pencil size={14} /></button>
                      <button className="rounded-md border border-slate-700 bg-slate-900 p-2 text-slate-200 transition hover:border-rose-400/50 hover:text-rose-200" onClick={() => onArchive(site._id)} title="ארכב"><Archive size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
