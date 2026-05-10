import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from "lucide-react";
import { ReactNode } from "react";
import { DerivedHealthStatus } from "../types/site";

export function HealthBadge({ status }: { status: DerivedHealthStatus }) {
  const map: Record<DerivedHealthStatus, { cls: string; label: string; icon: ReactNode }> = {
    healthy: { cls: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200", label: "תקין", icon: <ShieldCheck size={12} /> },
    warning: { cls: "border-amber-400/30 bg-amber-500/10 text-amber-200", label: "אזהרה", icon: <ShieldAlert size={12} /> },
    failed: { cls: "border-rose-400/30 bg-rose-500/10 text-rose-200", label: "תקלה", icon: <ShieldX size={12} /> },
    unknown: { cls: "border-slate-500/40 bg-slate-500/10 text-slate-300", label: "לא נבדק", icon: <ShieldQuestion size={12} /> }
  };

  const item = map[status];
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium ${item.cls}`}>{item.icon}{item.label}</span>;
}
