import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from "lucide-react";
import { ReactNode } from "react";
import { DerivedHealthStatus } from "../types/site";

export function HealthBadge({ status }: { status: DerivedHealthStatus }) {
  const map: Record<DerivedHealthStatus, { cls: string; label: string; icon: ReactNode }> = {
    healthy: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "תקין", icon: <ShieldCheck size={12} /> },
    warning: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: "אזהרה", icon: <ShieldAlert size={12} /> },
    failed: { cls: "bg-rose-50 text-rose-700 border-rose-200", label: "תקלה", icon: <ShieldX size={12} /> },
    unknown: { cls: "bg-slate-100 text-slate-600 border-slate-200", label: "לא נבדק", icon: <ShieldQuestion size={12} /> }
  };

  const item = map[status];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${item.cls}`}>{item.icon}{item.label}</span>;
}
