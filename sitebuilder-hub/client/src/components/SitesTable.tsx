import { ExternalLink, Pencil, Archive, Eye } from "lucide-react";
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
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-[1120px] w-full text-sm">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            {["שם אתר", "קוד אתר", "בעל אתר", "יחידה", "סטטוס עסקי", "תקינות", "גרסה", "נפח", "קבצים", "בדיקה אחרונה", "פעולות"].map((h) => (
              <th key={h} className="px-3 py-3 text-right font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sites.map((site) => (
            <tr key={site._id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-3 font-medium text-slate-900">{site.displayName}</td>
              <td className="tabular px-3 py-3 font-mono text-xs">{site.siteCode}</td>
              <td className="px-3 py-3">{site.ownerName || "-"}</td>
              <td className="px-3 py-3">{site.unitName || "-"}</td>
              <td className="px-3 py-3"><StatusBadge status={site.status} /></td>
              <td className="px-3 py-3"><HealthBadge status={site.derivedHealthStatus || "unknown"} /></td>
              <td className="tabular px-3 py-3 font-mono">{site.version || "-"}</td>
              <td className="tabular px-3 py-3 font-mono">{(site.storageMb ?? 0).toLocaleString()} MB</td>
              <td className="tabular px-3 py-3 font-mono">{(site.filesCount ?? 0).toLocaleString()}</td>
              <td className="tabular px-3 py-3 font-mono text-xs">{formatDate(site.lastHealthCheckAt)}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  <a className="rounded-md border border-slate-200 p-2" href={site.finalAppUrl || site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח אתר"><ExternalLink size={14} /></a>
                  <a className="rounded-md border border-slate-200 p-2" href={site.sharePointSiteUrl} target="_blank" rel="noreferrer" title="פתח SharePoint"><ExternalLink size={14} /></a>
                  <button className="rounded-md border border-slate-200 p-2" onClick={() => onDetails(site._id)} title="פרטים"><Eye size={14} /></button>
                  <button className="rounded-md border border-slate-200 p-2" onClick={() => onEdit(site)} title="ערוך"><Pencil size={14} /></button>
                  <button className="rounded-md border border-slate-200 p-2" onClick={() => onArchive(site._id)} title="ארכב"><Archive size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
