import { BadgeCheck, AlertTriangle, XCircle, CircleEllipsis, Archive } from "lucide-react";
import { ReactNode } from "react";

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; icon: ReactNode }> = {
    active: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "פעיל", icon: <BadgeCheck size={12} /> },
    warning: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "דורש טיפול", icon: <AlertTriangle size={12} /> },
    failed: { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "נכשל", icon: <XCircle size={12} /> },
    draft: { cls: "bg-slate-100 text-slate-700 border-slate-200", label: "טיוטה", icon: <CircleEllipsis size={12} /> },
    archived: { cls: "bg-slate-200 text-slate-700 border-slate-300", label: "ארכיון", icon: <Archive size={12} /> }
  };

  const item = map[status] ?? map.draft;
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${item.cls}`}>{item.icon}{item.label}</span>;
}
