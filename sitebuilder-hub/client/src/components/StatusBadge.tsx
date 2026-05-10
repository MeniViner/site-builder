import { BadgeCheck, AlertTriangle, XCircle, CircleEllipsis, Archive } from "lucide-react";
import { ReactNode } from "react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: ReactNode }> = {
    active: { cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200", label: "פעיל", icon: <BadgeCheck size={12} /> },
    warning: { cls: "border-amber-400/30 bg-amber-500/10 text-amber-200", label: "דורש טיפול", icon: <AlertTriangle size={12} /> },
    failed: { cls: "border-rose-400/30 bg-rose-500/10 text-rose-200", label: "נכשל", icon: <XCircle size={12} /> },
    draft: { cls: "border-slate-500/40 bg-slate-500/10 text-slate-200", label: "טיוטה", icon: <CircleEllipsis size={12} /> },
    archived: { cls: "border-indigo-400/30 bg-indigo-500/10 text-indigo-200", label: "ארכיון", icon: <Archive size={12} /> }
  };

  const item = map[status] ?? map.draft;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${item.cls}`}>{item.icon}{item.label}</span>;
}
